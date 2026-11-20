-- CreateTable
CREATE TABLE "project_share_links" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_share_links_projectId_key" ON "project_share_links"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_share_links_token_key" ON "project_share_links"("token");

-- AddForeignKey
ALTER TABLE "project_share_links" ADD CONSTRAINT "project_share_links_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_share_links" ADD CONSTRAINT "project_share_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
