/**
 * Seed: Testbetriebe und Testhandwerker für das Matching — alle in Heilbronn.
 *
 * Idempotent: Betriebe und Handwerker werden über ihre E-Mail wiedererkannt
 * und aktualisiert; als Seed markierte Firmen, die nicht mehr in der Liste
 * stehen, werden mitsamt Account und Inseraten entfernt.
 *
 * Ausführen (lokal):  npx ts-node scripts/seed-matching.ts
 * Ausführen (Prod):   DATABASE_URL=<POOLER> DIRECT_URL=<POOLER> npx ts-node scripts/seed-matching.ts
 *
 * **Aufbau der Testdaten.** Jeder Betrieb prüft möglichst genau EINE Regel,
 * und die Regel steht im Namen. Zusammen mit den drei Testhandwerkern ergibt
 * das eine Matrix, in der jeder Ausschluss und jede Gewichtung einmal greift
 * und einmal nicht — nachrechenbar ohne Blick in den Code.
 *
 * Alle Konten nutzen dasselbe Passwort (nur Testdaten!).
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/crypto/password.util';

const prisma = new PrismaClient();

const TEST_PASSWORD = 'PortaTest#2026';
const SEED_NOTE = 'Seed-Testdaten (Matching-Verifikation) — später löschen.';
const ORT = 'Heilbronn';

// ── Testhandwerker ───────────────────────────────────────────────────────────

interface SeedWorker {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** Wozu dieses Profil da ist. */
  zweck: string;
  profil: {
    bereich: string;
    ausbildungsstatus: string;
    beruf: string;
    aufgaben: string[];
    erfahrung: string;
    prioritaeten: string[];
    montage: string;
    fuehrerschein: string;
    deutsch: string;
    start: string;
  };
}

/** Arbeitsort für alle Testhandwerker — Heilbronn, damit die Entfernung nie stört. */
const ARBEITSORT = {
  id: 'seed-hn',
  label: 'Heilbronn',
  lat: 49.1427,
  lng: 9.2109,
  radiusKm: 40,
};

const WORKERS: SeedWorker[] = [
  {
    email: 'testhandwerker@portawerk-test.de',
    firstName: 'Timo',
    lastName: 'Testhandwerker',
    phone: '+4915112345678',
    zweck:
      'Der Normalfall — Elektronik, abgeschlossene Berufsausbildung, mittlere ' +
      'Erfahrung. Scheitert an Meisterpflicht und Dauermontage',
    profil: {
      bereich: 'elektronik',
      ausbildungsstatus: 'berufsausbildung',
      beruf: 'elektroniker_betriebstechnik',
      aufgaben: ['betriebstechnik', 'schaltschrankbau', 'instandhaltung_wartung'],
      erfahrung: '3_5',
      prioritaeten: ['gehalt', 'team', 'equipment'],
      montage: 'gering',
      fuehrerschein: 'b',
      deutsch: 'verhandlungssicher',
      start: 'sofort',
    },
  },
  {
    email: 'testmeister@portawerk-test.de',
    firstName: 'Martina',
    lastName: 'Testmeisterin',
    phone: '+4915112345679',
    zweck:
      'Erfüllt jede Anforderung — Meisterin, viel Erfahrung, LKW-Schein, ' +
      'Muttersprache, unbeschränkte Montage. Muss überall durchkommen',
    profil: {
      bereich: 'elektronik',
      ausbildungsstatus: 'techniker_meister',
      beruf: 'elektroniker_energie_gebaeude',
      aufgaben: [
        'energie_gebaeudetechnik',
        'pv_solar',
        'waermepumpen',
        'betriebstechnik',
        'bauleitung_projektleitung',
      ],
      erfahrung: 'ueber_10',
      prioritaeten: ['meisterstelle', 'personalverantwortung', 'firmenwagen'],
      montage: 'unbeschraenkt',
      fuehrerschein: 'c',
      deutsch: 'muttersprachlich',
      start: 'sofort',
    },
  },
  {
    email: 'testshk@portawerk-test.de',
    firstName: 'Sven',
    lastName: 'Testinstallateur',
    phone: '+4915112345680',
    zweck:
      'Anderer Ausbildungsbereich (SHK), wenig Erfahrung, nie auf Montage, ' +
      'nur Grundkenntnisse Deutsch — sieht von den Elektro-Stellen keine',
    profil: {
      bereich: 'shk',
      ausbildungsstatus: 'berufsausbildung',
      beruf: 'anlagenmechaniker_shk',
      aufgaben: ['sanitaerinstallation', 'heizungsbau', 'bad_sanierung'],
      erfahrung: '1_2',
      prioritaeten: ['team', 'urlaub'],
      montage: 'nie',
      fuehrerschein: 'b',
      deutsch: 'grundkenntnisse',
      start: '2_monate',
    },
  },
];

// ── Testbetriebe ─────────────────────────────────────────────────────────────

interface Anforderung {
  bereiche?: string[];
  berufe?: string[];
  ausbildungMin?: string;
  aufgaben?: string[];
  aufgabenMin?: number;
  erfahrungMin?: string;
  erfahrungMax?: string;
  montageMin?: string;
  fuehrerscheinMin?: string;
  deutschMin?: string;
  gebotenes?: string[];
  startBis?: string;
  gewichte?: Record<string, number>;
}

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
  anforderung: Anforderung;
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

const COMPANIES: SeedCompany[] = [
  {
    name: 'TEST Elektro Offen GmbH [keine Anforderungen]',
    email: 'elektro-offen@portawerk-test.de',
    slogan: 'Testbetrieb: Vergleichswert ohne jede Anforderung',
    description:
      'Seed-Testdaten. Dieses Inserat stellt keine einzige Anforderung. Jeder ' +
      'Handwerker muss hier durchkommen und 100 % sehen — der Bezugspunkt für ' +
      'alle anderen Testbetriebe.\n\nSeit 2005 in Heilbronn, Elektroinstallation ' +
      'für Privat- und Gewerbekunden, feste Teams und kurze Wege.',
    strasse: 'Allee 12',
    plz: '74072',
    lat: 49.1401,
    lng: 9.2201,
    gruendungsjahr: '2005',
    mitarbeiter: '18',
    website: 'https://elektro-offen.example.de',
    montage: 'Jeden Abend zuhause',
    urlaubstage: 28,
    benefits: ['Gutes Betriebsklima'],
    kontaktName: 'Testkontakt Offen',
    jobs: [
      {
        title: 'Elektriker (m/w/d) [ohne Anforderungen]',
        gewerk: 'Elektriker / Elektroniker',
        description:
          'Test-Inserat ohne Anforderungsprofil — dient als Vergleichswert.\n\n' +
          'Sie arbeiten in einem festen Team an Wohn- und Gewerbeobjekten in ' +
          'Heilbronn und Umgebung.',
        tags: ['Test: offen'],
        salaryMin: 2900,
        salaryMax: 3500,
        montage: 'Jeden Abend zuhause',
        fahrzeitIstArbeitszeit: false,
        startpunkt: 'Betrieb',
        urlaubstage: 28,
        extras: [],
        anforderung: {},
      },
    ],
  },
  {
    name: 'TEST Elektro Meisterpflicht [Ausschluss: Techniker/Meister]',
    email: 'elektro-meister@portawerk-test.de',
    slogan: 'Testbetrieb: harter Ausschluss über den Ausbildungsstand',
    description:
      'Seed-Testdaten. Verlangt mindestens Techniker/Meister. Wer nur eine ' +
      'Berufsausbildung hat, darf dieses Inserat gar nicht erst sehen.\n\n' +
      'Traditionsbetrieb seit 1987, Schwerpunkt Gebäudetechnik und Sanierung.',
    strasse: 'Wollhausstraße 40',
    plz: '74072',
    lat: 49.1385,
    lng: 9.2237,
    gruendungsjahr: '1987',
    mitarbeiter: '32',
    website: 'https://elektro-meister.example.de',
    montage: 'Gelegentlich Montage',
    urlaubstage: 30,
    benefits: ['Firmenwagen', 'Weiterbildung'],
    kontaktName: 'Testkontakt Meister',
    jobs: [
      {
        title: 'Elektromeister als Bauleiter [Ausschluss: Meisterpflicht]',
        gewerk: 'Elektriker / Elektroniker',
        description:
          'Test-Inserat mit hartem Ausschluss: mindestens Techniker/Meister.\n\n' +
          'Sie führen Baustellen eigenverantwortlich, planen Personal und ' +
          'rechnen mit dem Auftraggeber ab.',
        tags: ['Bauleitung', 'Test: Meisterpflicht'],
        salaryMin: 4000,
        salaryMax: 5200,
        montage: 'Gelegentlich Montage',
        fahrzeitIstArbeitszeit: true,
        startpunkt: 'Haustür',
        urlaubstage: 30,
        extras: ['Firmenwagen'],
        anforderung: {
          bereiche: ['elektronik'],
          ausbildungMin: 'techniker_meister',
          aufgaben: ['bauleitung_projektleitung', 'energie_gebaeudetechnik'],
          gebotenes: ['meisterstelle', 'firmenwagen', 'personalverantwortung'],
        },
      },
    ],
  },
  {
    name: 'TEST SHK Sanitär [Ausschluss: nur Bereich SHK]',
    email: 'shk-sanitaer@portawerk-test.de',
    slogan: 'Testbetrieb: harter Ausschluss über den Ausbildungsbereich',
    description:
      'Seed-Testdaten. Sucht ausschließlich Anlagenmechanik SHK. Elektroniker ' +
      'dürfen dieses Inserat nicht sehen, SHK-Profile schon.\n\n' +
      'Familienbetrieb in dritter Generation: Bäder, Heizungen, Wartung.',
    strasse: 'Weinsberger Straße 8',
    plz: '74072',
    lat: 49.1462,
    lng: 9.2264,
    gruendungsjahr: '1964',
    mitarbeiter: '14',
    website: 'https://shk-sanitaer.example.de',
    montage: 'Jeden Abend zuhause',
    urlaubstage: 27,
    benefits: ['Gutes Betriebsklima', 'Hochwertiges Werkzeug'],
    kontaktName: 'Testkontakt Sanitär',
    jobs: [
      {
        title: 'Anlagenmechaniker SHK [Ausschluss: Bereich SHK]',
        gewerk: 'Installateur / Klempner (SHK)',
        description:
          'Test-Inserat mit hartem Ausschluss über den Ausbildungsbereich.\n\n' +
          'Bäder von der Rohinstallation bis zur Übergabe, dazu Heizungs' +
          'wartung im Bestand.',
        tags: ['Sanitär', 'Test: Bereich'],
        salaryMin: 3000,
        salaryMax: 3600,
        montage: 'Jeden Abend zuhause',
        fahrzeitIstArbeitszeit: false,
        startpunkt: 'Betrieb',
        urlaubstage: 27,
        extras: ['Hochwertiges Werkzeug'],
        anforderung: {
          bereiche: ['shk'],
          aufgaben: ['sanitaerinstallation', 'bad_sanierung'],
          gebotenes: ['team', 'equipment', 'urlaub'],
        },
      },
    ],
  },
  {
    name: 'TEST Elektro Dauermontage [Ausschluss: Montage unbeschränkt]',
    email: 'elektro-montage@portawerk-test.de',
    slogan: 'Testbetrieb: harter Ausschluss über die Montagebereitschaft',
    description:
      'Seed-Testdaten. Verlangt unbeschränkte Montagebereitschaft. Wer „nie" ' +
      'oder „gering" angegeben hat, sieht dieses Inserat nicht.\n\n' +
      'Industrieelektrik bundesweit, Projekte von zwei Wochen bis sechs Monaten.',
    strasse: 'Austraße 63',
    plz: '74076',
    lat: 49.1533,
    lng: 9.2117,
    gruendungsjahr: '2011',
    mitarbeiter: '60',
    website: 'https://elektro-montage.example.de',
    montage: 'Dauermontage',
    urlaubstage: 30,
    benefits: ['Übertarifliche Bezahlung', 'Auslöse', 'Firmenwagen'],
    kontaktName: 'Testkontakt Montage',
    jobs: [
      {
        title: 'Industrieelektriker Montage [Ausschluss: Dauermontage]',
        gewerk: 'Elektriker / Elektroniker',
        description:
          'Test-Inserat mit hartem Ausschluss über die Montagebereitschaft.\n\n' +
          'Bundesweite Industrieprojekte, Montag bis Freitag auswärts, ' +
          'Wochenenden zuhause. Übernachtung und Auslöse zahlt der Betrieb.',
        tags: ['Montage', 'Industrie', 'Test: Montage'],
        salaryMin: 3800,
        salaryMax: 4600,
        montage: 'Dauermontage',
        fahrzeitIstArbeitszeit: true,
        startpunkt: 'Betrieb',
        urlaubstage: 30,
        extras: ['Auslöse', 'Firmenwagen'],
        anforderung: {
          bereiche: ['elektronik'],
          montageMin: 'unbeschraenkt',
          aufgaben: ['betriebstechnik', 'produktion_industrie'],
          gebotenes: ['gehalt', 'firmenwagen'],
        },
      },
    ],
  },
  {
    name: 'TEST Elektro Fuhrpark [Führerschein C gewichtet · Deutsch schließt aus]',
    email: 'elektro-fuhrpark@portawerk-test.de',
    slogan: 'Testbetrieb: Führerschein zählt Punkte, Sprache schließt aus',
    description:
      'Seed-Testdaten. Verlangt verhandlungssicheres Deutsch (harter ' +
      'Ausschluss) und wünscht die Klasse C. Wer nur Klasse B hat, wird NICHT ' +
      'ausgeschlossen, verliert aber Punkte — nur wer gar keinen Führerschein ' +
      'hat, fällt raus.\n\nVerkehrsanlagen und Freileitungsbau in ganz ' +
      'Baden-Württemberg.',
    strasse: 'Neckargartacher Straße 90',
    plz: '74080',
    lat: 49.1608,
    lng: 9.1936,
    gruendungsjahr: '1999',
    mitarbeiter: '75',
    website: 'https://elektro-fuhrpark.example.de',
    montage: 'Gelegentlich Montage',
    urlaubstage: 29,
    benefits: ['Firmenwagen', 'Weiterbildung'],
    kontaktName: 'Testkontakt Fuhrpark',
    jobs: [
      {
        title: 'Elektriker Verkehrsanlagen [FS C gewichtet · Deutsch Ausschluss]',
        gewerk: 'Elektriker / Elektroniker',
        description:
          'Test-Inserat: Deutsch verhandlungssicher ist Ausschlusskriterium, ' +
          'die Klasse C wird gewichtet statt vorausgesetzt.\n\n' +
          'Signalanlagen, Beleuchtung und Verkehrstechnik im Straßenraum — ' +
          'mit eigenem Fahrzeug ab Betrieb.',
        tags: ['Verkehrsanlagen', 'Test: Führerschein'],
        salaryMin: 3200,
        salaryMax: 3900,
        montage: 'Gelegentlich Montage',
        fahrzeitIstArbeitszeit: true,
        startpunkt: 'Betrieb',
        urlaubstage: 29,
        extras: ['Firmenwagen'],
        anforderung: {
          bereiche: ['elektronik'],
          fuehrerscheinMin: 'c',
          deutschMin: 'verhandlungssicher',
          aufgaben: ['verkehrsanlagen', 'energie_gebaeudetechnik'],
          gebotenes: ['firmenwagen', 'weiterbildung'],
          gewichte: { fuehrerschein: 5, aufgaben: 3 },
        },
      },
    ],
  },
  {
    name: 'TEST Elektro Senior [Erfahrung ab 6-10 Jahren ×5]',
    email: 'elektro-senior@portawerk-test.de',
    slogan: 'Testbetrieb: Erfahrung unter der Spanne kostet je Stufe die Hälfte',
    description:
      'Seed-Testdaten. Sucht 6–10 Jahre Erfahrung bei Gewicht 5. Wer 3–5 Jahre ' +
      'hat, liegt eine Stufe darunter und verliert die Hälfte der Punkte für ' +
      'dieses Kriterium; wer 1–2 Jahre hat, verliert alle.\n\n' +
      'Anspruchsvolle Gebäudeautomation für Kliniken und Rechenzentren.',
    strasse: 'Bahnhofstraße 21',
    plz: '74072',
    lat: 49.1441,
    lng: 9.2098,
    gruendungsjahr: '1993',
    mitarbeiter: '52',
    website: 'https://elektro-senior.example.de',
    montage: 'Gelegentlich Montage',
    urlaubstage: 30,
    benefits: ['Übertarifliche Bezahlung', 'Weiterbildung'],
    kontaktName: 'Testkontakt Senior',
    jobs: [
      {
        title: 'Elektroniker Automatisierung [Erfahrung 6-10 ×5]',
        gewerk: 'Elektriker / Elektroniker',
        description:
          'Test-Inserat: Erfahrungsspanne 6–10 Jahre mit Gewicht 5.\n\n' +
          'Sie programmieren und nehmen Gebäudeautomation in Betrieb, ' +
          'überwiegend im laufenden Betrieb sensibler Objekte.',
        tags: ['Automatisierung', 'Test: Erfahrung'],
        salaryMin: 3600,
        salaryMax: 4400,
        montage: 'Gelegentlich Montage',
        fahrzeitIstArbeitszeit: false,
        startpunkt: 'Betrieb',
        urlaubstage: 30,
        extras: ['Weiterbildung'],
        anforderung: {
          bereiche: ['elektronik'],
          erfahrungMin: '6_10',
          aufgaben: ['automatisierung_steuerung', 'betriebstechnik'],
          gebotenes: ['gehalt', 'weiterbildung'],
          gewichte: { erfahrung: 5, aufgaben: 2 },
        },
      },
    ],
  },
  {
    name: 'TEST Elektro Junior [Erfahrung bis 1-2 Jahre · Überqualifikation kostet wenig]',
    email: 'elektro-junior@portawerk-test.de',
    slogan: 'Testbetrieb: mehr Erfahrung als gesucht kostet nur wenig',
    description:
      'Seed-Testdaten. Sucht Berufseinsteiger (0 bis 1–2 Jahre). Wer deutlich ' +
      'mehr Erfahrung hat, wird nicht ausgeschlossen und verliert höchstens ' +
      '30 % bei diesem Kriterium — Überqualifikation ist kein Ausschluss.\n\n' +
      'Ausbildungsbetrieb mit eigener Lehrwerkstatt.',
    strasse: 'Happelstraße 17',
    plz: '74074',
    lat: 49.1339,
    lng: 9.2261,
    gruendungsjahr: '2016',
    mitarbeiter: '9',
    website: 'https://elektro-junior.example.de',
    montage: 'Jeden Abend zuhause',
    urlaubstage: 26,
    benefits: ['Weiterbildung', 'Gutes Betriebsklima'],
    kontaktName: 'Testkontakt Junior',
    jobs: [
      {
        title: 'Elektroniker Einstieg [Erfahrung 0 bis 1-2]',
        gewerk: 'Elektriker / Elektroniker',
        description:
          'Test-Inserat: Erfahrungsspanne 0 bis 1–2 Jahre.\n\n' +
          'Einstieg mit fester Betreuung: Sie arbeiten immer im Team mit einem ' +
          'erfahrenen Kollegen und übernehmen Schritt für Schritt mehr.',
        tags: ['Einstieg', 'Test: Junior'],
        salaryMin: 2600,
        salaryMax: 3100,
        montage: 'Jeden Abend zuhause',
        fahrzeitIstArbeitszeit: false,
        startpunkt: 'Betrieb',
        urlaubstage: 26,
        extras: [],
        anforderung: {
          bereiche: ['elektronik'],
          erfahrungMax: '1_2',
          aufgaben: ['energie_gebaeudetechnik'],
          gebotenes: ['weiterbildung', 'team'],
          gewichte: { erfahrung: 5, aufgaben: 1 },
        },
      },
    ],
  },
  {
    name: 'TEST Elektro Spezialist [2 von 3 Aufgabenbereichen Pflicht]',
    email: 'elektro-spezialist@portawerk-test.de',
    slogan: 'Testbetrieb: Mindestüberschneidung bei den Aufgabenbereichen',
    description:
      'Seed-Testdaten. Sucht PV, Wärmepumpen und Betriebstechnik und verlangt, ' +
      'dass mindestens ZWEI davon abgedeckt sind. Wer nur einen Bereich ' +
      'mitbringt, sieht das Inserat nicht.\n\n' +
      'Erneuerbare Energien: Photovoltaik, Speicher und Wärmepumpen.',
    strasse: 'Etzelstraße 5',
    plz: '74076',
    lat: 49.1571,
    lng: 9.2183,
    gruendungsjahr: '2018',
    mitarbeiter: '24',
    website: 'https://elektro-spezialist.example.de',
    montage: 'Gelegentlich Montage',
    urlaubstage: 30,
    benefits: ['Firmenwagen', 'Weiterbildung', 'Hochwertiges Werkzeug'],
    kontaktName: 'Testkontakt Spezialist',
    jobs: [
      {
        title: 'Elektroniker PV & Wärmepumpe [2 von 3 Bereichen Pflicht]',
        gewerk: 'Elektriker / Elektroniker',
        description:
          'Test-Inserat: drei gesuchte Aufgabenbereiche, mindestens zwei ' +
          'müssen abgedeckt sein.\n\n' +
          'Sie installieren PV-Anlagen mit Speicher und binden Wärmepumpen ' +
          'elektrisch an — überwiegend bei Privatkunden in der Region.',
        tags: ['PV', 'Wärmepumpe', 'Test: Aufgaben'],
        salaryMin: 3300,
        salaryMax: 4100,
        montage: 'Gelegentlich Montage',
        fahrzeitIstArbeitszeit: true,
        startpunkt: 'Haustür',
        urlaubstage: 30,
        extras: ['Firmenwagen', 'Hochwertiges Werkzeug'],
        anforderung: {
          bereiche: ['elektronik'],
          aufgaben: ['pv_solar', 'waermepumpen', 'betriebstechnik'],
          aufgabenMin: 2,
          gebotenes: ['equipment', 'firmenwagen', 'weiterbildung'],
          gewichte: { aufgaben: 5 },
        },
      },
    ],
  },
  {
    name: 'TEST Elektro Wunschgeber [bietet alle 11 Prioritäten]',
    email: 'elektro-wunsch@portawerk-test.de',
    slogan: 'Testbetrieb: erfüllt jeden Wunsch — Prioritäten immer 100 %',
    description:
      'Seed-Testdaten. Dieser Betrieb hakt alle elf Prioritäten ab. Das ' +
      'Kriterium „Deine Prioritäten" muss hier immer voll erfüllt sein, egal ' +
      'was der Handwerker gewählt hat.\n\n' +
      'Mittelständischer Betrieb mit ungewöhnlich breitem Angebot.',
    strasse: 'Olgastraße 32',
    plz: '74072',
    lat: 49.1395,
    lng: 9.2154,
    gruendungsjahr: '2001',
    mitarbeiter: '38',
    website: 'https://elektro-wunsch.example.de',
    montage: 'Jeden Abend zuhause',
    urlaubstage: 32,
    benefits: ['Firmenwagen', 'Weiterbildung', 'Übertarifliche Bezahlung'],
    kontaktName: 'Testkontakt Wunsch',
    jobs: [
      {
        title: 'Elektroniker (m/w/d) [alle Prioritäten erfüllt]',
        gewerk: 'Elektriker / Elektroniker',
        description:
          'Test-Inserat, das alle elf Prioritäten bedient.\n\n' +
          'Abwechslungsreiche Projekte, moderne Ausstattung und ein Team, das ' +
          'seit Jahren zusammenarbeitet.',
        tags: ['Test: Prioritäten'],
        salaryMin: 3400,
        salaryMax: 4000,
        montage: 'Jeden Abend zuhause',
        fahrzeitIstArbeitszeit: true,
        startpunkt: 'Haustür',
        urlaubstage: 32,
        extras: ['Firmenwagen', 'Weiterbildung'],
        anforderung: {
          bereiche: ['elektronik'],
          gebotenes: [
            'firmenwagen',
            'weiterbildung',
            'equipment',
            'gehalt',
            'start_zuhause',
            'meisterstelle',
            'aufstieg',
            'personalverantwortung',
            'team',
            'urlaub',
            'abwechslung',
          ],
          gewichte: { prioritaeten: 5 },
        },
      },
    ],
  },
];

// ── Ausführung ───────────────────────────────────────────────────────────────

async function seedWorkers(passwordHash: string) {
  for (const w of WORKERS) {
    const profileData = {
      profil: w.profil,
      '3': { workLocations: [ARBEITSORT] },
    };
    await prisma.user.upsert({
      where: { email: w.email },
      create: {
        email: w.email,
        passwordHash,
        firstName: w.firstName,
        lastName: w.lastName,
        phone: w.phone,
        role: 'APPLICANT',
        status: 'ACTIVE',
        profileData,
      },
      // Beim erneuten Lauf nur das Profil auffrischen — Bewerbungen,
      // Merkliste und Angebote des Testkontos bleiben erhalten.
      update: { profileData },
    });
    console.log(`  ✓ ${w.email} — ${w.zweck}`);
  }
}

async function seedCompanies(passwordHash: string) {
  const behalten: string[] = [];

  for (const c of COMPANIES) {
    const stamm = {
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
      source: 'ADMIN' as const,
      managedNote: SEED_NOTE,
    };

    // `kontaktEmail` ist nicht eindeutig indiziert — daher suchen statt upsert.
    const vorhanden = await prisma.company.findFirst({
      where: { kontaktEmail: c.email },
      select: { id: true },
    });
    const company = vorhanden
      ? await prisma.company.update({ where: { id: vorhanden.id }, data: stamm })
      : await prisma.company.create({
          data: { ...stamm, kontaktEmail: c.email, kontaktTelefon: '+4971311234567' },
        });
    behalten.push(company.id);

    await prisma.user.upsert({
      where: { email: c.email },
      create: {
        email: c.email,
        passwordHash,
        firstName: 'Test',
        lastName: 'Betrieb',
        phone: '+4971311234567',
        role: 'EMPLOYER',
        status: 'ACTIVE',
        companyName: c.name,
        companyId: company.id,
      },
      update: { companyName: c.name, companyId: company.id, status: 'ACTIVE' },
    });

    // Inserate werden ersetzt: die Anforderungen sind der eigentliche
    // Prüfgegenstand und sollen bei jedem Lauf exakt der Liste entsprechen.
    await prisma.jobPosting.deleteMany({
      where: { companyId: company.id, source: 'ADMIN' },
    });
    for (const j of c.jobs) {
      const a = j.anforderung;
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
          bereiche: a.bereiche ?? [],
          berufe: a.berufe ?? [],
          ausbildungMin: a.ausbildungMin ?? null,
          aufgaben: a.aufgaben ?? [],
          aufgabenMin: a.aufgabenMin ?? 0,
          erfahrungMin: a.erfahrungMin ?? null,
          erfahrungMax: a.erfahrungMax ?? null,
          montageMin: a.montageMin ?? null,
          fuehrerscheinMin: a.fuehrerscheinMin ?? null,
          deutschMin: a.deutschMin ?? null,
          gebotenes: a.gebotenes ?? [],
          startBis: a.startBis ?? null,
          gewichte: a.gewichte ?? undefined,
        },
      });
    }
    console.log(`  ✓ ${c.name}`);
  }

  // Verwaiste Seed-Firmen entfernen (Namen ändern sich, E-Mails bleiben).
  const verwaist = await prisma.company.findMany({
    where: { managedNote: SEED_NOTE, id: { notIn: behalten } },
    select: { id: true, name: true },
  });
  for (const alt of verwaist) {
    await prisma.user.deleteMany({ where: { companyId: alt.id } });
    await prisma.company.delete({ where: { id: alt.id } });
    console.log(`  − entfernt: ${alt.name}`);
  }
}

async function main() {
  const passwordHash = await hashPassword(TEST_PASSWORD);

  console.log('Testhandwerker:');
  await seedWorkers(passwordHash);

  console.log('\nTestbetriebe:');
  await seedCompanies(passwordHash);

  console.log(`\nFertig. Passwort für alle Testkonten: ${TEST_PASSWORD}`);
  console.log('\nErwartet in der Jobbörse (prüfen mit scripts/matching-matrix.ts):');
  console.log('  testhandwerker@ → 5 von 9 Stellen — raus bei Meisterpflicht,');
  console.log('                    SHK, Dauermontage und „2 von 3 Bereichen"');
  console.log('  testmeister@    → 8 von 9 — nur die SHK-Stelle bleibt zu');
  console.log('  testshk@        → 2 von 9 — SHK-Stelle und die offene');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
