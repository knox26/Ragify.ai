import { createHash } from "crypto";

// Store only SHA-256 of refresh token. DB leak → no usable session.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
