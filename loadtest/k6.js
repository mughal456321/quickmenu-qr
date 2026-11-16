/**
 * k6 load test for NFR-P2 and NFR-P6.
 *
 *   k6 run load/k6.js \
 *     -e BASE_URL=https://api.staging.example.com \
 *     -e QR_TOKEN=<active table token> \
 *     -e ITEM_ID=<available item id>
 *
 * 500 customer sessions browse the menu and place an order; thresholds mirror
 * the SRS (p95 <= 300 ms, p99 <= 800 ms, error rate <= 1%).
 */
import http from "k6/http";
import { check, sleep } from "k6";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function randomIp() {
  return `10.${Math.floor(Math.random() * 255)}.${Math.floor(
    Math.random() * 255
  )}.${Math.floor(Math.random() * 255)}`;
}

export const options = {
  scenarios: {
    customers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 500 },
        { duration: "3m", target: 500 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:menu}": ["p(95)<300", "p(99)<800"],
    "http_req_duration{kind:order}": ["p(95)<300", "p(99)<800"],
  },
};

const BASE_URL = __ENV.BASE_URL ?? "http://localhost:4000";
const QR_TOKEN = __ENV.QR_TOKEN;
const ITEM_ID = __ENV.ITEM_ID;

export default function () {
  if (!QR_TOKEN || !ITEM_ID) {
    throw new Error("Set QR_TOKEN and ITEM_ID (see docs/RUNBOOK.md).");
  }

  const lang = ["", "?lang=ur", "?lang=ar", "?dietary=halal", "?q=chicken"][
    Math.floor(Math.random() * 5)
  ];
  const menu = http.get(`${BASE_URL}/api/v1/public/menu/${QR_TOKEN}${lang}`, {
    headers: { "X-Forwarded-For": randomIp() },
    tags: { kind: "menu" },
  });
  check(menu, { "menu 200": (response) => response.status === 200 });

  if (Math.random() < 0.4) {
    const order = http.post(
      `${BASE_URL}/api/v1/public/orders`,
      JSON.stringify({
        qrToken: QR_TOKEN,
        items: [{ itemId: ITEM_ID, variantId: null, quantity: 1 }],
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": uuid(),
          "X-Forwarded-For": randomIp(),
        },
        tags: { kind: "order" },
      }
    );
    check(order, {
      "order created or rate limited": (response) =>
        response.status === 201 || response.status === 429,
    });
  }

  sleep(Math.random() * 3 + 1);
}
