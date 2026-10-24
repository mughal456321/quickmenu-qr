import { Router } from "express";
import * as staffController from "../controllers/staffController";
import { authenticate, requireRole } from "../middleware/auth";

export const staffRouter = Router();

staffRouter.use("/staff", authenticate, requireRole("owner"));

staffRouter.get("/staff", staffController.list);
staffRouter.post("/staff", staffController.create);
staffRouter.patch("/staff/:id", staffController.update);
staffRouter.delete("/staff/:id", staffController.remove);
