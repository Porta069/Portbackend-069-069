import { MatchingService } from './matching.service';

/**
 * Das Auslesen des Handwerkerprofils aus `profileData`.
 *
 * Der zweite Teil ist der wichtigere: Konten, die vor dem neuen Fragebogen
 * entstanden sind, dürfen nicht plötzlich profillos dastehen — ein leeres
 * Profil besteht zwar jedes Ausschlusskriterium, wird aber in keiner Wertung
 * mehr berücksichtigt und rutscht damit hinter jeden vollständigen Bewerber.
 */
describe('MatchingService.extractProfile', () => {
  const service = new MatchingService();

  const user = (profileData: unknown, avatar: string | null = null) =>
    ({ profileData, avatar }) as Parameters<typeof service.extractProfile>[0];

  it('liest die Antworten des neuen Fragebogens', () => {
    const { profil } = service.extractProfile(
      user({
        profil: {
          bereich: 'shk',
          ausbildungsstatus: 'techniker_meister',
          beruf: 'anlagenmechaniker_shk',
          aufgaben: ['heizungsbau', 'waermepumpen'],
          erfahrung: '6_10',
          prioritaeten: ['gehalt', 'firmenwagen'],
          montage: 'gering',
          fuehrerschein: 'c',
          deutsch: 'muttersprachlich',
          start: 'sofort',
        },
      }),
    );

    expect(profil.bereich).toBe('shk');
    expect(profil.aufgaben).toEqual(['heizungsbau', 'waermepumpen']);
    expect(profil.erfahrung).toBe('6_10');
    expect(profil.prioritaeten).toHaveLength(2);
    expect(profil.fuehrerschein).toBe('c');
  });

  it('ohne jede Angabe bleibt das Profil leer statt zu raten', () => {
    const { profil } = service.extractProfile(user({}));
    expect(profil.bereich).toBeNull();
    expect(profil.aufgaben).toEqual([]);
    expect(profil.erfahrung).toBeNull();
  });

  it('verwirft Werte, die keine Zeichenkette sind', () => {
    const { profil } = service.extractProfile(
      user({ profil: { bereich: 42, aufgaben: ['heizungsbau', 7, null] } }),
    );
    expect(profil.bereich).toBeNull();
    expect(profil.aufgaben).toEqual(['heizungsbau']);
  });

  describe('Überleitung alter Konten', () => {
    const alt = (ai: Record<string, unknown>, survey: Record<string, unknown> = {}) =>
      user({ '1': { surveyAnswers: survey }, '4': { aiAnswers: ai } });

    it('übersetzt Gewerk, Jahre und Qualifikationen', () => {
      const { profil } = service.extractProfile(
        alt(
          {
            ai_gewerke: ['Elektriker / Elektroniker'],
            ai_erfahrung: 9,
            ai_zertifikate: ['geselle', 'fuehrerschein'],
          },
          { survey_bereitschaft: ['montage'], survey_ziel: 'gehalt' },
        ),
      );

      expect(profil.bereich).toBe('elektronik');
      expect(profil.erfahrung).toBe('6_10');
      expect(profil.ausbildungsstatus).toBe('berufsausbildung');
      expect(profil.fuehrerschein).toBe('b');
      expect(profil.montage).toBe('regelmaessig');
      expect(profil.prioritaeten).toEqual(['gehalt']);
    });

    it('Meister- und Technikerbrief heben den Ausbildungsstand', () => {
      expect(
        service.extractProfile(alt({ ai_zertifikate: ['meister'] })).profil
          .ausbildungsstatus,
      ).toBe('techniker_meister');
      expect(
        service.extractProfile(alt({ ai_zertifikate: ['techniker'] })).profil
          .ausbildungsstatus,
      ).toBe('techniker_meister');
    });

    it.each([
      [0, 'keine'],
      [1, '1_2'],
      [2, '1_2'],
      [3, '3_5'],
      [5, '3_5'],
      [6, '6_10'],
      [10, '6_10'],
      [11, 'ueber_10'],
      [40, 'ueber_10'],
    ])('%i Jahre werden zu Stufe „%s"', (jahre, stufe) => {
      expect(service.extractProfile(alt({ ai_erfahrung: jahre })).profil.erfahrung).toBe(
        stufe,
      );
    });

    it('„kurzer Arbeitsweg" hat keine Entsprechung und wird nicht erfunden', () => {
      // Die Entfernung steckt in den Arbeitsorten, nicht in den Prioritäten.
      const { profil } = service.extractProfile(alt({}, { survey_ziel: 'naehe' }));
      expect(profil.prioritaeten).toEqual([]);
    });

    it('findet das Profil auch im Schritt-Container der Registrierung', () => {
      // Der Wizard speichert opake Schritt-Daten unter Zahlen-Schlüsseln.
      const { profil } = service.extractProfile(
        user({ '2': { profil: { bereich: 'elektronik', erfahrung: '6_10' } } }),
      );
      expect(profil.bereich).toBe('elektronik');
      expect(profil.erfahrung).toBe('6_10');
    });

    it('das neue Format hat Vorrang vor dem alten', () => {
      const { profil } = service.extractProfile(
        user({
          profil: { bereich: 'shk' },
          '4': { aiAnswers: { ai_gewerke: ['Elektriker / Elektroniker'] } },
        }),
      );
      expect(profil.bereich).toBe('shk');
    });
  });

  describe('Arbeitsorte', () => {
    it('übernimmt gültige Orte und ergänzt den Standardradius', () => {
      const { workLocations } = service.extractProfile(
        user({
          '3': {
            workLocations: [
              { id: 'a', label: 'Heilbronn', lat: 49.14, lng: 9.21 },
              { id: 'b', label: 'Ohne Koordinaten' },
            ],
          },
        }),
      );
      expect(workLocations).toHaveLength(1);
      expect(workLocations[0].radiusKm).toBe(30);
    });
  });

  describe('Lage zu den Arbeitsorten', () => {
    const mitOrten = (orte: { label: string; lat: number; lng: number; radiusKm: number }[]) =>
      service.extractProfile(
        user({
          '3': {
            workLocations: orte.map((o, i) => ({ id: String(i), ...o })),
          },
        }),
      );

    // Heilbronn 49.14/9.21 · Stuttgart 48.78/9.18 (~40 km) · Hamburg 53.55/9.99
    it('erkennt eine Stelle innerhalb des Radius', () => {
      const p = mitOrten([{ label: 'Heilbronn', lat: 49.14, lng: 9.21, radiusKm: 50 }]);
      const l = service.lage(p, 48.78, 9.18)!;
      expect(l.imRadius).toBe(true);
      expect(l.ort).toBe('Heilbronn');
    });

    it('erkennt eine Stelle außerhalb des Radius', () => {
      const p = mitOrten([{ label: 'Heilbronn', lat: 49.14, lng: 9.21, radiusKm: 30 }]);
      const l = service.lage(p, 53.55, 9.99)!;
      expect(l.imRadius).toBe(false);
      expect(Math.round(l.km)).toBeGreaterThan(400);
    });

    // Der eigentliche Stolperstein: der NÄCHSTE Ort ist nicht zwingend der,
    // dessen Radius die Stelle abdeckt.
    it('ein weiter entfernter Ort mit großem Radius zählt trotzdem', () => {
      const p = mitOrten([
        { label: 'Enger Ort', lat: 49.14, lng: 9.21, radiusKm: 5 },
        { label: 'Weiter Ort', lat: 48.40, lng: 9.99, radiusKm: 200 },
      ]);
      const l = service.lage(p, 48.78, 9.18)!;
      // Nächster Ort ist der enge — die Stelle liegt außerhalb SEINES Radius,
      // aber innerhalb des zweiten. Sie darf nicht ausgeschlossen werden.
      expect(l.ort).toBe('Enger Ort');
      expect(l.imRadius).toBe(true);
    });

    it('ohne Arbeitsorte oder ohne Koordinaten gibt es keine Lage', () => {
      expect(service.lage(mitOrten([]), 49.1, 9.2)).toBeNull();
      const p = mitOrten([{ label: 'HN', lat: 49.14, lng: 9.21, radiusKm: 30 }]);
      expect(service.lage(p, null, null)).toBeNull();
    });
  });

  describe('Gewichte aus der Datenbank', () => {
    const anf = (gewichte: unknown) =>
      service.anforderungVon({
        bereiche: [], berufe: [], ausbildungMin: null, aufgaben: [], aufgabenMin: 0,
        erfahrungMin: null, erfahrungMax: null, montageMin: null,
        fuehrerscheinMin: null, deutschMin: null, gebotenes: [], startBis: null,
        gewichte,
      });

    it('übernimmt gültige Gewichte', () => {
      expect(anf({ aufgaben: 5, erfahrung: 0 }).gewichte).toEqual({
        aufgaben: 5,
        erfahrung: 0,
      });
    });

    // Vorher wurde mit NaN weitergerechnet — und weil `NaN > 0` falsch ist,
    // galt das Inserat als „ohne bewertbare Kriterien" und war für JEDEN ein
    // 100-%-Treffer.
    it('verwirft unbrauchbare Werte, statt mit NaN zu rechnen', () => {
      expect(anf({ aufgaben: 'abc' }).gewichte).toBeUndefined();
      expect(anf({ aufgaben: null }).gewichte).toBeUndefined();
      expect(anf('kaputt').gewichte).toBeUndefined();
      expect(anf(null).gewichte).toBeUndefined();
    });

    it('begrenzt Werte auf 0 bis 5', () => {
      expect(anf({ aufgaben: 999 }).gewichte).toEqual({ aufgaben: 5 });
      expect(anf({ aufgaben: -7 }).gewichte).toEqual({ aufgaben: 0 });
      expect(anf({ aufgaben: 3.6 }).gewichte).toEqual({ aufgaben: 4 });
    });

    it('ignoriert unbekannte Schlüssel', () => {
      expect(anf({ quatsch: 5 }).gewichte).toBeUndefined();
    });
  });

  it('merkt sich, ob ein Profilbild hinterlegt ist', () => {
    expect(service.extractProfile(user({}, 'data:image/jpeg;base64,x')).hasAvatar).toBe(
      true,
    );
    expect(service.extractProfile(user({})).hasAvatar).toBe(false);
  });
});
