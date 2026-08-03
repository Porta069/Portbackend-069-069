import { decideRouting, isPublicDemo } from './routing.policy';

/**
 * Diese Regeln sind kein Geschmacksfall: an den Routing-Dienst gehen
 * Standortdaten von Menschen. Ohne Vertrag darf dorthin nichts fließen —
 * die Tests halten fest, dass ein Versehen in der Konfiguration nicht
 * ausreicht, um das doch zu tun.
 */
describe('Routing-Freigabe', () => {
  const live = { isPubliclyServed: true, allowPublicDemo: false };
  const lokal = { isPubliclyServed: false, allowPublicDemo: false };

  it('ohne konfigurierte Adresse wird gar nicht gefragt', () => {
    const d = decideRouting({ ...live, osrmUrl: undefined });
    expect(d.enabled).toBe(false);
    expect(d.baseUrl).toBeNull();
    expect(d.reason).toContain('keine Standortdaten');
  });

  it('der öffentliche Demo-Server ist im Livebetrieb gesperrt', () => {
    const d = decideRouting({
      ...live,
      osrmUrl: 'https://router.project-osrm.org',
    });
    expect(d.enabled).toBe(false);
    expect(d.reason).toContain('Auftragsverarbeitungsvertrag');
  });

  it('… und bleibt es auch, wenn jemand die Freigabe setzt', () => {
    const d = decideRouting({
      osrmUrl: 'https://router.project-osrm.org',
      allowPublicDemo: true,
      isPubliclyServed: true,
    });
    expect(d.enabled).toBe(false);
  });

  it('lokal ist der Demo-Server nur mit ausdrücklicher Freigabe erlaubt', () => {
    expect(
      decideRouting({ ...lokal, osrmUrl: 'https://router.project-osrm.org' })
        .enabled,
    ).toBe(false);
    const frei = decideRouting({
      osrmUrl: 'https://router.project-osrm.org',
      allowPublicDemo: true,
      isPubliclyServed: false,
    });
    expect(frei.enabled).toBe(true);
    expect(frei.reason).toContain('Niemals mit echten Nutzerdaten');
  });

  it('eine eigene Instanz ist im Livebetrieb erlaubt', () => {
    const d = decideRouting({ ...live, osrmUrl: 'https://osrm.portawerk.de' });
    expect(d.enabled).toBe(true);
    expect(d.baseUrl).toBe('https://osrm.portawerk.de');
  });

  it('abschließender Schrägstrich verfälscht die Adresse nicht', () => {
    expect(
      decideRouting({ ...live, osrmUrl: 'https://osrm.portawerk.de/' }).baseUrl,
    ).toBe('https://osrm.portawerk.de');
  });

  it('erkennt die bekannten Demo-Hosts, unabhängig von Pfad und Schreibweise', () => {
    expect(isPublicDemo('https://ROUTER.project-osrm.org/table/v1')).toBe(true);
    expect(isPublicDemo('https://routing.openstreetmap.de/routed-car')).toBe(true);
    expect(isPublicDemo('https://osrm.portawerk.de')).toBe(false);
    // Ein Host, der den Namen nur enthält, ist nicht der Demo-Server.
    expect(isPublicDemo('https://router.project-osrm.org.example.com')).toBe(false);
  });
});
