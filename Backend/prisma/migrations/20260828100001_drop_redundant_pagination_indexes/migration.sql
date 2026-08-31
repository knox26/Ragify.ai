-- DropIndex
-- Redundant with the ..._id tiebreak indexes created in
-- 20260827192805_add_pagination_tiebreak_indexes. Postgres btree indexes are
-- prefix-servable, so (userId, createdAt) is a strict prefix of
-- (userId, createdAt, id) and never used independently.
DROP INDEX "Document_userId_createdAt_idx";

-- DropIndex
DROP INDEX "ChatSession_userId_updatedAt_idx";

-- DropIndex
DROP INDEX "ChatMessage_sessionId_createdAt_idx";
