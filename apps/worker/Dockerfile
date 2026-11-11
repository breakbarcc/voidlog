# Build context must be the monorepo root (see docker-compose.yml) — same
# reasoning as apps/web/Dockerfile (workspace packages, root lockfile,
# glibc base for Prisma's native query-engine binary, Node 22, and a pnpm
# version kept in sync with the root package.json's packageManager — see that
# Dockerfile's base-image comment).

FROM node:25-bookworm-slim AS base
# See apps/web/Dockerfile's identical line — Prisma needs openssl present to
# pick the correct query-engine binary variant, otherwise every DB call
# fails at runtime with a missing .so.node error.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@12.4.2 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
# No --prod here: the worker runs straight from TypeScript source via tsx at
# runtime (mirrors `apps/worker`'s own "start" script — see package.json),
# not a compiled dist/ output, so tsx/typescript need to stay installed.
# Trades a somewhat larger image for not introducing a second, untested
# "compiled" run path in addition to the one already used everywhere else
# (local dev, `pnpm start`) — switching to `pnpm run build` + `node dist/
# index.js` later is a reasonable follow-up if image size becomes a problem.
#
# --filter @voidlog/worker... : without this, pnpm installs dependencies for
# every workspace package (all package.json files above are only there so
# pnpm can validate/resolve the workspace graph against the lockfile) —
# including apps/web's Next.js/React/Radix/Recharts/Tailwind tree, which
# this image never runs. "..." pulls in this package's own workspace
# dependencies too (@voidlog/db, @voidlog/shared).
#
# `pnpm store prune` in the same RUN: pnpm's content-addressable store (the
# actual downloaded package contents, hardlinked into node_modules) is
# written outside node_modules and isn't needed once install is done — left
# alone, it's dead weight baked into this layer's diff. Confirmed on a real
# build: node_modules ended up 171MB, but the un-pruned install layer alone
# was 620MB. Must be the same RUN/layer as the install, not a later one —
# Docker layers are additive, so pruning in a separate layer wouldn't shrink
# the image, only hide the files.
RUN pnpm install --frozen-lockfile --filter @voidlog/worker... && pnpm store prune

FROM deps AS runner
ENV NODE_ENV=production
COPY . .
RUN pnpm --filter @voidlog/db run generate

CMD ["pnpm", "--filter", "@voidlog/worker", "exec", "tsx", "src/index.ts"]
