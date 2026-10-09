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

if [ "${SKIP_PRISMA_MIGRATIONS}" != "true" ]; then
  echo "Running Prisma migrations..."
  attempt=1
  max_attempts="${PRISMA_MIGRATION_MAX_RETRIES:-10}"

  while [ "$attempt" -le "$max_attempts" ]; do
    migration_log="$(mktemp)"
    if ./node_modules/.bin/prisma migrate deploy --schema "$PRISMA_SCHEMA_PATH" >"$migration_log" 2>&1; then
      cat "$migration_log"
      rm -f "$migration_log"
      break
    fi

    cat "$migration_log"

    if grep -q "P1000" "$migration_log"; then
      rm -f "$migration_log"
      echo "Prisma migration failed: database authentication was rejected. Check DATABASE_URL/POSTGRES_PASSWORD."
      exit 1
    fi

    if grep -q "P3009" "$migration_log"; then
      failed_migration=$(grep -oP 'The `\K[^`]+(?=` migration)' "$migration_log" | head -1)
      if [ -n "$failed_migration" ]; then
        echo "Detected failed migration in DB: $failed_migration — marking as rolled-back and retrying..."
        ./node_modules/.bin/prisma migrate resolve --rolled-back "$failed_migration" --schema "$PRISMA_SCHEMA_PATH" || true
      fi
    fi

    rm -f "$migration_log"

    if [ "$attempt" -eq "$max_attempts" ]; then
      echo "Prisma migrations failed after ${max_attempts} attempts"
      exit 1
    fi

    echo "Migration attempt ${attempt}/${max_attempts} failed, retrying in 5s..."
    attempt=$((attempt + 1))
    sleep 5
  done
else
  echo "Skipping Prisma migrations because SKIP_PRISMA_MIGRATIONS=true"
fi

if [ "${SKIP_PRISMA_SEED}" != "true" ] && [ -f "/app/dist/prisma/seed.js" ]; then
  echo "Running Prisma seed..."
  node /app/dist/prisma/seed.js
fi

echo "Starting application..."
exec "$@"
