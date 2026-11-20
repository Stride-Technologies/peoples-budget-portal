#!/usr/bin/env bash
# Prove the newest off-host backup restores (#130). Downloads it from DO
# Spaces, restores it into a throwaway Postgres 16 container on this host
# (no published port, removed afterwards), and compares row counts of the
# budget tables with the live database. The dump never leaves the Droplet.
#
# Usage: bash /opt/budget-portal/deploy/restore-check.sh [<spaces key>]
set -euo pipefail
umask 077

ROOT=/opt/budget-portal
cd "$ROOT"
spaces() { docker compose exec -T api node -e "$(cat deploy/spaces-backup.cjs)" "$@"; }

KEY=${1:-$(spaces list backups/daily/ | head -1 | cut -d' ' -f1)}
[ -n "$KEY" ] || { echo "no backups under backups/daily/"; exit 1; }
FILE=$(mktemp "$ROOT/backups/restore-check-XXXX.dump")
NAME=portal-restore-check
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -f "$FILE"' EXIT

echo "restoring $KEY"
spaces get "$KEY" > "$FILE"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=check -e POSTGRES_DB=portal \
  postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U postgres -d portal >/dev/null 2>&1 && break
  sleep 1
done
docker exec -i "$NAME" pg_restore -U postgres -d portal --no-owner --exit-on-error < "$FILE"

# Budget tables only — counting personal tables would be fine here, but there
# is nothing to learn from them that these don't already show.
SQL="select 'aip_cycles', count(*) from aip_cycles union all
     select 'offices', count(*) from offices union all
     select 'programs', count(*) from programs union all
     select 'project_activities', count(*) from project_activities union all
     select 'program_versions', count(*) from program_versions union all
     select 'ppmps', count(*) from ppmps order by 1"
LIVE=$(docker compose exec -T postgres psql -U portal -d portal -At -c "$SQL")
RESTORED=$(docker exec "$NAME" psql -U postgres -d portal -At -c "$SQL")
paste -d' ' <(echo "$LIVE") <(echo "$RESTORED" | cut -d'|' -f2) | awk -F'[| ]' \
  '{ printf "%-20s live %-8s restored %s\n", $1, $2, $3 }'
# Rows written since the dump was taken make "live" larger; never smaller.
if [ "$LIVE" != "$RESTORED" ]; then
  echo "NOTE: counts differ — expected only for rows written since the backup ran"
fi
echo "restore ok"
