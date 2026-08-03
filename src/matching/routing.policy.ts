/**
 * Wann darf für die exakte Fahrzeit überhaupt ein externer Dienst gefragt
 * werden?
 *
 * Die Frage ist keine technische, sondern eine rechtliche: an den Routing-
 * Dienst gehen Koordinaten unserer Nutzer — beim Punkt „Mein Standort" die
 * aktuelle Position einer identifizierbaren Person. Sie stehen in der
 * Adresszeile der Anfrage und landen damit in den Zugriffsprotokollen des
 * Betreibers. Ohne Auftragsverarbeitungsvertrag, ohne zugesicherte
 * Löschfristen und ohne bekannten Verarbeitungsort ist das gegenüber einer
 * Aufsichtsbehörde nicht zu vertreten (Art. 28, 44 DSGVO).
 *
 * Der öffentliche Demo-Server des OSRM-Projekts ist genau so ein Fall — er ist
 * ein Schaufenster für die Software, ausdrücklich keine Betriebsgrundlage.
 *
 * Deshalb gilt: **kein Ziel konfiguriert = keine Anfrage.** Die Fahrzeit fällt
 * dann auf die interne Schätzung zurück, die ohne jede Übermittlung auskommt.
 * Wer die genaue Berechnung will, trägt eine eigene Instanz oder einen
 * Anbieter mit Vertrag in `OSRM_URL` ein — beides eine bewusste Entscheidung,
 * die niemand versehentlich trifft.
 */

/** Hosts, die als öffentlicher Demo-Dienst ohne Vertrag gelten. */
const PUBLIC_DEMO_HOSTS = [
  'router.project-osrm.org',
  'routing.openstreetmap.de',
];

export interface RoutingDecision {
  /** Darf überhaupt ein externer Aufruf stattfinden? */
  enabled: boolean;
  /** Basis-URL, wenn erlaubt. */
  baseUrl: string | null;
  /** Klartext fürs Startprotokoll — erklärt genau eine Entscheidung. */
  reason: string;
}

export function isPublicDemo(url: string): boolean {
  try {
    return PUBLIC_DEMO_HOSTS.includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function decideRouting(opts: {
  osrmUrl?: string;
  allowPublicDemo: boolean;
  isPubliclyServed: boolean;
}): RoutingDecision {
  const { osrmUrl, allowPublicDemo, isPubliclyServed } = opts;

  if (!osrmUrl) {
    return {
      enabled: false,
      baseUrl: null,
      reason:
        'Kein Routing-Dienst konfiguriert (OSRM_URL leer) — die exakte ' +
        'Fahrzeit nutzt die interne Schätzung, es werden keine Standortdaten ' +
        'übermittelt.',
    };
  }

  if (isPublicDemo(osrmUrl)) {
    if (isPubliclyServed) {
      return {
        enabled: false,
        baseUrl: null,
        reason:
          `Öffentlicher Demo-Server (${osrmUrl}) auf einer öffentlich ` +
          'erreichbaren Instanz — abgeschaltet: dorthin dürfen keine ' +
          'Standortdaten von Nutzern gehen (kein Auftragsverarbeitungs' +
          'vertrag). Eigene OSRM-Instanz eintragen, siehe docs/routing.md.',
      };
    }
    if (!allowPublicDemo) {
      return {
        enabled: false,
        baseUrl: null,
        reason:
          `Öffentlicher Demo-Server (${osrmUrl}) nicht freigegeben — für ` +
          'lokale Versuche ROUTING_ALLOW_PUBLIC_DEMO=true setzen.',
      };
    }
    return {
      enabled: true,
      baseUrl: osrmUrl.replace(/\/+$/, ''),
      reason:
        `Öffentlicher Demo-Server (${osrmUrl}) — nur für lokale Entwicklung ` +
        'freigegeben. Niemals mit echten Nutzerdaten verwenden.',
    };
  }

  return {
    enabled: true,
    baseUrl: osrmUrl.replace(/\/+$/, ''),
    reason: `Routing über ${osrmUrl}.`,
  };
}
