-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_id_idx" ON "ChatMessage"("sessionId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ChatSession_userId_updatedAt_id_idx" ON "ChatSession"("userId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Document_userId_createdAt_id_idx" ON "Document"("userId", "createdAt", "id");
