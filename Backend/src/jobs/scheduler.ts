import { enqueuePendingDocuments } from "./enqueuePendingDocuments";
import { reconcileStaleUploads } from "./reconcileStaleUploads";

const POLL_INTERVAL_MS = 2000;
// Stale-upload sweep — coarse, it does not need the enqueue cadence.
const RECONCILE_INTERVAL_MS = 15 * 60 * 1000; // 15m

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

async function reconcileLoop(): Promise<void> {
  try {
    const count = await reconcileStaleUploads();
    if (count > 0) {
      console.log(`[scheduler] reconciled ${count} abandoned upload(s)`);
    }
  } catch (error) {
    console.error("[scheduler] reconcile failed", error);
  }

  setTimeout(reconcileLoop, RECONCILE_INTERVAL_MS);
}

loop();
reconcileLoop();

// Let the process exit cleanly on shutdown signals.
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
