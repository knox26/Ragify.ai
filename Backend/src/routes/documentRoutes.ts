import { Hono } from "hono";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  completeUploadController,
  initUploadController,
  getDocumentsController,
} from "../controller/documentsController";

const documentRoutes = new Hono();

documentRoutes.post("/init-upload", authMiddleware, initUploadController);
documentRoutes.post(
  "/complete-upload",
  authMiddleware,
  completeUploadController,
);

documentRoutes.get("/get-documents", authMiddleware, getDocumentsController);

export default documentRoutes;
