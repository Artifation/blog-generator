import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // `standalone` makes `next build` emit a self-contained .next/standalone
  // directory with a minimal server.js + only the production-needed
  // node_modules. This is what the Docker runtime stage copies. Required for
  // the production deployment (Docker + systemd) — see docs/deployment/vps.md.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  serverExternalPackages: ["@libsql/client", "sharp"],
  outputFileTracingIncludes: {
    // libsql loads its native binary via dynamic require() which nft can't
    // trace. Force-include all platform binaries so the standalone tree has
    // the right .node file at runtime (esp. @libsql/linux-x64-musl on Alpine).
    "*": [
      "../../node_modules/libsql/**/*",
      "../../node_modules/@libsql/**/*",
      "./node_modules/libsql/**/*",
      "./node_modules/@libsql/**/*",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
