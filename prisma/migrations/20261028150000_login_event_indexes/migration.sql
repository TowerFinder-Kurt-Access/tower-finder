-- Ordering for the default list: newest first, with id as the tiebreaker.
CREATE INDEX "LoginEvent_createdAt_id_idx" ON "LoginEvent"("createdAt" DESC, "id" DESC);

-- Type filters keep the same newest-first order.
CREATE INDEX "LoginEvent_type_createdAt_idx" ON "LoginEvent"("type", "createdAt");
