import { getCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import { verify } from "jsonwebtoken";
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from "../utils/jwtConfig";
import { getTokenVersion } from "../utils/tokenVersion";

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
      Bun.env.JWT_SECRET as string,
      {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }
    ) as { userId: string; ver?: number };

    if (!decoded) {
      return c.json(
        {
          success: false,
          message: "Unauthorized - Invalid token",
        },
        401
      );
    }

    // 3. Check token version against current revocation state.
    //
    // A password change / "log out everywhere" bumps User.tokenVersion,
    // invalidating every previously-issued access token immediately instead
    // of waiting out its 15-minute lifetime. Old tokens without a `ver`
    // claim (issued before this change) mismatch and are rejected too.
    const currentVersion = await getTokenVersion(decoded.userId);

    if (currentVersion === null || decoded.ver !== currentVersion) {
      return c.json(
        {
          success: false,
          message: "Unauthorized - Token revoked",
        },
        401
      );
    }

    // 4. Attach userId to context
    c.set("userId", decoded.userId);

    // 5. Continue request
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
