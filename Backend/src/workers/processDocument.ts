import type { Job } from "bullmq";
import type { ProcessDocumentJob } from "../queues/documentQueue";
import prisma from "../db/dbConfig";
import { downloadDocument } from "../services/downloadDocumentService";
import { parseDocument } from "../parsers/documentParser";

export async function processDocument(
  job: Job<ProcessDocumentJob>,
): Promise<void> {
  const { documentId } = job.data;
  console.log("processing document ", documentId);

  const document = await prisma.document.findUnique({
    where: {
      id: documentId,
    },
  });

  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }

  console.log("document found ", document);

  await prisma.document.update({
    where: {
      id: documentId,
    },
    data: {
      status: "PROCESSING",
    },
  });

  const fileBuffer = await downloadDocument({
    r2Key: document.r2Key,
  });

  console.log("file buffer ", fileBuffer);

  const parsedDocument = await parseDocument({
    buffer: fileBuffer,
    mimeType: document.mimeType,
    metadata: {
      documentId: document.id,
      fileName: document.fileName,
      userId: document.userId,
    },
  });

  console.log("parsed document ", parsedDocument);
}
