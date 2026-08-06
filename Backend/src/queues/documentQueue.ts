import { Queue } from "bullmq";
import { redis } from "../libs/redis";
import { QUEUE_NAMES } from "./queueConstants";

export interface ProcessDocumentJob {
  documentId: string;
}

export const documentProcessorQueue = new Queue(
  QUEUE_NAMES.DOCUMENT_PROCESSING,
  {
    connection: redis,
  },
);
