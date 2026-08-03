#!/usr/bin/env bash
# ─── OSRM-Kartendaten vorbereiten ────────────────────────────────────────────
# Einmalig auszuführen (gern auf dem eigenen Rechner). Danach startet
# `docker compose -f docker-compose.osrm.yml up -d` den Routing-Dienst.
#
#   ./scripts/osrm-prepare.sh [ausschnitt] [zielordner]
#
#   ausschnitt: baden-wuerttemberg (Standard) | germany | bayern | ...
#               alles, was Geofabrik unter europe/germany/ anbietet;
#               "germany" nimmt den kompletten Bundes-Ausschnitt.
#
# Warum überhaupt: an einen fremden Routing-Dienst gehen Standortdaten unserer
# Nutzer. Mit einer eigenen Instanz verlässt kein Nutzerdatum das System.
# Hintergrund und Rechtslage: docs/routing.md
set -euo pipefail

REGION="${1:-baden-wuerttemberg}"
DEST="${2:-$(cd "$(dirname "$0")/.." && pwd)/osrm-data}"
IMAGE="ghcr.io/project-osrm/osrm-backend:latest"

if [ "$REGION" = "germany" ]; then
  URL="https://download.geofabrik.de/europe/germany-latest.osm.pbf"
else
  URL="https://download.geofabrik.de/europe/germany/${REGION}-latest.osm.pbf"
fi
PBF="${REGION}-latest.osm.pbf"
BASE="${REGION}-latest"

command -v docker >/dev/null || { echo "Docker fehlt — bitte installieren."; exit 1; }

mkdir -p "$DEST"
cd "$DEST"

echo "▸ Kartendaten: $REGION"
echo "  Ziel: $DEST"

if [ -f "$PBF" ]; then
  echo "  $PBF ist schon da — Download übersprungen."
else
  echo "  Lade $URL …"
  curl -fL --progress-bar -o "$PBF" "$URL"
fi

# Die drei Schritte der MLD-Pipeline. osrm-extract ist der teure:
# er braucht je nach Ausschnitt mehrere GB Arbeitsspeicher.
run() {
  echo "▸ $1"
  shift
  docker run --rm -t -v "$DEST:/data" "$IMAGE" "$@"
}

run "Straßennetz auslesen (dauert am längsten)" \
  osrm-extract -p /opt/car.lua "/data/$PBF"
run "Netz partitionieren" osrm-partition "/data/$BASE.osrm"
run "Gewichte berechnen" osrm-customize "/data/$BASE.osrm"

# Der Dienst muss wissen, welche Datei er laden soll.
echo "$BASE" > "$DEST/.osrm-base"

echo
echo "Fertig. Vorbereitete Daten: $(du -sh "$DEST" | cut -f1) in $DEST"
echo
echo "Weiter mit:"
echo "  docker compose -f docker-compose.osrm.yml up -d"
echo "  curl 'http://localhost:5000/table/v1/driving/9.21,49.14;9.18,49.15?annotations=duration'"
echo
echo "Danach OSRM_URL auf die Adresse des Dienstes setzen (docs/routing.md)."
