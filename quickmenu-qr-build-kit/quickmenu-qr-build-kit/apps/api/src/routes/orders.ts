import { Router } from "express";
import {
  orderIdParamsSchema,
  orderListQuerySchema,
  orderStatusUpdateSchema,
} from "@quickmenu/shared";
import * as orderController from "../controllers/orderController";
import { authenticate, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";

export const ordersRouter = Router();

ordersRouter.use("/orders", authenticate, requireRole("owner", "kitchen"));

ordersRouter.get(
  "/orders",
  validate({ query: orderListQuerySchema }),
  orderController.list
);

ordersRouter.patch(
  "/orders/:id/status",
  validate({ params: orderIdParamsSchema, body: orderStatusUpdateSchema }),
  orderController.changeStatus
);
