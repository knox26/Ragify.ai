import { getCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import { verify }from "jsonwebtoken";

export const authMiddleware = async (c: Context, next: Next) => {
  try {
    // 1. Get token from cookie
    const token = getCookie(c, "accessToken");

    if (!token) {
      return c.json(
        {
          success: false,
          message: "Unauthorized - No token",
        },
        401
      );
    }

    // 2. Verify token
    const decoded = verify(
      token,
      Bun.env.JWT_SECRET as string
    ) as { userId: string };

    if (!decoded) {
      return c.json(
        {
          success: false,
          message: "Unauthorized - Invalid token",
        },
        401
      );
    }

    // 3. Attach userId to context
    c.set("userId", decoded.userId);

    // 4. Continue request
    await next();
  } catch (error) {
    return c.json(
      {
        success: false,
        message: "Unauthorized - Token expired or invalid",
      },
      401
    );
  }
};