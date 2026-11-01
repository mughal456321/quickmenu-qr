import { Router } from "express";
import {
  idempotencyHeadersSchema,
  orderIdParamsSchema,
  publicOrderSchema,
  qrTokenParamsSchema,
} from "@quickmenu/shared";
import * as publicMenuController from "../controllers/publicMenuController";
import * as publicOrderController from "../controllers/publicOrderController";
import { createOrderRateLimiter } from "../middleware/orderRateLimit";
import { validate } from "../middleware/validate";

export const publicRouter = Router();

publicRouter.get(
  "/public/menu/:qrToken",
  validate({ params: qrTokenParamsSchema }),
  publicMenuController.getMenu
);

publicRouter.post(
  "/public/orders",
  createOrderRateLimiter(),
  validate({
    body: publicOrderSchema,
    headers: idempotencyHeadersSchema,
  }),
  publicOrderController.create
);

publicRouter.get(
  "/public/orders/:id",
  validate({ params: orderIdParamsSchema }),
  publicOrderController.getStatus
);
