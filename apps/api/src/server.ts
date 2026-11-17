import { createServer } from "http";
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
import { publicRouter } from "./routes/public";
import { ordersRouter } from "./routes/orders";
import { menuRouter } from "./routes/menu";
import { tablesRouter } from "./routes/tables";
import { attachRealtime, closeRealtime } from "./realtime/socket";

export function createApp(): Application {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  // The API only serves JSON and binary QR files, so a deny-all CSP is safe.
  // HSTS is set by helmet; it is harmless over local HTTP and required in prod.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "no-referrer" },
    })
  );
  app.use(corsMiddleware);
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "100kb" }));

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
  app.use("/api/v1", publicRouter);
  app.use("/api/v1", ordersRouter);
  app.use("/api/v1", menuRouter);
  app.use("/api/v1", tablesRouter);

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
  const server = createServer(app);
  attachRealtime(server);

  // Without this listener an occupied port surfaces as an unhandled 'error'
  // event and the raw EADDRINUSE stack, which says nothing useful.
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      logger.error(
        { port: env.PORT },
        `API port ${env.PORT} is already in use. Stop the other instance or set PORT to a free port.`,
      );
      process.exit(1);
    }
    logger.error({ err: error }, "API server error");
    process.exit(1);
  });

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT, ws: "/ws" }, "API listening");
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down");
    closeRealtime();
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
  start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, "API failed to start");
    console.error(`\nAPI could not start: ${message}`);
    console.error(
      "If this is a connection error, PostgreSQL is not running: start `npm run db:local` in another terminal.\n",
    );
    process.exit(1);
  });
}