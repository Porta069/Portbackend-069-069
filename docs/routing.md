# Fahrzeit-Routing: eigene OSRM-Instanz

## Warum

Für die exakte Fahrzeit („Genaue Fahrzeit berechnen") braucht das Backend einen
Routing-Dienst. An diesen Dienst gehen **Koordinaten unserer Nutzer** — beim
Punkt „Mein Standort" die aktuelle Position einer identifizierbaren Person. Sie
stehen in der Adresszeile der Anfrage und landen damit in den Zugriffs-
protokollen des Betreibers.

Der öffentliche Demo-Server des OSRM-Projekts (`router.project-osrm.org`) ist
dafür **keine zulässige Grundlage**: kein Auftragsverarbeitungsvertrag, keine
zugesicherten Sicherheitsmaßnahmen, keine bekannte Löschfrist, kein gesicherter
Verarbeitungsort (Art. 28, 44 DSGVO). Betrieblich kommt hinzu, dass er keinerlei
Verfügbarkeit zusagt und produktiven Einsatz ausdrücklich nicht vorsieht.

**Das Backend fragt ihn deshalb nicht.** Ist `OSRM_URL` leer oder zeigt auf
einen bekannten Demo-Host, findet gar keine Anfrage statt; die Fahrzeit fällt
auf die interne Schätzung zurück (Luftlinie × 1,2 + 5 Min.), die ohne jede
Übermittlung auskommt. Die Oberfläche weist das Ergebnis dann als „Schätzung"
statt „genaue Route" aus — sie kann beides bereits darstellen.

Die Regeln stehen in `src/matching/routing.policy.ts` und sind in
`routing.policy.spec.ts` festgeschrieben.

## Was zu tun ist

Zwei Wege führen zum Ziel. Beide enden damit, dass `OSRM_URL` auf einen Dienst
zeigt, für den eine Rechtsgrundlage besteht — **eine Code-Änderung ist nicht
nötig.**

### Weg A: eigene OSRM-Instanz (empfohlen)

Kein Nutzerdatum verlässt dann unser System, und die Verfügbarkeit liegt in
unserer Hand. OSRM ist freie Software, die Kartendaten sind frei.

**Schritt 1 — Kartendaten vorbereiten.** Das ist der schwere Teil und wird
**einmalig** erledigt, gern auf dem eigenen Rechner:

```bash
./scripts/osrm-prepare.sh baden-wuerttemberg   # oder: germany
```

Das Skript lädt den Kartenausschnitt von Geofabrik und rechnet ihn in die
OSRM-Formate um. Anhaltswerte (grob, je nach Rechner):

| Ausschnitt          | Download | Arbeitsspeicher | Dauer      | Ergebnis |
|---------------------|----------|-----------------|------------|----------|
| Baden-Württemberg   | ~0,6 GB  | ~4 GB           | ~10 Min.   | ~1,5 GB  |
| Deutschland         | ~4 GB    | ~16 GB          | ~1–2 Std.  | ~10 GB   |

Für den Start reicht der Ausschnitt, in dem die Betriebe tatsächlich sitzen.
Er lässt sich später jederzeit gegen den größeren tauschen — die fertigen
Dateien werden nur ersetzt.

**Schritt 2 — Dienst starten.** Der Dienst selbst braucht deutlich weniger als
die Vorbereitung (etwa so viel Arbeitsspeicher wie die fertigen Dateien groß
sind):

```bash
docker compose -f docker-compose.osrm.yml up -d
```

**Schritt 3 — eintragen.**

```
OSRM_URL=https://osrm.<eure-domain>
```

Auf Render unter *Environment* setzen; der Dienst startet neu und protokolliert
beim Start eine Zeile, die genau sagt, wohin geroutet wird.

**Wichtig zur Absicherung:** Die Instanz darf nicht offen im Internet stehen —
sonst rechnen Fremde auf unsere Kosten. Entweder im selben privaten Netz wie das
Backend betreiben, oder per Reverse-Proxy auf die Backend-IP beschränken bzw.
mit Basic Auth schützen (OSRM selbst kennt keine Authentifizierung).

### Weg B: kommerzieller Anbieter mit Vertrag

Wenn kein eigener Server betrieben werden soll: ein Anbieter mit
Auftragsverarbeitungsvertrag und Verarbeitung in der EU. In Frage kommen unter
anderem **GraphHopper** (GmbH, Deutschland) und **openrouteservice** (HeiGIT,
Universität Heidelberg). Beide bieten OSRM-nahe Schnittstellen; die Anfrage in
`routing.service.ts` müsste dann auf deren Format angepasst werden — anders als
bei Weg A ist das eine kleine Code-Änderung.

Vor dem Einsatz: AV-Vertrag abschließen, Verarbeitungsort schriftlich bestätigen
lassen, Löschfristen der Protokolle erfragen und beides ins Verarbeitungs-
verzeichnis aufnehmen.

## Was ohnehin schon greift

- Die Koordinaten werden vor dem Versand auf **~110 m gerundet** — für eine
  Fahrzeit mehr als genau genug, die exakte Position verlässt das System nicht.
- Angefragt wird **nur auf bewussten Klick**, nicht beim Laden der Jobbörse.
- Ergebnisse werden zwischengespeichert, gleiche Strecken kosten keine zweite
  Anfrage.
- Die Anfragen tragen eine identifizierende Kennung (Nutzungsetikette der
  OpenStreetMap-Dienste).

## Noch offen

Die **Postleitzahl-Auflösung** (`geocoding.service.ts`) fragt Nominatim, den
Adressdienst der OpenStreetMap Foundation. Übertragen wird dabei nur eine
fünfstellige Postleitzahl ohne Bezug zu einer Person — deutlich weniger heikel
als eine Standortkoordinate, aber dieselbe Bauart. Wer die eigene Instanz
betreibt, kann Nominatim gleich mitnehmen; bis dahin bleibt es bei der
Postleitzahl.
