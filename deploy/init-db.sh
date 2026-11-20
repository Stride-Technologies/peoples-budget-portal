#!/usr/bin/env bash
# Apply the database migrations, and on the first run load your city.
# Run after the first deploy and after any new migrations land.
#
# The Prisma CLI and tsx are devDependencies, so they do NOT exist in the slim runtime `api`
# image. Both steps run from the `migrate` compose service instead, which builds off the
# Dockerfile `build` stage (full deps + generated client) and joins the same network as Postgres.
#
# Usage:
#   bash deploy/init-db.sh                                         # migrations only
#   bash deploy/init-db.sh --load-city prisma/data/<folder> [--draft]
#
# --load-city works on an EMPTY database only: it loads the folder's offices and goals and one
# year's AIP, and creates the first administrator from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
# The folder must be under api/ in this checkout, so it is inside the image
# (api/prisma/data/sample-city/README.md says what it holds). --draft leaves every program a draft.
set -euo pipefail

cd /opt/budget-portal

echo "==> Building the migrator image and applying migrations..."
docker compose --profile tools run --rm --build --no-deps migrate

if [[ "${1:-}" == "--load-city" ]]; then
  echo "==> Loading ${2:?the city folder, e.g. prisma/data/my-city}..."
  docker compose --profile tools run --rm --no-deps migrate \
    pnpm db:seed:city -- --dir "$2" "${@:3}"
fi

echo "Database ready."
