# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim

WORKDIR /app

RUN --mount=type=cache,id=gympass-apt-lists,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,id=gympass-apt-cache,target=/var/cache/apt,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl openssl \
    && rm -rf /var/lib/apt/lists/*

# Install ALL deps including devDependencies (needed for nest build / tsc)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --include=dev

# Copy source and build
COPY . .
RUN npx prisma generate
RUN npm run build

# Verify the build actually produced output
RUN test -f dist/main.js || (echo "ERROR: dist/main.js not found — build failed" && exit 1)

# Remove devDependencies from the final image
RUN npm prune --omit=dev

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh \
    && chown -R node:node /app

USER node

ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=512 \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/api/v1/health" >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
