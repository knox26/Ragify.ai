import { enqueuePendingDocuments } from "./enqueuePendingDocuments";

const POLL_INTERVAL_MS = 2000;

/**
 * Scheduler entrypoint — runs the background jobs on a loop.
 *
 * Uses a recursive setTimeout (not setInterval) so a slow run never
 * overlaps with the next one.
 */
async function loop(): Promise<void> {
  try {
    const count = await enqueuePendingDocuments();
    if (count > 0) {
      console.log(`[scheduler] enqueued ${count} document(s)`);
    }
  } catch (error) {
    // Log and continue — a transient failure must never kill the loop.
    console.error("[scheduler] poll failed", error);
  }

  // Schedule the next run AFTER this one finishes.
  setTimeout(loop, POLL_INTERVAL_MS);
}

loop();

// Let the process exit cleanly on shutdown signals.
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
