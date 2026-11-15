"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ALLOWED_ALLERGENS,
  ALLOWED_DIETARY_TAGS,
  itemCreateSchema,
  itemUpdateSchema,
} from "@quickmenu/shared";
import type {
  CategoryWithCount,
  ItemImage,
  MenuItemWithDetails,
  UploadSignature,
} from "@quickmenu/shared";
import { ApiRequestError, apiRequest, apiVoid } from "../../../lib/api";
import { optimizedImageUrl } from "../../../lib/images";
import { uploadImage } from "../../../lib/uploads";
import { useToast } from "../../../components/Toast";
import { CloseIcon, PlusIcon, TrashIcon } from "../../../components/icons";
import {
  dangerButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../components/ui";

interface VariantDraft {
  key: string;
  name: string;
  price: string;
}

interface ItemDrawerProps {
  categories: CategoryWithCount[];
  item: MenuItemWithDetails | null;
  defaultCategoryId: string | null;
  onClose(): void;
  onSaved(): void;
}

function newKey(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ItemDrawer({
  categories,
  item,
  defaultCategoryId,
  onClose,
  onSaved,
}: ItemDrawerProps) {
  const toast = useToast();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [basePrice, setBasePrice] = useState(
    item ? String(item.basePrice) : ""
  );
  const [categoryId, setCategoryId] = useState(
    item?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? ""
  );
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);
  const [dietaryTags, setDietaryTags] = useState<string[]>(
    item?.dietaryTags ?? []
  );
  const [allergens, setAllergens] = useState<string[]>(item?.allergens ?? []);
  const [variants, setVariants] = useState<VariantDraft[]>(
    item
      ? item.variants.map((variant) => ({
          key: variant.id,
          name: variant.name,
          price: String(variant.price),
        }))
      : []
  );
  const [images, setImages] = useState<ItemImage[]>(item?.images ?? []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const remainingImageSlots = Math.max(
    0,
    3 - images.length - pendingFiles.length
  );

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.displayOrder - b.displayOrder),
    [categories]
  );

  function toggleTag(list: string[], value: string): string[] {
    return list.includes(value)
      ? list.filter((entry) => entry !== value)
      : [...list, value];
  }

  function addVariant() {
    if (variants.length >= 10) return;
    setVariants((current) => [...current, { key: newKey(), name: "", price: "" }]);
  }

  function updateVariant(key: string, patch: Partial<VariantDraft>) {
    setVariants((current) =>
      current.map((variant) =>
        variant.key === key ? { ...variant, ...patch } : variant
      )
    );
  }

  function removeVariant(key: string) {
    setVariants((current) => current.filter((variant) => variant.key !== key));
  }

  function queueFiles(files: FileList | null) {
    if (!files) return;
    const accepted = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, remainingImageSlots);
    setPendingFiles((current) => [...current, ...accepted]);
  }

  async function removeImage(image: ItemImage) {
    try {
      await apiVoid(`/images/${image.id}`, { method: "DELETE" });
      setImages((current) => current.filter((entry) => entry.id !== image.id));
      toast.push("Photo removed.", "success");
    } catch (error) {
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not remove the photo.",
        "error"
      );
    }
  }

  async function uploadPending(targetItemId: string): Promise<number> {
    let uploaded = 0;
    for (const [index, file] of pendingFiles.entries()) {
      const signature = await apiRequest<UploadSignature>("/media/upload-signature", {
        method: "POST",
      });
      const image = await uploadImage(signature, file);
      await apiRequest(`/items/${targetItemId}/images`, {
        method: "POST",
        body: JSON.stringify({
          publicId: image.publicId,
          url: image.url,
          displayOrder: images.length + index,
        }),
      });
      uploaded += 1;
    }
    return uploaded;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    if (busy) return;

    const payload = {
      categoryId,
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      basePrice: Number.parseFloat(basePrice),
      isAvailable,
      dietaryTags,
      allergens,
      variants: variants
        .filter((variant) => variant.name.trim() && variant.price !== "")
        .map((variant, index) => ({
          name: variant.name.trim(),
          price: Number.parseFloat(variant.price),
          displayOrder: index,
        })),
    };

    const schema = item ? itemUpdateSchema : itemCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        nextErrors[field] ??= issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setBusy(true);
    let targetId = item?.id ?? null;
    try {
      if (item) {
        await apiRequest(`/items/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify(parsed.data),
        });
      } else {
        const created = await apiRequest<MenuItemWithDetails>("/items", {
          method: "POST",
          body: JSON.stringify(parsed.data),
        });
        targetId = created.id;
      }

      if (targetId && pendingFiles.length > 0) {
        try {
          const count = await uploadPending(targetId);
          toast.push(
            `${count} photo${count === 1 ? "" : "s"} uploaded.`,
            "success"
          );
        } catch (uploadError) {
          toast.push(
            uploadError instanceof ApiRequestError
              ? uploadError.message
              : "The item was saved, but a photo failed to upload. Try again from the edit drawer.",
            "error"
          );
          onSaved();
          setBusy(false);
          return;
        }
      }

      toast.push(item ? "Item updated." : "Item created.", "success");
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.code === "VARIANT_LIMIT_REACHED") {
          setErrors({ variants: "An item can have at most 10 variants." });
        } else if (error.code === "IMAGE_LIMIT_REACHED") {
          setErrors({ images: "An item can have at most 3 photos." });
        } else if (error.code === "CONFLICT") {
          setErrors({ variants: error.message });
        } else {
          setErrors({ form: error.message });
        }
      } else {
        setErrors({ form: "Could not save the item. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeItem() {
    if (!item) return;
    if (!window.confirm(`Delete “${item.name}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await apiVoid(`/items/${item.id}`, { method: "DELETE" });
      toast.push("Item deleted.", "success");
      onSaved();
      onClose();
    } catch (error) {
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not delete the item.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in justify-end bg-ink/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-drawer-title"
        className="flex h-full w-full animate-sheet-up flex-col border-l border-line bg-canvas shadow-lift min-[900px]:w-[520px]"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Menu item
            </p>
            <h2 id="item-drawer-title" className="display mt-1 text-[22px] leading-none text-ink">
              {item ? "Edit item" : "New item"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink2 transition hover:border-line-strong"
            aria-label="Close item editor"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <form
          id="item-form"
          onSubmit={(event) => void save(event)}
          className="flex-1 space-y-4 overflow-y-auto px-5 py-5"
        >
          <label className={labelClass}>
            Name
            <input
              ref={nameRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
              maxLength={120}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && <span className="text-xs text-red-600">{errors.name}</span>}
          </label>

          <label className={labelClass}>
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={inputClass}
              rows={2}
              maxLength={1000}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Base price
              <input
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                value={basePrice}
                onChange={(event) => setBasePrice(event.target.value)}
                className={inputClass}
                aria-invalid={Boolean(errors.basePrice)}
              />
              {errors.basePrice && (
                <span className="text-xs text-red-600">{errors.basePrice}</span>
              )}
            </label>

            <label className={labelClass}>
              Category
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className={inputClass}
              >
                {sortedCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {errors.categoryId && (
                <span className="text-xs text-red-600">{errors.categoryId}</span>
              )}
            </label>
          </div>

          <label className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-[13px] font-medium text-ink2">
            <input
              type="checkbox"
              checked={isAvailable}
              onChange={(event) => setIsAvailable(event.target.checked)}
              className="h-4 w-4 accent-[#151412]"
            />
            In stock
          </label>

          <fieldset>
            <legend className={labelClass}>Dietary labels</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALLOWED_DIETARY_TAGS.map((tag) => (
                <label
                  key={tag}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] capitalize transition ${
                    dietaryTags.includes(tag)
                      ? "border-ink bg-ink text-canvas"
                      : "border-line bg-surface text-ink2 hover:border-line-strong"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={dietaryTags.includes(tag)}
                    onChange={() => setDietaryTags((current) => toggleTag(current, tag))}
                    className="sr-only"
                  />
                  {tag.replace("_", " ")}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={labelClass}>Allergens</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALLOWED_ALLERGENS.map((allergen) => (
                <label
                  key={allergen}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition ${
                    allergens.includes(allergen)
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink2"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={allergens.includes(allergen)}
                    onChange={() => setAllergens((current) => toggleTag(current, allergen))}
                    className="sr-only"
                  />
                  {allergen}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-line bg-surface p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <legend className={labelClass}>Variants (max 10)</legend>
              <button
                type="button"
                onClick={addVariant}
                disabled={variants.length >= 10}
                className={secondaryButton}
              >
                <PlusIcon size={13} />
                Add variant
              </button>
            </div>
            <div className="mt-2.5 space-y-2">
              {variants.length === 0 && (
                <p className="text-[12px] text-muted">
                  No variants: the base price is used.
                </p>
              )}
              {variants.map((variant) => (
                <div key={variant.key} className="flex gap-2">
                  <input
                    value={variant.name}
                    onChange={(event) =>
                      updateVariant(variant.key, { name: event.target.value })
                    }
                    placeholder="Name (e.g. Large)"
                    className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] text-ink placeholder:text-muted/80 outline-none focus:border-line-strong"
                    aria-label="Variant name"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={variant.price}
                    onChange={(event) =>
                      updateVariant(variant.key, { price: event.target.value })
                    }
                    placeholder="Price"
                    className="w-24 rounded-xl border border-line bg-canvas px-3 py-2 text-[13px] tabular text-ink placeholder:text-muted/80 outline-none focus:border-line-strong"
                    aria-label="Variant price"
                  />
                  <button
                    type="button"
                    onClick={() => removeVariant(variant.key)}
                    className="flex items-center justify-center rounded-xl px-2.5 text-muted transition hover:text-danger"
                    aria-label={`Remove variant ${variant.name || "row"}`}
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              ))}
            </div>
            {errors.variants && (
              <p className="mt-1.5 text-[12px] text-danger">{errors.variants}</p>
            )}
          </fieldset>

          <fieldset className="rounded-2xl border border-line bg-surface p-3.5">
            <legend className={labelClass}>Photos (max 3)</legend>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              Uploaded directly to Cloudinary with a short-lived signature.
            </p>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {images.map((image) => (
                <div key={image.id} className="relative">
                  <img
                    src={optimizedImageUrl(image.url, 400)}
                    alt=""
                    className="h-20 w-full rounded-xl object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => void removeImage(image)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-canvas"
                    aria-label="Remove photo"
                  >
                    <CloseIcon size={11} />
                  </button>
                </div>
              ))}
              {pendingFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="relative">
                  <div className="flex h-20 items-center justify-center rounded-xl bg-accent-soft px-1 text-center text-[10px] text-accent">
                    {file.name}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingFiles((current) =>
                        current.filter((_entry, entryIndex) => entryIndex !== index)
                      )
                    }
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-canvas"
                    aria-label={`Remove ${file.name}`}
                  >
                    <CloseIcon size={11} />
                  </button>
                </div>
              ))}
              {remainingImageSlots > 0 && (
                <label className="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong text-center text-[11px] text-muted transition hover:border-ink/40 hover:text-ink2">
                  <PlusIcon size={15} />
                  <span>Add photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      queueFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            {errors.images && (
              <p className="mt-1.5 text-[12px] text-danger">{errors.images}</p>
            )}
          </fieldset>

          {errors.form && (
            <p
              className="rounded-xl bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger"
              role="alert"
            >
              {errors.form}
            </p>
          )}
        </form>

        <div className="flex items-center justify-between gap-2 border-t border-line bg-surface px-5 py-3.5">
          {item ? (
            <button
              type="button"
              onClick={() => void removeItem()}
              disabled={busy}
              className={dangerButton}
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={secondaryButton}>
              Cancel
            </button>
            <button
              type="submit"
              form="item-form"
              disabled={busy}
              className={primaryButton}
            >
              {busy ? "Saving…" : "Save item"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
