import { ProjectRole, prisma } from "@voidlog/db";
import { NextResponse } from "next/server";
import { checkProjectRole } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import { generateShareToken } from "@/lib/share-links";

/**
 * Turns the project's public read-only link on, or replaces it with a new
 * one (the old link stops working at once). Admins only.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const session = await requireSession();
  const access = await checkProjectRole(projectId, session.user.id, ProjectRole.ADMIN);
  if (!access.ok) return access.response;

  const token = generateShareToken();
  await prisma.projectShareLink.upsert({
    where: { projectId },
    create: { projectId, token, createdById: session.user.id },
    update: { token, createdById: session.user.id, createdAt: new Date() },
  });
  return NextResponse.json({ token });
}

/** Turns the public link off. Admins only. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const session = await requireSession();
  const access = await checkProjectRole(projectId, session.user.id, ProjectRole.ADMIN);
  if (!access.ok) return access.response;

  await prisma.projectShareLink.deleteMany({ where: { projectId } });
  return NextResponse.json({ deleted: true });
}
