"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALLOWED_ALLERGENS,
  ALLOWED_DIETARY_TAGS,
  SUPPORTED_LANGUAGES,
} from "@quickmenu/shared";
import type {
  LanguageOption,
  PublicMenu,
  PublicMenuItem,
  PublicMenuVariant,
  PublicOrderCreated,
} from "@quickmenu/shared";
import {
  ApiRequestError,
  apiEnvelope,
  apiRequest,
  formatPrice,
  toMinor,
} from "../../../lib/api";
import { optimizedImageUrl } from "../../../lib/images";
import {
  addCartLine,
  applyAvailability,
  cartItemCount,
  cartTotalMinor,
  changeQuantity,
  removeCartLine,
  setLineInstructions,
  type CartLine,
  type PersistedCart,
} from "../../../lib/cart";
import { buildMenuQuery, priceRange, toggleFilterValue } from "../../../lib/menuFilters";
import { publicMenuSocket } from "../../../lib/realtime";
import {
  clearSavedCart,
  getSavedLanguage,
  newIdempotencyKey,
  readCart,
  saveCart,
  saveLanguage,
  saveMenuPath,
  saveTrackingToken,
} from "../../../lib/storage";

interface CustomerMenuProps {
  qrToken: string;
  initialMenu: PublicMenu | null;
  initialWarnings: string[];
}

function labelFor(value: string): string {
  return value.replace(/_/g, " ");
}

export function CustomerMenu({
  qrToken,
  initialMenu,
  initialWarnings,
}: CustomerMenuProps) {
  const router = useRouter();

  const [menu, setMenu] = useState<PublicMenu | null>(initialMenu);
  const [warnings, setWarnings] = useState<string[]>(initialWarnings);
  const [languages, setLanguages] = useState<LanguageOption[]>([
    ...SUPPORTED_LANGUAGES,
  ]);
  const [lang, setLang] = useState(
    initialMenu?.language ?? initialMenu?.restaurant.defaultLanguage ?? "en"
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [loading, setLoading] = useState(!initialMenu);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState("");
  const [cartHydrated, setCartHydrated] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [variantItem, setVariantItem] = useState<PublicMenuItem | null>(null);
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(
    initialMenu?.categories[0]?.id ?? null
  );

  const placingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const firstLoad = useRef(true);
  const categoryRefs = useRef(new Map<string, HTMLElement>());

  const loadMenu = useCallback(
    async (nextLang: string, filters: { dietary: string[]; exclude: string[]; q: string }, quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      try {
        const query = buildMenuQuery({
          lang: nextLang,
          dietary: filters.dietary,
          exclude: filters.exclude,
          q: filters.q,
        });
        const envelope = await apiEnvelope<PublicMenu>(
          `/public/menu/${encodeURIComponent(qrToken)}${query}`
        );
        setMenu(envelope.data);
        setWarnings(envelope.warnings ?? []);
        setLoadError(null);
      } catch (error) {
        setLoadError(
          error instanceof ApiRequestError
            ? error.message
            : "We could not load the menu. Please try again."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [qrToken]
  );

  /* Initial hydration: saved language and cart for this table. */
  useEffect(() => {
    const savedLanguage = getSavedLanguage(qrToken);
    const savedCart = readCart<PersistedCart>(qrToken);
    if (savedCart) {
      setCart(Array.isArray(savedCart.lines) ? savedCart.lines : []);
      setNotes(typeof savedCart.notes === "string" ? savedCart.notes : "");
    }
    setCartHydrated(true);

    if (savedLanguage && savedLanguage !== lang) {
      setLang(savedLanguage);
      void loadMenu(savedLanguage, { dietary, exclude, q: search });
    } else {
      void loadMenu(lang, { dietary, exclude, q: search });
    }
    // The remaining dependencies are read once, on mount.
  }, [qrToken]);

  /* Language metadata is public and cached for an hour by the API. */
  useEffect(() => {
    apiRequest<LanguageOption[]>("/public/languages")
      .then(setLanguages)
      .catch(() => {
        /* Fall back to the bundled list. */
      });
  }, []);

  /* Persist the cart per table (FR-23). */
  useEffect(() => {
    if (!cartHydrated) return;
    saveCart(qrToken, { lines: cart, notes } satisfies PersistedCart);
  }, [cart, notes, qrToken, cartHydrated]);

  /* RTL and document language follow the selected language (FR-20). */
  useEffect(() => {
    const option = languages.find((entry) => entry.code === lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = option?.rtl ? "rtl" : "ltr";
    return () => {
      document.documentElement.lang = "en";
      document.documentElement.dir = "ltr";
    };
  }, [lang, languages]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  /* Refetch when the filters change (skip the mount request above). */
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    void loadMenu(lang, { dietary, exclude, q: debouncedSearch }, true);
  }, [lang, dietary, exclude, debouncedSearch, loadMenu]);

  /* Live availability (FR-27). */
  useEffect(() => {
    const socket = publicMenuSocket();
    socket.on("connect", () => {
      socket.emit("menu:join", { qrToken });
    });
    socket.on("menu:updated", (payload: { itemId?: string; isAvailable?: boolean }) => {
      if (!payload?.itemId || typeof payload.isAvailable !== "boolean") return;
      setMenu((current) => {
        if (!current) return current;
        return {
          ...current,
          categories: current.categories.map((category) => ({
            ...category,
            items: category.items.map((item) =>
              item.id === payload.itemId
                ? { ...item, isAvailable: payload.isAvailable as boolean }
                : item
            ),
          })),
        };
      });
      setCart((current) =>
        applyAvailability(current, payload.itemId as string, payload.isAvailable as boolean)
      );
    });
    return () => {
      socket.close();
    };
  }, [qrToken]);

  /* Scroll-spy for the sticky category tabs. */
  useEffect(() => {
    if (!menu) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveCategory(visible[0].target.id.replace("category-", ""));
        }
      },
      { rootMargin: "-150px 0px -60% 0px", threshold: 0 }
    );
    for (const element of categoryRefs.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, [menu]);

  const clearAttempt = () => {
    idempotencyKeyRef.current = null;
    setOrderError(null);
  };

  const handleAdd = (item: PublicMenuItem, variant: PublicMenuVariant | null) => {
    clearAttempt();
    setCart((current) => addCartLine(current, item, variant));
    setVariantItem(null);
  };

  const itemCount = cartItemCount(cart);
  const totalMinor = cartTotalMinor(cart);
  const currency = menu?.restaurant.currency ?? "PKR";
  const rtl = languages.find((entry) => entry.code === lang)?.rtl ?? false;

  const itemCountsByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const category of menu?.categories ?? []) {
      map.set(category.id, category.items.length);
    }
    return map;
  }, [menu]);

  async function placeOrder() {
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
      saveMenuPath(created.id, `/m/${qrToken}`);
      clearSavedCart(qrToken);
      router.push(`/order/${created.id}`);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.code === "ITEM_UNAVAILABLE") {
          const names = (error.details ?? [])
            .map((detail) => detail.name)
            .filter((name): name is string => Boolean(name));
          setOrderError(
            names.length > 0
              ? `These items are no longer available: ${names.join(", ")}. Please remove them and try again.`
              : "Some items are no longer available. Please update your cart."
          );
          void loadMenu(lang, { dietary, exclude, q: debouncedSearch }, true);
        } else if (error.code === "VALIDATION_ERROR") {
          const issues = (error.details ?? [])
            .map((detail) => detail.issue)
            .filter((issue): issue is string => Boolean(issue));
          setOrderError(issues[0] ?? error.message);
        } else if (error.code === "RATE_LIMITED") {
          setOrderError("Too many order attempts. Please wait a minute and try again.");
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

  if (!menu) {
    return (
      <main className="customer-shell flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Menu unavailable</h1>
        <p className="text-gray-600">{loadError ?? "This table link is not valid."}</p>
        <button
          type="button"
          onClick={() =>
            void loadMenu(lang, { dietary, exclude, q: debouncedSearch })
          }
          className="rounded-xl bg-orange-500 px-5 py-2 font-medium text-white"
        >
          Try again
        </button>
      </main>
    );
  }

  const visibleCategories = menu.categories.filter(
    (category) => category.items.length > 0
  );

  return (
    <main
      className="customer-shell min-h-screen bg-gray-50 pb-28"
      dir={rtl ? "rtl" : "ltr"}
    >
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Table {menu.table.number}</p>
            <h1 className="truncate text-xl font-bold tracking-tight text-gray-900">
              {menu.restaurant.name}
            </h1>
          </div>
          <label className="text-xs font-medium text-gray-600">
            <span className="sr-only">Language</span>
            <select
              value={lang}
              onChange={(event) => {
                const next = event.target.value;
                setLang(next);
                saveLanguage(qrToken, next);
              }}
              className="mt-1 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
              aria-label="Language"
            >
              {languages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.nativeName} · {language.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {warnings.includes("TRANSLATION_UNAVAILABLE") && (
          <p
            className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
            role="status"
          >
            Translation is temporarily unavailable. Showing the original language.
          </p>
        )}
      </header>

      <section className="bg-white px-4 pb-3" aria-label="Search and filters">
        <label className="block">
          <span className="sr-only">Search the menu</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search dishes…"
            className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-2 flex gap-1 overflow-x-auto pb-1" aria-label="Dietary filters">
          {ALLOWED_DIETARY_TAGS.map((tag) => {
            const selected = dietary.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setDietary((current) => toggleFilterValue(current, tag));
                  clearAttempt();
                }}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium capitalize ${
                  selected
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {labelFor(tag)}
              </button>
            );
          })}
        </div>

        <div className="mt-1 flex gap-1 overflow-x-auto pb-1" aria-label="Allergen exclusions">
          <span className="whitespace-nowrap py-1 text-[11px] uppercase tracking-wide text-gray-400">
            No
          </span>
          {ALLOWED_ALLERGENS.map((allergen) => {
            const selected = exclude.includes(allergen);
            return (
              <button
                key={allergen}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setExclude((current) => toggleFilterValue(current, allergen));
                  clearAttempt();
                }}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium capitalize ${
                  selected
                    ? "bg-amber-900 text-white"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {allergen}
              </button>
            );
          })}
        </div>
      </section>

      {visibleCategories.length > 1 && (
        <nav
          aria-label="Menu categories"
          className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur"
        >
          {visibleCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                categoryRefs.current
                  .get(category.id)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              aria-current={activeCategory === category.id ? "true" : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                activeCategory === category.id
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {category.name} ({itemCountsByCategory.get(category.id) ?? 0})
            </button>
          ))}
        </nav>
      )}

      {refreshing && (
        <p className="px-4 pt-2 text-xs text-gray-500" role="status">
          Updating menu…
        </p>
      )}

      <div className="space-y-6 px-4 py-4">
        {visibleCategories.length === 0 && (
          <p className="rounded-xl bg-white px-4 py-10 text-center text-gray-500">
            No items match your search or filters.
          </p>
        )}

        {visibleCategories.map((category) => (
          <section
            key={category.id}
            id={`category-${category.id}`}
            ref={(element) => {
              if (element) categoryRefs.current.set(category.id, element);
              else categoryRefs.current.delete(category.id);
            }}
            className="scroll-mt-16"
          >
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
                    if (item.variants.length > 0) setVariantItem(item);
                    else handleAdd(item, null);
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
                  onClick={() => handleAdd(variantItem, variant)}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-left"
                >
                  <span className="font-medium">{variant.name}</span>
                  <span className="text-gray-600">{formatPrice(variant.price, currency)}</span>
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
                      {!line.isAvailable && (
                        <p className="mt-1 text-xs font-medium text-red-600">
                          No longer available — remove it before ordering.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        clearAttempt();
                        setCart((current) => removeCartLine(current, line.key));
                      }}
                      className="text-sm text-red-600"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        clearAttempt();
                        setCart((current) =>
                          changeQuantity(current, line.key, line.quantity - 1)
                        );
                      }}
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
                      onClick={() => {
                        clearAttempt();
                        setCart((current) =>
                          changeQuantity(current, line.key, line.quantity + 1)
                        );
                      }}
                      className="h-9 w-9 rounded-lg border border-gray-300 text-lg"
                      aria-label={`Increase ${line.name}`}
                    >
                      +
                    </button>
                    <span className="ml-auto font-semibold">
                      {formatPrice(
                        (toMinor(line.unitPrice) * line.quantity) / 100,
                        currency
                      )}
                    </span>
                  </div>

                  <input
                    value={line.instructions}
                    onChange={(event) => {
                      clearAttempt();
                      setCart((current) =>
                        setLineInstructions(current, line.key, event.target.value)
                      );
                    }}
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
                  onChange={(event) => {
                    clearAttempt();
                    setNotes(event.target.value);
                  }}
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
  const range = priceRange(item);
  return (
    <article
      className={`flex gap-3 rounded-2xl border border-gray-200 bg-white p-3 ${
        item.isAvailable ? "" : "opacity-60"
      }`}
    >
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-orange-100 text-2xl">
        {item.images[0] ? (
          <img
            src={optimizedImageUrl(item.images[0].url, 800)}
            alt={item.name}
            loading="lazy"
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
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <h3 className="min-w-0 font-semibold text-gray-900">{item.name}</h3>
          <p className="whitespace-nowrap text-right font-medium text-gray-800">
            {range.min === range.max
              ? formatPrice(range.min, currency)
              : `${formatPrice(range.min, currency)} – ${formatPrice(range.max, currency)}`}
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
              {labelFor(tag)}
            </span>
          ))}
          {item.allergens.map((allergen) => (
            <span
              key={allergen}
              className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800"
            >
              {allergen}
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
