import { execSync } from "child_process";
import { mkdirSync } from "fs";
import path from "path";
import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";

const REPO_ROOT = path.resolve(__dirname, "..");
const SCREENSHOT_DIR = path.join(REPO_ROOT, "docs", "week6");
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://quickmenu:quickmenu@localhost:5432/quickmenu";

let client: Client;
let qrToken: string;
let tableId: string;

async function countOrders(): Promise<number> {
  const { rows } = await client.query<{ total: string }>(
    "SELECT count(*)::text AS total FROM orders WHERE table_id = $1",
    [tableId]
  );
  return Number.parseInt(rows[0]!.total, 10);
}

async function addItem(page: Page, name: string, variant?: string) {
  const card = page.locator("article").filter({ hasText: name }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "+ Add" }).click();
  if (variant) {
    await page.getByRole("button", { name: new RegExp(`^${variant}`) }).click();
  }
}

async function placeOrder(page: Page): Promise<{ id: string; orderNumber: string }> {
  await page.getByRole("button", { name: /View cart/ }).click();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-cart.png") });
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/[0-9a-f-]+/);
  const id = page.url().split("/order/")[1]!;
  const heading = await page.getByRole("heading", { level: 1 }).textContent();
  const orderNumber = heading?.match(/#(\d+)/)?.[1] ?? "";
  return { id, orderNumber };
}

async function openStaffAndLogin(page: Page) {
  await page.goto("/dashboard/orders");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Kitchen orders" })).toBeVisible();
}

test.beforeAll(async () => {
  // The seed is idempotent: it replaces the Cafe Aroma demo restaurant. The API
  // webserver runs migrations before this hook executes.
  execSync("npm run db:seed", { cwd: REPO_ROOT, stdio: "inherit" });
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const { rows } = await client.query<{ id: string; qr_token: string }>(
    `SELECT t.id, t.qr_token
       FROM restaurant_tables t
       JOIN restaurants r ON r.id = t.restaurant_id
      WHERE r.slug = 'cafe-aroma' AND t.table_number = '5' AND t.is_active
      LIMIT 1`
  );
  tableId = rows[0]!.id;
  qrToken = rows[0]!.qr_token;
});

test.afterAll(async () => {
  await client.end();
});

test("customer orders from a table QR and staff moves it to preparing (FR-17..FR-29, FR-33)", async ({
  page,
}) => {
  await page.goto(`/m/${qrToken}`);
  await expect(page.getByRole("heading", { name: "Cafe Aroma" })).toBeVisible();

  // Two lines, one of which requires a variant (D-5).
  await addItem(page, "Chicken Biryani", "Full");
  await addItem(page, "Mint Lemonade");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-menu.png") });

  const { id, orderNumber } = await placeOrder(page);
  expect(orderNumber).not.toBe("");

  // Confirmation / status screen.
  await expect(page.getByText(`Order #${orderNumber}`)).toBeVisible();
  await expect(page.getByText("Received", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-order-status.png") });

  // Staff page: the order shows up and can move to preparing.
  await openStaffAndLogin(page);
  const staffCard = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: `#${orderNumber}` }) })
    .first();
  await expect(staffCard).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-staff-orders.png") });
  await staffCard.getByRole("button", { name: "Start preparing" }).click();
  await expect(staffCard.getByText("preparing", { exact: true })).toBeVisible();

  // Customer page polls every 5 seconds and shows the new status.
  await page.goto(`/order/${id}`);
  await expect(page.locator("header").getByText("preparing", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-customer-preparing.png") });
});

test("double-tapping Place order creates exactly one order (NFR-R5)", async ({ page }) => {
  const before = await countOrders();

  await page.goto(`/m/${qrToken}`);
  await expect(page.getByRole("heading", { name: "Cafe Aroma" })).toBeVisible();
  await addItem(page, "Mint Lemonade");

  await page.getByRole("button", { name: /View cart/ }).click();
  const placeButton = page.getByRole("button", { name: "Place order" });
  await placeButton.dblclick({ force: true });

  await page.waitForURL(/\/order\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: /Order #\d+/ })).toBeVisible();

  await expect.poll(countOrders, { timeout: 10_000 }).toBe(before + 1);
});
