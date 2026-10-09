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
  exit 1
fi

if [ "${SKIP_PRISMA_MIGRATIONS}" != "true" ]; then
  MIGRATIONS_DIR="/app/prisma/migrations"
  HAS_MIGRATIONS=false
  if [ -d "$MIGRATIONS_DIR" ] && [ -n "$(ls -A "$MIGRATIONS_DIR" 2>/dev/null)" ]; then
    HAS_MIGRATIONS=true
  fi

  attempt=1
  max_attempts="${PRISMA_MIGRATION_MAX_RETRIES:-10}"

  if [ "$HAS_MIGRATIONS" = "true" ]; then
    echo "Running Prisma migrations..."
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
        echo "Database authentication failed. Check DATABASE_URL."
        exit 1
      fi

      if grep -q "P3009" "$migration_log"; then
        failed_migration=$(grep -oP 'The `\K[^`]+(?=` migration)' "$migration_log" | head -1)
        if [ -n "$failed_migration" ]; then
          echo "Marking failed migration as rolled-back: $failed_migration"
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
    echo "No migrations found. Pushing schema with prisma db push..."
    while [ "$attempt" -le "$max_attempts" ]; do
      if ./node_modules/.bin/prisma db push --schema "$PRISMA_SCHEMA_PATH" --skip-generate 2>&1; then
        echo "Schema pushed successfully."
        break
      fi

      if [ "$attempt" -eq "$max_attempts" ]; then
        echo "Prisma db push failed after ${max_attempts} attempts"
        exit 1
      fi

      echo "db push attempt ${attempt}/${max_attempts} failed, retrying in 5s..."
      attempt=$((attempt + 1))
      sleep 5
    done
  fi
else
  echo "Skipping Prisma migrations because SKIP_PRISMA_MIGRATIONS=true"
fi

if [ "${PRISMA_SEED_ON_DEPLOY}" = "true" ]; then
  if [ -f "/app/dist/prisma/seed.js" ]; then
    echo "Running Prisma seed..."
    node /app/dist/prisma/seed.js
  else
    echo "PRISMA_SEED_ON_DEPLOY=true but no runtime seed artifact was found"
    exit 1
  fi
fi

echo "Starting application..."
exec "$@"
