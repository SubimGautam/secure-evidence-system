# ---- build: install deps, generate the Prisma client, then drop dev deps ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# npm ci's postinstall hook runs `prisma generate`. Generation only needs the
# schema, not a reachable database, so no secrets are required at build time.
RUN npm ci

COPY src ./src

# @prisma/client's generated output is plain JS at this point — the `prisma`
# CLI itself (and every other dev dependency) is no longer needed at runtime.
RUN npm prune --omit=dev

# ---- runtime: minimal image, non-root user ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma

# Pre-created and owned by appuser so the first mount of the (empty) named
# evidence-files volume inherits these permissions — otherwise Docker
# mounts it root-owned and the app's own writes fail with EACCES.
RUN mkdir -p /app/storage/evidence-files && chown -R appuser:appgroup /app/storage

USER appuser
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/healthz || exit 1

CMD ["node", "src/server.js"]
