"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderStatus, PublicOrderStatus } from "@quickmenu/shared";
import { ApiRequestError, apiRequest, formatPrice } from "../../../lib/api";
import { orderSocket } from "../../../lib/realtime";
import { getMenuPath, getTrackingToken } from "../../../lib/storage";
import { ArrowLeftIcon } from "../../../components/icons";
import { primaryButton } from "../../../components/ui";

const STEPS: Array<{ status: OrderStatus; label: string }> = [
  { status: "new", label: "Received" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready" },
  { status: "served", label: "Served" },
];

const STATUS_CHIP: Record<OrderStatus, string> = {
  new: "bg-accent-soft text-accent",
  preparing: "bg-[#FBF0DC] text-[#8A5A05]",
  ready: "bg-success-soft text-success",
  served: "bg-success-soft text-success",
  cancelled: "bg-danger-soft text-danger",
};

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
      <main className="customer-shell flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-6 text-center">
        <h1 className="display text-[26px] leading-tight text-ink">
          Order tracking unavailable
        </h1>
        <p className="max-w-[36ch] text-[13px] leading-relaxed text-muted">
          This browser does not have the tracking token for the order. Open the order
          from the same tab where you placed it.
        </p>
        <Link href="/" className={`${primaryButton} mt-1 px-5`}>
          Back to home
        </Link>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="customer-shell flex min-h-screen items-center justify-center bg-canvas p-6">
        <p className="text-[13px] text-muted">{error ?? "Loading your order…"}</p>
      </main>
    );
  }

  const cancelledOrder = order.status === "cancelled";
  const currentStep = stepIndex(order.status);

  return (
    <main className="customer-shell min-h-screen bg-canvas pb-10">
      <header className="border-b border-line bg-surface px-5 pb-5 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Table {order.table.number}
            </p>
            <h1 className="display tabular mt-2 text-[30px] leading-none text-ink">
              Order #{order.orderNumber}
            </h1>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_CHIP[order.status]}`}
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
            {order.status}
          </span>
        </div>
        <p
          className="mt-4 flex items-center gap-2 text-[11.5px] text-muted"
          role="status"
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${
              connection === "live" ? "bg-success" : "bg-muted/60"
            }`}
          />
          {connection === "live"
            ? "Live updates from the kitchen"
            : "This page refreshes automatically every 5 seconds."}
        </p>
      </header>

      <section className="px-5 py-6">
        {cancelledOrder ? (
          <p className="rounded-xl border border-danger/15 bg-danger-soft px-4 py-3 text-[12.5px] font-medium text-danger">
            This order was cancelled.
          </p>
        ) : (
          <ol className="flex items-start justify-between">
            {STEPS.map((step, index) => {
              const done = index <= currentStep;
              const active = index === currentStep;
              return (
                <li
                  key={step.status}
                  className="relative flex flex-1 flex-col items-center gap-2 text-center"
                >
                  {index > 0 && (
                    <span
                      aria-hidden
                      className={`absolute left-0 top-[15px] h-px w-1/2 ${
                        done ? "bg-ink/20" : "bg-line"
                      }`}
                    />
                  )}
                  {index < STEPS.length - 1 && (
                    <span
                      aria-hidden
                      className={`absolute right-0 top-[15px] h-px w-1/2 ${
                        index < currentStep ? "bg-ink/20" : "bg-line"
                      }`}
                    />
                  )}
                  <span
                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold tabular transition ${
                      active
                        ? "bg-accent text-canvas ring-4 ring-accent-soft"
                        : done
                          ? "bg-ink text-canvas"
                          : "border border-line bg-surface text-muted"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                      done ? "text-ink2" : "text-muted"
                    }`}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-6 overflow-hidden rounded-[18px] border border-line bg-surface">
          <div className="divide-y divide-line px-4">
            {order.items.map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                className="flex items-start justify-between gap-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium leading-snug text-ink">
                    {item.quantity} × {item.name}
                  </p>
                  {item.variant && (
                    <p className="mt-0.5 text-[11.5px] text-muted">{item.variant}</p>
                  )}
                  {item.specialInstructions && (
                    <p className="mt-0.5 text-[11.5px] italic text-muted">
                      “{item.specialInstructions}”
                    </p>
                  )}
                </div>
                <p className="whitespace-nowrap text-[13px] tabular text-ink2">
                  {formatPrice(item.unitPrice * item.quantity, order.currency)}
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Total
            </span>
            <span className="display tabular text-[24px] leading-none text-ink">
              {formatPrice(order.total, order.currency)}
            </span>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-warn-soft px-3.5 py-2.5 text-center text-[12px] leading-relaxed text-warn">
            {error}
          </p>
        )}

        <Link
          href={menuPath}
          className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] font-semibold text-ink transition hover:border-line-strong hover:bg-canvas"
        >
          <ArrowLeftIcon size={15} />
          Back to menu
        </Link>
      </section>
    </main>
  );
}
