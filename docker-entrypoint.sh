#!/bin/sh

set -e

cd /app

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is required"
  exit 1
fi

PRISMA_SCHEMA_PATH="${PRISMA_SCHEMA_PATH:-/app/prisma/schema.prisma}"

if [ ! -f "$PRISMA_SCHEMA_PATH" ]; then
  echo "Prisma schema not found at $PRISMA_SCHEMA_PATH"
  echo "Current working directory: $(pwd)"
  exit 1
fi

# Isolated staff release: do not execute unrelated migrations or seed production.
node /app/scripts/staff-release-preflight.cjs
node /app/scripts/member-card-preflight.cjs
node /app/scripts/registration-preflight.cjs

echo "Starting application..."
exec "$@"
