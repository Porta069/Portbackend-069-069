import {
  Anforderungsprofil,
  Kandidatenprofil,
  bewerte,
  ausschlusskriterien,
} from './scoring';

/**
 * Das Matching entscheidet, welche Stellen ein Handwerker überhaupt zu sehen
 * bekommt. Diese Tests halten beide Stufen fest: was hart ausschließt und wie
 * der Rest gewichtet wird.
 */
describe('Matching', () => {
  const anforderung = (over: Partial<Anforderungsprofil> = {}): Anforderungsprofil => ({
    bereiche: ['elektronik'],
    berufe: [],
    ausbildungMin: null,
    aufgaben: [],
    aufgabenMin: 1,
    erfahrungMin: null,
    erfahrungMax: null,
    montageMin: null,
    fuehrerscheinMin: null,
    deutschMin: null,
    gebotenes: [],
    startBis: null,
    ...over,
  });

  const kandidat = (over: Partial<Kandidatenprofil> = {}): Kandidatenprofil => ({
    bereich: 'elektronik',
    ausbildungsstatus: 'berufsausbildung',
    beruf: 'elektroniker_betriebstechnik',
    aufgaben: ['betriebstechnik', 'schaltschrankbau'],
    erfahrung: '3_5',
    prioritaeten: ['gehalt', 'team'],
    montage: 'gering',
    fuehrerschein: 'b',
    deutsch: 'verhandlungssicher',
    start: 'sofort',
    ...over,
  });

  // ── Stufe 1: Ausschluss ───────────────────────────────────────────────────

  describe('Ausschlusskriterien', () => {
    it('ein passendes Profil wird nicht ausgeschlossen', () => {
      expect(ausschlusskriterien(anforderung(), kandidat())).toEqual([]);
    });

    it('anderer Ausbildungsbereich schließt aus', () => {
      const raus = ausschlusskriterien(
        anforderung({ bereiche: ['shk'] }),
        kandidat({ bereich: 'elektronik' }),
      );
      expect(raus.map((r) => r.key)).toEqual(['bereich']);
      expect(raus[0].reason).toContain('Anlagenmechanik SHK');
    });

    it('mehrere akzeptierte Bereiche lassen beide durch', () => {
      const anf = anforderung({ bereiche: ['elektronik', 'shk'] });
      expect(ausschlusskriterien(anf, kandidat({ bereich: 'shk', beruf: null }))).toEqual([]);
      expect(ausschlusskriterien(anf, kandidat({ bereich: 'elektronik' }))).toEqual([]);
    });

    it('zu niedriger Ausbildungsstand schließt aus, höherer nicht', () => {
      const anf = anforderung({ ausbildungMin: 'techniker_meister' });
      expect(
        ausschlusskriterien(anf, kandidat({ ausbildungsstatus: 'berufsausbildung' }))
          .map((r) => r.key),
      ).toEqual(['ausbildung']);
      expect(
        ausschlusskriterien(anf, kandidat({ ausbildungsstatus: 'techniker_meister' })),
      ).toEqual([]);
    });

    it('ohne Überschneidung bei den Aufgabenbereichen ist Schluss', () => {
      const anf = anforderung({ aufgaben: ['pv_solar', 'waermepumpen'] });
      expect(
        ausschlusskriterien(anf, kandidat({ aufgaben: ['schaltschrankbau'] }))
          .map((r) => r.key),
      ).toEqual(['aufgaben']);
      // Eine Überschneidung genügt.
      expect(
        ausschlusskriterien(anf, kandidat({ aufgaben: ['pv_solar'] })),
      ).toEqual([]);
    });

    it('der Betrieb kann mehr als eine Überschneidung verlangen', () => {
      const anf = anforderung({
        aufgaben: ['pv_solar', 'waermepumpen', 'betriebstechnik'],
        aufgabenMin: 2,
      });
      expect(
        ausschlusskriterien(anf, kandidat({ aufgaben: ['pv_solar'] })).map((r) => r.key),
      ).toEqual(['aufgaben']);
      expect(
        ausschlusskriterien(anf, kandidat({ aufgaben: ['pv_solar', 'waermepumpen'] })),
      ).toEqual([]);
    });

    it('zu geringe Montagebereitschaft schließt aus, höhere nicht', () => {
      const anf = anforderung({ montageMin: 'regelmaessig' });
      expect(
        ausschlusskriterien(anf, kandidat({ montage: 'nie' })).map((r) => r.key),
      ).toEqual(['montage']);
      expect(ausschlusskriterien(anf, kandidat({ montage: 'unbeschraenkt' }))).toEqual([]);
    });

    it('nur gar kein Führerschein schließt aus — Klasse B bei gesuchter C nicht', () => {
      const anf = anforderung({ fuehrerscheinMin: 'c' });
      expect(
        ausschlusskriterien(anf, kandidat({ fuehrerschein: 'nein' })).map((r) => r.key),
      ).toEqual(['fuehrerschein']);
      expect(ausschlusskriterien(anf, kandidat({ fuehrerschein: 'b' }))).toEqual([]);
      expect(ausschlusskriterien(anf, kandidat({ fuehrerschein: 'fahrschule' }))).toEqual([]);
    });

    it('zu geringe Deutschkenntnisse schließen aus', () => {
      const anf = anforderung({ deutschMin: 'verhandlungssicher' });
      expect(
        ausschlusskriterien(anf, kandidat({ deutsch: 'grundkenntnisse' })).map((r) => r.key),
      ).toEqual(['deutsch']);
      expect(ausschlusskriterien(anf, kandidat({ deutsch: 'muttersprachlich' }))).toEqual([]);
    });

    it('unbeantwortete Fragen schließen niemanden aus', () => {
      const anf = anforderung({
        ausbildungMin: 'techniker_meister',
        montageMin: 'unbeschraenkt',
        deutschMin: 'muttersprachlich',
      });
      const leer = kandidat({ ausbildungsstatus: null, montage: null, deutsch: null });
      expect(ausschlusskriterien(anf, leer)).toEqual([]);
    });

    it('eine ausgeschlossene Stelle bekommt Score 0 und passed=false', () => {
      const b = bewerte(anforderung({ bereiche: ['shk'] }), kandidat());
      expect(b.passed).toBe(false);
      expect(b.score).toBe(0);
      expect(b.knockouts).toHaveLength(1);
    });
  });

  // ── Stufe 2: Punktwertung ─────────────────────────────────────────────────

  describe('Punktwertung', () => {
    it('ohne Anforderungen passen alle gleich gut', () => {
      const b = bewerte(anforderung(), kandidat({ prioritaeten: [] }));
      expect(b.score).toBe(100);
      expect(b.formula).toContain('keine bewertbaren Anforderungen');
    });

    it('volle Erfüllung ergibt 100', () => {
      const b = bewerte(
        anforderung({
          aufgaben: ['betriebstechnik'],
          erfahrungMin: '3_5',
          erfahrungMax: '6_10',
          berufe: ['elektroniker_betriebstechnik'],
          gebotenes: ['gehalt', 'team'],
          startBis: 'sofort',
        }),
        kandidat(),
      );
      expect(b.passed).toBe(true);
      expect(b.score).toBe(100);
      expect(b.totalPenalty).toBe(0);
    });

    it('Aufgabenbereiche zählen anteilig', () => {
      const b = bewerte(
        anforderung({ aufgaben: ['betriebstechnik', 'pv_solar', 'waermepumpen'] }),
        kandidat({ aufgaben: ['betriebstechnik'], prioritaeten: [] }),
      );
      const zeile = b.criteria.find((c) => c.key === 'aufgaben')!;
      expect(zeile.fulfilment).toBeCloseTo(1 / 3, 2);
      // Einziges bewertetes Kriterium → Score entspricht der Erfüllung.
      expect(b.score).toBe(33);
    });

    it('fehlende Erfahrung kostet je Stufe die Hälfte', () => {
      const anf = anforderung({ erfahrungMin: '6_10' });
      const eineStufe = bewerte(anf, kandidat({ erfahrung: '3_5', prioritaeten: [] }));
      const zweiStufen = bewerte(anf, kandidat({ erfahrung: '1_2', prioritaeten: [] }));
      expect(eineStufe.criteria.find((c) => c.key === 'erfahrung')!.fulfilment).toBe(0.5);
      expect(zweiStufen.criteria.find((c) => c.key === 'erfahrung')!.fulfilment).toBe(0);
      expect(eineStufe.score).toBeGreaterThan(zweiStufen.score);
    });

    it('mehr Erfahrung als gesucht kostet nur wenig', () => {
      const b = bewerte(
        anforderung({ erfahrungMin: 'keine', erfahrungMax: '1_2' }),
        kandidat({ erfahrung: 'ueber_10', prioritaeten: [] }),
      );
      const zeile = b.criteria.find((c) => c.key === 'erfahrung')!;
      expect(zeile.fulfilment).toBeGreaterThanOrEqual(0.7);
      expect(zeile.fulfilment).toBeLessThan(1);
    });

    it('verwandter Beruf im selben Bereich zählt zu 60 Prozent', () => {
      const anf = anforderung({ berufe: ['elektroniker_energie_gebaeude'] });
      const verwandt = bewerte(anf, kandidat({ prioritaeten: [] }));
      expect(verwandt.criteria.find((c) => c.key === 'beruf')!.fulfilment).toBe(0.6);

      const genau = bewerte(
        anf,
        kandidat({ beruf: 'elektroniker_energie_gebaeude', prioritaeten: [] }),
      );
      expect(genau.criteria.find((c) => c.key === 'beruf')!.fulfilment).toBe(1);
    });

    it('Prioritäten messen, wie viele eigene Wünsche der Betrieb bedient', () => {
      const b = bewerte(
        anforderung({ gebotenes: ['gehalt', 'firmenwagen'] }),
        kandidat({ prioritaeten: ['gehalt', 'team', 'urlaub'] }),
      );
      const zeile = b.criteria.find((c) => c.key === 'prioritaeten')!;
      expect(zeile.fulfilment).toBeCloseTo(1 / 3, 2);
      expect(zeile.note).toContain('Überdurchschnittliches Gehalt');
    });

    it('späterer Wunschstart als gesucht kostet Punkte', () => {
      const anf = anforderung({ startBis: 'sofort' });
      const spaeter = bewerte(anf, kandidat({ start: '6_monate', prioritaeten: [] }));
      const sofort = bewerte(anf, kandidat({ start: 'sofort', prioritaeten: [] }));
      expect(spaeter.score).toBeLessThan(sofort.score);
      expect(sofort.score).toBe(100);
    });

    it('Gewichte des Betriebs verschieben das Ergebnis', () => {
      // Aufgaben zu 1/3 erfüllt, Erfahrung zu 1/2 — erst unterschiedliche
      // Erfüllungsgrade machen die Gewichtung überhaupt sichtbar.
      const basis = {
        aufgaben: ['betriebstechnik', 'pv_solar', 'waermepumpen'],
        erfahrungMin: '6_10' as const,
      };
      const k = kandidat({ aufgaben: ['betriebstechnik'], erfahrung: '3_5', prioritaeten: [] });

      const aufgabenWichtig = bewerte(
        anforderung({ ...basis, gewichte: { aufgaben: 5, erfahrung: 1 } }),
        k,
      );
      const erfahrungWichtig = bewerte(
        anforderung({ ...basis, gewichte: { aufgaben: 1, erfahrung: 5 } }),
        k,
      );
      // Wer die schwächer erfüllte Anforderung höher gewichtet, kommt tiefer raus.
      expect(aufgabenWichtig.score).toBeLessThan(erfahrungWichtig.score);
    });

    it('Gewicht 0 nimmt ein Kriterium aus der Wertung', () => {
      const b = bewerte(
        anforderung({ aufgaben: ['pv_solar'], gewichte: { aufgaben: 0 } }),
        kandidat({ aufgaben: ['pv_solar', 'betriebstechnik'], prioritaeten: [] }),
      );
      expect(b.criteria.find((c) => c.key === 'aufgaben')!.skipped).toBe(true);
      expect(b.totalMaxPenalty).toBe(0);
    });

    it('unbeantwortete Fragen verwässern den Score nicht', () => {
      const anf = anforderung({
        aufgaben: ['betriebstechnik'],
        erfahrungMin: '3_5',
        startBis: 'sofort',
      });
      const ohneStart = bewerte(anf, kandidat({ start: null, prioritaeten: [] }));
      expect(ohneStart.criteria.find((c) => c.key === 'start')!.skipped).toBe(true);
      expect(ohneStart.score).toBe(100);
    });

    it('der Rechenweg bleibt nachrechenbar', () => {
      const b = bewerte(
        anforderung({ aufgaben: ['betriebstechnik', 'pv_solar'], erfahrungMin: '6_10' }),
        kandidat({ aufgaben: ['betriebstechnik'], erfahrung: '3_5', prioritaeten: [] }),
      );
      const bewertet = b.criteria.filter((c) => !c.skipped);
      const summe = bewertet.reduce((s, c) => s + c.weight * (1 - c.fulfilment), 0);
      const maxSumme = bewertet.reduce((s, c) => s + c.weight, 0);
      expect(b.totalPenalty).toBeCloseTo(summe, 2);
      expect(b.totalMaxPenalty).toBe(maxSumme);
      expect(b.score).toBe(Math.round(100 * (1 - summe / maxSumme)));
    });
  });
});
