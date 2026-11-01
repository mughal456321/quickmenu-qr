import type { Request, Response } from "express";
import type { PublicOrderInput } from "@quickmenu/shared";
import { asyncHandler } from "../lib/asyncHandler";
import * as orderService from "../services/orderService";

/** FR-23..FR-28: place an order from the customer cart. */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const idempotencyKey = req.headers["idempotency-key"] as string;
  const result = await orderService.createOrder(
    req.body as PublicOrderInput,
    idempotencyKey
  );
  res.status(result.replayed ? 200 : 201).json({ data: result.order });
});

/** FR-29: current status for the customer's own order. */
export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  const token = req.headers["x-tracking-token"];
  const data = await orderService.getPublicOrder(
    req.params.id as string,
    typeof token === "string" ? token : undefined
  );
  res.status(200).json({ data });
});
