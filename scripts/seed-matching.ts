/**
 * Seed: Matching-Fragenkatalog + Test-Unternehmen (alle in Heilbronn).
 *
 * Idempotent — Unternehmen werden über ihre kontaktEmail wiedererkannt und
 * aktualisiert; als Seed markierte Firmen, die nicht mehr in der Liste stehen,
 * werden mitsamt Account/Inseraten entfernt.
 *
 * Ausführen (lokal):   npx ts-node scripts/seed-matching.ts
 * Ausführen (Prod):    DATABASE_URL=<POOLER> DIRECT_URL=<POOLER> npx ts-node scripts/seed-matching.ts
 *
 * Die Test-Unternehmen tragen ihre Matching-Eigenschaften IM NAMEN, damit sich
 * Scores auf einen Blick nachrechnen lassen (z. B. "Erf 8-40 ×5" = Kriterium
 * Berufserfahrung, Range 8–40, Gewicht 5). Alle Accounts nutzen dasselbe
 * Passwort (nur Testdaten!) mit unterschiedlichen E-Mail-Adressen.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/crypto/password.util';

const prisma = new PrismaClient();

const TEST_PASSWORD = 'PortaTest#2026';
const SEED_NOTE = 'Seed-Testdaten (Matching-Verifikation) — später löschen.';

// ── Fragenkatalog ────────────────────────────────────────────────────────────
const QUESTIONS = [
  { key: 'erfahrung', label: 'Berufserfahrung', hint: 'Jahre im Gewerk (aus der Registrierung).', scaleMin: 0, scaleMax: 40, unit: 'Jahre', answerKey: 'aiAnswers.ai_erfahrung', valueMap: null as Record<string, number> | null, defaultWeight: 3, sortOrder: 1 },
  { key: 'auftragsart', label: 'Bevorzugte Auftragsart', hint: '1 = Privataufträge, 2 = beides, 3 = Großprojekte.', scaleMin: 1, scaleMax: 3, unit: '', answerKey: 'aiAnswers.ai_auftragsart', valueMap: { privat: 1, beides: 2, gross: 3 }, defaultWeight: 1, sortOrder: 2 },
  { key: 'umfeld', label: 'Bevorzugte Betriebsgröße', hint: '1 = kleiner Betrieb, 2 = Mittelstand, 3 = Großunternehmen. „Egal“ passt überall.', scaleMin: 1, scaleMax: 3, unit: '', answerKey: 'surveyAnswers.survey_umfeld', valueMap: { klein: 1, mittel: 2, gross: 3 }, defaultWeight: 1, sortOrder: 3 },
  { key: 'meister', label: 'Meisterbrief', hint: '0 = nein, 1 = ja.', scaleMin: 0, scaleMax: 1, unit: '', answerKey: 'aiAnswers.ai_zertifikate:meister', valueMap: null, defaultWeight: 2, sortOrder: 4 },
  { key: 'geselle', label: 'Gesellenbrief', hint: '0 = nein, 1 = ja.', scaleMin: 0, scaleMax: 1, unit: '', answerKey: 'aiAnswers.ai_zertifikate:geselle', valueMap: null, defaultWeight: 2, sortOrder: 5 },
  { key: 'fuehrerschein', label: 'Führerschein Kl. B / BE', hint: '0 = nein, 1 = ja.', scaleMin: 0, scaleMax: 1, unit: '', answerKey: 'aiAnswers.ai_zertifikate:fuehrerschein', valueMap: null, defaultWeight: 2, sortOrder: 6 },
  { key: 'montagebereitschaft', label: 'Bereitschaft: Montage / Reisetätigkeit', hint: '0 = nein, 1 = ja.', scaleMin: 0, scaleMax: 1, unit: '', answerKey: 'surveyAnswers.survey_bereitschaft:montage', valueMap: null, defaultWeight: 2, sortOrder: 7 },
  { key: 'schichtbereitschaft', label: 'Bereitschaft: Schichtarbeit', hint: '0 = nein, 1 = ja.', scaleMin: 0, scaleMax: 1, unit: '', answerKey: 'surveyAnswers.survey_bereitschaft:schicht', valueMap: null, defaultWeight: 1, sortOrder: 8 },
  { key: 'notdienstbereitschaft', label: 'Bereitschaft: Notdienst / Rufbereitschaft', hint: '0 = nein, 1 = ja.', scaleMin: 0, scaleMax: 1, unit: '', answerKey: 'surveyAnswers.survey_bereitschaft:notdienst', valueMap: null, defaultWeight: 1, sortOrder: 9 },
];

// ── Test-Unternehmen — alle in Heilbronn, unterschiedliche Adressen ──────────
// Bewusst gestreut in Größe, Benefits (Firmenwagen ja/nein …), Gehalt und
// Kriterien, damit Liste, Sortierung und der tabellarische VERGLEICH etwas
// Unterscheidbares zeigen.

interface SeedJob {
  title: string;
  gewerk: string;
  description: string;
  tags: string[];
  salaryMin: number;
  salaryMax: number;
  montage: string;
  fahrzeitIstArbeitszeit: boolean;
  startpunkt: string;
  urlaubstage: number;
  extras: string[];
  criteria: { key: string; min: number; max: number; weight: number }[];
}

interface SeedCompany {
  name: string;
  email: string;
  slogan: string;
  description: string;
  strasse: string;
  plz: string;
  lat: number;
  lng: number;
  gruendungsjahr: string;
  mitarbeiter: string;
  website: string;
  montage: string;
  urlaubstage: number;
  benefits: string[];
  kontaktName: string;
  jobs: SeedJob[];
}

const ORT = 'Heilbronn';

const COMPANIES: SeedCompany[] = [
  {
    name: 'TEST Elektro Streng GmbH [Erf 8-40 ×5 · Meister ×5 · Montage ×3]',
    email: 'elektro-streng@portawerk-test.de',
    slogan: 'Testbetrieb: hohe Anforderungen, hohe Gewichte',
    description:
      'Seed-Testdaten. Dieser Betrieb verlangt viel Erfahrung (Range 8–40, Gewicht 5), einen ' +
      'Meisterbrief (Gewicht 5) und Montagebereitschaft (Gewicht 3). Profile ohne Meister und mit ' +
      'wenig Erfahrung müssen hier einen deutlich niedrigeren Score sehen.\n\n' +
      'Seit 1998 in Heilbronn: Gebäudetechnik, Industrieanlagen und Schaltschrankbau für Kunden in ' +
      'der ganzen Region. Eigene Prüfabteilung, moderner Fuhrpark, feste Teams.',
    strasse: 'Kaiserstraße 17',
    plz: '74072',
    lat: 49.1417,
    lng: 9.2185,
    gruendungsjahr: '1998',
    mitarbeiter: '45',
    website: 'https://elektro-streng.example.de',
    montage: 'Gelegentlich Montage',
    urlaubstage: 30,
    benefits: ['Firmenwagen', 'Übertarifliche Bezahlung'],
    kontaktName: 'Testkontakt Streng',
    jobs: [
      {
        title: 'Elektriker Gebäudetechnik [streng: Erf 8-40 ×5, Meister ×5]',
        gewerk: 'Elektriker / Elektroniker',
        description:
          'Test-Inserat mit strengen Kriterien: Berufserfahrung Range 8–40 (Gewicht 5), Meisterbrief ' +
          '(Range 1–1, Gewicht 5), Montagebereitschaft (Range 1–1, Gewicht 3).\n\nSie übernehmen die ' +
          'technische Verantwortung auf unseren Baustellen in und um Heilbronn, führen ein kleines Team ' +
          'und stimmen sich direkt mit der Projektleitung ab.',
        tags: ['Gebäudetechnik', 'Test: streng'],
        salaryMin: 3400,
        salaryMax: 4200,
        montage: 'Gelegentlich Montage',
        fahrzeitIstArbeitszeit: true,
        startpunkt: 'Haustür',
        urlaubstage: 30,
        extras: ['Firmenwagen'],
        criteria: [
          { key: 'erfahrung', min: 8, max: 40, weight: 5 },
          { key: 'meister', min: 1, max: 1, weight: 5 },
          { key: 'montagebereitschaft', min: 1, max: 1, weight: 3 },
        ],
      },
    ],
  },
  {
    name: 'TEST Elektro Locker GmbH [Erf 0-40 ×1 · sonst nichts]',
    email: 'elektro-locker@portawerk-test.de',
    slogan: 'Testbetrieb: nimmt praktisch jeden — Score muss ~100 sein',
    description:
      'Seed-Testdaten. Einziges Kriterium ist Berufserfahrung mit voller Range 0–40 und Gewicht 1 — ' +
      'jede Antwort liegt in der Range. Jeder Handwerker muss hier Score 100 sehen.\n\n' +
      'Junger Kundendienst-Betrieb (gegründet 2015) mit Schwerpunkt Wohnungswirtschaft: kleine ' +
      'Reparaturen, Zählerwechsel, Smart-Home-Nachrüstung. 4-Tage-Woche als Standard.',
    strasse: 'Allee 40',
    plz: '74072',
    lat: 49.1399,
    lng: 9.2205,
    gruendungsjahr: '2015',
    mitarbeiter: '12',
    website: 'https://elektro-locker.example.de',
    montage: 'Jeden Abend zuhause',
    urlaubstage: 28,
    benefits: ['4-Tage-Woche', 'Weiterbildung & Schulungen'],
    kontaktName: 'Testkontakt Locker',
    jobs: [
      {
        title: 'Elektriker Kundendienst [locker: alle Scores 100]',
        gewerk: 'Elektriker / Elektroniker',
        description:
          'Test-Inserat ohne echte Hürden: Berufserfahrung Range 0–40, Gewicht 1. Erwarteter ' +
          'Match-Score für jedes vollständige Profil: 100.\n\nKundendiensttouren in Heilbronn und ' +
          'Umgebung, jeden Abend zuhause, Übergabe des Servicefahrzeugs an der Haustür.',
        tags: ['Kundendienst', 'Test: locker'],
        salaryMin: 2900,
        salaryMax: 3500,
        montage: 'Jeden Abend zuhause',
        fahrzeitIstArbeitszeit: true,
        startpunkt: 'Haustür',
        urlaubstage: 28,
        extras: ['Unbefristet'],
        criteria: [{ key: 'erfahrung', min: 0, max: 40, weight: 1 }],
      },
    ],
  },
  {
    name: 'TEST SHK Mitte KG [Erf 3-10 ×3 · Geselle ×2 · Führerschein ×2]',
    email: 'shk-mitte@portawerk-test.de',
    slogan: 'Testbetrieb: mittlere Anforderungen im SHK-Bereich',
    description:
      'Seed-Testdaten. Erfahrung Range 3–10 (Gewicht 3): wer z. B. 15 Jahre hat, liegt 5 über der ' +
      'Range → Differenz 5 × Gewicht 3 = 15 Strafpunkte. Dazu Gesellenbrief (×2) und Führerschein ' +
      '(×2). Gut, um die Range-Logik nach OBEN zu prüfen.\n\nFamiliengeführter Heizungs- und ' +
      'Sanitärbetrieb im Heilbronner Süden, stark im Wärmepumpen-Umbau.',
    strasse: 'Sülmerstraße 72',
    plz: '74072',
    lat: 49.1445,
    lng: 9.2168,
    gruendungsjahr: '2004',
    mitarbeiter: '28',
    website: 'https://shk-mitte.example.de',
    montage: 'Jeden Abend zuhause',
    urlaubstage: 30,
    benefits: ['Betriebliche Altersvorsorge', 'Weiterbildung & Schulungen'],
    kontaktName: 'Testkontakt Mitte',
    jobs: [
      {
        title: 'Anlagenmechaniker SHK [mittel: Erf 3-10 ×3]',
        gewerk: 'Installateur / Klempner (SHK)',
        description:
          'Test-Inserat mit mittleren Kriterien: Erfahrung Range 3–10 (Gewicht 3), Gesellenbrief ' +
          '(Gewicht 2), Führerschein (Gewicht 2).\n\nEinbau und Wartung von Wärmepumpen und ' +
          'Gasthermen, überwiegend Bestandskunden im Stadtgebiet.',
        tags: ['Sanitär', 'Heizung', 'Test: mittel'],
        salaryMin: 3000,
        salaryMax: 3700,
        montage: 'Jeden Abend zuhause',
        fahrzeitIstArbeitszeit: true,
        startpunkt: 'Haustür',
        urlaubstage: 30,
        extras: ['Weiterbildung'],
        criteria: [
          { key: 'erfahrung', min: 3, max: 10, weight: 3 },
          { key: 'geselle', min: 1, max: 1, weight: 2 },
          { key: 'fuehrerschein', min: 1, max: 1, weight: 2 },
        ],
      },
    ],
  },
  {
    name: 'TEST Maler Range GmbH [Erf 2-6 ×2 · Betrieb klein-mittel ×1]',
    email: 'maler-range@portawerk-test.de',
    slogan: 'Testbetrieb: enge Range + Betriebsgrößen-Frage',
    description:
      'Seed-Testdaten. Enge Erfahrungs-Range 2–6 (Gewicht 2) und Betriebsgröße Range 1–2 (Gewicht 1): ' +
      'Wer „Großes Bauunternehmen“ (3) bevorzugt, bekommt Differenz 1 × Gewicht 1. Wer „egal“ gewählt ' +
      'hat, wird bei dieser Frage übersprungen.\n\nKleiner Malerbetrieb mit Fokus auf hochwertigen ' +
      'Innenausbau, kein Firmenwagen — gut für den Vergleich.',
    strasse: 'Wollhausstraße 121',
    plz: '74074',
    lat: 49.1371,
    lng: 9.2249,
    gruendungsjahr: '2019',
    mitarbeiter: '8',
    website: '',
    montage: 'Jeden Abend zuhause',
    urlaubstage: 28,
    benefits: ['Unbefristeter Vertrag'],
    kontaktName: 'Testkontakt Range',
    jobs: [
      {
        title: 'Maler & Lackierer [Range-Test: Erf 2-6 ×2, Umfeld 1-2 ×1]',
        gewerk: 'Maler & Lackierer',
        description:
          'Test-Inserat für die Range-Logik: Erfahrung 2–6 (Gewicht 2), bevorzugte Betriebsgröße 1–2 ' +
          '(Gewicht 1). Beispiel: 9 Jahre Erfahrung → Differenz 3 × 2 = 6 Strafpunkte.\n\n' +
          'Innenausbau in Alt- und Neubauten, Baustellen fast ausschließlich im Stadtgebiet Heilbronn.',
        tags: ['Innenausbau', 'Test: Range'],
        salaryMin: 2600,
        salaryMax: 3200,
        montage: 'Jeden Abend zuhause',
        fahrzeitIstArbeitszeit: false,
        startpunkt: 'Betrieb',
        urlaubstage: 28,
        extras: [],
        criteria: [
          { key: 'erfahrung', min: 2, max: 6, weight: 2 },
          { key: 'umfeld', min: 1, max: 2, weight: 1 },
        ],
      },
    ],
  },
  {
    name: 'TEST Dach Hoch GmbH [Montage ×3 · Erf 5-40 ×2]',
    email: 'dach-hoch@portawerk-test.de',
    slogan: 'Testbetrieb: Montagebereitschaft entscheidet',
    description:
      'Seed-Testdaten. Montagebereitschaft (Range 1–1, Gewicht 3) plus Erfahrung 5–40 (Gewicht 2): ' +
      'Wer keine Montage will, verliert hier am meisten Score — Kontrast zum Kundendienst-Betrieb.\n\n' +
      'Dachdeckerei mit Industriekunden in ganz Baden-Württemberg, Auslöse und Firmenwagen inklusive.',
    strasse: 'Neckargartacher Straße 90',
    plz: '74080',
    lat: 49.1503,
    lng: 9.1948,
    gruendungsjahr: '1989',
    mitarbeiter: '35',
    website: 'https://dach-hoch.example.de',
    montage: 'Dauermontage',
    urlaubstage: 30,
    benefits: ['Firmenwagen', 'Übertarifliche Bezahlung', 'Betriebliche Altersvorsorge'],
    kontaktName: 'Testkontakt Hoch',
    jobs: [
      {
        title: 'Dachdecker Montage [Montage-Test: Montage ×3, Erf 5-40 ×2]',
        gewerk: 'Dachdecker',
        description:
          'Test-Inserat: Montagebereitschaft Range 1–1 (Gewicht 3), Erfahrung 5–40 (Gewicht 2). Ohne ' +
          'Montagebereitschaft: Differenz 1 × 3 = 3 Strafpunkte von maximal 3 — der Score fällt spürbar.\n\n' +
          'Flachdach-Großprojekte, montags Anreise ab Betrieb, Auslöse nach Tarif.',
        tags: ['Flachdach', 'Test: Montage'],
        salaryMin: 3200,
        salaryMax: 4000,
        montage: 'Dauermontage',
        fahrzeitIstArbeitszeit: true,
        startpunkt: 'Betrieb',
        urlaubstage: 30,
        extras: ['Auslöse', 'Firmenwagen'],
        criteria: [
          { key: 'montagebereitschaft', min: 1, max: 1, weight: 3 },
          { key: 'erfahrung', min: 5, max: 40, weight: 2 },
        ],
      },
    ],
  },
  {
    name: 'TEST Tischler Fein & Söhne [Erf 4-12 ×3 · kleiner Betrieb ×2 · Privat ×2]',
    email: 'tischler-fein@portawerk-test.de',
    slogan: 'Testbetrieb: Wunschprofil kleiner Familienbetrieb',
    description:
      'Seed-Testdaten. Erfahrung 4–12 (Gewicht 3), bevorzugte Betriebsgröße GENAU „klein“ (Range 1–1, ' +
      'Gewicht 2) und Auftragsart Privat bis beides (Range 1–2, Gewicht 2). Wer Großprojekte (3) ' +
      'bevorzugt, bekommt hier Abzug in zwei Fragen.\n\nSchreinerei in dritter Generation: Möbel, ' +
      'Einbauschränke, Restaurierung. Sechs Mitarbeiter, eigene Werkstatt am Rand der Innenstadt.',
    strasse: 'Olgastraße 55',
    plz: '74072',
    lat: 49.1389,
    lng: 9.2141,
    gruendungsjahr: '1974',
    mitarbeiter: '6',
    website: '',
    montage: 'Jeden Abend zuhause',
    urlaubstage: 27,
    benefits: ['Weiterbildung & Schulungen'],
    kontaktName: 'Testkontakt Fein',
    jobs: [
      {
        title: 'Tischler Möbelbau [Familien-Test: Erf 4-12 ×3, klein ×2, privat ×2]',
        gewerk: 'Tischler / Schreiner',
        description:
          'Test-Inserat: Erfahrung 4–12 (Gewicht 3), Betriebsgröße 1–1 (Gewicht 2), Auftragsart 1–2 ' +
          '(Gewicht 2).\n\nMassivholzmöbel und Innenausbau für Privatkunden, Fertigung in der eigenen ' +
          'Werkstatt, Montage beim Kunden in Heilbronn und Umgebung.',
        tags: ['Möbelbau', 'Test: Familienbetrieb'],
        salaryMin: 2800,
        salaryMax: 3400,
        montage: 'Jeden Abend zuhause',
        fahrzeitIstArbeitszeit: false,
        startpunkt: 'Betrieb',
        urlaubstage: 27,
        extras: ['Gutes Team'],
        criteria: [
          { key: 'erfahrung', min: 4, max: 12, weight: 3 },
          { key: 'umfeld', min: 1, max: 1, weight: 2 },
          { key: 'auftragsart', min: 1, max: 2, weight: 2 },
        ],
      },
    ],
  },
  {
    name: 'TEST Metall Schwer AG [Erf 6-40 ×4 · Schicht ×2 · Großbetrieb]',
    email: 'metall-schwer@portawerk-test.de',
    slogan: 'Testbetrieb: Industrie-Großbetrieb mit Schichtmodell',
    description:
      'Seed-Testdaten. Erfahrung 6–40 (Gewicht 4), Schichtbereitschaft (Gewicht 2), Führerschein ' +
      '(Gewicht 1), bevorzugte Betriebsgröße 2–3 (Gewicht 1). Bestbezahler im Testfeld — gut für die ' +
      'Sortierung „Höchstes Gehalt“ und den Vergleich (120 Mitarbeiter vs. 4 beim kleinsten).\n\n' +
      'Stahl- und Metallbau seit 1965: Hallenbau, Treppen, Sonderkonstruktionen. Eigene Lackiererei, ' +
      'zwei Schichten, 32 Urlaubstage.',
    strasse: 'Weinsberger Straße 23',
    plz: '74076',
    lat: 49.1462,
    lng: 9.2351,
    gruendungsjahr: '1965',
    mitarbeiter: '120',
    website: 'https://metall-schwer.example.de',
    montage: 'Gelegentlich Montage',
    urlaubstage: 32,
    benefits: ['Übertarifliche Bezahlung', 'Firmenwagen', 'Betriebliche Altersvorsorge'],
    kontaktName: 'Testkontakt Schwer',
    jobs: [
      {
        title: 'Metallbauer Konstruktion [Industrie-Test: Erf 6-40 ×4, Schicht ×2]',
        gewerk: 'Metallbauer / Schlosser',
        description:
          'Test-Inserat: Erfahrung 6–40 (Gewicht 4), Schichtbereitschaft 1–1 (Gewicht 2), Führerschein ' +
          '(Gewicht 1), Betriebsgröße 2–3 (Gewicht 1).\n\nSchweißen und Montieren von ' +
          'Stahlkonstruktionen in der Fertigungshalle, Zwei-Schicht-Betrieb, übertarifliche Zulagen.',
        tags: ['Stahlbau', 'Schweißen', 'Test: Industrie'],
        salaryMin: 3500,
        salaryMax: 4400,
        montage: 'Gelegentlich Montage',
        fahrzeitIstArbeitszeit: true,
        startpunkt: 'Betrieb',
        urlaubstage: 32,
        extras: ['Schichtzulage'],
        criteria: [
          { key: 'erfahrung', min: 6, max: 40, weight: 4 },
          { key: 'schichtbereitschaft', min: 1, max: 1, weight: 2 },
          { key: 'fuehrerschein', min: 1, max: 1, weight: 1 },
          { key: 'umfeld', min: 2, max: 3, weight: 1 },
        ],
      },
    ],
  },
  {
    name: 'TEST Fliesen Flott UG [Erf 0-5 ×2 · Notdienst ×1 · Junior-freundlich]',
    email: 'fliesen-flott@portawerk-test.de',
    slogan: 'Testbetrieb: sucht ausdrücklich Berufseinsteiger',
    description:
      'Seed-Testdaten. Erfahrung Range 0–5 (Gewicht 2) — hier verlieren ERFAHRENE Profile Punkte ' +
      '(15 Jahre → Differenz 10 × 2 = 20 Strafpunkte), der Umkehrfall zu allen anderen Betrieben. ' +
      'Dazu Notdienstbereitschaft (Gewicht 1).\n\nKleinster Betrieb im Testfeld (4 Mitarbeiter, ' +
      'gegründet 2022), niedrigstes Gehalt, dafür 4-Tage-Woche.',
    strasse: 'Etzelstraße 38',
    plz: '74076',
    lat: 49.1435,
    lng: 9.2299,
    gruendungsjahr: '2022',
    mitarbeiter: '4',
    website: '',
    montage: 'Jeden Abend zuhause',
    urlaubstage: 26,
    benefits: ['4-Tage-Woche'],
    kontaktName: 'Testkontakt Flott',
    jobs: [
      {
        title: 'Fliesenleger Einsteiger [Junior-Test: Erf 0-5 ×2, Notdienst ×1]',
        gewerk: 'Fliesenleger',
        description:
          'Test-Inserat mit umgekehrter Range: Erfahrung 0–5 (Gewicht 2) — erfahrene Profile bekommen ' +
          'hier bewusst Abzug. Dazu Notdienstbereitschaft 1–1 (Gewicht 1).\n\nBadsanierungen für ' +
          'Privatkunden, Anlernen durch den Chef, Werkzeug wird gestellt.',
        tags: ['Badsanierung', 'Test: Junior'],
        salaryMin: 2500,
        salaryMax: 3000,
        montage: 'Jeden Abend zuhause',
        fahrzeitIstArbeitszeit: false,
        startpunkt: 'Betrieb',
        urlaubstage: 26,
        extras: [],
        criteria: [
          { key: 'erfahrung', min: 0, max: 5, weight: 2 },
          { key: 'notdienstbereitschaft', min: 1, max: 1, weight: 1 },
        ],
      },
    ],
  },
];

async function main() {
  // 1) Fragenkatalog (upsert per key).
  for (const q of QUESTIONS) {
    await prisma.matchQuestion.upsert({
      where: { key: q.key },
      create: { ...q, valueMap: q.valueMap ?? undefined },
      update: { ...q, valueMap: q.valueMap ?? undefined },
    });
  }
  console.log(`✓ ${QUESTIONS.length} Matching-Fragen`);

  const questions = await prisma.matchQuestion.findMany();
  const questionId = new Map(questions.map((q) => [q.key, q.id]));
  const passwordHash = await hashPassword(TEST_PASSWORD);

  // 2) Verwaiste Seed-Firmen entfernen (erkannt an der Seed-Notiz).
  const emails = COMPANIES.map((c) => c.email);
  const stale = await prisma.company.findMany({
    where: { managedNote: SEED_NOTE, kontaktEmail: { notIn: emails } },
  });
  for (const s of stale) {
    await prisma.user.deleteMany({ where: { companyId: s.id, role: 'EMPLOYER' } });
    await prisma.company.delete({ where: { id: s.id } });
    console.log(`− entfernt: ${s.name}`);
  }

  // 3) Test-Unternehmen inkl. Account + Inserate (Wiedererkennung: kontaktEmail).
  for (const c of COMPANIES) {
    let company = await prisma.company.findFirst({
      where: { kontaktEmail: c.email, managedNote: SEED_NOTE },
    });
    const companyData = {
      name: c.name,
      slogan: c.slogan,
      description: c.description,
      strasse: c.strasse,
      plz: c.plz,
      ort: ORT,
      lat: c.lat,
      lng: c.lng,
      gruendungsjahr: c.gruendungsjahr,
      mitarbeiter: c.mitarbeiter,
      website: c.website,
      montage: c.montage,
      urlaubstage: c.urlaubstage,
      benefits: c.benefits,
      kontaktName: c.kontaktName,
      kontaktEmail: c.email,
      source: 'ADMIN' as const,
      managedNote: SEED_NOTE,
    };
    company = company
      ? await prisma.company.update({ where: { id: company.id }, data: companyData })
      : await prisma.company.create({ data: companyData });

    await prisma.user.upsert({
      where: { email: c.email },
      create: {
        email: c.email,
        passwordHash,
        firstName: 'Test',
        lastName: c.kontaktName,
        phone: '',
        role: 'EMPLOYER',
        companyName: c.name,
        companyId: company.id,
        emailVerified: true,
      },
      update: { companyId: company.id, companyName: c.name, passwordHash },
    });

    // Inserate deterministisch neu aufbauen (alte Seed-Inserate ersetzen).
    await prisma.jobPosting.deleteMany({
      where: { companyId: company.id, source: 'ADMIN' },
    });
    for (const j of c.jobs) {
      await prisma.jobPosting.create({
        data: {
          companyId: company.id,
          title: j.title,
          gewerk: j.gewerk,
          description: j.description,
          tags: j.tags,
          city: ORT,
          lat: c.lat,
          lng: c.lng,
          salaryMin: j.salaryMin,
          salaryMax: j.salaryMax,
          montage: j.montage,
          fahrzeitIstArbeitszeit: j.fahrzeitIstArbeitszeit,
          startpunkt: j.startpunkt,
          urlaubstage: j.urlaubstage,
          startText: 'Ab sofort',
          extras: j.extras,
          status: 'ACTIVE',
          source: 'ADMIN',
          criteria: {
            create: j.criteria.map((cr) => ({
              questionId: questionId.get(cr.key)!,
              minValue: cr.min,
              maxValue: cr.max,
              weight: cr.weight,
            })),
          },
        },
      });
    }
    console.log(`✓ ${c.name} (${c.email})`);
  }

  console.log(`\nAlle Test-Accounts: Passwort "${TEST_PASSWORD}" — alle in ${ORT}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
