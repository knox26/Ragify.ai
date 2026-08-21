import { QdrantClient } from "@qdrant/js-client-rest";

const QDRANT_URL = Bun.env.QDRANT_URL;
const QDRANT_API_KEY = Bun.env.QDRANT_API_KEY;

if (!QDRANT_URL) {
  throw new Error("QDRANT_URL is not configured");
}

export const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
  timeout: 30_000,
});
