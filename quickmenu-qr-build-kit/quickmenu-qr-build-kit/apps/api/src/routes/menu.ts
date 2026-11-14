import { Router } from "express";
import {
  categoryCreateSchema,
  categoryIdParamsSchema,
  categoryReorderSchema,
  categoryUpdateSchema,
  forceQuerySchema,
  imageIdParamsSchema,
  itemAvailabilitySchema,
  itemCreateSchema,
  itemIdParamsSchema,
  itemImageSchema,
  itemListQuerySchema,
  itemUpdateSchema,
  variantCreateSchema,
  variantIdParamsSchema,
  variantUpdateSchema,
} from "@quickmenu/shared";
import * as menuController from "../controllers/menuController";
import { authenticate, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";

export const menuRouter = Router();

// Every menu endpoint is owner-only and tenant-scoped by the JWT (FR-06..FR-13).
menuRouter.use("/categories", authenticate, requireRole("owner"));
menuRouter.use("/items", authenticate, requireRole("owner"));
menuRouter.use("/variants", authenticate, requireRole("owner"));
menuRouter.use("/images", authenticate, requireRole("owner"));
menuRouter.use("/media", authenticate, requireRole("owner"));

menuRouter.get("/categories", menuController.listCategories);
menuRouter.post(
  "/categories",
  validate({ body: categoryCreateSchema }),
  menuController.createCategory
);
menuRouter.put(
  "/categories/order",
  validate({ body: categoryReorderSchema }),
  menuController.reorderCategories
);
menuRouter.patch(
  "/categories/:id",
  validate({ params: categoryIdParamsSchema, body: categoryUpdateSchema }),
  menuController.updateCategory
);
menuRouter.delete(
  "/categories/:id",
  validate({ params: categoryIdParamsSchema, query: forceQuerySchema }),
  menuController.deleteCategory
);

menuRouter.get(
  "/items",
  validate({ query: itemListQuerySchema }),
  menuController.listItems
);
menuRouter.post("/items", validate({ body: itemCreateSchema }), menuController.createItem);
menuRouter.get(
  "/items/:id",
  validate({ params: itemIdParamsSchema }),
  menuController.getItem
);
menuRouter.patch(
  "/items/:id",
  validate({ params: itemIdParamsSchema, body: itemUpdateSchema }),
  menuController.updateItem
);
menuRouter.delete(
  "/items/:id",
  validate({ params: itemIdParamsSchema }),
  menuController.deleteItem
);
menuRouter.patch(
  "/items/:id/availability",
  validate({ params: itemIdParamsSchema, body: itemAvailabilitySchema }),
  menuController.setAvailability
);
menuRouter.post(
  "/items/:id/variants",
  validate({ params: itemIdParamsSchema, body: variantCreateSchema }),
  menuController.addVariant
);

menuRouter.patch(
  "/variants/:id",
  validate({ params: variantIdParamsSchema, body: variantUpdateSchema }),
  menuController.updateVariant
);
menuRouter.delete(
  "/variants/:id",
  validate({ params: variantIdParamsSchema }),
  menuController.deleteVariant
);

menuRouter.post("/media/upload-signature", menuController.uploadSignature);
menuRouter.post(
  "/items/:id/images",
  validate({ params: itemIdParamsSchema, body: itemImageSchema }),
  menuController.addImage
);
menuRouter.delete(
  "/images/:id",
  validate({ params: imageIdParamsSchema }),
  menuController.deleteImage
);
