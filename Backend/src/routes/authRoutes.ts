
import { Hono } from "hono";
import { signupController, loginController, logoutController, refreshController } from "../controller/authController";

const authRoutes = new Hono();

authRoutes.post("/signup", signupController);
authRoutes.post("/login", loginController);
authRoutes.post("/logout", logoutController);
authRoutes.post("/refreshtoken", refreshController);

export default authRoutes;