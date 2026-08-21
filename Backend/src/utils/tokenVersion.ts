import prisma from "../db/dbConfig";
import { redis } from "../libs/redis";

const VERSION_CACHE_TTL = 300; // seconds — 5 min

/**
 * Current session version for a user.
 *
 * Redis is the hot path (one GET per authed request, sub-ms). Falls back to
 * the DB on a cache miss or Redis failure, so auth keeps working if Redis is
 * down — it just costs a DB read.
 */
export async function getTokenVersion(userId: string): Promise<number | null> {
  const key = `tokenVersion:${userId}`;

  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      return Number(cached);
    }
  } catch {
    // Redis unreachable — fall through to DB.
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  });

  // User deleted → null. Caller must reject. Never fall back to a default:
  // `?? 0` would let a token for a deleted user (ver: 0) still authenticate.
  if (!user) {
    return null;
  }

  try {
    await redis.set(key, user.tokenVersion, "EX", VERSION_CACHE_TTL);
  } catch {
    // Best-effort cache write.
  }

  return user.tokenVersion;
}

/**
 * Revoke every session for a user: bump the version (invalidates all issued
 * access tokens) and delete all refresh tokens.
 *
 * Call this on password change / "log out everywhere". Wired when those
 * endpoints land.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await tx.refreshToken.deleteMany({ where: { userId } });
    return user;
  });

  try {
    await redis.set(
      `tokenVersion:${userId}`,
      updated.tokenVersion,
      "EX",
      VERSION_CACHE_TTL,
    );
  } catch {
    // Best-effort — next getTokenVersion re-reads the DB.
  }
}
