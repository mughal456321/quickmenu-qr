import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const id = (req.headers["x-request-id"] as string) || uuidv4();
  req.id = id;
  res.set("X-Request-Id", id);
  next();
}

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}