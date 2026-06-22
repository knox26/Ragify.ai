import prisma from "../db/dbConfig";
import { signupSchema , loginSchema } from "../validators/authValidators";
import { hashPassword, comparePassword } from "../utils/hashPass";
import { generateAccessToken, generateRefreshToken } from "../utils/generateTokens";
import {  setCookie, deleteCookie, getCookie} from 'hono/cookie'
import type { Context } from "hono";




// Signup controller
export const signupController = async (c: Context) => {
  try {
    const body = await c.req.json();

    // Validate Request
    const result = signupSchema.safeParse(body);

    if (!result.success) {
      return c.json(
        {
          success: false,
          message: "Invalid request body",
        },
        400
      );
    }

    const { name, email, password } = result.data;

    // Check Existing User
    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      return c.json(
        {
          success: false,
          message: "User already exists",
        },
        409
      );
    }

    // Hash Password
    const passwordHash = await hashPassword(password);

    const { user, refreshToken } = await prisma.$transaction(
      async (tx) => {
        // create user
        const user = await tx.user.create({
          data: {
            name,
            email,
            passwordHash,
          },
        });

        // generate refresh token
        const refreshToken = generateRefreshToken(user.id);

        // store refresh token
        await tx.refreshToken.create({
          data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ),
          },
        });

        return { user, refreshToken };
      }
    );


    // Generate Tokens
    const accessToken = generateAccessToken(user.id);


    // Set Cookies accessToken
    setCookie(c, "accessToken", accessToken, {
      httpOnly: true,
      secure: Bun.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 15 * 60,
      path: "/",
    });

    // Set Cookies refreshToken

    setCookie(c, "refreshToken", refreshToken, {
      httpOnly: true,
      secure: Bun.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return c.json(
      {
        success: true,
        message: "User created successfully",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
      201
    );
  } catch (error) {
    console.error("Signup failed",error);

    return c.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      500
    );
  }
}

// Login controller

export const loginController = async (c: Context) => {
  try {
    const body = await c.req.json();

    // 1. Validate request
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return c.json(
        {
          success: false,
          message: "Invalid request body",
        },
        400
      );
    }

    const { email, password } = result.data;

    // 2. Check user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return c.json(
        {
          success: false,
          message: "Invalid credentials",
        },
        401
      );
    }

    // 3. Compare password
    const isPasswordValid = await comparePassword(
      password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      return c.json(
        {
          success: false,
          message: "Invalid credentials",
        },
        401
      );
    }

    // 4. CLEANUP OLD EXPIRED TOKENS
    await prisma.refreshToken.deleteMany({
    where: {
        userId: user.id,
        expiresAt: {
        lt: new Date(),
        },
    },
    });

    // 5. Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // 6. Save refresh token in DB
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ),
      },
    });

    // 7. Set cookies
    setCookie(c, "accessToken", accessToken, {
      httpOnly: true,
      secure: Bun.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 15 * 60,
      path: "/",
    });

    setCookie(c, "refreshToken", refreshToken, {
      httpOnly: true,
      secure: Bun.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    // 8. Response
    return c.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login failed", error);

    return c.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      500
    );
  }
};

// logout controller

export const logoutController = async (c: Context) => {
  try {
    // 1. Get refresh token from cookie
    const refreshToken = getCookie(c, "refreshToken");

    // 2. If token exists → remove it from DB
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: {
          token: refreshToken,
        },
      });
    }

    // 3. Clear cookies
    deleteCookie(c, "accessToken", {
      path: "/",
    });

    deleteCookie(c, "refreshToken", {
      path: "/",
    });

    // 4. Response
    return c.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout failed", error);

    return c.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      500
    );
  }
};


// refresh token controller

export const refreshController = async (c: Context) => {
  try {
    // 1. Get refresh token from cookie
    const refreshToken = getCookie(c, "refreshToken");

    if (!refreshToken) {
      return c.json(
        {
          success: false,
          message: "No refresh token provided",
        },
        401
      );
    }

    // 2. Find token in DB
    const storedToken = await prisma.refreshToken.findUnique({
      where: {
        token: refreshToken,
      },
    });

    if (!storedToken) {
      return c.json(
        {
          success: false,
          message: "Invalid refresh token",
        },
        401
      );
    }

    // 3. Check expiry
    if (storedToken.expiresAt < new Date()) {
      await prisma.refreshToken.delete({
        where: {
          token: refreshToken,
        },
      });

      return c.json(
        {
          success: false,
          message: "Refresh token expired",
        },
        401
      );
    }

    // 4. Generate new access token
    const newAccessToken = generateAccessToken(storedToken.userId);

    // 5. OPTIONAL: rotate refresh token (recommended)
    const newRefreshToken = generateRefreshToken(storedToken.userId);

    await prisma.refreshToken.update({
      where: {
        token: refreshToken,
      },
      data: {
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // 6. Set cookies again
    setCookie(c, "accessToken", newAccessToken, {
      httpOnly: true,
      secure: Bun.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 15 * 60,
      path: "/",
    });

    setCookie(c, "refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: Bun.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    // 7. Response
    return c.json({
      success: true,
      message: "Token refreshed successfully",
    });
  } catch (error) {
    console.error("Refresh failed", error);

    return c.json(
      {
        success: false,
        message: "Internal Server Error",
      },
      500
    );
  }
};