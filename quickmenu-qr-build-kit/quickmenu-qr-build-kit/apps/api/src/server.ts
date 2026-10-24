import express, { Application, Request, Response } from "express";
import helmet from "helmet";
import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import { env } from "./config";
import { logger } from "./logger";
import { closePool, runMigrations } from "./db";
import { requestIdMiddleware } from "./middleware/requestId";
import { corsMiddleware } from "./middleware/cors";
import { errorHandler } from "./middleware/errorHandler";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { staffRouter } from "./routes/staff";
import { restaurantRouter } from "./routes/restaurant";

export function createApp(): Application {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(corsMiddleware);
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "1mb" }));

  const globalLimiter: RateLimitRequestHandler = rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many requests." } },
  });
  app.use("/api/", globalLimiter);

  app.use((req, res, next) => {
    res.set("X-Request-Id", req.id);
    logger.info({ method: req.method, path: req.path, id: req.id }, "request");
    next();
  });

  app.use("/api/v1", healthRouter);
  app.use("/api/v1", authRouter);
  app.use("/api/v1", staffRouter);
  app.use("/api/v1", restaurantRouter);

  app.use("*", (_req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
        requestId: _req.id,
      },
    });
  });

  app.use(errorHandler);

  return app;
}

export async function start(): Promise<void> {
  await runMigrations();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "API listening");
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down");
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// Entry point: start the server when this file is run directly.
// Tests import `createApp` and set NODE_ENV=test, so skip auto-start there.
if (env.NODE_ENV !== "test") {
  start();
}