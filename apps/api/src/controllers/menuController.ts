import type { Request, Response } from "express";
import type {
  CategoryCreateInput,
  CategoryUpdateInput,
  ItemCreateInput,
  ItemImageInput,
  ItemListQuery,
  ItemUpdateInput,
  VariantCreateInput,
  VariantUpdateInput,
} from "@quickmenu/shared";
import { asyncHandler } from "../lib/asyncHandler";
import { getAuth } from "../middleware/auth";
import * as menuService from "../services/menuService";

/* Categories */

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  res.status(200).json({ data: await menuService.listCategories(auth.restaurantId) });
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const data = await menuService.createCategory(
    auth.restaurantId,
    req.body as CategoryCreateInput
  );
  res.status(201).json({ data });
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const data = await menuService.updateCategory(
    auth.restaurantId,
    req.params.id as string,
    req.body as CategoryUpdateInput
  );
  res.status(200).json({ data });
});

export const reorderCategories = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { ids } = req.body as { ids: string[] };
  await menuService.reorderCategories(auth.restaurantId, ids);
  res.status(200).json({ data: await menuService.listCategories(auth.restaurantId) });
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const force = (req.query as { force?: boolean }).force === true;
  await menuService.deleteCategory(auth.restaurantId, req.params.id as string, force);
  res.status(204).send();
});

/* Items */

export const listItems = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const query = req.query as unknown as ItemListQuery;
  const result = await menuService.listItems(auth.restaurantId, query);
  res.status(200).json({
    data: result.items,
    meta: { page: query.page, pageSize: query.pageSize, total: result.total },
  });
});

export const createItem = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const data = await menuService.createItem(auth.restaurantId, req.body as ItemCreateInput);
  res.status(201).json({ data });
});

export const getItem = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  res
    .status(200)
    .json({ data: await menuService.getItem(auth.restaurantId, req.params.id as string) });
});

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const data = await menuService.updateItem(
    auth.restaurantId,
    req.params.id as string,
    req.body as ItemUpdateInput
  );
  res.status(200).json({ data });
});

export const deleteItem = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  await menuService.deleteItem(auth.restaurantId, req.params.id as string);
  res.status(204).send();
});

export const setAvailability = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { isAvailable } = req.body as { isAvailable: boolean };
  const data = await menuService.setAvailability(
    auth.restaurantId,
    req.params.id as string,
    isAvailable
  );
  res.status(200).json({ data });
});

/* Variants */

export const addVariant = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const data = await menuService.addVariant(
    auth.restaurantId,
    req.params.id as string,
    req.body as VariantCreateInput
  );
  res.status(201).json({ data });
});

export const updateVariant = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const data = await menuService.updateVariant(
    auth.restaurantId,
    req.params.id as string,
    req.body as VariantUpdateInput
  );
  res.status(200).json({ data });
});

export const deleteVariant = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  await menuService.deleteVariant(auth.restaurantId, req.params.id as string);
  res.status(204).send();
});

/* Media (FR-09) */

export const uploadSignature = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  res.status(200).json({ data: menuService.uploadSignature(auth.restaurantId) });
});

export const addImage = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const data = await menuService.addImage(
    auth.restaurantId,
    req.params.id as string,
    req.body as ItemImageInput
  );
  res.status(201).json({ data });
});

export const deleteImage = asyncHandler(async (req: Request, res: Response) => {
  const auth = getAuth(req);
  await menuService.deleteImage(auth.restaurantId, req.params.id as string);
  res.status(204).send();
});
