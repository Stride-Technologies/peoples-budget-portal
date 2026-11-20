#!/usr/bin/env bash
# Nightly production database backup (#130): pg_dump → backups/ → DO Spaces.
#
#   daily   backups/daily/   keep 14
#   weekly  backups/weekly/  keep 8   (the Sunday-UTC run is also copied here)
#   local   /opt/budget-portal/backups/portal-*Z.dump   keep 3 days
#
# Objects are uploaded PRIVATE — the dump holds personal data. Manual dumps
# (portal-<date>-<purpose>.dump) are never pruned. Installed in the deploy
# user's crontab (no sudo needed); see docs/deployment-do.md §5:
#
#   15 18 * * * /opt/budget-portal/deploy/backup-db.sh >> /opt/budget-portal/backups/backup.log 2>&1
#
# Exits non-zero on any failure, leaving the local dump in place.
set -euo pipefail
umask 077

ROOT=/opt/budget-portal
cd "$ROOT"
mkdir -p backups

log() { echo "$(date -u +%FT%TZ) $*"; }
spaces() { docker compose exec -T api node -e "$(cat deploy/spaces-backup.cjs)" "$@"; }

STAMP=$(date -u +%Y%m%dT%H%MZ)
NAME="portal-$STAMP.dump"
FILE="backups/$NAME"

log "dumping to $FILE"
docker compose exec -T postgres pg_dump -U portal -d portal -Fc > "$FILE"

# A readable archive lists every table, index and constraint (~340 today).
ENTRIES=$(docker compose exec -T postgres pg_restore -l < "$FILE" | grep -cv '^;' || true)
if [ "$ENTRIES" -lt 100 ]; then
  log "FAILED: $FILE lists only $ENTRIES entries"
  exit 1
fi
SHA=$(sha256sum "$FILE" | cut -d' ' -f1)
log "dump ok: $(stat -c %s "$FILE") bytes, $ENTRIES entries, sha256 $SHA"

spaces put "backups/daily/$NAME" "$SHA" < "$FILE"
if [ "$(date -u +%u)" = 7 ]; then
  spaces put "backups/weekly/$NAME" "$SHA" < "$FILE"
fi
spaces prune backups/daily/ 14
spaces prune backups/weekly/ 8

find backups -maxdepth 1 -name 'portal-*Z.dump' -mtime +3 -delete
log "done"
