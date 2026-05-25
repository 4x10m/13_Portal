# ── AxiiomLab Dashboard — Multi-stage Docker build ──
# Node 22 Alpine + native deps for better-sqlite3

# ── Stage 1: build ──
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++ sqlite-dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force
COPY . .
RUN npm run build

# ── Stage 2: production ──
FROM node:22-alpine AS runner
RUN apk add --no-cache sqlite-libs python3 bash curl postgresql16-client redis docker-cli && \
    npm install -g mongosh 2>/dev/null || true
WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/dashboard.db

RUN addgroup --system --gid 1001 nodejs && \
    addgroup --system --gid 989 docker && \
    adduser --system --uid 1001 nextjs && \
    addgroup nextjs docker

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# better-sqlite3 native binding (needed at runtime)
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

RUN mkdir -p /app/data/groudon /app/.next/cache && chown nextjs:nodejs /app/data /app/data/groudon /app/.next/cache

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
