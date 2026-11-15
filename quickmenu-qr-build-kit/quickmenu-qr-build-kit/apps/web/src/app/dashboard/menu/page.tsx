"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CategoryWithCount,
  MenuItemWithDetails,
} from "@quickmenu/shared";
import { ApiRequestError, apiEnvelope, apiRequest, apiVoid, formatPrice } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useToast } from "../../../components/Toast";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { DishImage } from "../../../components/DishImage";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "../../../components/icons";
import {
  cardClass,
  eyebrowClass,
  ghostButton,
  primaryButton,
  secondaryButton,
} from "../../../components/ui";
import { ItemDrawer } from "./ItemDrawer";

const PAGE_SIZE = 20;

interface ConfirmState {
  kind: "category" | "force-category" | "item";
  id: string;
  label: string;
  itemCount?: number;
}

export default function MenuBuilderPage() {
  const { refresh } = useAuth();
  const toast = useToast();

  const [categories, setCategories] = useState<CategoryWithCount[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<MenuItemWithDetails[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loadingItems, setLoadingItems] = useState(false);

  const [newCategory, setNewCategory] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [drawerItem, setDrawerItem] = useState<MenuItemWithDetails | "new" | null>(
    null
  );
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [busy, setBusy] = useState(false);

  const sortCategories = useCallback(
    (list: CategoryWithCount[]) =>
      [...list].sort((a, b) => a.displayOrder - b.displayOrder),
    []
  );

  const handleAuthError = useCallback(
    async (error: unknown): Promise<boolean> => {
      if (error instanceof ApiRequestError && error.status === 401) {
        const token = await refresh();
        if (!token) {
          toast.push("Your session expired. Please log in again.", "error");
        }
        return true;
      }
      return false;
    },
    [refresh, toast]
  );

  const loadCategories = useCallback(async () => {
    try {
      const data = await apiRequest<CategoryWithCount[]>("/categories");
      const sorted = sortCategories(data);
      setCategories(sorted);
      setSelectedId((current) =>
        current && sorted.some((category) => category.id === current)
          ? current
          : sorted[0]?.id ?? null
      );
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError
          ? error.message
          : "Could not load categories.",
        "error"
      );
    }
  }, [handleAuthError, sortCategories, toast]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadItems = useCallback(async () => {
    if (!selectedId && !debouncedSearch) {
      setItems([]);
      setTotal(0);
      return;
    }
    setLoadingItems(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      // Searching covers the whole menu; browsing is scoped to the category.
      if (!debouncedSearch && selectedId) params.set("categoryId", selectedId);
      if (debouncedSearch) params.set("q", debouncedSearch);
      const envelope = await apiEnvelope<MenuItemWithDetails[]>(
        `/items?${params.toString()}`
      );
      setItems(envelope.data);
      setTotal(envelope.meta?.total ?? envelope.data.length);
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not load items.",
        "error"
      );
    } finally {
      setLoadingItems(false);
    }
  }, [selectedId, debouncedSearch, page, handleAuthError, toast]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const selectedCategory = useMemo(
    () => categories?.find((category) => category.id === selectedId) ?? null,
    [categories, selectedId]
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function addCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    try {
      const created = await apiRequest<CategoryWithCount>("/categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewCategory("");
      await loadCategories();
      setSelectedId(created.id);
      toast.push("Category added.", "success");
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not add the category.",
        "error"
      );
    }
  }

  async function startRename(category: CategoryWithCount) {
    setRenamingId(category.id);
    setRenameValue(category.name);
  }

  async function saveRename(id: string) {
    const name = renameValue.trim();
    if (!name) return;
    try {
      await apiRequest(`/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setRenamingId(null);
      await loadCategories();
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not rename the category.",
        "error"
      );
    }
  }

  async function toggleCategory(category: CategoryWithCount) {
    try {
      await apiRequest(`/categories/${category.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !category.isActive }),
      });
      await loadCategories();
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not update the category.",
        "error"
      );
    }
  }

  async function moveCategory(id: string, direction: -1 | 1) {
    if (!categories) return;
    const ordered = sortCategories(categories);
    const index = ordered.findIndex((category) => category.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);

    // Optimistic order, then persist the whole list in one transaction.
    setCategories(next.map((category, order) => ({ ...category, displayOrder: order })));
    try {
      await apiRequest("/categories/order", {
        method: "PUT",
        body: JSON.stringify({ ids: next.map((category) => category.id) }),
      });
      await loadCategories();
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push("Could not save the new order.", "error");
      await loadCategories();
    }
  }

  async function confirmDelete() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === "item") {
        await apiVoid(`/items/${confirm.id}`, { method: "DELETE" });
        toast.push("Item deleted.", "success");
        await loadItems();
      } else if (confirm.kind === "force-category") {
        await apiVoid(`/categories/${confirm.id}?force=true`, { method: "DELETE" });
        toast.push("Category and its items deleted.", "success");
        await loadCategories();
        await loadItems();
      } else {
        await apiVoid(`/categories/${confirm.id}`, { method: "DELETE" });
        toast.push("Category deleted.", "success");
        await loadCategories();
        await loadItems();
      }
      setConfirm(null);
    } catch (error) {
      if (await handleAuthError(error)) return;
      if (
        confirm.kind === "category" &&
        error instanceof ApiRequestError &&
        error.code === "CATEGORY_NOT_EMPTY"
      ) {
        setConfirm({
          kind: "force-category",
          id: confirm.id,
          label: confirm.label,
          itemCount: confirm.itemCount,
        });
        return;
      }
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not delete.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleAvailability(item: MenuItemWithDetails) {
    const nextValue = !item.isAvailable;
    setItems((current) =>
      current?.map((entry) =>
        entry.id === item.id ? { ...entry, isAvailable: nextValue } : entry
      ) ?? null
    );
    try {
      await apiRequest(`/items/${item.id}/availability`, {
        method: "PATCH",
        body: JSON.stringify({ isAvailable: nextValue }),
      });
    } catch (error) {
      // Roll back the optimistic toggle on any failure.
      setItems((current) =>
        current?.map((entry) =>
          entry.id === item.id ? { ...entry, isAvailable: item.isAvailable } : entry
        ) ?? null
      );
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not update availability.",
        "error"
      );
    }
  }

  if (categories === null) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className={eyebrowClass}>Menu</p>
        <h1 className="display mt-1.5 text-[30px] leading-none text-ink">Menu Builder</h1>
        <p className="mt-4 flex items-center gap-3 text-sm text-muted" role="status">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
          Loading your menu…
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={eyebrowClass}>Menu</p>
          <h1 className="display mt-1.5 text-[30px] leading-none text-ink">
            Menu Builder
          </h1>
          <p className="mt-1.5 text-[13px] text-muted">
            Categories, items, prices, tags and availability.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDrawerItem("new")}
          disabled={!selectedId}
          className={primaryButton}
        >
          <PlusIcon size={16} />
          Add item
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-[300px_minmax(0,1fr)]">
        <section
          className={`${cardClass} h-fit min-w-0 p-4`}
          aria-labelledby="categories-heading"
        >
          <div className="flex items-center justify-between">
            <h2 id="categories-heading" className={eyebrowClass}>
              Categories
            </h2>
            <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium tabular text-ink2">
              {categories.length}
            </span>
          </div>

          <form onSubmit={(event) => void addCategory(event)} className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor="new-category">
              New category name
            </label>
            <input
              id="new-category"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="e.g. Desserts"
              className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2.5 text-[13px] text-ink placeholder:text-muted/80 outline-none transition focus:border-line-strong focus:bg-surface"
            />
            <button type="submit" className={secondaryButton}>
              Add
            </button>
          </form>

          <ul className="mt-3 space-y-1">
            {categories.length === 0 && (
              <li className="rounded-xl border border-dashed border-line px-3 py-7 text-center text-[12.5px] text-muted">
                Start by adding a category.
              </li>
            )}
            {categories.map((category) => (
              <li
                key={category.id}
                className={`rounded-xl border p-1.5 transition ${
                  selectedId === category.id
                    ? "border-accent/25 bg-accent-soft"
                    : "border-transparent hover:border-line"
                }`}
              >
                <div className="flex items-start gap-1">
                  {renamingId === category.id ? (
                    <form
                      className="flex flex-1 gap-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveRename(category.id);
                      }}
                    >
                      <label className="sr-only" htmlFor={`rename-${category.id}`}>
                        Category name
                      </label>
                      <input
                        id={`rename-${category.id}`}
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-line-strong"
                      />
                      <button
                        type="submit"
                        className="px-2 text-[12px] font-semibold text-accent"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="px-2 text-[12px] text-muted"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(category.id);
                        setPage(1);
                      }}
                      aria-pressed={selectedId === category.id}
                      className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left"
                    >
                      <span className="block truncate text-[13.5px] font-medium text-ink">
                        {category.name}
                      </span>
                      <span className="text-[11.5px] text-muted">
                        {category.itemCount} {category.itemCount === 1 ? "item" : "items"}
                        {category.isActive ? "" : " · hidden"}
                      </span>
                    </button>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => void moveCategory(category.id, -1)}
                    className="rounded-md p-1.5 text-muted transition hover:bg-surface hover:text-ink"
                    aria-label={`Move ${category.name} up`}
                  >
                    <ArrowUpIcon size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void moveCategory(category.id, 1)}
                    className="rounded-md p-1.5 text-muted transition hover:bg-surface hover:text-ink"
                    aria-label={`Move ${category.name} down`}
                  >
                    <ArrowDownIcon size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void startRename(category)}
                    className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-ink2 transition hover:bg-surface"
                  >
                    <PencilIcon size={11} />
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleCategory(category)}
                    className="rounded-md px-1.5 py-1 text-[11.5px] text-ink2 transition hover:bg-surface"
                  >
                    {category.isActive ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirm({
                        kind: "category",
                        id: category.id,
                        label: category.name,
                        itemCount: category.itemCount,
                      })
                    }
                    className="ms-auto flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-muted transition hover:bg-surface hover:text-danger"
                  >
                    <TrashIcon size={11} />
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${cardClass} min-w-0 p-4 sm:p-5`} aria-labelledby="items-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="items-heading" className="display text-[22px] leading-tight text-ink">
                {debouncedSearch
                  ? `Search results for “${debouncedSearch}”`
                  : selectedCategory?.name ?? "Items"}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {total} {total === 1 ? "item" : "items"}
                {selectedCategory && !debouncedSearch
                  ? ` in ${selectedCategory.name}`
                  : ""}
              </p>
            </div>
            <label className="relative block w-full sm:w-64">
              <span className="sr-only">Search items</span>
              <SearchIcon
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search items…"
                className="w-full rounded-full border border-line bg-canvas py-2.5 pl-9 pr-3 text-[13px] text-ink placeholder:text-muted/80 outline-none transition focus:border-line-strong focus:bg-surface"
              />
            </label>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="pb-2 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Photo</th>
                  <th scope="col" className="pb-2 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Item</th>
                  <th scope="col" className="pb-2 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Price</th>
                  <th scope="col" className="pb-2 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Tags</th>
                  <th scope="col" className="pb-2 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">In stock</th>
                  <th scope="col" className="pb-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingItems && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted" role="status">
                      Loading items…
                    </td>
                  </tr>
                )}
                {!loadingItems && items?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted">
                      No items yet. Use “Add item” to create one.
                    </td>
                  </tr>
                )}
                {!loadingItems &&
                  items?.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-line/70 align-top transition hover:bg-canvas/50"
                    >
                      <td className="py-3 pr-3">
                        <DishImage
                          src={item.images[0]?.url}
                          name={item.name}
                          width={120}
                          sizes="44px"
                          className="h-11 w-11 rounded-lg"
                        />
                      </td>
                      <td className="py-3 pr-3">
                        <p className="font-medium text-ink">{item.name}</p>
                        {item.description && (
                          <p className="line-clamp-1 text-[11.5px] text-muted">
                            {item.description}
                          </p>
                        )}
                        {item.variants.length > 0 && (
                          <p className="text-[11.5px] text-muted">
                            {item.variants.map((variant) => variant.name).join(" · ")}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-3 tabular text-ink2">
                        {formatPrice(item.basePrice)}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex max-w-[180px] flex-wrap gap-1">
                          {item.dietaryTags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-success-soft px-1.5 py-0.5 text-[10.5px] font-medium text-success"
                            >
                              {tag.replace("_", " ")}
                            </span>
                          ))}
                          {item.allergens.map((allergen) => (
                            <span
                              key={allergen}
                              className="rounded-full bg-warn-soft px-1.5 py-0.5 text-[10.5px] font-medium text-warn"
                            >
                              {allergen}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={item.isAvailable}
                          onClick={() => void toggleAvailability(item)}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                            item.isAvailable
                              ? "bg-success-soft text-success hover:bg-success/10"
                              : "bg-canvas text-muted ring-1 ring-line hover:text-ink2"
                          }`}
                        >
                          {item.isAvailable ? "In stock" : "Out of stock"}
                        </button>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDrawerItem(item)}
                          className={ghostButton}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-[12px]">
            <span className="text-muted">
              Page {page} of {pageCount}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className={secondaryButton}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setPage((current) => current + 1)}
                className={secondaryButton}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>

      {drawerItem && (
        <ItemDrawer
          categories={categories}
          item={drawerItem === "new" ? null : drawerItem}
          defaultCategoryId={selectedId}
          onClose={() => setDrawerItem(null)}
          onSaved={() => {
            void loadCategories();
            void loadItems();
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === "item"
              ? "Delete item?"
              : confirm.kind === "force-category"
                ? "Delete category and all its items?"
                : "Delete category?"
          }
          message={
            confirm.kind === "force-category"
              ? `“${confirm.label}” still contains ${confirm.itemCount ?? 0} item(s). Deleting it will permanently remove the category and every item inside it.`
              : confirm.kind === "item"
                ? `“${confirm.label}” will be removed from the menu.`
                : confirm.itemCount && confirm.itemCount > 0
                  ? `“${confirm.label}” contains ${confirm.itemCount} item(s). We will ask you to confirm a forced delete.`
                  : `“${confirm.label}” will be removed.`
          }
          confirmLabel={
            confirm.kind === "force-category" ? "Delete everything" : "Delete"
          }
          danger
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="flex justify-end">
        <span className="text-[11.5px] text-muted">
          Tip: use the arrow buttons to reorder categories without a mouse.
        </span>
      </div>
    </div>
  );
}
