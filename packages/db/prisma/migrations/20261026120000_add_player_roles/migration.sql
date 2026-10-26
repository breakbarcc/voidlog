-- CreateTable
CREATE TABLE "project_player_roles" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_player_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_player_roles" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_player_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_player_roles_projectId_account_key" ON "project_player_roles"("projectId", "account");

-- CreateIndex
CREATE UNIQUE INDEX "batch_player_roles_batchId_account_key" ON "batch_player_roles"("batchId", "account");

-- AddForeignKey
ALTER TABLE "project_player_roles" ADD CONSTRAINT "project_player_roles_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_player_roles" ADD CONSTRAINT "batch_player_roles_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "upload_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
