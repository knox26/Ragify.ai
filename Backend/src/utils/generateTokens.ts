import * as jwt from "jsonwebtoken";

export const generateAccessToken = (userId: string) => {
  return jwt.sign(
    {
      userId,
    },
    Bun.env.JWT_SECRET!,
    {
      expiresIn: "15m",
    }
  );
};

export const generateRefreshToken = (userId: string) => {
  return jwt.sign(
    {
      userId,
    },
    Bun.env.REFRESH_TOKEN_SECRET!,
    {
      expiresIn: "7d",
    }
  );
};