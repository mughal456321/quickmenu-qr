import { z } from "zod";
import { SUPPORTED_LANGUAGES, orderStatusSchema } from "./types";
import type { OrderStatus } from "./types";

/** Documented API error envelope. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ field: z.string(), issue: z.string() })).optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Standard success envelope. */
export const apiSuccessSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ data });
export type ApiSuccess<T> = { data: T };

/** Money: a decimal with 2 places, returned as a number. */
export const moneySchema = z.number().nonnegative().multipleOf(0.01);
export type Money = z.infer<typeof moneySchema>;

/** UUID. */
export const uuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof uuidSchema>;

/* ------------------------------------------------------------------ */
/* Authentication and account request schemas (Phase 03)              */
/* ------------------------------------------------------------------ */

const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code) as [string, ...string[]];

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email must be at most 254 characters.")
  .email("Enter a valid email address.");

/** Password policy: at least 8 characters, with a letter and a number. */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(100, "Password must be at most 100 characters.")
  .regex(/[A-Za-z]/, "Password must contain a letter.")
  .regex(/\d/, "Password must contain a number.");

export const languageSchema = z.enum(LANGUAGE_CODES);
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code.");

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  email: emailSchema,
  password: passwordSchema,
  restaurantName: z.string().trim().min(1, "Restaurant name is required.").max(120),
  defaultLanguage: languageSchema.optional(),
  currency: currencySchema.optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  // Do not apply the policy on login; only reject empty/oversized input.
  password: z.string().min(1, "Password is required.").max(100),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required.").max(200),
  password: passwordSchema,
});

export const staffCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  email: emailSchema,
  password: passwordSchema,
});

export const staffUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(100).optional(),
    password: passwordSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const restaurantUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(120).optional(),
    defaultLanguage: languageSchema.optional(),
    currency: currencySchema.optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
export type RestaurantUpdateInput = z.infer<typeof restaurantUpdateSchema>;

/* ------------------------------------------------------------------ */
/* Public ordering request schemas (Phase 06A)                        */
/* ------------------------------------------------------------------ */

export const orderLineSchema = z.object({
  itemId: uuidSchema,
  variantId: uuidSchema.nullable().optional(),
  quantity: z
    .number()
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(50, "Quantity must be at most 50."),
  specialInstructions: z.string().trim().max(200).nullable().optional(),
});

export const publicOrderSchema = z.object({
  qrToken: z.string().trim().min(1).max(64),
  items: z
    .array(orderLineSchema)
    .min(1, "The cart is empty.")
    .max(30, "An order can have at most 30 lines."),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const idempotencyHeadersSchema = z.object({
  "idempotency-key": z.string().uuid("Idempotency-Key must be a UUID."),
});

export const trackingHeadersSchema = z.object({
  "x-tracking-token": z.string().trim().min(1).max(200),
});

export const qrTokenParamsSchema = z.object({
  qrToken: z.string().trim().min(1).max(64),
});

export const orderIdParamsSchema = z.object({
  id: uuidSchema,
});

export const orderStatusUpdateSchema = z.object({
  status: orderStatusSchema,
});

export const statusListSchema = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx): OrderStatus[] | undefined => {
    if (!value) return undefined;
    const parts = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const invalid = parts.filter((part) => !orderStatusSchema.safeParse(part).success);
    if (invalid.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `invalid status: ${invalid.join(", ")}`,
      });
      return z.NEVER;
    }
    return parts as OrderStatus[];
  });

export const orderListQuerySchema = z.object({
  status: statusListSchema,
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type OrderLineInput = z.infer<typeof orderLineSchema>;
export type PublicOrderInput = z.infer<typeof publicOrderSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;