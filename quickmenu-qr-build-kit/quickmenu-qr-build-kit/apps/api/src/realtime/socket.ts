import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { orderStatusUpdateSchema } from "@quickmenu/shared";
import type { KitchenOrder, OrderStatus } from "@quickmenu/shared";
import { env } from "../config";
import { verifyTokenHash } from "../domain/tracking";
import { setOrderEvents, type OrderEvents } from "../events/orderEvents";
import { onMenuChanged } from "../lib/menuEvents";
import { verifyAccessToken } from "../lib/tokens";
import { logger } from "../logger";
import * as ordersRepo from "../repositories/orders";
import * as tablesRepo from "../repositories/tables";
import * as orderService from "../services/orderService";

interface SocketContext {
  kind: "staff" | "customer";
  userId?: string;
  restaurantId?: string;
  orderId?: string;
  role?: "owner" | "kitchen";
}

let io: Server | null = null;
let stopMenuListener: (() => void) | null = null;

function roomForRestaurant(id: string): string {
  return `restaurant:${id}`;
}

function roomForOrder(id: string): string {
  return `order:${id}`;
}

function roomForMenu(id: string): string {
  return `menu:${id}`;
}

function activeOrders(restaurantId: string): Promise<KitchenOrder[]> {
  return orderService
    .listOrders(restaurantId, {
      status: ["new", "preparing", "ready"] as OrderStatus[],
      page: 1,
      pageSize: 100,
    })
    .then((result) => result.orders);
}

/**
 * Socket.IO at `/ws` (docs/03 section 3.7).
 *
 * Authorization happens before any room is joined. Staff tokens carry the
 * restaurant id; customer tokens are checked against the stored tracking hash.
 * A socket can therefore never subscribe to another tenant's traffic.
 */
export function attachRealtime(httpServer: HttpServer): Server {
  if (io) return io;

  io = new Server(httpServer, {
    path: "/ws",
    // NFR-R3: the default heartbeat (25 s + 20 s) takes up to 45 s to notice a
    // dead connection. Five seconds each keeps the worst case at 10 s.
    pingInterval: 5_000,
    pingTimeout: 5_000,
    cors: {
      origin: env.FRONTEND_ORIGIN.split(",").map((origin) => origin.trim()),
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as {
      token?: string;
      orderId?: string;
      trackingToken?: string;
    };

    if (auth.token) {
      const claims = verifyAccessToken(auth.token);
      if (!claims) {
        next(new Error("UNAUTHENTICATED"));
        return;
      }
      socket.data.context = {
        kind: "staff",
        userId: claims.sub,
        restaurantId: claims.restaurantId,
        role: claims.role,
      } satisfies SocketContext;
      next();
      return;
    }

    if (auth.orderId && auth.trackingToken) {
      const order = await ordersRepo.getByIdWithTrackingHash(auth.orderId).catch(() => null);
      if (!order || !verifyTokenHash(auth.trackingToken, order.trackingTokenHash)) {
        next(new Error("NOT_FOUND"));
        return;
      }
      socket.data.context = {
        kind: "customer",
        restaurantId: order.restaurantId,
        orderId: order.id,
      } satisfies SocketContext;
      next();
      return;
    }

    // A menu socket has no identity yet; it must join with a valid QR token.
    socket.data.context = { kind: "customer" } satisfies SocketContext;
    next();
  });

  io.on("connection", (socket) => {
    const context = socket.data.context as SocketContext;

    if (context.kind === "staff" && context.restaurantId) {
      socket.join(roomForRestaurant(context.restaurantId));

      activeOrders(context.restaurantId)
        .then((orders) => socket.emit("kot:sync", orders))
        .catch((error) => logger.warn({ err: error }, "kot:sync failed"));

      socket.on("order:update_status", async (payload: unknown, ack?: unknown) => {
        const respond =
          typeof ack === "function"
            ? (ack as (result: { ok: boolean; error?: string; data?: unknown }) => void)
            : () => undefined;
        const parsed = orderStatusUpdateSchema.safeParse(payload);
        const orderId = (payload as { orderId?: unknown })?.orderId;
        if (!parsed.success || typeof orderId !== "string") {
          respond({ ok: false, error: "VALIDATION_ERROR" });
          return;
        }
        try {
          const data = await orderService.changeOrderStatus(
            context.restaurantId!,
            orderId,
            parsed.data.status,
            context.userId!
          );
          respond({ ok: true, data });
        } catch (error) {
          const code = (error as { code?: string }).code ?? "INTERNAL_ERROR";
          respond({ ok: false, error: code });
        }
      });
    }

    if (context.orderId) {
      socket.join(roomForOrder(context.orderId));
    }

    // Customer menu pages prove the QR token before joining the availability room.
    socket.on("menu:join", async (payload: { qrToken?: string }, ack?: unknown) => {
      const respond =
        typeof ack === "function"
          ? (ack as (result: { ok: boolean; restaurantId?: string }) => void)
          : () => undefined;
      const qrToken = payload?.qrToken;
      if (!qrToken) {
        respond({ ok: false });
        return;
      }
      const table = await tablesRepo.findByQrToken(qrToken).catch(() => null);
      if (!table || !table.isActive) {
        respond({ ok: false });
        return;
      }
      await socket.join(roomForMenu(table.restaurantId));
      respond({ ok: true, restaurantId: table.restaurantId });
    });

    socket.on("disconnect", () => {
      // Rooms are released automatically by Socket.IO.
    });
  });

  const events: OrderEvents = {
    orderCreated(event) {
      if (!event.order) return;
      io?.to(roomForRestaurant(event.restaurantId)).emit("order:new", event.order);
    },
    orderStatusChanged(event) {
      const payload = { orderId: event.orderId, status: event.status, at: event.at };
      io?.to(roomForRestaurant(event.restaurantId)).emit("order:status", payload);
      io?.to(roomForOrder(event.orderId)).emit("order:status", payload);
    },
  };
  setOrderEvents(events);

  stopMenuListener = onMenuChanged((event) => {
    const payload = { itemId: event.itemId, isAvailable: event.isAvailable };
    io?.to(roomForMenu(event.restaurantId)).emit("menu:updated", payload);
    io?.to(roomForRestaurant(event.restaurantId)).emit("menu:updated", payload);
  });

  return io;
}

/** Test / shutdown helper. */
export function closeRealtime(): void {
  stopMenuListener?.();
  stopMenuListener = null;
  setOrderEvents(null);
  io?.close();
  io = null;
}
