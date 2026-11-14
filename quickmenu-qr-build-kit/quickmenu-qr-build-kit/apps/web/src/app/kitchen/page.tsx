"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KitchenOrder, OrderStatus } from "@quickmenu/shared";
import { ApiRequestError, apiRequest, apiVoid } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../components/Toast";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { staffSocket } from "../../lib/realtime";
import { getSoundEnabled, saveSoundEnabled } from "../../lib/storage";
import {
  applyStatus,
  BOARD_COLUMNS,
  CLEAR_DELAY_MS,
  columnFor,
  countByStatus,
  elapsedMinutes,
  filterBoard,
  isBoardStatus,
  mergeOrders,
  POLL_INTERVAL_MS,
  primaryAction,
  removeOrder,
  upsertOrder,
  type BoardFilter,
  type BoardStatus,
} from "../../lib/kitchenBoard";

type Connection = "connecting" | "live" | "offline";

const COLUMN_STYLES: Record<BoardStatus, { header: string; card: string }> = {
  new: {
    header: "border-blue-500 bg-blue-50 text-blue-900",
    card: "border-blue-300",
  },
  preparing: {
    header: "border-amber-500 bg-amber-50 text-amber-900",
    card: "border-amber-300",
  },
  ready: {
    header: "border-green-600 bg-green-50 text-green-900",
    card: "border-green-400",
  },
};

const COLUMN_LABELS: Record<BoardStatus, string> = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};

function statusChangeError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "INVALID_STATUS_TRANSITION") {
      return "That order already moved on. The board has been refreshed.";
    }
    return error.message;
  }
  return "Could not update the order. Please try again.";
}

export default function KitchenPage() {
  const router = useRouter();
  const { status: authStatus, accessToken, restaurant, user, logout } = useAuth();
  const toast = useToast();

  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [columns, setColumns] = useState<Record<string, BoardStatus>>({});
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [connection, setConnection] = useState<Connection>("connecting");
  const [now, setNow] = useState(() => Date.now());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<KitchenOrder | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [soundOn, setSoundOn] = useState(false);
  const [soundUnlocked, setSoundUnlocked] = useState(false);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

  const socketRef = useRef<ReturnType<typeof staffSocket> | null>(null);
  const pollRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const columnsRef = useRef<Record<string, BoardStatus>>({});
  const soundOnRef = useRef(false);
  const clearTimers = useRef(new Map<string, number>());

  useEffect(() => {
    const stored = getSoundEnabled();
    setSoundOn(stored);
    soundOnRef.current = stored;
  }, []);

  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  useEffect(() => {
    if (authStatus === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent("/kitchen")}`);
    }
  }, [authStatus, router]);

  /* Keep "minutes since order" fresh without re-rendering every second. */
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  /* Screen Wake Lock (FR-34). Silently unsupported on older browsers. */
  useEffect(() => {
    interface WakeLockSentinelLike {
      release(): Promise<void>;
      addEventListener(type: "release", listener: () => void): void;
    }
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
    };
    let sentinel: WakeLockSentinelLike | null = null;

    const request = async () => {
      if (!nav.wakeLock || document.visibilityState !== "visible") return;
      try {
        sentinel = await nav.wakeLock.request("screen");
      } catch {
        /* The browser refused; the board still works. */
      }
    };

    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (sentinel) void sentinel.release();
    };
  }, []);

  const scheduleClear = useCallback((orderId: string) => {
    if (clearTimers.current.has(orderId)) return;
    const timer = window.setTimeout(() => {
      clearTimers.current.delete(orderId);
      setOrders((current) => removeOrder(current, orderId));
      setColumns((current) => {
        const next = { ...current };
        delete next[orderId];
        return next;
      });
    }, CLEAR_DELAY_MS);
    clearTimers.current.set(orderId, timer);
  }, []);

  const beep = useCallback(() => {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return;
    const context = audioRef.current ?? new AudioCtor();
    audioRef.current = context;
    if (context.state === "suspended") void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.5);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
    setSoundUnlocked(true);
  }, []);

  const flash = useCallback((orderId: string) => {
    setFlashIds((current) => new Set(current).add(orderId));
    window.setTimeout(() => {
      setFlashIds((current) => {
        const next = new Set(current);
        next.delete(orderId);
        return next;
      });
    }, 6_000);
  }, []);

  const loadSnapshot = useCallback(async () => {
    try {
      const data = await apiRequest<KitchenOrder[]>(
        "/orders?status=new,preparing,ready&pageSize=100"
      );
      setOrders(data);
      const nextColumns: Record<string, BoardStatus> = {};
      for (const order of data) {
        if (isBoardStatus(order.status)) nextColumns[order.id] = order.status;
      }
      setColumns(nextColumns);
      setListError(null);
    } catch (error) {
      setListError(
        error instanceof ApiRequestError
          ? error.message
          : "Could not refresh orders. Retrying automatically."
      );
    }
  }, []);

  /* REST polling is used only while the socket is down (NFR-R3). */
  const startPolling = useCallback(() => {
    if (pollRef.current !== null) return;
    pollRef.current = window.setInterval(() => void loadSnapshot(), POLL_INTERVAL_MS);
  }, [loadSnapshot]);

  const stopPolling = useCallback(() => {
    if (pollRef.current === null) return;
    window.clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    const socket = staffSocket(accessToken);
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnection("live");
      setListError(null);
      stopPolling();
      // `kot:sync` is emitted by the server on every connection/reconnection.
      void loadSnapshot();
    });

    const markOffline = () => {
      setConnection("offline");
      startPolling();
    };

    socket.on("disconnect", markOffline);
    socket.on("connect_error", markOffline);

    /*
     * A dropped Wi-Fi network is reported immediately by the browser, but an
     * existing WebSocket is not torn down until the heartbeat times out. React
     * to `offline` at once so the board tells staff it is polling (NFR-R3).
     */
    const handleOffline = () => markOffline();
    const handleOnline = () => {
      if (socket.connected) {
        setConnection("live");
        stopPolling();
        void loadSnapshot();
      } else {
        socket.connect();
      }
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    socket.on("kot:sync", (snapshot: KitchenOrder[]) => {
      if (!Array.isArray(snapshot)) return;
      const active = snapshot.filter((order) => isBoardStatus(order.status));
      setOrders((current) => mergeOrders(current, active));
      setColumns((current) => {
        const next = { ...current };
        for (const order of active) {
          if (isBoardStatus(order.status)) next[order.id] = order.status;
        }
        return next;
      });
    });

    socket.on("order:new", (order: KitchenOrder) => {
      if (!order?.id) return;
      const newStatus = order.status;
      setOrders((current) => upsertOrder(current, order));
      if (isBoardStatus(newStatus)) {
        setColumns((current) => ({ ...current, [order.id]: newStatus }));
      }
      flash(order.id);
      if (soundOnRef.current) beep();
    });

    socket.on(
      "order:status",
      (payload: { orderId?: string; status?: OrderStatus }) => {
        if (!payload?.orderId || !payload.status) return;
        const orderId = payload.orderId;
        const nextStatus = payload.status;
        setOrders((current) => applyStatus(current, orderId, nextStatus));
        if (isBoardStatus(nextStatus)) {
          setColumns((current) => {
            const known = current[orderId] ?? columnsRef.current[orderId];
            if (known === nextStatus) return current;
            return { ...current, [orderId]: nextStatus };
          });
        } else {
          scheduleClear(orderId);
        }
      }
    );

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      socket.close();
      socketRef.current = null;
      stopPolling();
    };
  }, [accessToken, beep, flash, loadSnapshot, scheduleClear, startPolling, stopPolling]);

  useEffect(
    () => () => {
      for (const timer of clearTimers.current.values()) {
        window.clearTimeout(timer);
      }
      clearTimers.current.clear();
    },
    []
  );

  async function sendStatus(orderId: string, status: OrderStatus): Promise<void> {
    const socket = socketRef.current;
    const rest = () =>
      apiVoid(`/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

    if (!socket?.connected) {
      await rest();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        rest().then(resolve, reject);
      }, 3_000);

      socket.emit(
        "order:update_status",
        { orderId, status },
        (response?: { ok?: boolean; error?: string }) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          if (response?.ok) resolve();
          else
            reject(
              new ApiRequestError(
                409,
                response?.error ?? "INTERNAL_ERROR",
                "The status change was rejected."
              )
            );
        }
      );
    });
  }

  async function advance(order: KitchenOrder, status: OrderStatus) {
    if (pendingId) return;
    setPendingId(order.id);
    const previous = order.status;
    setOrders((current) => applyStatus(current, order.id, status));
    if (isBoardStatus(status)) {
      setColumns((current) => ({ ...current, [order.id]: status }));
    } else {
      scheduleClear(order.id);
    }

    try {
      await sendStatus(order.id, status);
      setListError(null);
    } catch (error) {
      // Roll back the optimistic card when the server rejects or is unreachable.
      setOrders((current) => applyStatus(current, order.id, previous));
      if (isBoardStatus(previous)) {
        setColumns((current) => ({ ...current, [order.id]: previous }));
      }
      toast.push(statusChangeError(error), "error");
      if (error instanceof ApiRequestError && error.code === "INVALID_STATUS_TRANSITION") {
        void loadSnapshot();
      }
    } finally {
      setPendingId(null);
    }
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    soundOnRef.current = next;
    saveSoundEnabled(next);
    if (next) beep();
  }

  async function signOut() {
    await logout();
    router.replace("/login");
  }

  const counts = useMemo(() => countByStatus(orders), [orders]);
  const visible = useMemo(() => filterBoard(orders, filter), [orders, filter]);

  if (authStatus === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-300">
        <p role="status">Opening the kitchen board…</p>
      </main>
    );
  }

  if (authStatus === "anonymous") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-300">
        <p role="status">Redirecting to sign in…</p>
      </main>
    );
  }

  const visibleColumns = filter === "all" ? BOARD_COLUMNS : [filter];

  return (
    <main className="min-h-screen bg-gray-950 pb-10 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900 px-4 py-3">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-orange-400">
              QuickMenu QR · Kitchen
            </p>
            <h1 className="truncate text-xl font-bold">
              {restaurant?.name ?? "Kitchen board"}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              role="status"
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${
                connection === "live"
                  ? "bg-green-900/60 text-green-200"
                  : connection === "connecting"
                    ? "bg-gray-800 text-gray-300"
                    : "bg-red-900/70 text-red-100"
              }`}
            >
              <span
                aria-hidden
                className={`h-2.5 w-2.5 rounded-full ${
                  connection === "live"
                    ? "bg-green-400"
                    : connection === "connecting"
                      ? "bg-gray-400"
                      : "bg-red-400"
                }`}
              />
              {connection === "live"
                ? "Live"
                : connection === "connecting"
                  ? "Connecting…"
                  : "Reconnecting…"}
            </span>

            {soundOn && !soundUnlocked && (
              <button
                type="button"
                onClick={beep}
                className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Enable sound
              </button>
            )}

            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={soundOn}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                soundOn
                  ? "border-green-500 bg-green-900/40 text-green-200"
                  : "border-gray-600 bg-gray-800 text-gray-300"
              }`}
            >
              Sound {soundOn ? "ON" : "OFF"}
            </button>

            {user?.role === "owner" && (
              <Link
                href="/dashboard/menu"
                className="rounded-lg border border-gray-600 px-3 py-1.5 text-sm font-semibold text-gray-200"
              >
                Dashboard
              </Link>
            )}

            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg border border-gray-600 px-3 py-1.5 text-sm font-semibold text-gray-200"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {connection === "offline" && (
        <div
          role="alert"
          className="border-b border-red-700 bg-red-700 px-4 py-2 text-center text-sm font-semibold text-white"
        >
          Reconnecting… Showing the latest orders and refreshing every 5 seconds.
        </div>
      )}

      {listError && (
        <p
          role="alert"
          className="mx-auto mt-3 max-w-[1600px] rounded-lg bg-red-950 px-4 py-2 text-sm text-red-200"
        >
          {listError}
        </p>
      )}

      <nav
        aria-label="Order filters"
        className="mx-auto flex max-w-[1600px] gap-2 overflow-x-auto px-4 py-3"
      >
        {(
          [
            ["all", "All"],
            ["new", "New"],
            ["preparing", "Preparing"],
            ["ready", "Ready"],
          ] as Array<[BoardFilter, string]>
        ).map(([value, label]) => {
          const count =
            value === "all"
              ? orders.filter((order) => isBoardStatus(order.status)).length
              : counts[value];
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${
                filter === value
                  ? "bg-orange-500 text-white"
                  : "bg-gray-800 text-gray-300"
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </nav>

      <div
        className={`mx-auto grid max-w-[1600px] gap-4 px-4 ${
          visibleColumns.length === 3 ? "min-[900px]:grid-cols-3" : ""
        }`}
      >
        {visibleColumns.map((column) => {
          const columnOrders = visible
            .filter((order) => columnFor(order, columns[order.id]) === column)
            .sort(
              (a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );

          return (
            <section
              key={column}
              aria-labelledby={`column-${column}`}
              className="rounded-2xl bg-gray-900/60 p-2"
            >
              <h2
                id={`column-${column}`}
                className={`flex items-center justify-between rounded-xl border-l-4 px-3 py-2 text-base font-bold ${COLUMN_STYLES[column].header}`}
              >
                <span>{COLUMN_LABELS[column]}</span>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-sm text-gray-900">
                  {counts[column]}
                </span>
              </h2>

              <div className="mt-2 space-y-2">
                {columnOrders.length === 0 && (
                  <p className="rounded-xl border border-dashed border-gray-700 px-3 py-8 text-center text-sm text-gray-500">
                    No orders
                  </p>
                )}

                {columnOrders.map((order) => {
                  const action = primaryAction(order.status);
                  const clearing =
                    order.status === "served" || order.status === "cancelled";
                  const flashing = flashIds.has(order.id);
                  const minutes = elapsedMinutes(order.createdAt, now);

                  return (
                    <article
                      key={order.id}
                      aria-label={`Order ${order.orderNumber}, table ${order.table.number}`}
                      className={`rounded-xl border-2 bg-white p-3 text-gray-900 shadow-lg transition ${
                        COLUMN_STYLES[column].card
                      } ${clearing ? "opacity-60" : ""} ${
                        flashing ? "ring-4 ring-orange-400" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xl font-extrabold leading-tight">
                            #{order.orderNumber}
                          </p>
                          <p className="text-base font-semibold text-gray-700">
                            Table {order.table.number}
                          </p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
                              order.status === "new"
                                ? "bg-blue-100 text-blue-800"
                                : order.status === "preparing"
                                  ? "bg-amber-100 text-amber-900"
                                  : order.status === "ready"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-gray-200 text-gray-700"
                            }`}
                          >
                            {STATUS_LABELS[order.status]}
                          </span>
                          <p className="mt-1 text-sm font-semibold text-gray-500">
                            {minutes} min{minutes === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>

                      <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                        {order.items.map((item, index) => (
                          <li key={`${order.id}-${index}`} className="text-sm">
                            <span className="font-bold">{item.quantity}×</span>{" "}
                            <span className="font-medium">{item.name}</span>
                            {item.variant && (
                              <span className="text-gray-500"> · {item.variant}</span>
                            )}
                            {item.specialInstructions && (
                              <p className="ml-4 mt-1 rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-900">
                                {item.specialInstructions}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>

                      {order.notes && (
                        <p className="mt-2 rounded-lg bg-yellow-200 px-2 py-1.5 text-sm font-semibold text-yellow-950">
                          Note: {order.notes}
                        </p>
                      )}

                      {clearing ? (
                        <p className="mt-3 text-center text-sm font-semibold text-gray-500">
                          {STATUS_LABELS[order.status]} — clearing in 10 seconds
                        </p>
                      ) : (
                        <div className="mt-3 flex gap-2">
                          {action && (
                            <button
                              type="button"
                              disabled={pendingId === order.id}
                              onClick={() => void advance(order, action.status)}
                              className="flex-1 rounded-xl bg-gray-900 px-3 py-3 text-sm font-bold text-white disabled:opacity-60"
                            >
                              {pendingId === order.id ? "Saving…" : action.label}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={pendingId === order.id}
                            onClick={() => setConfirmCancel(order)}
                            className="rounded-xl border-2 border-red-200 px-3 py-3 text-sm font-bold text-red-700 disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {confirmCancel && (
        <ConfirmDialog
          title="Cancel this order?"
          message={`Order #${confirmCancel.orderNumber} for table ${confirmCancel.table.number} will be cancelled. The customer sees the change immediately.`}
          confirmLabel="Cancel order"
          cancelLabel="Keep order"
          danger
          busy={pendingId === confirmCancel.id}
          onConfirm={() => {
            const order = confirmCancel;
            setConfirmCancel(null);
            void advance(order, "cancelled");
          }}
          onCancel={() => setConfirmCancel(null)}
        />
      )}
    </main>
  );
}
