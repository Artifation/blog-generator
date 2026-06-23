# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Blog Studio — production Dockerfile
#
# Three-stage build:
#   1. deps    — install npm dependencies for both the root pipeline workspace
#                and apps/web. Native modules (sharp, libsql native bits) need
#                python3 + a C++ toolchain on Alpine.
#   2. builder — copy source, build the Next.js app with `output: "standalone"`
#                so the runtime stage can ship without npm install.
#   3. runner  — minimal node:22-alpine, non-root user, only the runtime
#                artifacts. SQLite db lives on a mounted volume at /app/data.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=22-alpine

# ===========================================================================
# Stage 1: deps — install dependencies (root + apps/web)
# ===========================================================================
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Native build-tools for sharp / better-sqlite3-style native modules.
# libsql ships prebuilt binaries for linux-x64-musl, so this is mostly for
# sharp + any optional native dep that may need to compile.
RUN apk add --no-cache \
      python3 \
      make \
      g++ \
      libc6-compat

# Copy manifests first so dependency layers can be cached between builds.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package-lock.json ./apps/web/

# Root pipeline deps (src/agents/, src/pipeline/, etc.)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# Web app deps
RUN --mount=type=cache,target=/root/.npm \
    cd apps/web && npm ci --no-audit --no-fund

# Sharp's prebuilt binary is shipped via platform-specific optional deps
# (e.g. @img/sharp-linuxmusl-x64). `npm ci` only installs the optional deps
# that are recorded in package-lock.json — and lockfiles generated on
# Win/macOS only record those platforms. Force the Alpine binary explicitly
# for both the root and the apps/web install so the runtime image can load
# sharp without 500-ing every server-action chunk that transitively imports
# it (see src/image/optimize.ts).
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-save --include=optional \
      --os=linux --libc=musl --cpu=x64 \
      sharp \
 && cd apps/web && npm install --no-save --include=optional \
      --os=linux --libc=musl --cpu=x64 \
      sharp

# ===========================================================================
# Stage 2: builder — compile Next.js (standalone output)
# ===========================================================================
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

# Re-install the same toolchain so any postinstall scripts that rebuild
# native modules during `next build` have what they need.
RUN apk add --no-cache python3 make g++ libc6-compat

# Bring over the resolved node_modules from the deps stage.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Now the source.
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Next.js build can OOM on small VPSes (default Node heap ~2GB). Bump to 4GB
# for the build step so subsystems like the type-checker and bundle compiler
# don't trigger "JavaScript heap out of memory".
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Build the Next.js app. Outputs:
#   apps/web/.next/standalone/        — self-contained server.js + minimal node_modules
#   apps/web/.next/static/            — static chunks, must be copied alongside
#   apps/web/public/                  — public assets
RUN cd apps/web && npm run build

# ===========================================================================
# Stage 3: runner — minimal runtime image
# ===========================================================================
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

# Runtime libs only — no compilers in the final image.
# tini = proper PID 1 signal handling; curl = HEALTHCHECK probe.
RUN apk add --no-cache tini curl libc6-compat \
 && addgroup -S -g 1001 blogtool \
 && adduser -S -u 1001 -G blogtool blogtool

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# DB lives on the mounted volume — absolute path, no `cd` dance.
ENV DATABASE_FILE=/app/data/app.db

# Next.js standalone output is rooted at the monorepo root because
# `outputFileTracingRoot` points there. So the standalone/ directory contains
# both apps/web/ and a top-level node_modules/.
COPY --from=builder --chown=blogtool:blogtool /app/apps/web/.next/standalone ./
COPY --from=builder --chown=blogtool:blogtool /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=blogtool:blogtool /app/apps/web/public ./apps/web/public

# Persistent state directory — mount a volume here.
RUN mkdir -p /app/data /app/data/backups /app/data/exports /app/data/runs /app/data/images \
 && chown -R blogtool:blogtool /app/data

USER blogtool

VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
# server.js is emitted by Next inside apps/web/ within the standalone tree.
CMD ["node", "apps/web/server.js"]
