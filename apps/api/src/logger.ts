import pino from "pino";
import { env } from "./config";

const devTransport = (() => {
  if (env.NODE_ENV !== "development") return undefined;
  try {
    // pino-pretty is a dev-only dependency; fall back to plain JSON if absent.
    require.resolve("pino-pretty");
    return { target: "pino-pretty", options: { colorize: true } };
  } catch {
    return undefined;
  }
})();

export const logger = pino({
  level: process.env.LOG_LEVEL || (env.NODE_ENV === "production" ? "info" : "debug"),
  transport: devTransport,
});

export function childLogger(name: string): pino.Logger {
  return logger.child({ component: name });
}