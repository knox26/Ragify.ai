import { S3Client } from "@aws-sdk/client-s3";

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${Bun.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Bun.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: Bun.env.R2_SECRET_ACCESS_KEY!,
  },
});