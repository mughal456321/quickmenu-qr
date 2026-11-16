/**
 * Local NFR load probe (NFR-P2, P3, P6, S8).
 *
 * Runs 500 customer sessions (menu browse + order placement) with 25 kitchen
 * sockets and records p50/p95/p99, error rate and order-to-kitchen latency.
 *
 * Usage:
 *   npm run db:seed
 *   npm run dev:api            # in another terminal
 *   node load/node-load.mjs
 *
 * A unique X-Forwarded-For per request keeps the documented per-IP rate limits
 * from throttling the probe itself; the API runs with `trust proxy = 1`.
 */
import { writeFileSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import pg from "pg";
import { io } from "socket.io-client";

const API_URL = process.env.API_URL ?? "http://localhost:4000/api/v1";
const WS_URL = API_URL.replace(/\/api\/v1\/?$/, "");
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://quickmenu:quickmenu@localhost:5432/quickmenu";
const SESSIONS = Number(process.env.SESSIONS ?? 500);
const SOCKETS = Number(process.env.SOCKETS ?? 25);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 50);
const THINK_MS = Number(process.env.THINK_MS ?? 1500);
const KITCHEN_LATENCY_SAMPLES = Number(process.env.KITCHEN_SAMPLES ?? 20);

const { Client: PgClient } = pg;

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

function ipFor(index) {
  return `10.${(index >> 16) & 255}.${(index >> 8) & 255}.${index & 255}`;
}

async function timed(fn) {
  const started = performance.now();
  try {
    const response = await fn();
    return {
      ms: performance.now() - started,
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    return { ms: performance.now() - started, ok: false, status: 0, error };
  }
}

async function login(email, password, ip) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`login failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body.data.accessToken;
}

async function main() {
  const client = new PgClient({ connectionString: DATABASE_URL });
  await client.connect();

  const { rows: tables } = await client.query(
    `SELECT t.id, t.qr_token
       FROM restaurant_tables t
       JOIN restaurants r ON r.id = t.restaurant_id
      WHERE r.slug = 'cafe-aroma' AND t.is_active
      ORDER BY t.table_number`
  );
  if (tables.length === 0) throw new Error("seed the database first");

  const menuResponse = await fetch(`${API_URL}/public/menu/${tables[0].qr_token}`);
  const menuBody = await menuResponse.json();
  const items = (menuBody.data?.categories ?? [])
    .flatMap((category) => category.items)
    .filter((item) => item.isAvailable)
    .map((item) => ({
      id: item.id,
      variantId: item.variants?.[0]?.id ?? null,
    }));
  if (items.length === 0) throw new Error("no available menu items in the seed");

  const ownerToken = await login("owner@cafearoma.pk", "CafeAroma2026!", ipFor(1));
  const kitchenToken = await login(
    "kitchen@cafearoma.pk",
    "KitchenCafe2026!",
    ipFor(2)
  );

  /* ---------------- 500 customer sessions ---------------- */
  const latencies = [];
  const statuses = new Map();
  let nextSession = 0;

  async function sessionWorker() {
    for (;;) {
      const index = nextSession++;
      if (index >= SESSIONS) return;
      const table = tables[index % tables.length];
      const ip = ipFor(1000 + index);
      const filter = ["", "?lang=ur", "?dietary=halal", "?q=chicken"][index % 4];
      const browse = await timed(() =>
        fetch(`${API_URL}/public/menu/${table.qr_token}${filter}`, {
          headers: { "X-Forwarded-For": ip },
        })
      );
      latencies.push({ kind: "menu", ...browse });
      statuses.set(browse.status, (statuses.get(browse.status) ?? 0) + 1);

      // A real customer pauses between browsing and ordering. Modelling think
      // time keeps 500 sessions concurrent without turning the probe into a
      // 100 orders/second burst (NFR-P2 "under normal load").
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * THINK_MS)
      );

      // Every session places an order, matching the "browsing and ordering"
      // workload in the NFR.
      const item = items[index % items.length];
      const order = await timed(() =>
        fetch(`${API_URL}/public/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": randomUUID(),
            "X-Forwarded-For": ip,
          },
          body: JSON.stringify({
            qrToken: table.qr_token,
            items: [
              {
                itemId: item.id,
                variantId: item.variantId,
                quantity: 1,
              },
            ],
          }),
        })
      );
      latencies.push({ kind: "order", ...order });
      statuses.set(order.status, (statuses.get(order.status) ?? 0) + 1);

      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * THINK_MS)
      );
    }
  }

  const sessionStart = performance.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => sessionWorker()));
  const sessionSeconds = (performance.now() - sessionStart) / 1000;

  /* ---------------- 25 kitchen sockets + order latency ---------------- */
  const sockets = [];
  const syncWaits = [];
  for (let index = 0; index < SOCKETS; index += 1) {
    const socket = io(WS_URL, {
      path: "/ws",
      auth: { token: kitchenToken },
      transports: ["websocket"],
    });
    sockets.push(socket);
    syncWaits.push(
      new Promise((resolve) => {
        socket.once("kot:sync", resolve);
        socket.once("connect_error", resolve);
        setTimeout(resolve, 10_000);
      })
    );
  }
  await Promise.all(syncWaits);

  const kitchenLatencies = [];
  for (let index = 0; index < KITCHEN_LATENCY_SAMPLES; index += 1) {
    const table = tables[index % tables.length];
    const item = items[index % items.length];
    const ip = ipFor(50_000 + index);
    const started = performance.now();
    const received = new Promise((resolve) => {
      const handler = (payload) => {
        if (payload?.id) resolve(performance.now() - started);
      };
      sockets[0].once("order:new", handler);
      setTimeout(() => resolve(null), 5_000);
    });
    const response = await fetch(`${API_URL}/public/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
        "X-Forwarded-For": ip,
      },
      body: JSON.stringify({
        qrToken: table.qr_token,
        items: [{ itemId: item.id, variantId: item.variantId, quantity: 1 }],
      }),
    });
    if (!response.ok) {
      console.error("order for kitchen probe failed", response.status);
    }
    const latency = await received;
    if (typeof latency === "number") kitchenLatencies.push(latency);
  }

  for (const socket of sockets) socket.close();
  await client.end();

  const all = latencies.map((entry) => entry.ms);
  const menuLatencies = latencies
    .filter((entry) => entry.kind === "menu")
    .map((entry) => entry.ms);
  const orderLatencies = latencies
    .filter((entry) => entry.kind === "order")
    .map((entry) => entry.ms);
  const failures = latencies.filter((entry) => !entry.ok);

  const summary = {
    generatedAt: new Date().toISOString(),
    environment: {
      apiUrl: API_URL,
      sessions: SESSIONS,
      kitchenSockets: SOCKETS,
      concurrency: CONCURRENCY,
      thinkTimeMsMax: THINK_MS,
    },
    customerSessions: {
      requests: latencies.length,
      durationSeconds: Number(sessionSeconds.toFixed(2)),
      requestsPerSecond: Number((latencies.length / sessionSeconds).toFixed(1)),
      errorRate: Number(((failures.length / latencies.length) * 100).toFixed(2)),
      statuses: Object.fromEntries(
        [...statuses.entries()].sort((a, b) => a[0] - b[0])
      ),
      all: {
        p50: percentile(all, 50),
        p95: percentile(all, 95),
        p99: percentile(all, 99),
      },
      menu: {
        p50: percentile(menuLatencies, 50),
        p95: percentile(menuLatencies, 95),
        p99: percentile(menuLatencies, 99),
      },
      orders: {
        p50: percentile(orderLatencies, 50),
        p95: percentile(orderLatencies, 95),
        p99: percentile(orderLatencies, 99),
      },
    },
    orderToKitchenMs: {
      samples: kitchenLatencies.length,
      p50: percentile(kitchenLatencies, 50),
      p95: percentile(kitchenLatencies, 95),
      p99: percentile(kitchenLatencies, 99),
      max: Math.max(0, ...kitchenLatencies),
    },
    ownerTokenUsed: Boolean(ownerToken),
  };

  const outputDir = path.join(process.cwd(), "docs");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "NFR_LOAD_RESULTS.json");
  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
