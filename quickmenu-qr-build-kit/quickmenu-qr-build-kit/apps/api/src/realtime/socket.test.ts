import { randomUUID } from "crypto";
import { createServer, type Server as HttpServer } from "http";
import type { Application } from "express";
import request from "supertest";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server";
import { attachRealtime, closeRealtime } from "../realtime/socket";
import { signAccessToken } from "../lib/tokens";
import { menuCache } from "../lib/menuCache";
import { truncateAll } from "../repositories/testing";
import * as categories from "../repositories/categories";
import * as menuItems from "../repositories/menuItems";
import * as restaurants from "../repositories/restaurants";
import * as tables from "../repositories/tables";
import * as users from "../repositories/users";

const API = "/api/v1";

let app: Application;
let httpServer: HttpServer;
let url: string;

interface Tenant {
  restaurantId: string;
  ownerToken: string;
  kitchenToken: string;
  qrToken: string;
  itemId: string;
}

const clients: Socket[] = [];

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function tenant(name: string): Promise<Tenant> {
  const restaurant = await restaurants.create({
    name,
    slug: `rt-${randomUUID().slice(0, 8)}`,
  });
  const category = await categories.create(restaurant.id, { name: "Mains" });
  const item = await menuItems.create(restaurant.id, {
    categoryId: category.id,
    name: "Chicken Biryani",
    basePrice: 500,
  });
  const table = await tables.create(restaurant.id, {
    tableNumber: "5",
    qrToken: `qr-${randomUUID().replace(/-/g, "")}`,
  });
  const owner = await users.create(restaurant.id, {
    email: `owner-${restaurant.id}@example.com`,
    name: "Owner",
    passwordHash: "x".repeat(60),
    role: "owner",
  });
  const kitchen = await users.create(restaurant.id, {
    email: `kitchen-${restaurant.id}@example.com`,
    name: "Kitchen",
    passwordHash: "x".repeat(60),
    role: "kitchen",
  });
  return {
    restaurantId: restaurant.id,
    ownerToken: signAccessToken({
      id: owner.id,
      restaurantId: restaurant.id,
      role: "owner",
    }),
    kitchenToken: signAccessToken({
      id: kitchen.id,
      restaurantId: restaurant.id,
      role: "kitchen",
    }),
    qrToken: table.qrToken,
    itemId: item.id,
  };
}

type TestSocket = Socket & { kotSync?: Promise<unknown> };

function connectSocket(auth: Record<string, unknown>): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const socket = connect(url, {
      path: "/ws",
      transports: ["websocket"],
      auth,
      reconnection: false,
    }) as TestSocket;
    clients.push(socket);
    // Register before "connect" so a fast server sync cannot be missed.
    socket.kotSync = waitFor(socket, "kot:sync", 2_000).catch(() => undefined);
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (error) => reject(error));
  });
}

function waitFor<T = unknown>(socket: Socket, event: string, timeout = 3_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeout);
    const handler = (payload: T) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

function emitAck<T = unknown>(
  socket: Socket,
  event: string,
  payload: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), 3_000);
    socket.emit(event, payload, (response: T) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function placeOrder(target: Tenant) {
  return request(app)
    .post(`${API}/public/orders`)
    .set("Idempotency-Key", randomUUID())
    .send({ qrToken: target.qrToken, items: [{ itemId: target.itemId, quantity: 1 }] });
}

beforeEach(async () => {
  await truncateAll();
  menuCache.clear();
  app = createApp();
  httpServer = createServer(app);
  attachRealtime(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("no port");
  url = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  closeRealtime();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe("Socket.IO real-time contract (FR-30..FR-34)", () => {
  it("pushes order:new only to the owning restaurant and syncs on connect", async () => {
    const a = await tenant("Cafe A");
    const b = await tenant("Cafe B");

    const staffA = await connectSocket({ token: a.kitchenToken });
    const staffB = await connectSocket({ token: b.kitchenToken });
    // Both get an initial sync (empty board).
    expect(await staffA.kotSync).toEqual([]);
    expect(await staffB.kotSync).toEqual([]);

    let leaked = false;
    staffB.on("order:new", () => {
      leaked = true;
    });

    const newOrder = waitFor<{ orderNumber: number; table: { number: string } }>(
      staffA,
      "order:new"
    );
    const created = await placeOrder(a);
    expect(created.status).toBe(201);

    const payload = await newOrder;
    expect(payload.orderNumber).toBe(created.body.data.orderNumber);
    expect(payload.table.number).toBe("5");

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(leaked).toBe(false);
  });

  it("updates status over the socket and notifies the customer room", async () => {
    const a = await tenant("Cafe A");
    const staff = await connectSocket({ token: a.kitchenToken });
    await staff.kotSync;

    const created = await placeOrder(a);
    expect(created.status).toBe(201);
    const orderId: string = created.body.data.id;
    const trackingToken: string = created.body.data.trackingToken;

    const customer = await connectSocket({ orderId, trackingToken });
    const statusEvent = waitFor<{ orderId: string; status: string }>(
      customer,
      "order:status"
    );

    const ack = await emitAck<{ ok: boolean; data: { status: string } }>(
      staff,
      "order:update_status",
      { orderId, status: "preparing" }
    );
    expect(ack.ok).toBe(true);
    expect(ack.data.status).toBe("preparing");

    const event = await statusEvent;
    expect(event).toEqual(expect.objectContaining({ orderId, status: "preparing" }));
  });

  it("blocks cross-restaurant status changes over the socket", async () => {
    const a = await tenant("Cafe A");
    const b = await tenant("Cafe B");
    const staffB = await connectSocket({ token: b.kitchenToken });
    await staffB.kotSync;

    const created = await placeOrder(a);
    const ack = await emitAck<{ ok: boolean; error?: string }>(
      staffB,
      "order:update_status",
      { orderId: created.body.data.id, status: "preparing" }
    );
    expect(ack).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("broadcasts menu:updated to sockets that proved the QR token", async () => {
    const a = await tenant("Cafe A");
    const menuSocket = await connectSocket({});
    const joined = await emitAck<{ ok: boolean }>(menuSocket, "menu:join", {
      qrToken: a.qrToken,
    });
    expect(joined.ok).toBe(true);

    const update = waitFor<{ itemId: string; isAvailable: boolean }>(
      menuSocket,
      "menu:updated"
    );
    const response = await request(app)
      .patch(`${API}/items/${a.itemId}/availability`)
      .set(bearer(a.ownerToken))
      .send({ isAvailable: false });
    expect(response.status).toBe(200);

    const event = await update;
    expect(event).toEqual({ itemId: a.itemId, isAvailable: false });
  });
});
