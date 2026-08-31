import { Hono } from "hono";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  completeUploadController,
  initUploadController,
  getDocumentsController,
  getDocumentStatusesController,
  getDocumentCountController,
  getDocumentController,
} from "../controller/documentsController";

const documentRoutes = new Hono();

documentRoutes.post("/init-upload", authMiddleware, initUploadController);
documentRoutes.post(
  "/complete-upload",
  authMiddleware,
  completeUploadController,
);

documentRoutes.get("/get-documents", authMiddleware, getDocumentsController);
documentRoutes.get("/count", authMiddleware, getDocumentCountController);
documentRoutes.get("/statuses", authMiddleware, getDocumentStatusesController);

// Static routes above must stay registered before the :id param route, or
// "/count" and "/statuses" would be captured by it.
documentRoutes.get("/:id", authMiddleware, getDocumentController);

export default documentRoutes;
