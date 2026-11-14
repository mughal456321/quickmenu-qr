"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderStatus, PublicOrderStatus } from "@quickmenu/shared";
import { ApiRequestError, apiRequest, formatPrice } from "../../../lib/api";
import { orderSocket } from "../../../lib/realtime";
import { getMenuPath, getTrackingToken } from "../../../lib/storage";

const STEPS: Array<{ status: OrderStatus; label: string }> = [
  { status: "new", label: "Received" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready" },
  { status: "served", label: "Served" },
];

function stepIndex(status: OrderStatus): number {
  return STEPS.findIndex((step) => step.status === status);
}

type Connection = "connecting" | "live" | "polling";

export default function OrderStatusPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [order, setOrder] = useState<PublicOrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenMissing, setTokenMissing] = useState(false);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [menuPath, setMenuPath] = useState("/");
  const pollTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const token = getTrackingToken(id);
    if (!token) return;
    try {
      const data = await apiRequest<PublicOrderStatus>(`/public/orders/${id}`, {
        headers: { "X-Tracking-Token": token },
      });
      setOrder(data);
      setError(null);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 404) {
        setError("We could not find this order on this device.");
      } else {
        setError("We could not refresh the order. Retrying…");
      }
    }
  }, [id]);

  useEffect(() => {
    setMenuPath(getMenuPath(id) ?? "/");
    const token = getTrackingToken(id);
    if (!token) {
      setTokenMissing(true);
      return;
    }

    let cancelled = false;

    const stopPolling = () => {
      if (pollTimer.current !== null) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };

    const startPolling = () => {
      if (cancelled) return;
      setConnection("polling");
      if (pollTimer.current === null) {
        pollTimer.current = window.setInterval(() => void load(), 5_000);
      }
    };

    const socket = orderSocket(id, token);

    socket.on("connect", () => {
      if (cancelled) return;
      setConnection("live");
      stopPolling();
      void load();
    });

    socket.on("disconnect", startPolling);
    socket.on("connect_error", startPolling);

    socket.on(
      "order:status",
      (payload: { orderId?: string; status?: OrderStatus; at?: string }) => {
        if (cancelled || payload?.orderId !== id || !payload.status) return;
        setOrder((current) =>
          current
            ? {
                ...current,
                status: payload.status as OrderStatus,
                timeline: [
                  ...current.timeline,
                  {
                    status: payload.status as OrderStatus,
                    at: payload.at ?? new Date().toISOString(),
                  },
                ],
              }
            : current
        );
      }
    );

    // Load immediately and keep a safety poll until the socket connects.
    void load();
    pollTimer.current = window.setInterval(() => void load(), 5_000);

    return () => {
      cancelled = true;
      stopPolling();
      socket.close();
    };
  }, [id, load]);

  if (tokenMissing) {
    return (
      <main className="customer-shell flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Order tracking unavailable</h1>
        <p className="text-gray-600">
          This browser does not have the tracking token for the order. Open the order
          from the same tab where you placed it.
        </p>
        <Link href="/" className="rounded-xl bg-orange-500 px-5 py-2 font-medium text-white">
          Back to home
        </Link>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="customer-shell flex min-h-screen items-center justify-center p-6">
        <p className="text-gray-500">{error ?? "Loading your order…"}</p>
      </main>
    );
  }

  const cancelledOrder = order.status === "cancelled";
  const currentStep = stepIndex(order.status);

  return (
    <main className="customer-shell min-h-screen bg-gray-50 pb-8">
      <header className="border-b border-gray-200 bg-white px-4 py-4">
        <p className="text-sm text-gray-500">Table {order.table.number}</p>
        <div className="flex items-end justify-between gap-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Order #{order.orderNumber}
          </h1>
          <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-medium capitalize text-orange-700">
            {order.status}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500" role="status">
          {connection === "live"
            ? "Live updates from the kitchen"
            : "This page refreshes automatically every 5 seconds."}
        </p>
      </header>

      <section className="px-4 py-5">
        {cancelledOrder ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            This order was cancelled.
          </p>
        ) : (
          <ol className="flex items-start justify-between gap-1">
            {STEPS.map((step, index) => {
              const done = index <= currentStep;
              return (
                <li
                  key={step.status}
                  className="flex flex-1 flex-col items-center gap-1 text-center"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      done ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={`text-[11px] ${
                      done ? "font-semibold text-gray-900" : "text-gray-500"
                    }`}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-5 space-y-2 rounded-2xl border border-gray-200 bg-white p-4">
          {order.items.map((item, index) => (
            <div
              key={`${item.name}-${index}`}
              className="flex items-start justify-between gap-3 border-b border-gray-100 py-2 last:border-0"
            >
              <div>
                <p className="font-medium text-gray-900">
                  {item.quantity} × {item.name}
                </p>
                {item.variant && <p className="text-xs text-gray-500">{item.variant}</p>}
                {item.specialInstructions && (
                  <p className="text-xs italic text-gray-500">
                    “{item.specialInstructions}”
                  </p>
                )}
              </div>
              <p className="whitespace-nowrap text-sm text-gray-700">
                {formatPrice(item.unitPrice * item.quantity, order.currency)}
              </p>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 text-lg font-bold">
            <span>Total</span>
            <span>{formatPrice(order.total, order.currency)}</span>
          </div>
        </div>

        {error && <p className="mt-4 text-center text-sm text-amber-600">{error}</p>}

        <Link
          href={menuPath}
          className="mt-5 block rounded-xl border border-orange-200 bg-white px-4 py-3 text-center font-semibold text-orange-700"
        >
          Back to menu
        </Link>
      </section>
    </main>
  );
}
