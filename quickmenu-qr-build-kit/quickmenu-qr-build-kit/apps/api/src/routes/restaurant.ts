import { Router } from "express";
import * as restaurantController from "../controllers/restaurantController";
import { authenticate, requireRole } from "../middleware/auth";

export const restaurantRouter = Router();

restaurantRouter.get("/restaurant", authenticate, restaurantController.get);
restaurantRouter.patch(
  "/restaurant",
  authenticate,
  requireRole("owner"),
  restaurantController.update
);
