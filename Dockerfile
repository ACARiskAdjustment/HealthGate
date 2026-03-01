# HealthGate Next.js BFF
# Multi-stage build: development | production
# Hardened per NFR8: non-root, read-only FS, no capabilities, minimal image

# --- Base ---
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat \
    && apk upgrade --no-cache

# --- Dependencies (production only) ---
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# --- Dependencies (all, for build) ---
FROM base AS deps-all
COPY package.json package-lock.json* ./
RUN npm ci

# --- Development ---
FROM base AS development
WORKDIR /app
COPY --from=deps-all /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- Builder (production) ---
FROM base AS builder
WORKDIR /app
COPY --from=deps-all /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Production ---
FROM node:20-alpine AS production
WORKDIR /app

# Security: upgrade all packages to latest patches
RUN apk add --no-cache libc6-compat \
    && apk upgrade --no-cache \
    && rm -rf /var/cache/apk/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user (UID 1001)
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Copy only standalone output (minimal footprint)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Writable dirs for Next.js cache (mounted as emptyDir in K8s)
RUN mkdir -p /app/.next/cache /tmp \
    && chown -R nextjs:nodejs /app/.next/cache /tmp

# Security labels
LABEL org.opencontainers.image.title="healthgate-bff" \
      org.opencontainers.image.description="HealthGate BFF — HIPAA-compliant auth gateway" \
      org.opencontainers.image.vendor="Google Health" \
      org.opencontainers.image.source="https://github.com/googlehealth/healthgate"

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check for container runtimes without K8s probes
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/healthz || exit 1

CMD ["node", "server.js"]
