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
import { DishImage } from "../../../components/DishImage";
import {
  ArrowRightIcon,
  BagIcon,
  CheckIcon,
  CloseIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
} from "../../../components/icons";
import { eyebrowClass } from "../../../components/ui";

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
      <main className="customer-shell flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas p-6">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ink" />
        <p className="text-sm text-muted">Loading menu…</p>
      </main>
    );
  }

  if (!menu) {
    return (
      <main className="customer-shell flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line text-muted">
          <BagIcon size={22} />
        </span>
        <h1 className="display text-2xl text-ink">Menu unavailable</h1>
        <p className="max-w-[32ch] text-sm leading-relaxed text-muted">
          {loadError ?? "This table link is not valid."}
        </p>
        <button
          type="button"
          onClick={() => void loadMenu(lang, { dietary, exclude, q: debouncedSearch })}
          className="mt-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-canvas"
        >
          Try again
        </button>
      </main>
    );
  }

  const visibleCategories = menu.categories.filter(
    (category) => category.items.length > 0
  );
  const activeFilters = dietary.length + exclude.length;

  return (
    <main
      className="customer-shell relative min-h-screen bg-canvas pb-32"
      dir={rtl ? "rtl" : "ltr"}
    >
      <header className="px-5 pb-2 pt-7">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={eyebrowClass}>Table {menu.table.number} · Dine in</p>
            <h1 className="display mt-1.5 truncate text-[32px] leading-none text-ink">
              {menu.restaurant.name}
            </h1>
          </div>
          <label className="relative shrink-0">
            <span className="sr-only">Language</span>
            <select
              value={lang}
              onChange={(event) => {
                const next = event.target.value;
                setLang(next);
                saveLanguage(qrToken, next);
              }}
              className="max-w-[8.5rem] appearance-none truncate rounded-full border border-line bg-surface py-2 pl-3 pr-7 text-xs font-medium text-ink2 outline-none focus:border-line-strong"
              aria-label="Language"
            >
              {languages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.nativeName} · {language.name}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </label>
        </div>

        <p className="mt-3 max-w-[34ch] text-[13px] leading-relaxed text-muted">
          Everything is cooked to order. Add dishes as you go and send the whole
          table&rsquo;s order at the end.
        </p>

        {warnings.includes("TRANSLATION_UNAVAILABLE") && (
          <p
            className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn"
            role="status"
          >
            Translation is temporarily unavailable. Showing the original language.
          </p>
        )}
      </header>

      <section className="px-5 pb-1 pt-3" aria-label="Search and filters">
        <label className="relative block">
          <span className="sr-only">Search the menu</span>
          <SearchIcon
            size={17}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the menu"
            className="w-full rounded-full border border-line bg-surface py-3 pl-11 pr-4 text-sm text-ink placeholder:text-muted/80 outline-none transition focus:border-line-strong"
          />
        </label>

        <div
          className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1"
          aria-label="Dietary filters"
        >
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
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${
                  selected
                    ? "border-ink bg-ink text-canvas"
                    : "border-line bg-transparent text-ink2 hover:border-line-strong"
                }`}
              >
                {labelFor(tag)}
              </button>
            );
          })}
        </div>
        <div
          className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-2 pt-1.5"
          aria-label="Allergen exclusions"
        >
          <span className="shrink-0 self-center pr-1 text-[11px] uppercase tracking-[0.12em] text-muted">
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
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${
                  selected
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-transparent text-muted hover:border-line-strong"
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
          className="no-scrollbar sticky top-0 z-10 -mx-0 flex gap-5 overflow-x-auto border-b border-line bg-canvas/95 px-5 backdrop-blur"
        >
          {visibleCategories.map((category) => {
            const active = activeCategory === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  categoryRefs.current
                    .get(category.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                aria-current={active ? "true" : undefined}
                className={`relative shrink-0 whitespace-nowrap py-3.5 text-[13px] tracking-tight transition ${
                  active ? "font-semibold text-ink" : "font-medium text-muted"
                }`}
              >
                {category.name}
                <span className="ms-1.5 text-[11px] tabular text-muted/70">
                  {itemCountsByCategory.get(category.id) ?? 0}
                </span>
                <span
                  className={`absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-ink transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
              </button>
            );
          })}
        </nav>
      )}

      {refreshing && (
        <p className="px-5 pt-3 text-[11px] uppercase tracking-[0.12em] text-muted" role="status">
          Updating menu…
        </p>
      )}

      <div className="px-5 pb-4 pt-5">
        {visibleCategories.length === 0 && (
          <div className="mt-6 rounded-[18px] border border-dashed border-line px-6 py-12 text-center">
            <p className="display text-xl text-ink">Nothing here yet</p>
            <p className="mx-auto mt-1 max-w-[30ch] text-sm leading-relaxed text-muted">
              No dishes match your search or filters.
            </p>
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDietary([]);
                  setExclude([]);
                }}
                className="mt-4 text-sm font-semibold text-accent underline underline-offset-4"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="space-y-8">
          {visibleCategories.map((category, categoryIndex) => (
            <section
              key={category.id}
              id={`category-${category.id}`}
              ref={(element) => {
                if (element) categoryRefs.current.set(category.id, element);
                else categoryRefs.current.delete(category.id);
              }}
              className="scroll-mt-14"
            >
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="display text-[22px] leading-none text-ink">
                  {category.name}
                </h2>
                <span className="text-[11px] uppercase tracking-[0.12em] text-muted">
                  {String(categoryIndex + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="space-y-2.5">
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
      </div>

      {itemCount > 0 && !cartOpen && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-4 pb-4">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="pointer-events-auto mx-auto flex w-full max-w-[448px] items-center gap-3 rounded-full bg-ink py-3 pl-3 pr-4 text-canvas shadow-pill transition active:scale-[0.99]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas/10 text-[13px] font-semibold tabular">
              {itemCount}
            </span>
            <span className="flex-1 text-left text-sm font-medium">
              View cart
            </span>
            <span className="tabular text-sm font-semibold">
              {formatPrice(totalMinor / 100, currency)}
            </span>
            <ArrowRightIcon size={16} className="opacity-70" />
          </button>
        </div>
      )}

      {variantItem && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-ink/45 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label={variantItem.name}
        >
          <div className="mx-auto w-full max-w-[480px] animate-sheet-up rounded-t-[28px] bg-canvas shadow-sheet">
            <div className="flex justify-center pt-2.5">
              <span className="h-1 w-9 rounded-full bg-line-strong" />
            </div>
            <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-4">
              <div className="min-w-0">
                <p className={eyebrowClass}>Choose a size</p>
                <h3 className="display mt-1 truncate text-2xl leading-tight text-ink">
                  {variantItem.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setVariantItem(null)}
                className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink2"
                aria-label="Close variant picker"
              >
                <CloseIcon size={16} />
              </button>
            </div>
            <div className="space-y-2 px-5 pb-6">
              {variantItem.variants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => handleAdd(variantItem, variant)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left transition hover:border-ink/30"
                >
                  <span className="font-medium text-ink">{variant.name}</span>
                  <span className="flex items-center gap-2 text-sm text-ink2">
                    <span className="tabular">{formatPrice(variant.price, currency)}</span>
                    <ArrowRightIcon size={15} className="text-muted" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {cartOpen && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-ink/45 animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto flex max-h-[92vh] w-full max-w-[480px] animate-sheet-up flex-col rounded-t-[28px] bg-canvas shadow-sheet">
            <div className="flex justify-center pt-2.5">
              <span className="h-1 w-9 rounded-full bg-line-strong" />
            </div>

            <div className="flex items-center justify-between px-5 pb-3 pt-3">
              <div>
                <p className={eyebrowClass}>Table {menu.table.number}</p>
                <h2 className="display text-2xl leading-tight text-ink">Your cart</h2>
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink2"
                aria-label="Close cart"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <div className="no-scrollbar flex-1 space-y-2.5 overflow-y-auto px-5 pb-2">
              {cart.length === 0 && (
                <p className="py-10 text-center text-sm text-muted">Your cart is empty.</p>
              )}
              {cart.map((line) => (
                <div key={line.key} className="rounded-2xl border border-line bg-surface p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium leading-snug text-ink">{line.name}</p>
                      {line.variantName && (
                        <p className="mt-0.5 text-xs text-muted">{line.variantName}</p>
                      )}
                      <p className="mt-1 text-[13px] tabular text-ink2">
                        {formatPrice(line.unitPrice, currency)}
                      </p>
                      {!line.isAvailable && (
                        <p className="mt-1 text-xs font-medium text-danger">
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
                      className="shrink-0 text-xs font-medium text-muted underline underline-offset-4 hover:text-danger"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        clearAttempt();
                        setCart((current) =>
                          changeQuantity(current, line.key, line.quantity - 1)
                        );
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-canvas text-ink2 transition hover:border-line-strong"
                      aria-label={`Decrease ${line.name}`}
                    >
                      <MinusIcon size={15} />
                    </button>
                    <span className="min-w-6 text-center text-sm font-semibold tabular text-ink">
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
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-canvas text-ink2 transition hover:border-line-strong"
                      aria-label={`Increase ${line.name}`}
                    >
                      <PlusIcon size={15} />
                    </button>
                    <span className="ms-auto text-sm font-semibold tabular text-ink">
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
                    className="mt-3 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] text-ink placeholder:text-muted/80 outline-none focus:border-line-strong"
                  />
                </div>
              ))}

              <label className="block pt-1">
                <span className="text-[13px] font-medium text-ink2">Order notes</span>
                <textarea
                  value={notes}
                  onChange={(event) => {
                    clearAttempt();
                    setNotes(event.target.value);
                  }}
                  maxLength={500}
                  rows={2}
                  placeholder="Please serve together"
                  className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] text-ink placeholder:text-muted/80 outline-none focus:border-line-strong"
                />
              </label>

              {orderError && (
                <p
                  className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] leading-relaxed text-danger"
                  role="alert"
                >
                  {orderError}
                </p>
              )}
            </div>

            <div className="safe-bottom mt-2 border-t border-line bg-canvas px-5 pt-4">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-[0.12em] text-muted">
                  Total
                </span>
                <span className="display text-[26px] leading-none tabular text-ink">
                  {formatPrice(totalMinor / 100, currency)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void placeOrder()}
                disabled={placing || cart.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-3.5 text-sm font-semibold text-canvas transition disabled:opacity-50"
              >
                {placing ? "Placing order…" : "Place order"}
                {!placing && <ArrowRightIcon size={16} className="opacity-80" />}
              </button>
              <p className="mx-auto mb-1 mt-2.5 max-w-[34ch] text-center text-[11px] leading-relaxed text-muted">
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
      className={`flex gap-3.5 rounded-[18px] border border-line bg-surface p-2.5 transition ${
        item.isAvailable ? "" : "opacity-55"
      }`}
    >
      <DishImage
        src={item.images[0]?.url}
        name={item.name}
        width={240}
        sizes="96px"
        className="h-[92px] w-[92px] shrink-0 rounded-[13px]"
      />

      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-[15px] font-semibold leading-snug tracking-tight text-ink">
            {item.name}
          </h3>
          <p className="whitespace-nowrap text-[13px] font-medium tabular text-ink2">
            {range.min === range.max
              ? formatPrice(range.min, currency)
              : `${formatPrice(range.min, currency)}+`}
          </p>
        </div>

        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted">
            {item.description}
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {item.dietaryTags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 text-[10.5px] uppercase tracking-[0.08em] text-success"
            >
              <CheckIcon size={11} />
              {labelFor(tag)}
            </span>
          ))}
          {item.allergens.length > 0 && (
            <span className="text-[10.5px] tracking-[0.02em] text-warn">
              contains {item.allergens.join(", ")}
            </span>
          )}
        </div>

        <div className="mt-auto pt-2">
          {item.isAvailable ? (
            <button
              type="button"
              onClick={onAdd}
              aria-label="+ Add"
              className="inline-flex items-center gap-1 rounded-full border border-ink/15 bg-canvas px-3 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-ink/35 hover:bg-accent-soft hover:text-accent"
            >
              <PlusIcon size={13} />
              Add
            </button>
          ) : (
            <p className="text-[12px] font-medium text-danger">Out of stock</p>
          )}
        </div>
      </div>
    </article>
  );
}
