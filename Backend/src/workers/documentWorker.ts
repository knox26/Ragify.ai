import { Worker } from "bullmq";
import { redis } from "../libs/redis";
import { QUEUE_NAMES } from "../queues/queueConstants";
import { processDocument } from "./processDocument";

const worker = new Worker(QUEUE_NAMES.DOCUMENT_PROCESSING, processDocument, {
  connection: redis,
  // One document at a time — each job holds a full file buffer in memory.
  concurrency: 1,
});

// How long to wait for the in-flight job to finish before forcing exit.
const FORCE_EXIT_TIMEOUT_MS = 30_000;

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received — draining in-flight job`);

  // If a job is hung (e.g. a stalled embedding call), don't wait forever.
  // Forced exit is safe: BullMQ stalled recovery will re-run the job.
  const forceExit = setTimeout(() => {
    console.error(
      `[worker] graceful shutdown timed out after ${FORCE_EXIT_TIMEOUT_MS}ms — forcing exit`,
    );
    process.exit(1);
  }, FORCE_EXIT_TIMEOUT_MS);

  try {
    // Stops taking new jobs and waits for the active job to finish.
    await worker.close();
    clearTimeout(forceExit);
    console.log("[worker] drained cleanly — exiting");
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExit);
    console.error("[worker] shutdown error", error);
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
