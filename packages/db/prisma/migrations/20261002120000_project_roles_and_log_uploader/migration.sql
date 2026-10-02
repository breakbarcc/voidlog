-- Project roles: OWNER -> ADMIN, MEMBER -> VIEWER (nobody was ever invited to
-- a project, so every existing MEMBER row is an artifact and is safest as the
-- least-privileged role), plus the new CONTRIBUTOR role in between.
-- Renaming keeps existing rows and the column default (now 'VIEWER') intact.
ALTER TYPE "ProjectRole" RENAME VALUE 'OWNER' TO 'ADMIN';
ALTER TYPE "ProjectRole" RENAME VALUE 'MEMBER' TO 'VIEWER';
ALTER TYPE "ProjectRole" ADD VALUE 'CONTRIBUTOR' BEFORE 'VIEWER';

-- Upload attribution. Nullable: existing logs have no known uploader.
ALTER TABLE "log_files" ADD COLUMN "uploadedById" TEXT;

ALTER TABLE "log_files" ADD CONSTRAINT "log_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
