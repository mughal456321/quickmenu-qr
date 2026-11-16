import { Router } from "express";
import * as authController from "../controllers/authController";
import { authenticate } from "../middleware/auth";
import { loginRateLimiter } from "../middleware/rateLimit";

export const authRouter = Router();

authRouter.post("/auth/register", authController.register);
authRouter.post("/auth/login", loginRateLimiter, authController.login);
authRouter.post("/auth/refresh", authController.refresh);
authRouter.post("/auth/logout", authenticate, authController.logout);
authRouter.post("/auth/forgot-password", authController.forgotPassword);
authRouter.post("/auth/reset-password", authController.resetPassword);
authRouter.get("/me", authenticate, authController.me);
