import * as jwt from "jsonwebtoken";
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from "./jwtConfig";

export const generateAccessToken = (userId: string, tokenVersion: number) => {
  return jwt.sign(
    {
      userId,
      ver: tokenVersion,
    },
    Bun.env.JWT_SECRET!,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: "15m",
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
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
      algorithm: JWT_ALGORITHM,
      expiresIn: "7d",
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
};
