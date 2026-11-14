import { execSync } from "child_process";
import path from "path";
import { Client } from "pg";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Kitchen display (Phase 09 / FR-30..FR-34, NFR-R3):
 * two browser contexts prove the real-time path end to end.
 */
const REPO_ROOT = path.resolve(__dirname, "..");
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://quickmenu:quickmenu@localhost:5432/quickmenu";

let client: Client;
let qrToken: string;

async function loginKitchen(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("kitchen@cafearoma.pk");
  await page.getByLabel("Password").fill("KitchenCafe2026!");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/kitchen/);
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
}

async function placeOrder(page: Page, itemName = "Mint Lemonade"): Promise<string> {
  const card = page.locator("article").filter({ hasText: itemName }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: /View cart/ }).click();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/[0-9a-f-]+/);
  const heading = await page.getByRole("heading", { level: 1 }).textContent();
  const number = heading?.match(/#(\d+)/)?.[1];
  expect(number).toBeTruthy();
  return number!;
}

function kitchenCard(page: Page, orderNumber: string) {
  return page
    .locator("article")
    .filter({ has: page.getByText(`#${orderNumber}`, { exact: true }) })
    .first();
}

test.beforeAll(async () => {
  execSync("npm run db:seed", { cwd: REPO_ROOT, stdio: "inherit" });
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const { rows } = await client.query<{ qr_token: string }>(
    `SELECT t.qr_token
       FROM restaurant_tables t
       JOIN restaurants r ON r.id = t.restaurant_id
      WHERE r.slug = 'cafe-aroma' AND t.table_number = '5' AND t.is_active
      LIMIT 1`
  );
  qrToken = rows[0]!.qr_token;
});

test.afterAll(async () => {
  await client.end();
});

test("kitchen receives a new order and advances its status (FR-30..FR-33, NFR-R3)", async ({
  browser,
}: {
  browser: Browser;
}) => {
  const kitchenContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const customerContext = await browser.newContext({
    viewport: { width: 360, height: 740 },
    isMobile: true,
    hasTouch: true,
  });
  const kitchen = await kitchenContext.newPage();
  const customer = await customerContext.newPage();

  await loginKitchen(kitchen);

  await customer.goto(`/m/${qrToken}`);
  await expect(customer.getByRole("heading", { name: "Cafe Aroma" })).toBeVisible();
  const orderNumber = await placeOrder(customer);

  const started = Date.now();
  const card = kitchenCard(kitchen, orderNumber);
  await expect(card).toBeVisible({ timeout: 5_000 });
  const elapsed = Date.now() - started;
  console.info(`kitchen: order #${orderNumber} appeared in ${elapsed} ms`);
  expect(elapsed).toBeLessThan(5_000);

  // One tap moves the ticket and the customer page updates live.
  await card.getByRole("button", { name: "Start preparing" }).click();
  await expect(
    kitchenCard(kitchen, orderNumber).getByText("Preparing", { exact: true })
  ).toBeVisible();
  await expect(
    customer.locator("header").getByText("preparing", { exact: true })
  ).toBeVisible({ timeout: 10_000 });

  // Served tickets clear themselves after ten seconds.
  await kitchenCard(kitchen, orderNumber)
    .getByRole("button", { name: "Mark ready" })
    .click();
  await kitchenCard(kitchen, orderNumber)
    .getByRole("button", { name: "Mark served" })
    .click();
  await expect(kitchenCard(kitchen, orderNumber)).toHaveCount(0, {
    timeout: 15_000,
  });

  await kitchenContext.close();
  await customerContext.close();
});

test("offline kitchen recovers without losing or duplicating orders (FR-34, NFR-R3)", async ({
  browser,
}: {
  browser: Browser;
}) => {
  const kitchenContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const customerContext = await browser.newContext({
    viewport: { width: 360, height: 740 },
    isMobile: true,
    hasTouch: true,
  });
  const kitchen = await kitchenContext.newPage();
  const customer = await customerContext.newPage();

  await loginKitchen(kitchen);
  await kitchenContext.setOffline(true);
  await expect(
    kitchen.getByRole("status").filter({ hasText: "Reconnecting" })
  ).toBeVisible({ timeout: 10_000 });

  await customer.goto(`/m/${qrToken}`);
  await expect(customer.getByRole("heading", { name: "Cafe Aroma" })).toBeVisible();
  const orderNumber = await placeOrder(customer);

  // Let the disconnect last long enough to prove the recovery path.
  await kitchen.waitForTimeout(15_000);
  await kitchenContext.setOffline(false);

  const card = kitchenCard(kitchen, orderNumber);
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(
    kitchen.locator("article").filter({ hasText: `#${orderNumber}` })
  ).toHaveCount(1);

  await kitchenContext.close();
  await customerContext.close();
});
