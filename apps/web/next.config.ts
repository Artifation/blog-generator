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
  // The app renders images from same-origin API routes (/api/post-image,
  // /api/draft-image) and plain <img> tags inside post HTML — next/image is not
  // used with remote hosts. The old `hostname: "**"` turned /_next/image into
  // an open image proxy (bandwidth/CPU abuse + limited SSRF), so we lock it
  // down: no remote optimizer hosts. Add explicit entries here if next/image
  // ever needs a remote source.
  images: {
    remotePatterns: [],
    dangerouslyAllowSVG: false,
  },
  poweredByHeader: false,
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      // Next/React inline runtime needs 'unsafe-inline'; dev/HMR also needs eval.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "connect-src 'self'",
      "form-action 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          // Honored only over HTTPS (ignored on plain-HTTP deploys), so safe to
          // always send. No `preload` — that is an explicit opt-in commitment.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
