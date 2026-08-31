-- CreateExtension
-- pg_trgm backs the GIN operator class below. Declared in the datasource
-- (extensions = [pg_trgm]) so Prisma Migrate does not try to drop it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
-- Accelerates the case-insensitive substring search
-- ("fileName" ILIKE '%term%') used by getDocumentsController. A btree cannot
-- serve a leading-wildcard match; pg_trgm's GIN operator class handles ILIKE
-- natively. Modeled in schema as @@index(... type: Gin, map: ...) so the
-- shadow-diff recognises this hand-written index and never re-drops it.
CREATE INDEX "Document_fileName_trgm_idx" ON "Document" USING GIN ("fileName" gin_trgm_ops);
