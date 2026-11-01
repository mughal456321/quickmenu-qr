import type { Request, Response } from "express";
import type { OrderListQuery, OrderStatusUpdateInput } from "@quickmenu/shared";
import { asyncHandler } from "../lib/asyncHandler";
import { getAuth } from "../middleware/auth";
import * as orderService from "../services/orderService";

/** FR-30, FR-35: kitchen/owner order list with a status filter. */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const query = req.query as unknown as OrderListQuery;
  const result = await orderService.listOrders(auth.restaurantId, query);
  res.status(200).json({
    data: result.orders,
    meta: { page: query.page ?? 1, pageSize: query.pageSize ?? 20, total: result.total },
  });
});

/** FR-33: advance an order along the state machine. */
export const changeStatus = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { status } = req.body as OrderStatusUpdateInput;
  const data = await orderService.changeOrderStatus(
    auth.restaurantId,
    req.params.id as string,
    status,
    auth.userId
  );
  res.status(200).json({ data });
});
