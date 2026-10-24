import type { Request, Response } from "express";
import { restaurantUpdateSchema } from "@quickmenu/shared";
import { asyncHandler } from "../lib/asyncHandler";
import { getAuth } from "../middleware/auth";
import * as restaurantService from "../services/restaurantService";

/** FR-01 */
export const get = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const data = await restaurantService.get(auth.restaurantId);
  res.status(200).json({ data });
});

/** FR-01 */
export const update = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const input = restaurantUpdateSchema.parse(req.body);
  const data = await restaurantService.update(auth.restaurantId, input);
  res.status(200).json({ data });
});
