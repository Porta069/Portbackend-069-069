/**
 * Das Matching in zwei Stufen.
 *
 * **Stufe 1 — Ausschluss.** Es gibt Anforderungen, bei denen ein Prozentwert
 * die falsche Antwort ist. Wer nie auf Montage kann, passt nicht „zu 62 %" auf
 * eine Dauermontagestelle — er passt gar nicht. Solche Stellen werden dem
 * Handwerker deshalb erst gar nicht vorgeschlagen, statt ihn mit einem
 * schlechten Wert zu verwirren.
 *
 * **Stufe 2 — Punktwertung.** Was übrig bleibt, wird nach Nähe zum gesuchten
 * Profil sortiert. Jedes Kriterium liefert einen Erfüllungsgrad zwischen 0 und
 * 1, der mit seinem Gewicht multipliziert wird:
 *
 *     Score = 100 × (1 − Σ(Gewicht × (1 − Erfüllung)) / Σ Gewicht)
 *
 * Eine einzige Formel für alle Kriterien — egal ob Spanne (Erfahrung),
 * Schnittmenge (Aufgabenbereiche) oder Einzelwert (Beruf). Die frühere
 * Distanzformel konnte nur Zahlenspannen und musste alles andere in 0/1
 * pressen.
 *
 * Kriterien, zu denen der Betrieb nichts verlangt oder der Handwerker nichts
 * angegeben hat, werden übersprungen — sie zählen weder im Zähler noch im
 * Nenner, verwässern den Wert also nicht.
 */

import {
  labelFuer,
  rangAusbildung,
  rangDeutsch,
  rangErfahrung,
  rangFuehrerschein,
  rangMontage,
  rangStart,
  findBereich,
} from './catalog';

// ── Profile ─────────────────────────────────────────────────────────────────

/** Die Antworten des Handwerkers aus der Registrierung. */
export interface Kandidatenprofil {
  bereich: string | null;
  ausbildungsstatus: string | null;
  beruf: string | null;
  aufgaben: string[];
  erfahrung: string | null;
  prioritaeten: string[];
  montage: string | null;
  fuehrerschein: string | null;
  deutsch: string | null;
  start: string | null;
}

/** Was ein Inserat sucht. Leere Felder bedeuten: ist dem Betrieb egal. */
export interface Anforderungsprofil {
  /** Akzeptierte Ausbildungsbereiche. Leer = alle. */
  bereiche: string[];
  /** Bevorzugte Ausbildungsberufe. Leer = alle des Bereichs. */
  berufe: string[];
  /** Mindest-Ausbildungsstand. */
  ausbildungMin: string | null;
  /** Gesuchte Aufgabenbereiche. */
  aufgaben: string[];
  /** Wie viele davon der Handwerker mindestens abdecken muss. */
  aufgabenMin: number;
  erfahrungMin: string | null;
  erfahrungMax: string | null;
  /** Verlangte Montagebereitschaft. */
  montageMin: string | null;
  /** Verlangter Führerschein. */
  fuehrerscheinMin: string | null;
  /** Verlangtes Sprachniveau. */
  deutschMin: string | null;
  /** Was der Betrieb bietet — trifft auf die Wünsche des Handwerkers. */
  gebotenes: string[];
  /** Bis wann die Stelle besetzt sein soll. */
  startBis: string | null;
  /** Abweichende Gewichte, 0–5. Fehlt ein Wert, gilt die Vorgabe unten. */
  gewichte?: Partial<Record<KriteriumKey, number>>;
}

export type KriteriumKey =
  | 'beruf'
  | 'aufgaben'
  | 'erfahrung'
  | 'prioritaeten'
  | 'fuehrerschein'
  | 'start';

/**
 * Vorgabegewichte. Die Reihenfolge ist eine fachliche Aussage: was jemand
 * tatsächlich gemacht hat, wiegt schwerer als der Titel der Ausbildung, und
 * beides schwerer als der Wunschzettel.
 */
export const STANDARD_GEWICHTE: Record<KriteriumKey, number> = {
  aufgaben: 5,
  erfahrung: 4,
  beruf: 3,
  prioritaeten: 2,
  fuehrerschein: 2,
  start: 1,
};

// ── Ergebnis ────────────────────────────────────────────────────────────────

export interface KriteriumZeile {
  key: KriteriumKey;
  label: string;
  /** Was der Betrieb verlangt, im Klartext. */
  required: string;
  /** Was im Profil steht, im Klartext. */
  answer: string;
  weight: number;
  /** Erfüllungsgrad 0–1. */
  fulfilment: number;
  /** Gewicht × (1 − Erfüllung). */
  penalty: number;
  maxPenalty: number;
  skipped: boolean;
  /** Erklärung, wenn der Wert nicht selbsterklärend ist. */
  note?: string;
}

export interface Ausschluss {
  key: string;
  label: string;
  reason: string;
}

export interface ScoreAdjustment {
  id: string;
  label: string;
  points: number;
}

export interface MatchBreakdown {
  /** Fällt die Stelle durch ein Ausschlusskriterium? Dann wird sie nicht gezeigt. */
  passed: boolean;
  knockouts: Ausschluss[];
  criteria: KriteriumZeile[];
  totalPenalty: number;
  totalMaxPenalty: number;
  baseScore: number;
  adjustments: ScoreAdjustment[];
  score: number;
  formula: string;
  aiScore: number | null;
}

const FORMEL =
  'Score = 100 × (1 − Σ(Gewicht × (1 − Erfüllung)) / Σ Gewicht). ' +
  'Erfüllung ist 1, wenn die Anforderung ganz erfüllt ist, und 0, wenn gar nicht.';

const FORMEL_OHNE =
  'Für diese Stelle sind keine bewertbaren Anforderungen hinterlegt — ' +
  'wer die Ausschlusskriterien besteht, passt gleich gut.';

const runde2 = (n: number) => Math.round(n * 100) / 100;

// ── Stufe 1: Ausschluss ─────────────────────────────────────────────────────

/**
 * Prüft die Anforderungen, bei denen es kein „teilweise" gibt.
 *
 * Bewusst NICHT dabei: der Führerschein oberhalb von „gar keiner". Wer die
 * Klasse B hat und die Stelle einen LKW-Schein verlangt, ist keine
 * Fehlbesetzung, sondern jemand, der den Schein nachmachen kann — das gehört
 * in die Punktwertung, nicht ins Aus.
 */
export function ausschlusskriterien(
  anf: Anforderungsprofil,
  k: Kandidatenprofil,
): Ausschluss[] {
  const raus: Ausschluss[] = [];

  if (anf.bereiche.length > 0 && k.bereich && !anf.bereiche.includes(k.bereich)) {
    raus.push({
      key: 'bereich',
      label: 'Ausbildungsbereich',
      reason:
        `Gesucht: ${anf.bereiche.map((b) => labelFuer('bereich', b)).join(' oder ')} — ` +
        `dein Bereich: ${labelFuer('bereich', k.bereich)}.`,
    });
  }

  const statusIst = rangAusbildung(k.ausbildungsstatus);
  const statusSoll = rangAusbildung(anf.ausbildungMin);
  if (statusSoll != null && statusIst != null && statusIst < statusSoll) {
    raus.push({
      key: 'ausbildung',
      label: 'Ausbildungsstand',
      reason:
        `Mindestens ${labelFuer('ausbildung', anf.ausbildungMin!)} verlangt — ` +
        `angegeben: ${labelFuer('ausbildung', k.ausbildungsstatus!)}.`,
    });
  }

  // Aufgabenbereiche schließen nur aus, wenn der Betrieb das ausdrücklich
  // verlangt (`aufgabenMin` > 0). Sonst beschreiben sie die Stelle und fließen
  // allein in die Punktwertung ein — ein Elektriker soll nicht aus einer
  // Elektrikerstelle fallen, weil er ein bestimmtes Feld nicht angekreuzt hat.
  if (anf.aufgaben.length > 0 && anf.aufgabenMin > 0) {
    const treffer = anf.aufgaben.filter((a) => k.aufgaben.includes(a));
    const noetig = Math.min(anf.aufgabenMin, anf.aufgaben.length);
    if (treffer.length < noetig) {
      raus.push({
        key: 'aufgaben',
        label: 'Aufgabenbereiche',
        reason:
          `Mindestens ${noetig} der gesuchten Bereiche nötig ` +
          `(${anf.aufgaben.map((a) => labelFuer('aufgabe', a)).join(', ')}) — ` +
          `abgedeckt: ${treffer.length}.`,
      });
    }
  }

  const montageIst = rangMontage(k.montage);
  const montageSoll = rangMontage(anf.montageMin);
  if (montageSoll != null && montageIst != null && montageIst < montageSoll) {
    raus.push({
      key: 'montage',
      label: 'Montagebereitschaft',
      reason:
        `Die Stelle verlangt „${labelFuer('montage', anf.montageMin!)}" — ` +
        `du hast „${labelFuer('montage', k.montage!)}" angegeben.`,
    });
  }

  // Nur der Fall „gar kein Führerschein" schließt aus.
  const fsIst = rangFuehrerschein(k.fuehrerschein);
  const fsSoll = rangFuehrerschein(anf.fuehrerscheinMin);
  if (fsSoll != null && fsSoll > 0 && fsIst === 0) {
    raus.push({
      key: 'fuehrerschein',
      label: 'Führerschein',
      reason: `Für die Stelle wird ${labelFuer('fuehrerschein', anf.fuehrerscheinMin!)} vorausgesetzt.`,
    });
  }

  const deIst = rangDeutsch(k.deutsch);
  const deSoll = rangDeutsch(anf.deutschMin);
  if (deSoll != null && deIst != null && deIst < deSoll) {
    raus.push({
      key: 'deutsch',
      label: 'Deutschkenntnisse',
      reason:
        `Mindestens ${labelFuer('deutsch', anf.deutschMin!)} verlangt — ` +
        `angegeben: ${labelFuer('deutsch', k.deutsch!)}.`,
    });
  }

  return raus;
}

// ── Stufe 2: Punktwertung ───────────────────────────────────────────────────

/** Anteil der geforderten Aufgabenbereiche, den der Handwerker abdeckt. */
function bewerteAufgaben(
  anf: Anforderungsprofil,
  k: Kandidatenprofil,
): { fulfilment: number; note: string } {
  const treffer = anf.aufgaben.filter((a) => k.aufgaben.includes(a));
  return {
    fulfilment: treffer.length / anf.aufgaben.length,
    note:
      treffer.length === anf.aufgaben.length
        ? 'Alle gesuchten Bereiche abgedeckt.'
        : `${treffer.length} von ${anf.aufgaben.length} abgedeckt` +
          (treffer.length
            ? `: ${treffer.map((a) => labelFuer('aufgabe', a)).join(', ')}.`
            : '.'),
  };
}

/**
 * Erfahrung gegen die gesuchte Spanne.
 *
 * Bewusst unsymmetrisch: Wer unter der Spanne liegt, kann die Jahre nicht
 * herzaubern — jede Stufe darunter kostet die Hälfte. Wer darüber liegt, ist
 * überqualifiziert, aber nicht ungeeignet; das kostet nur wenig und nie mehr
 * als 30 %.
 */
function bewerteErfahrung(
  anf: Anforderungsprofil,
  k: Kandidatenprofil,
): { fulfilment: number; note: string } {
  const ist = rangErfahrung(k.erfahrung)!;
  const min = rangErfahrung(anf.erfahrungMin);
  const max = rangErfahrung(anf.erfahrungMax);

  if (min != null && ist < min) {
    const stufen = min - ist;
    return {
      fulfilment: Math.max(0, 1 - stufen * 0.5),
      note: `${stufen} Stufe${stufen > 1 ? 'n' : ''} unter der gesuchten Erfahrung.`,
    };
  }
  if (max != null && ist > max) {
    const stufen = ist - max;
    return {
      fulfilment: Math.max(0.7, 1 - stufen * 0.1),
      note: 'Mehr Erfahrung als gesucht — zählt nur geringfügig ab.',
    };
  }
  return { fulfilment: 1, note: 'Liegt in der gesuchten Spanne.' };
}

/** Wie viele der eigenen Wünsche der Betrieb bedient. */
function bewertePrioritaeten(
  anf: Anforderungsprofil,
  k: Kandidatenprofil,
): { fulfilment: number; note: string } {
  const erfuellt = k.prioritaeten.filter((p) => anf.gebotenes.includes(p));
  return {
    fulfilment: erfuellt.length / k.prioritaeten.length,
    note: erfuellt.length
      ? `Erfüllt: ${erfuellt.map((p) => labelFuer('prio', p)).join(', ')}.`
      : 'Keiner deiner Wünsche ist hier hinterlegt.',
  };
}

/** Passt der Ausbildungsberuf? Gleicher Bereich zählt als halbe Nähe. */
function bewerteBeruf(
  anf: Anforderungsprofil,
  k: Kandidatenprofil,
): { fulfilment: number; note: string } {
  if (anf.berufe.includes(k.beruf!)) {
    return { fulfilment: 1, note: 'Genau der gesuchte Ausbildungsberuf.' };
  }
  const bereich = findBereich(k.bereich);
  const imSelbenBereich = bereich?.berufe.some((b) => anf.berufe.includes(b.value));
  return imSelbenBereich
    ? {
        fulfilment: 0.6,
        note: 'Anderer Beruf, aber derselbe Ausbildungsbereich — fachlich verwandt.',
      }
    : { fulfilment: 0, note: 'Der gesuchte Ausbildungsberuf ist ein anderer.' };
}

/** Führerschein oberhalb der Ausschlussgrenze. */
function bewerteFuehrerschein(
  anf: Anforderungsprofil,
  k: Kandidatenprofil,
): { fulfilment: number; note: string } {
  const ist = rangFuehrerschein(k.fuehrerschein)!;
  const soll = rangFuehrerschein(anf.fuehrerscheinMin)!;
  if (ist >= soll) return { fulfilment: 1, note: 'Vorhanden.' };
  if (k.fuehrerschein === 'fahrschule') {
    return { fulfilment: 0.5, note: 'In der Fahrschule — zählt als halb erfüllt.' };
  }
  return {
    fulfilment: 0.3,
    note: `${labelFuer('fuehrerschein', anf.fuehrerscheinMin!)} gesucht, vorhanden ist ${labelFuer('fuehrerschein', k.fuehrerschein!)}.`,
  };
}

/** Wie gut der gewünschte Start zum Bedarf des Betriebs passt. */
function bewerteStart(
  anf: Anforderungsprofil,
  k: Kandidatenprofil,
): { fulfilment: number; note: string } {
  const ist = rangStart(k.start)!;
  const soll = rangStart(anf.startBis)!;
  if (ist <= soll) return { fulfilment: 1, note: 'Passt zum gesuchten Zeitpunkt.' };
  // Je Monat Verzug 10 % — nach zehn Monaten Differenz bleibt nichts übrig.
  return {
    fulfilment: Math.max(0, 1 - (ist - soll) * 0.1),
    note: `Du möchtest später anfangen als gesucht (${labelFuer('start', k.start!)}).`,
  };
}

/**
 * Vollständige Bewertung einer Stelle für einen Handwerker.
 * Fällt sie durch ein Ausschlusskriterium, ist `passed` false und der Score 0 —
 * die Aufrufer blenden solche Stellen aus.
 */
export function bewerte(
  anf: Anforderungsprofil,
  k: Kandidatenprofil,
): MatchBreakdown {
  const knockouts = ausschlusskriterien(anf, k);
  const gewicht = (key: KriteriumKey) =>
    anf.gewichte?.[key] ?? STANDARD_GEWICHTE[key];

  const zeilen: KriteriumZeile[] = [];
  const pruefe = (
    key: KriteriumKey,
    label: string,
    required: string,
    answer: string,
    anwendbar: boolean,
    bewerten: () => { fulfilment: number; note: string },
  ) => {
    const w = gewicht(key);
    if (!anwendbar || w <= 0) {
      zeilen.push({
        key,
        label,
        required,
        answer,
        weight: w,
        fulfilment: 0,
        penalty: 0,
        maxPenalty: 0,
        skipped: true,
      });
      return;
    }
    const { fulfilment, note } = bewerten();
    const f = Math.min(1, Math.max(0, fulfilment));
    zeilen.push({
      key,
      label,
      required,
      answer,
      weight: w,
      fulfilment: runde2(f),
      penalty: runde2(w * (1 - f)),
      maxPenalty: w,
      skipped: false,
      note,
    });
  };

  pruefe(
    'aufgaben',
    'Aufgabenbereiche',
    anf.aufgaben.map((a) => labelFuer('aufgabe', a)).join(', ') || '—',
    k.aufgaben.map((a) => labelFuer('aufgabe', a)).join(', ') || '—',
    anf.aufgaben.length > 0 && k.aufgaben.length > 0,
    () => bewerteAufgaben(anf, k),
  );

  pruefe(
    'erfahrung',
    'Berufserfahrung',
    anf.erfahrungMin || anf.erfahrungMax
      ? `${labelFuer('erfahrung', anf.erfahrungMin ?? 'keine')} bis ${labelFuer('erfahrung', anf.erfahrungMax ?? 'ueber_10')}`
      : '—',
    k.erfahrung ? labelFuer('erfahrung', k.erfahrung) : '—',
    rangErfahrung(k.erfahrung) != null &&
      (anf.erfahrungMin != null || anf.erfahrungMax != null),
    () => bewerteErfahrung(anf, k),
  );

  pruefe(
    'beruf',
    'Ausbildungsberuf',
    anf.berufe.map((b) => labelFuer('beruf', b)).join(', ') || '—',
    k.beruf ? labelFuer('beruf', k.beruf) : '—',
    anf.berufe.length > 0 && !!k.beruf,
    () => bewerteBeruf(anf, k),
  );

  pruefe(
    'prioritaeten',
    'Deine Prioritäten',
    anf.gebotenes.map((p) => labelFuer('prio', p)).join(', ') || '—',
    k.prioritaeten.map((p) => labelFuer('prio', p)).join(', ') || '—',
    // Hat der Betrieb gar nichts hinterlegt, ist das keine Aussage über die
    // Stelle — dann darf sie dafür auch nicht abgewertet werden.
    k.prioritaeten.length > 0 && anf.gebotenes.length > 0,
    () => bewertePrioritaeten(anf, k),
  );

  pruefe(
    'fuehrerschein',
    'Führerschein',
    anf.fuehrerscheinMin ? labelFuer('fuehrerschein', anf.fuehrerscheinMin) : '—',
    k.fuehrerschein ? labelFuer('fuehrerschein', k.fuehrerschein) : '—',
    rangFuehrerschein(anf.fuehrerscheinMin) != null &&
      rangFuehrerschein(anf.fuehrerscheinMin)! > 0 &&
      rangFuehrerschein(k.fuehrerschein) != null,
    () => bewerteFuehrerschein(anf, k),
  );

  pruefe(
    'start',
    'Startzeitpunkt',
    anf.startBis ? labelFuer('start', anf.startBis) : '—',
    k.start ? labelFuer('start', k.start) : '—',
    rangStart(anf.startBis) != null && rangStart(k.start) != null,
    () => bewerteStart(anf, k),
  );

  const bewertet = zeilen.filter((z) => !z.skipped);
  const totalPenalty = runde2(bewertet.reduce((s, z) => s + z.penalty, 0));
  const totalMaxPenalty = bewertet.reduce((s, z) => s + z.maxPenalty, 0);
  const baseScore =
    totalMaxPenalty > 0
      ? Math.min(100, Math.max(0, Math.round(100 * (1 - totalPenalty / totalMaxPenalty))))
      : 100;

  const passed = knockouts.length === 0;
  return {
    passed,
    knockouts,
    criteria: zeilen,
    totalPenalty,
    totalMaxPenalty,
    baseScore: passed ? baseScore : 0,
    adjustments: [],
    score: passed ? baseScore : 0,
    formula: totalMaxPenalty > 0 ? FORMEL : FORMEL_OHNE,
    aiScore: null,
  };
}
