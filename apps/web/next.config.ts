import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Docker image (see apps/web/Dockerfile): produces .next/standalone, a
  // self-contained server.js plus only the node_modules subset it actually
  // needs — avoids shipping the whole monorepo's devDependencies into the
  // runtime image.
  output: "standalone",
  // Monorepo root, not this package's own directory — Next's file tracing
  // otherwise only looks two directories down from here and misses the
  // workspace packages (@voidlog/db, @voidlog/shared) this app imports by
  // relative workspace path.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
};

export default withNextIntl(nextConfig);
