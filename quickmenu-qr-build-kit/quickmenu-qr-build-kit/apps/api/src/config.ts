import { readFileSync } from "fs";
import { resolve } from "path";
import { z } from "zod";
import { SUPPORTED_LANGUAGES } from "@quickmenu/shared";

/** Minimal .env loader that ignores comment lines and blank lines. */
function loadEnv(): void {
  // Look for .env files relative to the package root (where the .env was copied).
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), ".env.local"),
    resolve(__dirname, "..", ".env"),
    resolve(__dirname, "..", ".env.local"),
  ];
  for (const file of candidates) {
    let contents: string;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const raw of contents.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

loadEnv();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "staging", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url().default("postgres://quickmenu:quickmenu@localhost:5432/quickmenu"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  TRACKING_SECRET: z.string().min(32),
  FRONTEND_ORIGIN: z.string().url(),
  PUBLIC_MENU_BASE_URL: z.string().url(),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default(""),
  TRANSLATION_PROVIDER: z
    .enum(["fake", "google", "libretranslate"])
    .default("fake"),
  TRANSLATION_API_KEY: z.string().optional().default(""),
  MAIL_TRANSPORT: z.enum(["console", "smtp"]).default("console"),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().optional().default(0),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  REDIS_URL: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  MIGRATIONS_DIR: z.string().optional(),
  TEST_DATABASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Parse lazily on first access so tests can override env vars before use. */
let _env: Env | null = null;
export function getEnv(): Env {
  if (_env) return _env;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten());
    process.exit(1);
  }
  _env = parsed.data;
  return _env;
}

/** Lazy proxy: every property access re-parses env on first use. */
export const env = new Proxy({} as Env, {
  get(_target, prop) {
    if (typeof prop === "symbol") return undefined;
    return (getEnv() as unknown as Record<string, unknown>)[prop];
  },
});

export const supportedLanguageCodes = SUPPORTED_LANGUAGES.map((l) => l.code);