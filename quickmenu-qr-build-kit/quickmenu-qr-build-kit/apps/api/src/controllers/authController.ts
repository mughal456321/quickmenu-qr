import type { Request, Response } from "express";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@quickmenu/shared";
import { ApiError } from "../errors";
import { asyncHandler } from "../lib/asyncHandler";
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from "../lib/cookies";
import { getAuth } from "../middleware/auth";
import * as authService from "../services/authService";

/** FR-01 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);
  const { refreshToken, ...session } = await authService.register(input);
  setRefreshCookie(res, refreshToken);
  res.status(201).json({ data: session });
});

/** FR-02 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const { refreshToken, ...session } = await authService.login(
    input.email,
    input.password
  );
  setRefreshCookie(res, refreshToken);
  res.status(200).json({ data: session });
});

/** FR-03 / NFR-S3 */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = readRefreshCookie(req);
  if (!token) {
    throw new ApiError(401, "UNAUTHENTICATED", "Invalid or expired session.");
  }
  const session = await authService.refresh(token);
  res.status(200).json({ data: session });
});

/** FR-03 */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  clearRefreshCookie(res);
  res.status(204).end();
});

/** FR-04 */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = forgotPasswordSchema.parse(req.body);
  await authService.forgotPassword(input.email);
  res.status(202).json({
    data: {
      message: "If an account exists for that email, a reset link has been sent.",
    },
  });
});

/** FR-04 */
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(input.token, input.password);
  res.status(204).end();
});

/** FR-05 */
export const me = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const data = await authService.getMe(auth.userId, auth.restaurantId);
  res.status(200).json({ data });
});
