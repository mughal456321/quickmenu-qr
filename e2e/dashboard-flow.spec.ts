import { expect, test } from "@playwright/test";

/**
 * Owner dashboard flow (Phase 07 / FR-06..FR-16):
 * register -> category -> item with variant -> availability -> table -> QR.
 */
test("owner builds a menu and downloads a table QR code (FR-06..FR-16, UC-02..UC-05)", async ({
  page,
}) => {
  const stamp = Date.now();
  const email = `owner.${stamp}@example.test`;
  const password = "OwnerPass123";

  await page.goto("/register");
  await expect(
    page.getByRole("heading", { name: "Create your restaurant" })
  ).toBeVisible();

  await page.getByLabel("Your name").fill("Test Owner");
  await page.getByLabel("Restaurant name").fill(`Test Kitchen ${stamp}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL(/\/dashboard\/menu/);
  await expect(page.getByRole("heading", { name: "Menu Builder" })).toBeVisible();

  // Category
  await page.locator("#new-category").fill("Starters");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Category added.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Starters/ })).toBeVisible();

  // Item with a variant
  await page.getByRole("button", { name: "Add item" }).click();
  const drawer = page.getByRole("dialog", { name: "New item" });
  await expect(drawer).toBeVisible();
  await drawer.getByLabel("Name", { exact: true }).fill("Garlic Bread");
  await drawer.getByLabel("Description").fill("Toasted sourdough with garlic butter.");
  await drawer.getByLabel("Base price").fill("300");
  await drawer.getByRole("button", { name: "Add variant" }).click();
  await drawer.getByLabel("Variant name").fill("Large");
  await drawer.getByLabel("Variant price").fill("450");
  await drawer.getByRole("button", { name: "Save item" }).click();

  await expect(page.getByText("Item created.")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Garlic Bread/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Garlic Bread/ })).toContainText(
    "Large"
  );

  // Availability toggle
  const row = page.getByRole("row", { name: /Garlic Bread/ });
  const toggle = row.getByRole("switch");
  await expect(toggle).toHaveText("In stock");
  await toggle.click();
  await expect(toggle).toHaveText("Out of stock");
  await toggle.click();
  await expect(toggle).toHaveText("In stock");

  // Table + QR download
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("link", { name: /Tables & QR/ }).click();
  await expect(page.getByRole("heading", { name: /Tables & QR codes/ })).toBeVisible();
  await page.getByLabel("Table number or name").fill("7");
  await page.getByRole("button", { name: "Add table" }).click();

  const tableCard = page.locator("article").filter({ hasText: "Table 7" });
  await expect(tableCard).toBeVisible();
  await expect(tableCard.getByRole("img", { name: /QR code for table 7/ })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await tableCard.getByRole("button", { name: "Download PNG" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("table-7-qr.png");
});
