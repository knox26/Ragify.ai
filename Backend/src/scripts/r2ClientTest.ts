import {
  CreateMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { r2Client } from "../libs/r2Client";

async function test() {
  const response = await r2Client.send(
    new CreateMultipartUploadCommand({
      Bucket: Bun.env.R2_BUCKET_NAME!,
      Key: "test.txt",
    })
  );

  console.log("UploadId:", response.UploadId);

  if (response.UploadId) {
    await r2Client.send(
      new AbortMultipartUploadCommand({
        Bucket: Bun.env.R2_BUCKET_NAME!,
        Key: "test.txt",
        UploadId: response.UploadId,
      })
    );

    console.log("Multipart upload aborted.");
  }
}

test();