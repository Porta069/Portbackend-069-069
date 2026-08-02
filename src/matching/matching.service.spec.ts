import { MatchQuestion } from '@prisma/client';
import { MatchingService, WorkerProfile } from './matching.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Verifies the exact score arithmetic the transparency view displays:
 * penalty = weight × distance-to-range, score = 100 × (1 − Σp / Σmax).
 */
describe('MatchingService', () => {
  const service = new MatchingService({} as PrismaService);

  const question = (over: Partial<MatchQuestion>): MatchQuestion =>
    ({
      id: over.key ?? 'q',
      key: 'q',
      label: 'Frage',
      hint: '',
      scaleMin: 0,
      scaleMax: 10,
      unit: '',
      answerKey: 'aiAnswers.x',
      valueMap: null,
      defaultWeight: 2,
      sortOrder: 0,
      active: true,
      ...over,
    }) as MatchQuestion;

  const profileWith = (answers: Record<string, unknown>): WorkerProfile => ({
    gewerke: [],
    erfahrungJahre: null,
    zertifikate: [],
    bereitschaft: [],
    praeferenz: null,
    answers,
    workLocations: [],
    hasAvatar: false,
  });

  const criterion = (
    q: MatchQuestion,
    minValue: number,
    maxValue: number,
    weight: number,
  ) => ({
    id: `c-${q.key}`,
    jobPostingId: 'job',
    questionId: q.id,
    minValue,
    maxValue,
    weight,
    question: q,
  });

  it('spec example: weight 2 × difference 2 = penalty 4', () => {
    // Worker answers 10, employer expects 8, weight 2 (the user's own example).
    const q = question({ key: 'nettigkeit', answerKey: 'aiAnswers.nett', scaleMin: 1, scaleMax: 10 });
    const result = service.score(
      [criterion(q, 8, 8, 2)],
      profileWith({ nett: 10 }),
    );
    const row = result.criteria[0];
    expect(row.diff).toBe(2);
    expect(row.penalty).toBe(4); // 2 × 2
    // maxDiff = max(8−1, 10−8) = 7 → score = 100 × (1 − 4/14) ≈ 71
    expect(row.maxDiff).toBe(7);
    expect(result.score).toBe(71);
  });

  it('range answers: everything inside [6,10] costs nothing', () => {
    const q = question({ key: 'r', scaleMin: 1, scaleMax: 10 });
    const inside = service.score([criterion(q, 6, 10, 3)], profileWith({ x: 7 }));
    expect(inside.criteria[0].diff).toBe(0);
    expect(inside.score).toBe(100);

    // Below the range: difference to the LOWER bound (6 − 4 = 2).
    const below = service.score([criterion(q, 6, 10, 3)], profileWith({ x: 4 }));
    expect(below.criteria[0].diff).toBe(2);
    expect(below.criteria[0].penalty).toBe(6);
  });

  it('sums weighted penalties across questions', () => {
    const q1 = question({ key: 'a', answerKey: 'aiAnswers.a' });
    const q2 = question({ key: 'b', answerKey: 'aiAnswers.b' });
    const result = service.score(
      [criterion(q1, 5, 5, 2), criterion(q2, 0, 2, 1)],
      profileWith({ a: 7, b: 6 }),
    );
    // q1: 2×2=4, q2: 1×4=4 → total 8; max: 2×5 + 1×8 = 18.
    expect(result.totalPenalty).toBe(8);
    expect(result.totalMaxPenalty).toBe(18);
    expect(result.score).toBe(Math.round(100 * (1 - 8 / 18)));
  });

  it('skips unanswered questions without penalty', () => {
    const q = question({ key: 'a' });
    const result = service.score([criterion(q, 5, 5, 3)], profileWith({}));
    expect(result.criteria[0].skipped).toBe(true);
    expect(result.totalPenalty).toBe(0);
    expect(result.score).toBe(100);
  });

  it('ignores zero-weight criteria entirely', () => {
    const q = question({ key: 'a' });
    const result = service.score([criterion(q, 5, 5, 0)], profileWith({ x: 0 }));
    expect(result.criteria).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it('derives checkbox membership as 0/1 and maps radio answers', () => {
    const meister = question({
      key: 'meister',
      answerKey: 'aiAnswers.ai_zertifikate:meister',
      scaleMin: 0,
      scaleMax: 1,
    });
    const umfeld = question({
      key: 'umfeld',
      answerKey: 'surveyAnswers.survey_umfeld',
      scaleMin: 1,
      scaleMax: 3,
      valueMap: { klein: 1, mittel: 2, gross: 3 },
    });

    const p = profileWith({
      ai_zertifikate: ['geselle', 'meister'],
      survey_umfeld: 'mittel',
    });
    expect(service.workerValue(meister, p)).toBe(1);
    expect(service.workerValue(umfeld, p)).toBe(2);
    // "egal" is deliberately unmapped → null → matches everything.
    expect(
      service.workerValue(umfeld, profileWith({ survey_umfeld: 'egal' })),
    ).toBeNull();
  });

  it('extracts the worker profile from step-keyed profileData', () => {
    const profile = service.extractProfile({
      avatar: null,
      profileData: {
        '1': {
          surveyAnswers: { survey_ziel: 'gehalt', survey_bereitschaft: ['montage'] },
        },
        '3': {
          workLocations: [
            { id: 'l1', label: 'München', lat: 48.1, lng: 11.5, radiusKm: 40 },
          ],
        },
        '4': {
          aiAnswers: {
            ai_gewerke: ['Elektriker / Elektroniker'],
            ai_erfahrung: 9,
            ai_zertifikate: ['geselle'],
          },
        },
      },
    });
    expect(profile.gewerke).toEqual(['Elektriker / Elektroniker']);
    expect(profile.erfahrungJahre).toBe(9);
    expect(profile.bereitschaft).toEqual(['montage']);
    expect(profile.workLocations).toHaveLength(1);
    expect(profile.praeferenz).toBe('gehalt');
  });
});
