import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { haversineKm } from './geo.util';
import { katalog } from './catalog';
import {
  Anforderungsprofil,
  Kandidatenprofil,
  MatchBreakdown,
  ScoreAdjustment,
  bewerte,
} from './scoring';

export type { MatchBreakdown, ScoreAdjustment, Anforderungsprofil, Kandidatenprofil };

/** Ein Arbeitsort des Handwerkers samt Umkreis. */
export interface WorkLocation {
  id: string;
  label: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

/** Alles, was zum Bewerten und Anzeigen eines Handwerkers gebraucht wird. */
export interface WorkerProfile {
  /** Die Antworten aus dem Fragebogen. */
  profil: Kandidatenprofil;
  workLocations: WorkLocation[];
  hasAvatar: boolean;
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

/**
 * Grenze für „zu weit weg“, solange sich aus den Absagen selbst keine
 * ableiten lässt (etwa weil der Nutzer keine Arbeitsorte hinterlegt hat).
 */
const ZU_WEIT_FALLBACK_MIN = 45;

// ── Überleitung alter Profile ───────────────────────────────────────────────
// Konten aus der Zeit vor dem neuen Fragebogen haben ihre Antworten noch im
// alten Format. Statt sie als „nichts angegeben" zu behandeln — was sie aus
// jeder Trefferliste werfen würde — wird übersetzt, was sich sinnvoll
// übersetzen lässt. Der Rest bleibt leer und wird schlicht nicht bewertet.

const ALT_GEWERK_ZU_BEREICH: Record<string, string> = {
  'Elektriker / Elektroniker': 'elektronik',
  'Installateur / Klempner (SHK)': 'shk',
  'Heizungs- & Lüftungsbauer': 'heizung_lueftung',
  'Maler & Lackierer': 'maler',
  'Tischler / Schreiner': 'tischler',
  'Maurer / Betonbauer': 'maurer',
  Dachdecker: 'dachdecker',
  Fliesenleger: 'fliesenleger',
  Zimmerer: 'zimmerer',
  'Metallbauer / Schlosser': 'metallbau',
  'KFZ-Mechatroniker': 'kfz',
  Trockenbauer: 'trockenbau',
  Gerüstbauer: 'geruestbau',
  'Garten- & Landschaftsbau': 'galabau',
  'Anderes Gewerk': 'sonstiges',
};

/** Jahre (alte Schieberegler-Antwort) auf die neue Stufenskala. */
function jahreZuStufe(jahre: number): string {
  if (jahre <= 0) return 'keine';
  if (jahre <= 2) return '1_2';
  if (jahre <= 5) return '3_5';
  if (jahre <= 10) return '6_10';
  return 'ueber_10';
}

function altesProfil(answers: Record<string, unknown>): Kandidatenprofil {
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

  const gewerke = strArr(answers['ai_gewerke']);
  const zertifikate = strArr(answers['ai_zertifikate']);
  const bereitschaft = strArr(answers['survey_bereitschaft']);
  const ziel = typeof answers['survey_ziel'] === 'string' ? answers['survey_ziel'] : null;

  const ausbildung = zertifikate.some((z) => z === 'meister' || z === 'techniker')
    ? 'techniker_meister'
    : zertifikate.includes('geselle')
      ? 'berufsausbildung'
      : null;

  return {
    bereich: ALT_GEWERK_ZU_BEREICH[gewerke[0]] ?? null,
    ausbildungsstatus: ausbildung,
    beruf: null,
    aufgaben: [],
    erfahrung:
      typeof answers['ai_erfahrung'] === 'number'
        ? jahreZuStufe(answers['ai_erfahrung'])
        : null,
    prioritaeten: ziel && ziel !== 'naehe' ? [ziel] : [],
    montage: bereitschaft.includes('montage') ? 'regelmaessig' : null,
    fuehrerschein: zertifikate.includes('fuehrerschein') ? 'b' : null,
    deutsch: null,
    start: null,
  };
}

const LEER: Kandidatenprofil = {
  bereich: null,
  ausbildungsstatus: null,
  beruf: null,
  aufgaben: [],
  erfahrung: null,
  prioritaeten: [],
  montage: null,
  fuehrerschein: null,
  deutsch: null,
  start: null,
};

@Injectable()
export class MatchingService {
  /** Der Fachkatalog, wie ihn die Registrierung und der Inserats-Editor brauchen. */
  katalog() {
    return katalog();
  }

  // ── Profil ────────────────────────────────────────────────────────────────

  /**
   * Liest das Handwerkerprofil aus `profileData`.
   *
   * Die Antworten des neuen Fragebogens liegen unter `profil`. Fehlen sie,
   * greift die Überleitung aus dem alten Format — siehe oben.
   */
  extractProfile(
    // `avatar` ist optional: Aufrufer, die nur ein anonymes Kandidatenprofil
    // brauchen, laden das große Bildfeld bewusst nicht mit.
    user: Pick<User, 'profileData'> & { avatar?: string | null },
  ): WorkerProfile {
    const pd = (user.profileData ?? {}) as Record<string, unknown>;

    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

    // Die Registrierung legt ihre Schritte unter numerischen Schlüsseln ab
    // (`profileData["2"] = { profil: … }`), die Einstellungen schreiben direkt
    // nach `profil`. Beide Wege müssen gelesen werden können.
    const ausSchritt = Object.values(pd).find(
      (v): v is Record<string, unknown> =>
        !!v && typeof v === 'object' && 'profil' in (v as object),
    );
    const neu = ((pd['profil'] ??
      (ausSchritt?.['profil'] as unknown) ??
      null) as Record<string, unknown> | null);
    let profil: Kandidatenprofil;

    if (neu && Object.keys(neu).length > 0) {
      profil = {
        bereich: str(neu['bereich']),
        ausbildungsstatus: str(neu['ausbildungsstatus']),
        beruf: str(neu['beruf']),
        aufgaben: strArr(neu['aufgaben']),
        erfahrung: str(neu['erfahrung']),
        prioritaeten: strArr(neu['prioritaeten']),
        montage: str(neu['montage']),
        fuehrerschein: str(neu['fuehrerschein']),
        deutsch: str(neu['deutsch']),
        start: str(neu['start']),
      };
    } else {
      const steps = pd as Record<string, Record<string, unknown> | undefined>;
      const survey = (steps['1']?.surveyAnswers ?? {}) as Record<string, unknown>;
      const ai = (steps['4']?.aiAnswers ?? {}) as Record<string, unknown>;
      const answers = { ...survey, ...ai };
      profil = Object.keys(answers).length > 0 ? altesProfil(answers) : { ...LEER };
    }

    const rawLocations = (pd['3'] as Record<string, unknown> | undefined)?.[
      'workLocations'
    ];
    const workLocations = (Array.isArray(rawLocations) ? rawLocations : [])
      .filter(
        (l): l is WorkLocation =>
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

    return { profil, workLocations, hasAvatar: !!user.avatar };
  }

  // ── Bewertung ─────────────────────────────────────────────────────────────

  /**
   * Bewertet eine Stelle für einen Handwerker: erst Ausschluss, dann Punkte.
   * Details der Regeln stehen in `scoring.ts`.
   */
  score(anforderung: Anforderungsprofil, profile: WorkerProfile): MatchBreakdown {
    return bewerte(anforderung, profile.profil);
  }

  /** Liest das Anforderungsprofil aus einem Inserat. */
  anforderungVon(posting: {
    bereiche: string[];
    berufe: string[];
    ausbildungMin: string | null;
    aufgaben: string[];
    aufgabenMin: number;
    erfahrungMin: string | null;
    erfahrungMax: string | null;
    montageMin: string | null;
    fuehrerscheinMin: string | null;
    deutschMin: string | null;
    gebotenes: string[];
    startBis: string | null;
    gewichte: unknown;
  }): Anforderungsprofil {
    const gewichte =
      posting.gewichte && typeof posting.gewichte === 'object'
        ? (posting.gewichte as Anforderungsprofil['gewichte'])
        : undefined;
    return {
      bereiche: posting.bereiche,
      berufe: posting.berufe,
      ausbildungMin: posting.ausbildungMin,
      aufgaben: posting.aufgaben,
      aufgabenMin: posting.aufgabenMin,
      erfahrungMin: posting.erfahrungMin,
      erfahrungMax: posting.erfahrungMax,
      montageMin: posting.montageMin,
      fuehrerscheinMin: posting.fuehrerscheinMin,
      deutschMin: posting.deutschMin,
      gebotenes: posting.gebotenes,
      startBis: posting.startBis,
      gewichte,
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
    if (adjustments.length === 0 || !breakdown.passed) return breakdown;
    const total = adjustments.reduce((s, a) => s + a.points, 0);
    return {
      ...breakdown,
      adjustments,
      score: Math.max(0, breakdown.baseScore - total),
    };
  }

  // ── Entfernung ────────────────────────────────────────────────────────────

  /**
   * Nearest work location of the worker to a target point.
   * Returns null when either side has no usable coordinates.
   */
  nearestLocation(
    profile: WorkerProfile,
    lat: number | null,
    lng: number | null,
  ): { location: WorkLocation; distanceKm: number } | null {
    if (lat == null || lng == null || profile.workLocations.length === 0) {
      return null;
    }
    let best: { location: WorkLocation; distanceKm: number } | null = null;
    for (const loc of profile.workLocations) {
      const d = haversineKm(loc.lat, loc.lng, lat, lng);
      if (!best || d < best.distanceKm) best = { location: loc, distanceKm: d };
    }
    return best;
  }
}
