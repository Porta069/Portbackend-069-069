#!/usr/bin/env bash
# ─── Datenbank-Backup (Supabase Prod) ────────────────────────────────────────
# Supabase Free hat KEIN Point-in-Time-Recovery — dieses Script zieht einen
# vollständigen pg_dump über den Session-Pooler. Regelmäßig ausführen (z. B.
# wöchentlich per Kalender-Erinnerung oder cron auf dem eigenen Rechner):
#
#   SUPABASE_DB_PASSWORD=... ./scripts/backup.sh [zielordner]
#
# Wiederherstellen (im Notfall, überschreibt Daten!) — die Datei ist GEPACKT,
# ohne gunzip schlaegt jede Wiederherstellung fehl:
#   gunzip -c portawerk-JJJJMMTT-HHMM.sql.gz | psql "<CONNECTION>"
# Am saubersten in eine LEERE Datenbank (der Dump enthaelt CREATE TABLE).
set -euo pipefail

HOST="aws-0-eu-west-1.pooler.supabase.com"
PORT=5432
USER="postgres.bycrvqfvpidbjhjshxyf"
DB="postgres"

DEST="${1:-$HOME/PortaWerk-Backups}"
mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M)"
FILE="$DEST/portawerk-$STAMP.sql.gz"

: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD fehlt (Supabase → Settings → Database)}"

# Server läuft auf Postgres 17 — pg_dump muss mindestens so neu sein.
PG_DUMP="pg_dump"
if [ -x /opt/homebrew/opt/postgresql@17/bin/pg_dump ]; then
  PG_DUMP=/opt/homebrew/opt/postgresql@17/bin/pg_dump
fi

echo "Sichere $DB → $FILE …"
PGPASSWORD="$SUPABASE_DB_PASSWORD" "$PG_DUMP" \
  --host="$HOST" --port="$PORT" --username="$USER" --dbname="$DB" \
  --no-owner --no-privileges --schema=public \
  | gzip > "$FILE"

echo "Fertig: $(du -h "$FILE" | cut -f1) — $FILE"

# Aufbewahrung: die letzten 12 Backups behalten, ältere löschen.
ls -1t "$DEST"/portawerk-*.sql.gz 2>/dev/null | tail -n +13 | xargs -I{} rm -- {} 2>/dev/null || true
echo "Vorhandene Backups:"; ls -1t "$DEST"/portawerk-*.sql.gz | head -12
