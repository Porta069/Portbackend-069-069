import { MatchingService, DeclineContext, MatchBreakdown } from './matching.service';

/** Regeln für das Absage-Feedback — jede Regel einzeln und kombiniert. */
describe('declineAdjustments', () => {
  const service = new MatchingService();

  const ctx = (over: Partial<DeclineContext>): DeclineContext => ({
    byCompany: new Map(),
    zuWeitCount: 0,
    zuWeitMinuten: null,
    gehaltCount: 0,
    gehaltDeclinedMax: null,
    ...over,
  });

  const job = { companyId: 'c1', travelMinutes: 20, salaryMax: 3000 };

  it('ohne Absagen keine Abzüge', () => {
    expect(service.declineAdjustments(ctx({}), job)).toEqual([]);
  });

  it('−8 pro abgelehntem Angebot desselben Betriebs, gedeckelt bei −20', () => {
    const one = service.declineAdjustments(
      ctx({ byCompany: new Map([['c1', 1]]) }),
      job,
    );
    expect(one[0].points).toBe(8);
    const three = service.declineAdjustments(
      ctx({ byCompany: new Map([['c1', 3]]) }),
      job,
    );
    expect(three[0].points).toBe(20);
    // Anderer Betrieb bleibt unberührt.
    const other = service.declineAdjustments(
      ctx({ byCompany: new Map([['c2', 3]]) }),
      job,
    );
    expect(other).toEqual([]);
  });

  it('„zu weit“ erst ab 2 Absagen, ohne bekannte Anfahrt ab 45 Min.', () => {
    const once = service.declineAdjustments(
      ctx({ zuWeitCount: 1 }),
      { ...job, travelMinutes: 60 },
    );
    expect(once).toEqual([]);
    const twiceFar = service.declineAdjustments(
      ctx({ zuWeitCount: 2 }),
      { ...job, travelMinutes: 60 },
    );
    expect(twiceFar[0].id).toBe('declined_zu_weit');
    const twiceNear = service.declineAdjustments(
      ctx({ zuWeitCount: 2 }),
      { ...job, travelMinutes: 30 },
    );
    expect(twiceNear).toEqual([]);
  });

  // Die feste 45-Minuten-Grenze ging an der Wirklichkeit vorbei: wer zweimal
  // eine 30-Minuten-Stelle als zu weit ablehnt, bekam 40-Minuten-Stellen
  // weiterhin unverändert bewertet. Jetzt zählt das eigene Verhalten.
  it('„zu weit“ misst an der Entfernung, die der Nutzer selbst abgelehnt hat', () => {
    const c = ctx({ zuWeitCount: 2, zuWeitMinuten: 30 });

    const ab30 = service.declineAdjustments(c, { ...job, travelMinutes: 30 });
    expect(ab30[0].id).toBe('declined_zu_weit');
    expect(ab30[0].label).toContain('ab 30 Min.');

    const dazwischen = service.declineAdjustments(c, { ...job, travelMinutes: 40 });
    expect(dazwischen[0]?.id).toBe('declined_zu_weit');

    const naeher = service.declineAdjustments(c, { ...job, travelMinutes: 25 });
    expect(naeher).toEqual([]);
  });

  it('„zu weit“ fällt nie unter eine Viertelstunde', () => {
    // Zwei Absagen bei 6 Minuten Anfahrt sind eher ein Fehlgriff als eine
    // Aussage über Entfernung — sonst würde das gesamte Angebot abgewertet.
    const c = ctx({ zuWeitCount: 2, zuWeitMinuten: 6 });
    expect(service.declineAdjustments(c, { ...job, travelMinutes: 8 })).toEqual([]);
    const abGrenze = service.declineAdjustments(c, { ...job, travelMinutes: 15 });
    expect(abGrenze[0].label).toContain('ab 15 Min.');
  });

  it('ohne bekannte Fahrzeit der Stelle greift die Regel nicht', () => {
    const c = ctx({ zuWeitCount: 2, zuWeitMinuten: 30 });
    expect(service.declineAdjustments(c, { ...job, travelMinutes: null })).toEqual([]);
  });

  it('„Gehalt“ wertet nur Stellen bis zum abgelehnten Niveau ab', () => {
    const c = ctx({ gehaltCount: 2, gehaltDeclinedMax: 3500 });
    expect(
      service.declineAdjustments(c, { ...job, salaryMax: 3400 })[0]?.id,
    ).toBe('declined_gehalt');
    expect(
      service.declineAdjustments(c, { ...job, salaryMax: 3800 }),
    ).toEqual([]);
  });

  it('applyAdjustments: Endscore = Basis − Summe, nie unter 0', () => {
    const base = {
      passed: true,
      knockouts: [],
      criteria: [],
      totalPenalty: 0,
      totalMaxPenalty: 0,
      baseScore: 25,
      adjustments: [],
      score: 25,
      formula: '',
      aiScore: null,
    } as MatchBreakdown;
    const adjusted = service.applyAdjustments(base, [
      { id: 'a', label: 'x', points: 20 },
      { id: 'b', label: 'y', points: 10 },
    ]);
    expect(adjusted.baseScore).toBe(25);
    expect(adjusted.score).toBe(0);
    expect(adjusted.adjustments).toHaveLength(2);
    // Ohne Abzüge bleibt das Objekt unverändert.
    expect(service.applyAdjustments(base, []).score).toBe(25);
  });
});
