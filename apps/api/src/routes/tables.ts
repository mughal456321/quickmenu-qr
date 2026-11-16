import { Router } from "express";
import {
  qrFormatQuerySchema,
  tableCreateSchema,
  tableIdParamsSchema,
  tableUpdateSchema,
} from "@quickmenu/shared";
import * as tableController from "../controllers/tableController";
import { authenticate, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";

export const tablesRouter = Router();

tablesRouter.use("/tables", authenticate, requireRole("owner"));

tablesRouter.get("/tables", tableController.list);
tablesRouter.post(
  "/tables",
  validate({ body: tableCreateSchema }),
  tableController.create
);
tablesRouter.patch(
  "/tables/:id",
  validate({ params: tableIdParamsSchema, body: tableUpdateSchema }),
  tableController.update
);
tablesRouter.delete(
  "/tables/:id",
  validate({ params: tableIdParamsSchema }),
  tableController.remove
);
tablesRouter.get(
  "/tables/:id/qr",
  validate({ params: tableIdParamsSchema, query: qrFormatQuerySchema }),
  tableController.qr
);
