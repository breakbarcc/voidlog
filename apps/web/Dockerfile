# Build context must be the monorepo root (see docker-compose.yml), not
# apps/web — this needs the workspace packages (@voidlog/db, @voidlog/shared)
# and the root lockfile.
#
# node:22-bookworm-slim (glibc), not alpine: Node 22 matches the root
# package.json's engines.node (>=22.13). The pnpm version below must match the
# root package.json's packageManager (currently pnpm@12.4.2) so images install
# the lockfile with the same pnpm as local dev. glibc avoids the musl/OpenSSL-version detection issues Prisma has
# historically had on Alpine.

FROM node:22-bookworm-slim AS base
# Prisma's query-engine binary selection inspects the system's OpenSSL
# version at generate-time — without openssl installed, bookworm-slim has
# none, so Prisma silently defaults to the wrong engine variant
# (libquery_engine-debian-openssl-1.1.x, which doesn't exist here; bookworm
# ships OpenSSL 3.x) and every Prisma call fails at runtime with a missing
# .so.node error. Confirmed by an actual build without this line.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@12.4.2 --activate
WORKDIR /repo

# Installed from only the package.json files first so this layer is cached
# across builds that don't touch dependencies — mirrors every workspace
# package.json individually since a wildcard COPY apps/*/package.json can't
# preserve the apps/<name>/ directory structure pnpm needs to see.
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
# pnpm-workspace.yaml's `allowBuilds` already approves the specific postinstall
# scripts (@prisma/client, esbuild, etc.) non-interactively — see apps/web
# README notes on `pnpm approve-builds` for the equivalent local-dev step.
#
# --filter @voidlog/web... : without this, pnpm installs every workspace
# package's dependencies, including apps/worker's (bullmq, stream-json) that
# this image never runs — the package.json files above are only there so
# pnpm can resolve the workspace graph against the lockfile, not to have
# their deps actually installed. "..." pulls in this package's own workspace
# dependencies too (@voidlog/db, @voidlog/shared).
#
# `pnpm store prune` in the same RUN — see apps/worker/Dockerfile's identical
# line for why: pnpm's content-addressable store is dead weight left in this
# layer's diff otherwise, and pruning only works if it happens in the same
# layer as the install (Docker layers are additive).
RUN pnpm install --frozen-lockfile --filter @voidlog/web... && pnpm store prune

# Full source now available — generate the Prisma client for *this*
# container's OS/libc (never copied in from the host, see base image note
# above), then build the standalone Next.js output.
FROM deps AS builder
COPY . .
RUN pnpm --filter @voidlog/db run generate
RUN pnpm --filter @voidlog/web run build

# Standalone output only includes the node_modules subset Next's build
# actually traced as needed (see next.config.ts's outputFileTracingRoot) —
# @voidlog/db and @voidlog/shared aren't in it because Next inlines them
# directly into the compiled server bundle (plain TS, no native deps);
# @prisma/client's generated client + native query-engine binary is real
# runtime-external and does get copied. `public`/`.next/static` are never
# part of the standalone trace (Next assumes a CDN for those) — copied
# manually per Next's own docs.
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

ENV PORT=4000
ENV HOSTNAME=0.0.0.0
EXPOSE 4000
CMD ["node", "apps/web/server.js"]
