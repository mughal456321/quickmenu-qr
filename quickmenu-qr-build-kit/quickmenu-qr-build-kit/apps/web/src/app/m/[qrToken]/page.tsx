"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  PublicMenu,
  PublicMenuItem,
  PublicMenuVariant,
  PublicOrderCreated,
} from "@quickmenu/shared";
import { ApiRequestError, apiRequest, formatPrice, toMinor } from "../../../lib/api";
import {
  newIdempotencyKey,
  saveTrackingToken,
} from "../../../lib/storage";

interface CartLine {
  key: string;
  itemId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  instructions: string;
}

function cartKey(itemId: string, variantId: string | null): string {
  return `${itemId}:${variantId ?? "base"}`;
}

export default function CustomerMenuPage({
  params,
}: {
  params: { qrToken: string };
}) {
  const { qrToken } = params;
  const router = useRouter();

  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [variantItem, setVariantItem] = useState<PublicMenuItem | null>(null);
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const placingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const loadMenu = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<PublicMenu>(
        `/public/menu/${encodeURIComponent(qrToken)}`
      );
      setMenu(data);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof ApiRequestError
          ? error.message
          : "We could not load the menu. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [qrToken]);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  const clearAttempt = () => {
    idempotencyKeyRef.current = null;
    setOrderError(null);
  };

  const addLine = (
    item: PublicMenuItem,
    variant: PublicMenuVariant | null,
    quantity = 1
  ) => {
    clearAttempt();
    const key = cartKey(item.id, variant?.id ?? null);
    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) =>
          line.key === key
            ? { ...line, quantity: Math.min(50, line.quantity + quantity) }
            : line
        );
      }
      return [
        ...current,
        {
          key,
          itemId: item.id,
          variantId: variant?.id ?? null,
          name: item.name,
          variantName: variant?.name ?? null,
          unitPrice: variant?.price ?? item.price,
          quantity,
          instructions: "",
        },
      ];
    });
    setVariantItem(null);
  };

  const setQuantity = (key: string, quantity: number) => {
    clearAttempt();
    if (quantity < 1) {
      setCart((current) => current.filter((line) => line.key !== key));
      return;
    }
    setCart((current) =>
      current.map((line) =>
        line.key === key ? { ...line, quantity: Math.min(50, quantity) } : line
      )
    );
  };

  const setInstructions = (key: string, instructions: string) => {
    clearAttempt();
    setCart((current) =>
      current.map((line) => (line.key === key ? { ...line, instructions } : line))
    );
  };

  const removeLine = (key: string) => {
    clearAttempt();
    setCart((current) => current.filter((line) => line.key !== key));
  };

  const itemCount = cart.reduce((total, line) => total + line.quantity, 0);
  const totalMinor = cart.reduce(
    (total, line) => total + toMinor(line.unitPrice) * line.quantity,
    0
  );
  const currency = menu?.restaurant.currency ?? "PKR";

  const categoryNames = useMemo(
    () => menu?.categories.map((category) => category.name) ?? [],
    [menu]
  );

  async function placeOrder() {
    // A ref guard makes a fast double tap create one order even before React
    // re-renders the disabled button. The same Idempotency-Key is reused on
    // retry, so a network retry also creates only one order.
    if (placingRef.current || cart.length === 0) return;
    placingRef.current = true;
    setPlacing(true);
    setOrderError(null);

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newIdempotencyKey();
    }

    try {
      const created = await apiRequest<PublicOrderCreated>("/public/orders", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKeyRef.current },
        body: JSON.stringify({
          qrToken,
          items: cart.map((line) => ({
            itemId: line.itemId,
            variantId: line.variantId,
            quantity: line.quantity,
            specialInstructions: line.instructions.trim() || null,
          })),
          notes: notes.trim() || null,
        }),
      });

      saveTrackingToken(created.id, created.trackingToken);
      router.push(`/order/${created.id}`);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.code === "ITEM_UNAVAILABLE") {
          const names = (error.details ?? [])
            .map((detail) => detail.name)
            .filter((name): name is string => Boolean(name));
          setOrderError(
            names.length > 0
              ? `These items are no longer available: ${names.join(", ")}. Please update your cart.`
              : "Some items are no longer available. Please update your cart."
          );
          void loadMenu();
        } else if (error.code === "VALIDATION_ERROR") {
          const issues = (error.details ?? [])
            .map((detail) => detail.issue)
            .filter((issue): issue is string => Boolean(issue));
          setOrderError(issues[0] ?? error.message);
        } else {
          setOrderError(error.message);
        }
      } else {
        setOrderError("We could not place the order. Please try again.");
      }
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  }

  if (loading && !menu) {
    return (
      <main className="customer-shell flex min-h-screen items-center justify-center p-6">
        <p className="text-gray-500">Loading menu…</p>
      </main>
    );
  }

  if (loadError || !menu) {
    return (
      <main className="customer-shell flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Menu unavailable</h1>
        <p className="text-gray-600">{loadError ?? "This table link is not valid."}</p>
        <button
          type="button"
          onClick={() => void loadMenu()}
          className="rounded-xl bg-orange-500 px-5 py-2 font-medium text-white"
        >
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className="customer-shell min-h-screen bg-gray-50 pb-28">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <p className="text-sm text-gray-500">Table {menu.table.number}</p>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          {menu.restaurant.name}
        </h1>
      </header>

      <nav className="sticky top-[73px] z-10 flex gap-2 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2">
        {categoryNames.map((name) => (
          <span
            key={name}
            className="whitespace-nowrap rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
          >
            {name}
          </span>
        ))}
      </nav>

      <div className="space-y-6 px-4 py-4">
        {menu.categories.map((category) => (
          <section key={category.id}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {category.name}
            </h2>
            <div className="space-y-3">
              {category.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  currency={currency}
                  onAdd={() => {
                    if (item.variants.length > 0) {
                      setVariantItem(item);
                    } else {
                      addLine(item, null);
                    }
                  }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {itemCount > 0 && !cartOpen && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-1/2 z-20 flex w-[min(448px,calc(100%-2rem))] -translate-x-1/2 items-center justify-between rounded-2xl bg-orange-500 px-4 py-3 text-white shadow-lg"
        >
          <span className="font-semibold">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
          <span className="font-bold">{formatPrice(totalMinor / 100, currency)}</span>
          <span className="text-sm">View cart ›</span>
        </button>
      )}

      {variantItem && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40">
          <div className="mx-auto w-full max-w-[480px] rounded-t-2xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{variantItem.name}</h3>
              <button
                type="button"
                onClick={() => setVariantItem(null)}
                className="rounded-full px-3 text-gray-500"
                aria-label="Close variant picker"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-500">Choose a size</p>
            <div className="space-y-2">
              {variantItem.variants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => addLine(variantItem, variant)}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-left"
                >
                  <span className="font-medium">{variant.name}</span>
                  <span className="text-gray-600">
                    {formatPrice(variant.price, currency)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40">
          <div className="mx-auto flex max-h-[90vh] w-full max-w-[480px] flex-col rounded-t-2xl bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="text-lg font-semibold">Your cart</h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="rounded-full px-3 text-gray-500"
                aria-label="Close cart"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {cart.length === 0 && (
                <p className="py-8 text-center text-gray-500">Your cart is empty.</p>
              )}
              {cart.map((line) => (
                <div key={line.key} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-900">{line.name}</p>
                      {line.variantName && (
                        <p className="text-xs text-gray-500">{line.variantName}</p>
                      )}
                      <p className="text-sm text-gray-600">
                        {formatPrice(line.unitPrice, currency)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="text-sm text-red-600"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setQuantity(line.key, line.quantity - 1)}
                      className="h-9 w-9 rounded-lg border border-gray-300 text-lg"
                      aria-label={`Decrease ${line.name}`}
                    >
                      −
                    </button>
                    <span className="min-w-6 text-center font-semibold">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(line.key, line.quantity + 1)}
                      className="h-9 w-9 rounded-lg border border-gray-300 text-lg"
                      aria-label={`Increase ${line.name}`}
                    >
                      +
                    </button>
                    <span className="ml-auto font-semibold">
                      {formatPrice((toMinor(line.unitPrice) * line.quantity) / 100, currency)}
                    </span>
                  </div>

                  <input
                    value={line.instructions}
                    onChange={(event) => setInstructions(line.key, event.target.value)}
                    maxLength={200}
                    placeholder="Special instructions (optional)"
                    className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
              ))}

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Order notes</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Please serve together"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>

              {orderError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {orderError}
                </p>
              )}
            </div>

            <div className="border-t border-gray-200 px-4 py-3">
              <div className="mb-3 flex items-center justify-between text-lg font-bold">
                <span>Total</span>
                <span>{formatPrice(totalMinor / 100, currency)}</span>
              </div>
              <button
                type="button"
                onClick={() => void placeOrder()}
                disabled={placing || cart.length === 0}
                className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white disabled:opacity-60"
              >
                {placing ? "Placing order…" : "Place order"}
              </button>
              <p className="mt-2 text-center text-xs text-gray-500">
                Prices are confirmed by the kitchen when your order is received.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ItemCard({
  item,
  currency,
  onAdd,
}: {
  item: PublicMenuItem;
  currency: string;
  onAdd: () => void;
}) {
  const lowestPrice =
    item.variants.length > 0
      ? Math.min(...item.variants.map((variant) => variant.price))
      : item.price;

  return (
    <article
      className={`flex gap-3 rounded-2xl border border-gray-200 bg-white p-3 ${
        item.isAvailable ? "" : "opacity-60"
      }`}
    >
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-orange-100 text-2xl">
        {item.images[0] ? (
          <img
            src={item.images[0].url}
            alt={item.name}
            className="h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <span aria-hidden>🍽️</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900">{item.name}</h3>
          <p className="whitespace-nowrap font-medium text-gray-800">
            {item.variants.length > 0 ? "From " : ""}
            {formatPrice(lowestPrice, currency)}
          </p>
        </div>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">{item.description}</p>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {item.dietaryTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] text-green-700"
            >
              {tag}
            </span>
          ))}
        </div>

        {item.isAvailable ? (
          <button
            type="button"
            onClick={onAdd}
            className="mt-2 rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white"
          >
            + Add
          </button>
        ) : (
          <p className="mt-2 text-sm font-medium text-red-600">Out of stock</p>
        )}
      </div>
    </article>
  );
}
