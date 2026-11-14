import type { Request, Response } from "express";
import type { PublicMenuQuery } from "@quickmenu/shared";
import { asyncHandler } from "../lib/asyncHandler";
import * as publicMenuService from "../services/publicMenuService";

/** FR-17..FR-22: menu for a scanned table with filters, search and translation. */
export const getMenu = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as PublicMenuQuery;
  const result = await publicMenuService.getMenu(req.params.qrToken as string, query);
  res.set("Cache-Control", "public, max-age=5");
  res.status(200).json({ data: result.menu, warnings: result.warnings });
});

/** FR-20: supported languages for the customer language selector. */
export const getLanguages = asyncHandler(async (_req: Request, res: Response) => {
  res.set("Cache-Control", "public, max-age=3600");
  res.status(200).json({ data: publicMenuService.getLanguages() });
});
