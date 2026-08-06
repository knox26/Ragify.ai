import IORedis from "ioredis";

export const redis = new IORedis(Bun.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});
