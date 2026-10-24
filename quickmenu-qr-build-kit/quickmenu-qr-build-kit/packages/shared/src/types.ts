import { z } from "zod";

/** Shared camelCase domain types. These mirror the snake_case DB rows. */

export const userRoleSchema = z.enum(["owner", "kitchen"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const orderStatusSchema = z.enum([
  "new",
  "preparing",
  "ready",
  "served",
  "cancelled",
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const translationEntitySchema = z.enum(["category", "item", "variant"]);
export type TranslationEntity = z.infer<typeof translationEntitySchema>;

export const translationFieldSchema = z.enum(["name", "description"]);
export type TranslationField = z.infer<typeof translationFieldSchema>;

/** Supported customer languages. */
export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", rtl: false },
  { code: "ur", name: "Urdu", nativeName: "اردو", rtl: true },
  { code: "ar", name: "Arabic", nativeName: "العربية", rtl: true },
  { code: "zh", name: "Chinese", nativeName: "中文", rtl: false },
  { code: "fr", name: "French", nativeName: "Français", rtl: false },
] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const ALLOWED_DIETARY_TAGS = [
  "vegetarian",
  "vegan",
  "halal",
  "gluten_free",
] as const;
export type AllowedDietaryTag = (typeof ALLOWED_DIETARY_TAGS)[number];

export const ALLOWED_ALLERGENS = [
  "nuts",
  "dairy",
  "gluten",
  "eggs",
  "seafood",
  "soy",
] as const;
export type AllowedAllergen = (typeof ALLOWED_ALLERGENS)[number];

/**
 * camelCase domain entities (docs/03 section 2.5). Repositories map snake_case
 * database rows to these shapes; timestamps are ISO 8601 strings and money is a
 * number with 2 decimals, matching the JSON API contract.
 */

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  defaultLanguage: string;
  currency: string;
  orderCounter: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  restaurantId: string;
  email: string;
  name: string;
  role: UserRole;
  failedAttempts: number;
  lockedUntil: string | null;
  isActive: boolean;
  createdAt: string;
}

/** User row including the bcrypt hash. Returned only by auth lookups. */
export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface Category {
  id: string;
  restaurantId: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface ItemVariant {
  id: string;
  itemId: string;
  name: string;
  price: number;
  displayOrder: number;
}

export interface ItemImage {
  id: string;
  itemId: string;
  publicId: string;
  url: string;
  displayOrder: number;
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePrice: number;
  isAvailable: boolean;
  dietaryTags: string[];
  allergens: string[];
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItemWithDetails extends MenuItem {
  variants: ItemVariant[];
  images: ItemImage[];
}

/** A category with its items, as returned by the public menu query (Q1/Q2). */
export interface MenuCategory {
  id: string;
  name: string;
  displayOrder: number;
  items: MenuItemWithDetails[];
}

export interface RestaurantTable {
  id: string;
  restaurantId: string;
  tableNumber: string;
  qrToken: string;
  isActive: boolean;
  createdAt: string;
}

export interface Order {
  id: string;
  restaurantId: string;
  tableId: string;
  orderNumber: number;
  status: OrderStatus;
  total: number;
  notes: string | null;
  clientRequestId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  itemId: string | null;
  variantId: string | null;
  itemName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  specialInstructions: string | null;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export interface OrderStatusHistoryEntry {
  id: string;
  orderId: string;
  status: OrderStatus;
  changedBy: string | null;
  changedAt: string;
}

export interface Translation {
  id: string;
  restaurantId: string;
  entityType: TranslationEntity;
  entityId: string;
  field: TranslationField;
  language: string;
  sourceHash: string;
  translatedText: string;
}

/** Safe user shape returned by auth endpoints (never includes the hash). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  restaurantId: string;
}

/** Login/register response payload (docs/03 section 3.5). */
export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

/** GET /me response payload. */
export interface MeResponse {
  user: User;
  restaurant: Restaurant;
}