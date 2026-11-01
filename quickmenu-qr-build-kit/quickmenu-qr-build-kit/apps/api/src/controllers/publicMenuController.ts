import type { Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import * as publicMenuService from "../services/publicMenuService";

/** FR-17, FR-18: minimal menu for a scanned table. */
export const getMenu = asyncHandler(async (req: Request, res: Response) => {
  const data = await publicMenuService.getMenu(req.params.qrToken as string);
  res.status(200).json({ data, warnings: [] });
});
