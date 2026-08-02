import { MatchingService, DeclineContext, MatchBreakdown } from './matching.service';
import { PrismaService } from '../prisma/prisma.service';

/** Regeln für das Absage-Feedback — jede Regel einzeln und kombiniert. */
describe('declineAdjustments', () => {
  const service = new MatchingService({} as PrismaService);

  const ctx = (over: Partial<DeclineContext>): DeclineContext => ({
    byCompany: new Map(),
    zuWeitCount: 0,
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

  it('„zu weit“ erst ab 2 Absagen und nur für Stellen über 45 Min.', () => {
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
