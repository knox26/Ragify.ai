import { Worker } from "bullmq";
import { redis } from "../libs/redis";
import { JOB_NAMES, QUEUE_NAMES } from "../queues/queueConstants";
import prisma from "../db/dbConfig";
import { processDocument } from "./processDocument";

const worker = new Worker(QUEUE_NAMES.DOCUMENT_PROCESSING, processDocument, {
  connection: redis,
});
