-- CreateIndex
CREATE INDEX "upload_batches_projectId_idx" ON "upload_batches"("projectId");

-- CreateIndex
CREATE INDEX "log_files_batchId_idx" ON "log_files"("batchId");

-- CreateIndex
CREATE INDEX "phase_results_encounterResultId_idx" ON "phase_results"("encounterResultId");

-- CreateIndex
CREATE INDEX "mechanic_events_phaseResultId_idx" ON "mechanic_events"("phaseResultId");

-- CreateIndex
CREATE INDEX "mechanic_events_playerResultId_idx" ON "mechanic_events"("playerResultId");
