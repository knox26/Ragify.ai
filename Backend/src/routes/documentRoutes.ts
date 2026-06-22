import { Hono } from "hono";
import { authMiddleware } from "../middleware/authMiddleware";
import { initUploadController } from "../controller/documentsController";


const documentRoutes = new Hono();


documentRoutes.post("/init-upload", authMiddleware,initUploadController);

export default documentRoutes;