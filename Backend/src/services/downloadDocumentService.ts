import { GetObjectCommand } from "@aws-sdk/client-s3";

import { r2Client } from "../libs/r2Client";

interface DownloadDocumentParams {
  r2Key: string;
}

export async function downloadDocument({
  r2Key,
}: DownloadDocumentParams): Promise<Buffer> {
  const response = await r2Client.send(
    new GetObjectCommand({
      Bucket: Bun.env.R2_BUCKET_NAME,
      Key: r2Key,
    }),
  );

  if (!response.Body) {
    throw new Error(`Document "${r2Key}" not found in R2`);
  }

  return Buffer.from(await response.Body.transformToByteArray());
}
