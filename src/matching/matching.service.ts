import { Injectable } from '@nestjs/common';
import { JobCriterion, MatchQuestion, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { haversineKm } from './geo.util';

/**
 * The matching engine.
 *
 * Score model (deliberately simple and fully explainable):
 *  - Per job posting the employer answers catalog questions optionally as a
 *    RANGE [minValue, maxValue] on the question's scale (single value ⇒
 *    min = max) plus a WEIGHT (0–5).
 *  - The worker's numeric value per question is derived from their onboarding
 *    answers (User.profileData) via MatchQuestion.answerKey (+ valueMap).
 *  - diff     = distance of the worker value to the range (0 inside).
 *  - penalty  = weight × diff            (exactly the spec'd "Gewichtung × Differenz")
 *  - maxDiff  = largest possible distance on the scale (worst case).
 *  - score    = 100 × (1 − Σ penalty / Σ (weight × maxDiff)), rounded.
 *
 * Every intermediate number is returned in the breakdown so the UI can show
 * the full computation (temporary transparency mode).
 */

/** A worker's matching-relevant profile, extracted from User.profileData. */
export interface WorkerProfile {
  gewerke: string[];
  erfahrungJahre: number | null;
  zertifikate: string[];
  bereitschaft: string[];
  praeferenz: string | null;
  answers: Record<string, unknown>; // merged survey + AI answers by question id
  workLocations: {
    id: string;
    label: string;
    lat: number;
    lng: number;
    radiusKm: number;
  }[];
  hasAvatar: boolean;
}

export interface CriterionBreakdown {
  questionKey: string;
  label: string;
  unit: string;
  scaleMin: number;
  scaleMax: number;
  /** The worker's derived numeric value (null = no answer → skipped). */
  workerValue: number | null;
  rangeMin: number;
  rangeMax: number;
  weight: number;
  diff: number | null;
  /** weight × diff */
  penalty: number | null;
  maxDiff: number;
  maxPenalty: number;
  skipped: boolean;
}

export interface ScoreAdjustment {
  id: string;
  /** Sichtbare Begründung in der Transparenz-Ansicht. */
  label: string;
  /** Abzug in Score-Punkten (positiv). */
  points: number;
}

export interface MatchBreakdown {
  criteria: CriterionBreakdown[];
  totalPenalty: number;
  totalMaxPenalty: number;
  /** Score aus den Kriterien allein (vor Abzügen). */
  baseScore: number;
  /** Abzüge aus dem Nutzerverhalten (abgelehnte Angebote). */
  adjustments: ScoreAdjustment[];
  /** Endscore 0–100 = baseScore − Σ adjustments (nie unter 0). */
  score: number;
  formula: string;
  /** Reserved: score of the AI question round (not yet integrated). */
  aiScore: number | null;
}

/**
 * Feedback aus abgelehnten Angeboten. Wird pro Nutzer einmal aufgebaut und
 * fließt als transparenter Punktabzug in jeden Job-Score ein.
 */
export interface DeclineContext {
  /** companyId → Anzahl abgelehnter Angebote dieses Betriebs. */
  byCompany: Map<string, number>;
  /** Wie oft insgesamt mit Grund „zu weit weg“ abgelehnt wurde. */
  zuWeitCount: number;
  /**
   * Kürzeste Fahrzeit unter den wegen Entfernung abgelehnten Stellen —
   * die Grenze, ab der dieser Nutzer eine Stelle selbst als zu weit ansieht.
   * `null`, wenn keine Fahrzeit ermittelbar war (etwa ohne Arbeitsorte).
   */
  zuWeitMinuten: number | null;
  /** Wie oft insgesamt mit Grund „Gehalt passt nicht“ abgelehnt wurde. */
  gehaltCount: number;
  /** Höchstes salaryMax unter den wegen Gehalt abgelehnten Stellen. */
  gehaltDeclinedMax: number | null;
}

export type CriterionWithQuestion = JobCriterion & { question: MatchQuestion };

const FORMULA =
  'Score = 100 × (1 − Σ(Gewicht × Differenz) / Σ(Gewicht × maxDifferenz)); ' +
  'Differenz = Abstand der Antwort zur Range (0 innerhalb).';

/**
 * Ohne erreichbare Strafpunkte gibt es nichts zu teilen — die Formel oben
 * stünde dann als „100 × (1 − 0 / 0)" da, also als Division durch Null.
 * Das passiert, wenn die angegebene Spanne die gesamte Skala abdeckt
 * (z. B. „0 bis 40 Jahre Erfahrung"): das Kriterium ist dann bewertet, kann
 * den Score aber rechnerisch nie beeinflussen. Statt einer undefinierten
 * Rechnung wird genau das erklärt.
 */
const FORMULA_NO_RANGE =
  'Keines der bewerteten Kriterien kann den Score senken — die angegebenen ' +
  'Spannen decken die gesamte Skala ab, jede Antwort liegt darin. Daher ' +
  'gibt es keine erreichbaren Strafpunkte und der Score bleibt 100.';

const FORMULA_NO_CRITERIA =
  'Für diese Stelle sind keine bewertbaren Kriterien hinterlegt — ohne ' +
  'Kriterien gilt Score = 100.';

/**
 * Grenze für „zu weit weg“, solange sich aus den Absagen selbst keine
 * ableiten lässt (etwa weil der Nutzer keine Arbeitsorte hinterlegt hat).
 */
const ZU_WEIT_FALLBACK_MIN = 45;

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  /** The active question catalog, ordered for display. */
  listQuestions(): Promise<MatchQuestion[]> {
    return this.prisma.matchQuestion.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ── Worker profile extraction ─────────────────────────────────────────────

  /**
   * profileData is keyed by wizard step: "1" = survey, "3" = work locations,
   * "4" = AI answers (see the registration steps in the frontend).
   */
  extractProfile(
    // `avatar` ist optional: Aufrufer, die nur ein anonymes Kandidatenprofil
    // brauchen, laden das große Bildfeld bewusst nicht mit.
    user: Pick<User, 'profileData'> & { avatar?: string | null },
  ): WorkerProfile {
    const pd = (user.profileData ?? {}) as Record<
      string,
      Record<string, unknown> | undefined
    >;
    const survey = (pd['1']?.surveyAnswers ?? {}) as Record<string, unknown>;
    const ai = (pd['4']?.aiAnswers ?? {}) as Record<string, unknown>;
    const answers = { ...survey, ...ai };

    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

    const rawLocations = pd['3']?.workLocations;
    const workLocations = (Array.isArray(rawLocations) ? rawLocations : [])
      .filter(
        (l): l is WorkerProfile['workLocations'][number] =>
          !!l &&
          typeof (l as { lat?: unknown }).lat === 'number' &&
          typeof (l as { lng?: unknown }).lng === 'number',
      )
      .map((l) => ({
        id: String(l.id ?? ''),
        label: String(l.label ?? ''),
        lat: l.lat,
        lng: l.lng,
        radiusKm: typeof l.radiusKm === 'number' ? l.radiusKm : 30,
      }));

    return {
      gewerke: strArr(answers['ai_gewerke']),
      erfahrungJahre:
        typeof answers['ai_erfahrung'] === 'number'
          ? (answers['ai_erfahrung'] as number)
          : null,
      zertifikate: strArr(answers['ai_zertifikate']),
      bereitschaft: strArr(answers['survey_bereitschaft']),
      praeferenz:
        typeof answers['survey_ziel'] === 'string'
          ? (answers['survey_ziel'] as string)
          : null,
      answers,
      workLocations,
      hasAvatar: !!user.avatar,
    };
  }

  /**
   * Derives the worker's numeric value for a catalog question.
   *  - answerKey "aiAnswers.ai_erfahrung"          → numeric answer as-is
   *  - answerKey "surveyAnswers.survey_umfeld"     → valueMap[stringAnswer]
   *  - answerKey "aiAnswers.ai_zertifikate:meister"→ 1 if option chosen else 0
   * Returns null when the worker has not answered (or the map has no entry,
   * e.g. "egal" — deliberately unmapped = matches everything).
   */
  workerValue(question: MatchQuestion, profile: WorkerProfile): number | null {
    const [path, option] = question.answerKey.split(':');
    const questionId = path.split('.').pop() ?? path;
    const raw = profile.answers[questionId];

    if (option !== undefined) {
      if (raw == null) return null; // question not answered at all
      return Array.isArray(raw) && raw.includes(option) ? 1 : 0;
    }
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string' && question.valueMap) {
      const mapped = (question.valueMap as Record<string, unknown>)[raw];
      return typeof mapped === 'number' ? mapped : null;
    }
    return null;
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  score(
    criteria: CriterionWithQuestion[],
    profile: WorkerProfile,
  ): MatchBreakdown {
    const rows: CriterionBreakdown[] = [];
    let totalPenalty = 0;
    let totalMaxPenalty = 0;

    for (const c of criteria.filter((c) => c.weight > 0)) {
      const q = c.question;
      const value = this.workerValue(q, profile);
      // Worst case: the worker sits at the scale end farthest from the range.
      const maxDiff = Math.max(c.minValue - q.scaleMin, q.scaleMax - c.maxValue);

      if (value === null) {
        rows.push({
          questionKey: q.key,
          label: q.label,
          unit: q.unit,
          scaleMin: q.scaleMin,
          scaleMax: q.scaleMax,
          workerValue: null,
          rangeMin: c.minValue,
          rangeMax: c.maxValue,
          weight: c.weight,
          diff: null,
          penalty: null,
          maxDiff,
          maxPenalty: c.weight * maxDiff,
          skipped: true,
        });
        continue;
      }

      const diff =
        value < c.minValue
          ? c.minValue - value
          : value > c.maxValue
            ? value - c.maxValue
            : 0;
      const penalty = c.weight * diff;
      totalPenalty += penalty;
      totalMaxPenalty += c.weight * maxDiff;

      rows.push({
        questionKey: q.key,
        label: q.label,
        unit: q.unit,
        scaleMin: q.scaleMin,
        scaleMax: q.scaleMax,
        workerValue: value,
        rangeMin: c.minValue,
        rangeMax: c.maxValue,
        weight: c.weight,
        diff,
        penalty,
        maxDiff,
        maxPenalty: c.weight * maxDiff,
        skipped: false,
      });
    }

    // Auf 0..100 klemmen: profileData ist ungeprüftes JSON, ein Wert
    // ausserhalb der Fragenskala könnte sonst einen negativen Score erzeugen.
    const score =
      totalMaxPenalty > 0
        ? Math.min(100, Math.max(0, Math.round(100 * (1 - totalPenalty / totalMaxPenalty))))
        : 100;

    const scored = rows.some((r) => !r.skipped);
    return {
      criteria: rows,
      totalPenalty,
      totalMaxPenalty,
      baseScore: score,
      adjustments: [],
      score,
      formula:
        totalMaxPenalty > 0
          ? FORMULA
          : scored
            ? FORMULA_NO_RANGE
            : FORMULA_NO_CRITERIA,
      aiScore: null,
    };
  }

  // ── Absage-Feedback ───────────────────────────────────────────────────────

  /**
   * Abzüge aus abgelehnten Angeboten — bewusst wenige, einfache Regeln:
   *  1. Je abgelehntem Angebot desselben Betriebs −8 Punkte (max. −20).
   *  2. Ab zwei Absagen „zu weit weg“: Stellen ab der Entfernung, die der
   *     Nutzer selbst schon abgelehnt hat, −10.
   *  3. Ab zwei Absagen „Gehalt passt nicht“: Stellen, deren Maximalgehalt
   *     nicht über dem bereits abgelehnten Niveau liegt, −10.
   *
   * Regel 2 nahm früher feste 45 Minuten an. Das war eine geratene Zahl, die
   * an der Realität vorbeiging: wer zwei Stellen mit 30 Minuten Anfahrt als zu
   * weit ablehnt, bekam weiterhin 40-Minuten-Stellen unverändert bewertet.
   * Jetzt zählt wie bei Regel 3 das tatsächlich abgelehnte Niveau.
   */
  declineAdjustments(
    ctx: DeclineContext,
    job: {
      companyId: string;
      travelMinutes: number | null;
      salaryMax: number | null;
    },
  ): ScoreAdjustment[] {
    const out: ScoreAdjustment[] = [];

    const declined = ctx.byCompany.get(job.companyId) ?? 0;
    if (declined > 0) {
      out.push({
        id: 'declined_company',
        label: `Du hast ${declined === 1 ? 'ein Angebot' : `${declined} Angebote`} dieses Betriebs abgelehnt`,
        points: Math.min(20, declined * 8),
      });
    }

    if (ctx.zuWeitCount >= 2 && job.travelMinutes != null) {
      // Untergrenze, damit zwei Absagen bei kurzer Anfahrt nicht gleich das
      // ganze Angebot abwerten — unter einer Viertelstunde ist „zu weit“ eher
      // ein Fehlgriff als eine Aussage über die Entfernung.
      const grenze = Math.max(15, ctx.zuWeitMinuten ?? ZU_WEIT_FALLBACK_MIN);
      if (job.travelMinutes >= grenze) {
        out.push({
          id: 'declined_zu_weit',
          label: `Mehrfach „zu weit weg“ abgelehnt — Stellen ab ${grenze} Min. abgewertet`,
          points: 10,
        });
      }
    }

    if (
      ctx.gehaltCount >= 2 &&
      ctx.gehaltDeclinedMax != null &&
      job.salaryMax != null &&
      job.salaryMax <= ctx.gehaltDeclinedMax
    ) {
      out.push({
        id: 'declined_gehalt',
        label: `Gehalt mehrfach als zu niedrig abgelehnt — Stellen bis ${ctx.gehaltDeclinedMax.toLocaleString('de-DE')} € abgewertet`,
        points: 10,
      });
    }

    return out;
  }

  /** Verrechnet die Abzüge in den Breakdown (Endscore nie unter 0). */
  applyAdjustments(
    breakdown: MatchBreakdown,
    adjustments: ScoreAdjustment[],
  ): MatchBreakdown {
    if (adjustments.length === 0) return breakdown;
    const total = adjustments.reduce((s, a) => s + a.points, 0);
    return {
      ...breakdown,
      adjustments,
      score: Math.max(0, breakdown.baseScore - total),
    };
  }

  // ── Distance ──────────────────────────────────────────────────────────────

  /**
   * Nearest work location of the worker to a target point.
   * Returns null when either side has no usable coordinates.
   */
  nearestLocation(
    profile: WorkerProfile,
    lat: number | null,
    lng: number | null,
  ): { location: WorkerProfile['workLocations'][number]; distanceKm: number } | null {
    if (lat == null || lng == null || profile.workLocations.length === 0) {
      return null;
    }
    let best: { location: WorkerProfile['workLocations'][number]; distanceKm: number } | null =
      null;
    for (const loc of profile.workLocations) {
      const d = haversineKm(loc.lat, loc.lng, lat, lng);
      if (!best || d < best.distanceKm) best = { location: loc, distanceKm: d };
    }
    return best;
  }
}
