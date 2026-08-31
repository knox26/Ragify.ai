import { Hono } from "hono";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  messageController,
  getChatsController,
  getChatController,
  getMessagesController,
  renameChatController,
  deleteChatController,
} from "../controller/chatController";

const chatRoutes = new Hono();

chatRoutes.post("/message", authMiddleware, messageController);
chatRoutes.get("/", authMiddleware, getChatsController);
chatRoutes.get("/:id/messages", authMiddleware, getMessagesController);
chatRoutes.get("/:id", authMiddleware, getChatController);
chatRoutes.patch("/:id", authMiddleware, renameChatController);
chatRoutes.delete("/:id", authMiddleware, deleteChatController);

export default chatRoutes;
