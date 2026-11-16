import { randomBytes } from "crypto";
import type { RestaurantTable, TableCreateInput, TableUpdateInput, TableWithLinks } from "@quickmenu/shared";
import { env } from "../config";
import { ConflictError, NotFoundError } from "../errors";
import * as restaurantsRepo from "../repositories/restaurants";
import * as tablesRepo from "../repositories/tables";
import { renderPdf, renderPng } from "./qrService";

function publicMenuUrl(qrToken: string): string {
  return `${env.PUBLIC_MENU_BASE_URL.replace(/\/$/, "")}/${qrToken}`;
}

function withLinks(table: RestaurantTable): TableWithLinks {
  return {
    ...table,
    menuUrl: publicMenuUrl(table.qrToken),
    qrDownload: {
      png: `/tables/${table.id}/qr?format=png`,
      pdf: `/tables/${table.id}/qr?format=pdf`,
    },
  };
}

/** FR-14: list the restaurant's tables and their QR links. */
export async function list(restaurantId: string): Promise<TableWithLinks[]> {
  const tables = await tablesRepo.listByRestaurant(restaurantId);
  return tables.map(withLinks);
}

/** FR-14/15: create a table with a cryptographically secure URL-safe token. */
export async function create(
  restaurantId: string,
  input: TableCreateInput
): Promise<TableWithLinks> {
  const qrToken = randomBytes(24).toString("base64url");
  const table = await tablesRepo.create(restaurantId, {
    tableNumber: input.tableNumber,
    qrToken,
  });
  return withLinks(table);
}

export async function update(
  restaurantId: string,
  id: string,
  patch: TableUpdateInput
): Promise<TableWithLinks> {
  const updated = await tablesRepo.update(restaurantId, id, patch);
  if (!updated) throw new NotFoundError("Table not found.");
  return withLinks(updated);
}

/** FR-14: order history blocks deletion; deactivate the table instead. */
export async function remove(restaurantId: string, id: string): Promise<void> {
  const table = await tablesRepo.getById(restaurantId, id);
  if (!table) throw new NotFoundError("Table not found.");

  const orderCount = await tablesRepo.countOrders(restaurantId, id);
  if (orderCount > 0) {
    throw new ConflictError(
      "This table has order history. Deactivate it instead of deleting it."
    );
  }
  await tablesRepo.deleteTable(restaurantId, id);
}

export interface QrFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/** FR-16: PNG or A6 PDF encoding the public menu URL. */
export async function qrFile(
  restaurantId: string,
  id: string,
  format: "png" | "pdf"
): Promise<QrFile> {
  const table = await tablesRepo.getById(restaurantId, id);
  if (!table) throw new NotFoundError("Table not found.");
  const restaurant = await restaurantsRepo.getById(restaurantId);
  if (!restaurant) throw new NotFoundError("Table not found.");

  const url = publicMenuUrl(table.qrToken);
  if (format === "pdf") {
    return {
      buffer: await renderPdf(url, restaurant.name, table.tableNumber),
      contentType: "application/pdf",
      filename: `table-${table.tableNumber}-qr.pdf`,
    };
  }
  return {
    buffer: await renderPng(url),
    contentType: "image/png",
    filename: `table-${table.tableNumber}-qr.png`,
  };
}
