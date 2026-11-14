import { io, type Socket } from "socket.io-client";
import { WS_BASE_URL } from "./api";

/**
 * Socket.IO clients (docs/03 section 3.7). Staff authenticate with the access
 * token; customers with the order id and tracking token; menu pages prove the
 * QR token with `menu:join` after connecting.
 */
export function staffSocket(token: string): Socket {
  return io(WS_BASE_URL, {
    path: "/ws",
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
  });
}

export function orderSocket(orderId: string, trackingToken: string): Socket {
  return io(WS_BASE_URL, {
    path: "/ws",
    auth: { orderId, trackingToken },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });
}

export function publicMenuSocket(): Socket {
  return io(WS_BASE_URL, {
    path: "/ws",
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });
}
