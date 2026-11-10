import { PrismaClient } from "@prisma/client";

declare global {
  var __voidlogPrisma: PrismaClient | undefined;
}

/**
 * Singleton PrismaClient, reused across hot reloads in dev so we don't
 * exhaust the Postgres connection pool.
 */
export const prisma = globalThis.__voidlogPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__voidlogPrisma = prisma;
}

// Runtime values are listed explicitly: @prisma/client is CommonJS, so a
// blanket `export *` can't be resolved at build time (Turbopack warns and
// adds runtime glue). Add new enums here when code needs them as values.
// Types (models, enum types, payloads) all pass through `export type *`.
export { LogFileStatus, MechanicCategory, Prisma, PrismaClient, ProjectRole } from "@prisma/client";
export type * from "@prisma/client";
