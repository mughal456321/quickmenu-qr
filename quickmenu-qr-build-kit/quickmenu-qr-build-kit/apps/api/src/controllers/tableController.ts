import type { Request, Response } from "express";
import type { TableCreateInput, TableUpdateInput } from "@quickmenu/shared";
import { asyncHandler } from "../lib/asyncHandler";
import { getAuth } from "../middleware/auth";
import * as tableService from "../services/tableService";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  res.status(200).json({ data: await tableService.list(auth.restaurantId) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const data = await tableService.create(auth.restaurantId, req.body as TableCreateInput);
  res.status(201).json({ data });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const data = await tableService.update(
    auth.restaurantId,
    req.params.id as string,
    req.body as TableUpdateInput
  );
  res.status(200).json({ data });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  await tableService.remove(auth.restaurantId, req.params.id as string);
  res.status(204).send();
});

export const qr = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const format = (req.query as { format: "png" | "pdf" }).format;
  const file = await tableService.qrFile(auth.restaurantId, req.params.id as string, format);
  res.status(200);
  res.set("Content-Type", file.contentType);
  res.set("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.send(file.buffer);
});
