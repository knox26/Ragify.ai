-- AlterTable
-- Phase 2 re-ingest idempotency (Option B): tenant-safe content hash on the
-- Document row instead of a Qdrant scroll. Null = never hashed.
ALTER TABLE "Document" ADD COLUMN "contentHash" TEXT;
