import type { Request, Response } from "express";
import { staffCreateSchema, staffUpdateSchema, uuidSchema } from "@quickmenu/shared";
import { asyncHandler } from "../lib/asyncHandler";
import { getAuth } from "../middleware/auth";
import * as staffService from "../services/staffService";

/** FR-05 */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const data = await staffService.list(auth.restaurantId);
  res.status(200).json({ data });
});

/** FR-05 */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const input = staffCreateSchema.parse(req.body);
  const data = await staffService.create(auth.restaurantId, input);
  res.status(201).json({ data });
});

/** FR-05 */
export const update = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const id = uuidSchema.parse(req.params.id);
  const input = staffUpdateSchema.parse(req.body);
  const data = await staffService.update(auth.restaurantId, id, input);
  res.status(200).json({ data });
});

/** FR-05 */
export const remove = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const id = uuidSchema.parse(req.params.id);
  await staffService.remove(auth.restaurantId, id, auth.userId);
  res.status(204).end();
});
