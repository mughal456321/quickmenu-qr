import { Router } from "express";
import { healthCheck } from "../db";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const db = await healthCheck();
  res.json({ data: { status: "ok", db: db ? "up" : "down" } });
});