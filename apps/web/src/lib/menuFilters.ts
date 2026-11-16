import type { PublicMenuItem } from "@quickmenu/shared";

export interface MenuFilters {
  lang: string;
  dietary: string[];
  exclude: string[];
  q: string;
}

/**
 * Build the documented public-menu query string (FR-19..FR-22).
 * Empty values are omitted so the API can apply its defaults.
 */
export function buildMenuQuery(filters: Partial<MenuFilters>): string {
  const params = new URLSearchParams();
  if (filters.lang) params.set("lang", filters.lang);
  if (filters.dietary && filters.dietary.length > 0) {
    params.set("dietary", [...filters.dietary].sort().join(","));
  }
  if (filters.exclude && filters.exclude.length > 0) {
    params.set("exclude", [...filters.exclude].sort().join(","));
  }
  const search = filters.q?.trim();
  if (search) params.set("q", search);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function toggleFilterValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

/** Lowest/highest price, accounting for variants (wireframe 1 element 5). */
export function priceRange(item: PublicMenuItem): { min: number; max: number } {
  if (item.variants.length === 0) {
    return { min: item.price, max: item.price };
  }
  const prices = item.variants.map((variant) => variant.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
