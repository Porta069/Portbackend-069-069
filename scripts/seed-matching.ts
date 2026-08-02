/**
 * Seed: Matching-Fragenkatalog + Test-Unternehmen.
 *
 * Idempotent — mehrfaches Ausführen aktualisiert statt zu duplizieren.
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

// ── Fragenkatalog ────────────────────────────────────────────────────────────
// answerKey verweist auf die Onboarding-Antworten der Handwerker
// (User.profileData); ":option" bedeutet Checkbox-Mitgliedschaft (0/1).
const QUESTIONS = [
  {
    key: 'erfahrung',
    label: 'Berufserfahrung',
    hint: 'Jahre im Gewerk (aus der Registrierung).',
    scaleMin: 0,
    scaleMax: 40,
    unit: 'Jahre',
    answerKey: 'aiAnswers.ai_erfahrung',
    valueMap: null as Record<string, number> | null,
    defaultWeight: 3,
    sortOrder: 1,
  },
  {
    key: 'auftragsart',
    label: 'Bevorzugte Auftragsart',
    hint: '1 = Privataufträge, 2 = beides, 3 = Großprojekte.',
    scaleMin: 1,
    scaleMax: 3,
    unit: '',
    answerKey: 'aiAnswers.ai_auftragsart',
    valueMap: { privat: 1, beides: 2, gross: 3 },
    defaultWeight: 1,
    sortOrder: 2,
  },
  {
    key: 'umfeld',
    label: 'Bevorzugte Betriebsgröße',
    hint: '1 = kleiner Betrieb, 2 = Mittelstand, 3 = Großunternehmen. „Egal“ passt überall.',
    scaleMin: 1,
    scaleMax: 3,
    unit: '',
    answerKey: 'surveyAnswers.survey_umfeld',
    valueMap: { klein: 1, mittel: 2, gross: 3 },
    defaultWeight: 1,
    sortOrder: 3,
  },
  {
    key: 'meister',
    label: 'Meisterbrief',
    hint: '0 = nein, 1 = ja.',
    scaleMin: 0,
    scaleMax: 1,
    unit: '',
    answerKey: 'aiAnswers.ai_zertifikate:meister',
    valueMap: null,
    defaultWeight: 2,
    sortOrder: 4,
  },
  {
    key: 'geselle',
    label: 'Gesellenbrief',
    hint: '0 = nein, 1 = ja.',
    scaleMin: 0,
    scaleMax: 1,
    unit: '',
    answerKey: 'aiAnswers.ai_zertifikate:geselle',
    valueMap: null,
    defaultWeight: 2,
    sortOrder: 5,
  },
  {
    key: 'fuehrerschein',
    label: 'Führerschein Kl. B / BE',
    hint: '0 = nein, 1 = ja.',
    scaleMin: 0,
    scaleMax: 1,
    unit: '',
    answerKey: 'aiAnswers.ai_zertifikate:fuehrerschein',
    valueMap: null,
    defaultWeight: 2,
    sortOrder: 6,
  },
  {
    key: 'montagebereitschaft',
    label: 'Bereitschaft: Montage / Reisetätigkeit',
    hint: '0 = nein, 1 = ja.',
    scaleMin: 0,
    scaleMax: 1,
    unit: '',
    answerKey: 'surveyAnswers.survey_bereitschaft:montage',
    valueMap: null,
    defaultWeight: 2,
    sortOrder: 7,
  },
  {
    key: 'schichtbereitschaft',
    label: 'Bereitschaft: Schichtarbeit',
    hint: '0 = nein, 1 = ja.',
    scaleMin: 0,
    scaleMax: 1,
    unit: '',
    answerKey: 'surveyAnswers.survey_bereitschaft:schicht',
    valueMap: null,
    defaultWeight: 1,
    sortOrder: 8,
  },
  {
    key: 'notdienstbereitschaft',
    label: 'Bereitschaft: Notdienst / Rufbereitschaft',
    hint: '0 = nein, 1 = ja.',
    scaleMin: 0,
    scaleMax: 1,
    unit: '',
    answerKey: 'surveyAnswers.survey_bereitschaft:notdienst',
    valueMap: null,
    defaultWeight: 1,
    sortOrder: 9,
  },
];

// ── Test-Unternehmen ─────────────────────────────────────────────────────────
interface SeedJob {
  title: string;
  gewerk: string;
  description: string;
  tags: string[];
  city: string;
  lat: number;
  lng: number;
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
  plz: string;
  ort: string;
  lat: number;
  lng: number;
  montage: string;
  urlaubstage: number;
  benefits: string[];
  kontaktName: string;
  jobs: SeedJob[];
}

const COMPANIES: SeedCompany[] = [
  {
    name: 'TEST Elektro Streng GmbH [Erf 8-40 ×5 · Meister ×5 · Montage ×3]',
    email: 'elektro-streng@portawerk-test.de',
    slogan: 'Testbetrieb: hohe Anforderungen, hohe Gewichte',
    description:
      'Seed-Testdaten. Dieser Betrieb verlangt viel Erfahrung (Range 8–40, Gewicht 5), ' +
      'einen Meisterbrief (Gewicht 5) und Montagebereitschaft (Gewicht 3). Profile ohne ' +
      'Meister und mit wenig Erfahrung müssen hier einen deutlich niedrigeren Score sehen.',
    plz: '80331',
    ort: 'München',
    lat: 48.1374,
    lng: 11.5755,
    montage: 'Gelegentlich Montage',
    urlaubstage: 30,
    benefits: ['Firmenwagen', 'Übertarifliche Bezahlung'],
    kontaktName: 'Testkontakt Streng',
    jobs: [
      {
        title: 'Elektriker Gebäudetechnik [streng: Erf 8-40 ×5, Meister ×5]',
        gewerk: 'Elektriker / Elektroniker',
        description:
          'Test-Inserat mit strengen Kriterien: Berufserfahrung Range 8–40 (Gewicht 5), ' +
          'Meisterbrief Pflichtwunsch (Range 1–1, Gewicht 5), Montagebereitschaft (Range 1–1, Gewicht 3).',
        tags: ['Gebäudetechnik', 'Test: streng'],
        city: 'München',
        lat: 48.1374,
        lng: 11.5755,
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
      'Seed-Testdaten. Einziges Kriterium ist Berufserfahrung mit voller Range 0–40 und ' +
      'Gewicht 1 — jede Antwort liegt in der Range. Jeder Handwerker muss hier Score 100 sehen.',
    plz: '80686',
    ort: 'München',
    lat: 48.1298,
    lng: 11.5021,
    montage: 'Jeden Abend zuhause',
    urlaubstage: 28,
    benefits: ['4-Tage-Woche', 'Weiterbildung & Schulungen'],
    kontaktName: 'Testkontakt Locker',
    jobs: [
      {
        title: 'Elektriker Kundendienst [locker: alle Scores 100]',
        gewerk: 'Elektriker / Elektroniker',
        description:
          'Test-Inserat ohne echte Hürden: Berufserfahrung Range 0–40, Gewicht 1. ' +
          'Erwarteter Match-Score für jedes vollständige Profil: 100.',
        tags: ['Kundendienst', 'Test: locker'],
        city: 'München',
        lat: 48.1298,
        lng: 11.5021,
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
      'Seed-Testdaten. Erfahrung Range 3–10 (Gewicht 3): wer z. B. 15 Jahre hat, liegt 5 über ' +
      'der Range → Differenz 5 × Gewicht 3 = 15 Strafpunkte. Dazu Gesellenbrief (×2) und ' +
      'Führerschein (×2). Gut, um die Range-Logik nach OBEN zu prüfen.',
    plz: '20095',
    ort: 'Hamburg',
    lat: 53.5511,
    lng: 9.9937,
    montage: 'Jeden Abend zuhause',
    urlaubstage: 30,
    benefits: ['Betriebliche Altersvorsorge', 'Weiterbildung & Schulungen'],
    kontaktName: 'Testkontakt Mitte',
    jobs: [
      {
        title: 'Anlagenmechaniker SHK [mittel: Erf 3-10 ×3]',
        gewerk: 'Installateur / Klempner (SHK)',
        description:
          'Test-Inserat mit mittleren Kriterien: Erfahrung Range 3–10 (Gewicht 3), ' +
          'Gesellenbrief Range 1–1 (Gewicht 2), Führerschein Range 1–1 (Gewicht 2).',
        tags: ['Sanitär', 'Heizung', 'Test: mittel'],
        city: 'Hamburg',
        lat: 53.5511,
        lng: 9.9937,
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
    name: 'TEST Maler Range Berlin [Erf 2-6 ×2 · Betrieb klein-mittel ×1]',
    email: 'maler-range@portawerk-test.de',
    slogan: 'Testbetrieb: enge Range + Betriebsgrößen-Frage',
    description:
      'Seed-Testdaten. Enge Erfahrungs-Range 2–6 (Gewicht 2) und Betriebsgröße Range 1–2 ' +
      '(Gewicht 1): Wer „Großes Bauunternehmen“ (3) bevorzugt, bekommt Differenz 1 × Gewicht 1. ' +
      'Wer „egal“ gewählt hat, wird bei dieser Frage übersprungen.',
    plz: '10115',
    ort: 'Berlin',
    lat: 52.52,
    lng: 13.405,
    montage: 'Jeden Abend zuhause',
    urlaubstage: 28,
    benefits: ['Unbefristeter Vertrag'],
    kontaktName: 'Testkontakt Range',
    jobs: [
      {
        title: 'Maler & Lackierer [Range-Test: Erf 2-6 ×2, Umfeld 1-2 ×1]',
        gewerk: 'Maler & Lackierer',
        description:
          'Test-Inserat für die Range-Logik: Erfahrung 2–6 (Gewicht 2), bevorzugte ' +
          'Betriebsgröße 1–2 (Gewicht 1). Beispiel: 9 Jahre Erfahrung → Differenz 3 × 2 = 6 Strafpunkte.',
        tags: ['Innenausbau', 'Test: Range'],
        city: 'Berlin',
        lat: 52.52,
        lng: 13.405,
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

  // 2) Test-Unternehmen inkl. Account + Inserate.
  for (const c of COMPANIES) {
    let company = await prisma.company.findFirst({ where: { name: c.name } });
    const companyData = {
      name: c.name,
      slogan: c.slogan,
      description: c.description,
      plz: c.plz,
      ort: c.ort,
      lat: c.lat,
      lng: c.lng,
      montage: c.montage,
      urlaubstage: c.urlaubstage,
      benefits: c.benefits,
      kontaktName: c.kontaktName,
      kontaktEmail: c.email,
      source: 'ADMIN' as const,
      managedNote: 'Seed-Testdaten (Matching-Verifikation) — später löschen.',
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

    // Inserate deterministisch neu aufbauen (Titel als Schlüssel).
    for (const j of c.jobs) {
      const existing = await prisma.jobPosting.findFirst({
        where: { companyId: company.id, title: j.title },
      });
      if (existing) {
        await prisma.jobPosting.delete({ where: { id: existing.id } });
      }
      await prisma.jobPosting.create({
        data: {
          companyId: company.id,
          title: j.title,
          gewerk: j.gewerk,
          description: j.description,
          tags: j.tags,
          city: j.city,
          lat: j.lat,
          lng: j.lng,
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

  console.log(`\nAlle Test-Accounts: Passwort "${TEST_PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
