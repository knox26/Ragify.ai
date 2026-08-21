
import { Hono } from "hono";
import {
  signupController,
  loginController,
  logoutController,
  refreshController,
  logoutAllController,
} from "../controller/authController";
import { authMiddleware } from "../middleware/authMiddleware";

const authRoutes = new Hono();

authRoutes.post("/signup", signupController);
authRoutes.post("/login", loginController);
authRoutes.post("/logout", logoutController);
authRoutes.post("/logout-all", authMiddleware, logoutAllController);
authRoutes.post("/refreshtoken", refreshController);

export default authRoutes;