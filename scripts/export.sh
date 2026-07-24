#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PortaWerk — Registrierungen aus Supabase exportieren (CSV + JSON).
#
# Nutzung:
#   SUPABASE_DB_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require" \
#     ./scripts/export.sh [ausgabe-ordner]
#
# Die Connection-URL bekommst du in Supabase → Settings → Database →
# "Connection string" (Session Pooler, Port 5432). Braucht `psql` (Postgres-Client).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${SUPABASE_DB_URL:?Bitte SUPABASE_DB_URL setzen (Supabase → Settings → Database → Connection string, Session Pooler 5432)}"

OUT="${1:-./export}"
mkdir -p "$OUT"

echo "→ User → $OUT/users.csv"
psql "$SUPABASE_DB_URL" -c "\copy (select \"firstName\", \"lastName\", email, phone, status, \"createdAt\", \"lastLoginAt\" from \"User\" order by \"createdAt\") to '$OUT/users.csv' with csv header"

echo "→ Registrierungs-Antworten (Umfrage + KI) → $OUT/registrations.json"
psql "$SUPABASE_DB_URL" -tAc \
  "select coalesce(json_agg(json_build_object('createdAt', \"createdAt\", 'completedAt', \"completedAt\", 'answers', \"stepData\") order by \"createdAt\"), '[]'::json) from \"RegistrationDraft\" where \"completedAt\" is not null" \
  > "$OUT/registrations.json"

USERS=$(psql "$SUPABASE_DB_URL" -tAc 'select count(*) from "User";')
echo ""
echo "✅ Fertig — $USERS User exportiert nach: $OUT/"
echo "   • $OUT/users.csv          (Kontaktdaten, in Excel öffenbar)"
echo "   • $OUT/registrations.json (Umfrage- & KI-Antworten)"
