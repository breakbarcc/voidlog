-- Attribute pre-existing logs to the owner of their project. Until project
-- roles existed nobody could be invited to a project, so the owner was the
-- only member and therefore the only possible uploader of those logs.
UPDATE "log_files" AS lf
SET "uploadedById" = p."ownerId"
FROM "upload_batches" AS b
JOIN "projects" AS p ON p."id" = b."projectId"
WHERE lf."batchId" = b."id"
  AND lf."uploadedById" IS NULL;
