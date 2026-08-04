/**
 * Fachkatalog — die eine Quelle der Wahrheit für Registrierung, Inserate und
 * Matching.
 *
 * Vorher lagen die Antwortmöglichkeiten im Frontend (`lib/constants.ts`,
 * `lib/aiService.ts`) und die Matching-Fragen in der Datenbank. Beide konnten
 * auseinanderlaufen — eine Antwort, die es im Katalog nicht gibt, wird beim
 * Bewerten stillschweigend übersprungen. Deshalb steht hier alles einmal, und
 * das Frontend holt es über `GET /catalog`.
 *
 * Aufbau: ein Ausbildungsbereich bringt seine eigenen Ausbildungsberufe und
 * Aufgabenbereiche mit — ein Elektroniker soll nicht „Bad-Sanierung" wählen
 * können und ein Anlagenmechaniker nicht „Schaltschrankbau".
 */

export interface KatalogOption {
  value: string;
  label: string;
  /** Erläuterung, wo die Bezeichnung allein nicht reicht. */
  hint?: string;
}

/** Option einer geordneten Skala — `rang` ist der Wert, mit dem gerechnet wird. */
export interface RangOption extends KatalogOption {
  rang: number;
}

export interface Bereich {
  value: string;
  label: string;
  /** Ausbildungsberufe dieses Bereichs. */
  berufe: KatalogOption[];
  /** Aufgabenbereiche, in denen man hier Erfahrung sammeln kann. */
  aufgaben: KatalogOption[];
}

const opt = (value: string, label: string, hint?: string): KatalogOption =>
  hint ? { value, label, hint } : { value, label };

// ── Ausbildungsbereiche ─────────────────────────────────────────────────────
// Elektronik und Anlagenmechanik SHK sind die beiden Schwerpunkte und deshalb
// am ausführlichsten. Die übrigen Gewerke stammen aus der bisherigen Liste und
// bleiben wählbar, damit niemand aus der Plattform fällt.

export const BEREICHE: Bereich[] = [
  {
    value: 'elektronik',
    label: 'Elektronik',
    berufe: [
      opt('elektroniker_energie_gebaeude', 'Elektroniker für Energie- und Gebäudetechnik'),
      opt('elektroinstallateur', 'Elektroinstallateur'),
      opt('elektroniker_betriebstechnik', 'Elektroniker für Betriebstechnik'),
      opt('energieanlagenelektroniker', 'Energieanlagenelektroniker'),
      opt('elektroniker_geraete_systeme', 'Elektroniker für Geräte und Systeme'),
      opt('mechatroniker', 'Mechatroniker'),
      opt('industrieelektroniker', 'Industrieelektroniker'),
      opt('elektroniker_maschinen_antriebe', 'Elektroniker für Maschinen- und Antriebstechnik'),
      opt('elektroniker_information_tk', 'Elektroniker für Informations- und Telekommunikationstechnik'),
      opt('elektroniker_automatisierung', 'Elektroniker für Automatisierungstechnik'),
      opt('industriemechaniker', 'Industriemechaniker'),
      opt('werkzeugmechaniker', 'Werkzeugmechaniker'),
      opt('kfz_mechatroniker', 'KFZ-Mechatroniker'),
      opt('sonstiges_elektrotechnik', 'Sonstiges Elektrotechnik'),
    ],
    aufgaben: [
      opt('energie_gebaeudetechnik', 'Energie- & Gebäudetechnik'),
      opt('betriebstechnik', 'Betriebstechnik'),
      opt('pv_solar', 'PV / Solar'),
      opt('waermepumpen', 'Wärmepumpen'),
      opt('kundendienst_service', 'Kundendienst / Service'),
      opt('schaltschrankbau', 'Schaltschrankbau'),
      opt('automatisierung_steuerung', 'Automatisierungs- & Steuerungstechnik'),
      opt('bauleitung_projektleitung', 'Bauleitung / Projektleitung'),
      opt('instandhaltung_wartung', 'Instandhaltung / Wartung'),
      opt('sicherheitstechnik', 'Sicherheitstechnik'),
      opt('kommunikation_datentechnik', 'Kommunikations- und Datentechnik'),
      opt('pruftechnik', 'Prüftechnik'),
      opt('geraete_systemtechnik', 'Geräte- & Systemtechnik'),
      opt('mechatronik', 'Mechatronik'),
      opt('mechanik', 'Mechanik'),
      opt('produktion_industrie', 'Produktion & Industrie'),
      opt('kfz_mechatronik', 'KFZ-Mechatronik'),
      opt('verkehrsanlagen', 'Verkehrsanlagen'),
    ],
  },
  {
    value: 'shk',
    label: 'Anlagenmechanik SHK',
    berufe: [
      opt('anlagenmechaniker_shk', 'Anlagenmechaniker für Sanitär-, Heizungs- und Klimatechnik'),
      opt('gas_wasserinstallateur', 'Gas- und Wasserinstallateur'),
      opt('zentralheizungs_lueftungsbauer', 'Zentralheizungs- und Lüftungsbauer'),
      opt('klempner', 'Klempner / Spengler'),
      opt('kaelteanlagenbauer', 'Mechatroniker für Kältetechnik / Kälteanlagenbauer'),
      opt('ofen_luftheizungsbauer', 'Ofen- und Luftheizungsbauer'),
      opt('rohrleitungsbauer', 'Rohrleitungsbauer'),
      opt('behaelter_apparatebauer', 'Behälter- und Apparatebauer'),
      opt('sonstiges_shk', 'Sonstiges SHK'),
    ],
    aufgaben: [
      opt('sanitaerinstallation', 'Sanitärinstallation'),
      opt('heizungsbau', 'Heizungsbau'),
      opt('lueftung_klima', 'Lüftungs- & Klimatechnik'),
      opt('waermepumpen', 'Wärmepumpen'),
      opt('solarthermie', 'Solarthermie'),
      opt('kaeltetechnik', 'Kältetechnik'),
      opt('bad_sanierung', 'Bad-Sanierung'),
      opt('flaechenheizung', 'Flächen- & Fußbodenheizung'),
      opt('gastechnik', 'Gastechnik'),
      opt('trinkwasserhygiene', 'Trinkwasserhygiene'),
      opt('rohrleitungsbau', 'Rohrleitungsbau'),
      opt('bauklempnerei', 'Bauklempnerei / Dachentwässerung'),
      opt('kundendienst_service', 'Kundendienst / Service'),
      opt('instandhaltung_wartung', 'Instandhaltung / Wartung'),
      opt('bauleitung_projektleitung', 'Bauleitung / Projektleitung'),
    ],
  },
  {
    value: 'heizung_lueftung',
    label: 'Heizungs- & Lüftungsbau',
    berufe: [
      opt('zentralheizungs_lueftungsbauer', 'Zentralheizungs- und Lüftungsbauer'),
      opt('anlagenmechaniker_shk', 'Anlagenmechaniker SHK'),
      opt('ofen_luftheizungsbauer', 'Ofen- und Luftheizungsbauer'),
      opt('kaelteanlagenbauer', 'Mechatroniker für Kältetechnik'),
      opt('sonstiges_heizung_lueftung', 'Sonstiges Heizung / Lüftung'),
    ],
    aufgaben: [
      opt('heizungsbau', 'Heizungsbau'),
      opt('lueftung_klima', 'Lüftungs- & Klimatechnik'),
      opt('waermepumpen', 'Wärmepumpen'),
      opt('solarthermie', 'Solarthermie'),
      opt('kaeltetechnik', 'Kältetechnik'),
      opt('flaechenheizung', 'Flächen- & Fußbodenheizung'),
      opt('kundendienst_service', 'Kundendienst / Service'),
      opt('instandhaltung_wartung', 'Instandhaltung / Wartung'),
      opt('bauleitung_projektleitung', 'Bauleitung / Projektleitung'),
    ],
  },
  {
    value: 'maler',
    label: 'Maler & Lackierer',
    berufe: [
      opt('maler_lackierer', 'Maler und Lackierer'),
      opt('bauten_objektbeschichter', 'Bauten- und Objektbeschichter'),
      opt('fahrzeuglackierer', 'Fahrzeuglackierer'),
      opt('stuckateur', 'Stuckateur'),
      opt('sonstiges_maler', 'Sonstiges Maler / Lackierer'),
    ],
    aufgaben: [
      opt('innenanstrich', 'Innenanstrich & Gestaltung'),
      opt('fassade_daemmung', 'Fassade & Wärmedämmung'),
      opt('lackierarbeiten', 'Lackierarbeiten'),
      opt('tapezier_putzarbeiten', 'Tapezier- & Putzarbeiten'),
      opt('bodenbelaege', 'Bodenbeläge'),
      opt('trockenbau', 'Trockenbau'),
      opt('denkmalpflege', 'Denkmalpflege & Restaurierung'),
      opt('bauleitung_projektleitung', 'Bauleitung / Projektleitung'),
    ],
  },
  {
    value: 'tischler',
    label: 'Tischler / Schreiner',
    berufe: [
      opt('tischler_schreiner', 'Tischler / Schreiner'),
      opt('holzmechaniker', 'Holzmechaniker'),
      opt('fachkraft_moebel_kuechen', 'Fachkraft für Möbel-, Küchen- und Umzugsservice'),
      opt('sonstiges_tischler', 'Sonstiges Holz / Möbel'),
    ],
    aufgaben: [
      opt('moebelbau', 'Möbelbau'),
      opt('innenausbau', 'Innenausbau'),
      opt('fenster_tueren', 'Fenster & Türen'),
      opt('treppenbau', 'Treppenbau'),
      opt('kuechenmontage', 'Küchenmontage'),
      opt('cnc_fertigung', 'CNC-Fertigung'),
      opt('montage_kunde', 'Montage beim Kunden'),
      opt('bauleitung_projektleitung', 'Bauleitung / Projektleitung'),
    ],
  },
  {
    value: 'maurer',
    label: 'Maurer / Betonbauer',
    berufe: [
      opt('maurer', 'Maurer'),
      opt('beton_stahlbetonbauer', 'Beton- und Stahlbetonbauer'),
      opt('bauwerksmechaniker_abbruch', 'Bauwerksmechaniker für Abbruchtechnik'),
      opt('feuerungs_schornsteinbauer', 'Feuerungs- und Schornsteinbauer'),
      opt('sonstiges_maurer', 'Sonstiges Hochbau'),
    ],
    aufgaben: [
      opt('rohbau', 'Rohbau'),
      opt('betonbau', 'Betonbau'),
      opt('sanierung_umbau', 'Sanierung & Umbau'),
      opt('putz_estrich', 'Putz- & Estricharbeiten'),
      opt('schalungsbau', 'Schalungsbau'),
      opt('abbruch', 'Abbruch'),
      opt('bauleitung_projektleitung', 'Bauleitung / Projektleitung'),
    ],
  },
  {
    value: 'dachdecker',
    label: 'Dachdecker',
    berufe: [
      opt('dachdecker', 'Dachdecker'),
      opt('klempner', 'Klempner / Spengler'),
      opt('zimmerer', 'Zimmerer'),
      opt('sonstiges_dach', 'Sonstiges Dach'),
    ],
    aufgaben: [
      opt('steildach', 'Steildach'),
      opt('flachdach', 'Flachdach'),
      opt('abdichtung', 'Abdichtung'),
      opt('dachbegruenung', 'Dachbegrünung'),
      opt('bauklempnerei', 'Bauklempnerei / Dachentwässerung'),
      opt('pv_solar', 'PV / Solar-Montage'),
      opt('geruest_absturzsicherung', 'Gerüst & Absturzsicherung'),
      opt('bauleitung_projektleitung', 'Bauleitung / Projektleitung'),
    ],
  },
  {
    value: 'fliesenleger',
    label: 'Fliesenleger',
    berufe: [
      opt('fliesen_platten_mosaikleger', 'Fliesen-, Platten- und Mosaikleger'),
      opt('estrichleger', 'Estrichleger'),
      opt('sonstiges_fliesen', 'Sonstiges Fliesen / Estrich'),
    ],
    aufgaben: [
      opt('wand_bodenfliesen', 'Wand- & Bodenfliesen'),
      opt('naturstein', 'Naturstein'),
      opt('grossformate', 'Großformate'),
      opt('abdichtung', 'Abdichtung'),
      opt('bad_sanierung', 'Bad-Sanierung'),
      opt('estrich', 'Estrich'),
      opt('bauleitung_projektleitung', 'Bauleitung / Projektleitung'),
    ],
  },
  {
    value: 'zimmerer',
    label: 'Zimmerer',
    berufe: [
      opt('zimmerer', 'Zimmerer'),
      opt('holzbau_techniker', 'Techniker / Meister Holzbau'),
      opt('dachdecker', 'Dachdecker'),
      opt('sonstiges_zimmerer', 'Sonstiges Holzbau'),
    ],
    aufgaben: [
      opt('dachstuhl', 'Dachstuhl'),
      opt('holzrahmenbau', 'Holzrahmenbau'),
      opt('sanierung_altbau', 'Sanierung Altbau'),
      opt('treppen_innenausbau', 'Treppen & Innenausbau'),
      opt('fertigteilmontage', 'Fertigteilmontage'),
      opt('abbund_cnc', 'Abbund / CNC'),
      opt('bauleitung_projektleitung', 'Bauleitung / Projektleitung'),
    ],
  },
  {
    value: 'metallbau',
    label: 'Metallbauer / Schlosser',
    berufe: [
      opt('metallbauer_konstruktion', 'Metallbauer Konstruktionstechnik'),
      opt('metallbauer_nutzfahrzeuge', 'Metallbauer Nutzfahrzeugbau'),
      opt('konstruktionsmechaniker', 'Konstruktionsmechaniker'),
      opt('industriemechaniker', 'Industriemechaniker'),
      opt('schweisser', 'Schweißer (mit Prüfung)'),
      opt('sonstiges_metall', 'Sonstiges Metall'),
    ],
    aufgaben: [
      opt('stahlbau', 'Stahlbau'),
      opt('schlosserei', 'Schlosserei'),
      opt('schweissen', 'Schweißen'),
      opt('tuer_tor_gelaender', 'Tür-, Tor- & Geländerbau'),
      opt('fassadenbau', 'Fassadenbau'),
      opt('cnc_zerspanung', 'CNC / Zerspanung'),
      opt('montage_kunde', 'Montage beim Kunden'),
      opt('instandhaltung_wartung', 'Instandhaltung / Wartung'),
      opt('bauleitung_projektleitung', 'Bauleitung / Projektleitung'),
    ],
  },
  {
    value: 'kfz',
    label: 'KFZ-Mechatronik',
    berufe: [
      opt('kfz_mechatroniker_pkw', 'Kfz-Mechatroniker PKW'),
      opt('kfz_mechatroniker_nfz', 'Kfz-Mechatroniker Nutzfahrzeuge'),
      opt('kfz_mechatroniker_system_hv', 'Kfz-Mechatroniker System- & Hochvolttechnik'),
      opt('karosserie_fahrzeugbaumechaniker', 'Karosserie- und Fahrzeugbaumechaniker'),
      opt('zweiradmechatroniker', 'Zweiradmechatroniker'),
      opt('sonstiges_kfz', 'Sonstiges KFZ'),
    ],
    aufgaben: [
      opt('wartung_inspektion', 'Wartung & Inspektion'),
      opt('diagnose', 'Diagnose'),
      opt('hochvolt_emobilitaet', 'Hochvolt & E-Mobilität'),
      opt('karosserie_lack', 'Karosserie & Lack'),
      opt('nutzfahrzeuge', 'Nutzfahrzeuge'),
      opt('reifen_fahrwerk', 'Reifen & Fahrwerk'),
      opt('kundendienst_service', 'Kundendienst / Service'),
      opt('werkstattleitung', 'Werkstattleitung'),
    ],
  },
  {
    value: 'trockenbau',
    label: 'Trockenbauer',
    berufe: [
      opt('trockenbaumonteur', 'Trockenbaumonteur'),
      opt('stuckateur', 'Stuckateur'),
      opt('ausbaufacharbeiter', 'Ausbaufacharbeiter'),
      opt('sonstiges_trockenbau', 'Sonstiges Ausbau'),
    ],
    aufgaben: [
      opt('staenderwaende', 'Ständerwände'),
      opt('decken', 'Decken'),
      opt('brandschutz', 'Brandschutz'),
      opt('schallschutz', 'Schallschutz'),
      opt('spachtelarbeiten', 'Spachtelarbeiten'),
      opt('dachgeschossausbau', 'Dachgeschossausbau'),
      opt('bauleitung_projektleitung', 'Bauleitung / Projektleitung'),
    ],
  },
  {
    value: 'geruestbau',
    label: 'Gerüstbauer',
    berufe: [
      opt('geruestbauer', 'Gerüstbauer'),
      opt('sonstiges_geruest', 'Sonstiges Gerüstbau'),
    ],
    aufgaben: [
      opt('fassadengeruest', 'Fassadengerüst'),
      opt('industriegeruest', 'Industriegerüst'),
      opt('fahrgeruest', 'Roll- & Fahrgerüst'),
      opt('wetterschutz_einhausung', 'Wetterschutz & Einhausung'),
      opt('aufbauplanung_statik', 'Aufbauplanung & Statik'),
      opt('kolonnenfuehrung', 'Kolonnenführung'),
    ],
  },
  {
    value: 'galabau',
    label: 'Garten- & Landschaftsbau',
    berufe: [
      opt('landschaftsgaertner', 'Landschaftsgärtner (GaLaBau)'),
      opt('gaertner', 'Gärtner'),
      opt('strassenbauer', 'Straßenbauer'),
      opt('sonstiges_galabau', 'Sonstiges GaLaBau'),
    ],
    aufgaben: [
      opt('pflasterarbeiten', 'Pflasterarbeiten'),
      opt('pflanzarbeiten', 'Pflanzarbeiten'),
      opt('teich_wasseranlagen', 'Teich- & Wasseranlagen'),
      opt('zaun_mauerbau', 'Zaun- & Mauerbau'),
      opt('pflege_gruenanlagen', 'Pflege & Grünanlagen'),
      opt('erdbau', 'Erdbau'),
      opt('baumpflege', 'Baumpflege'),
      opt('bauleitung_projektleitung', 'Bauleitung / Projektleitung'),
    ],
  },
  {
    value: 'sonstiges',
    label: 'Anderes Gewerk',
    berufe: [opt('sonstige_ausbildung', 'Sonstige Ausbildung')],
    aufgaben: [
      opt('montage_kunde', 'Montage beim Kunden'),
      opt('kundendienst_service', 'Kundendienst / Service'),
      opt('instandhaltung_wartung', 'Instandhaltung / Wartung'),
      opt('produktion_industrie', 'Produktion & Industrie'),
      opt('bauleitung_projektleitung', 'Bauleitung / Projektleitung'),
      opt('sonstiges', 'Sonstiges'),
    ],
  },
];

// ── Geordnete Skalen ────────────────────────────────────────────────────────
// `rang` ist der Wert, mit dem gerechnet wird — die Reihenfolge ist Teil der
// Fachaussage und darf nicht umsortiert werden.

/** Frage 2 — Ausbildungsstand. */
export const AUSBILDUNGSSTATUS: RangOption[] = [
  { value: 'keine', label: 'Keine Ausbildung', rang: 0 },
  { value: 'in_ausbildung', label: 'In Ausbildung', rang: 1 },
  { value: 'berufsausbildung', label: 'Berufsausbildung', rang: 2 },
  { value: 'techniker_meister', label: 'Techniker / Meister', rang: 3 },
];

/** Frage 5 — Berufserfahrung. */
export const ERFAHRUNG: RangOption[] = [
  { value: 'keine', label: '0 Jahre', rang: 0 },
  { value: '1_2', label: '1 bis 2 Jahre', rang: 1 },
  { value: '3_5', label: '3 bis 5 Jahre', rang: 2 },
  { value: '6_10', label: '6 bis 10 Jahre', rang: 3 },
  { value: 'ueber_10', label: 'Mehr als 10 Jahre', rang: 4 },
];

/** Frage 7 — Montagebereitschaft. */
export const MONTAGE: RangOption[] = [
  {
    value: 'nie',
    label: 'Nie',
    hint: 'Du bist jeden Abend zuhause — Montageeinsätze mit Übernachtung gibt es nicht.',
    rang: 0,
  },
  {
    value: 'gering',
    label: 'Gering',
    hint: 'Du bist gelegentlich auf Montage — in etwa 1 bis 4 Nächte pro Monat außer Haus.',
    rang: 1,
  },
  {
    value: 'regelmaessig',
    label: 'Regelmäßig',
    hint: 'Du bist regelmäßig im Einsatz — etwa 5 bis 15 Tage im Monat auf Montage mit Übernachtung.',
    rang: 2,
  },
  {
    value: 'unbeschraenkt',
    label: 'Unbeschränkt',
    hint: 'Du bist in der Regel durchgehend montags bis freitags auf Montage — die Wochenenden bist du zuhause.',
    rang: 3,
  },
];

/** Frage 8 — Führerschein. Rang bildet ab, was der Schein abdeckt. */
export const FUEHRERSCHEIN: RangOption[] = [
  { value: 'nein', label: 'Nein', rang: 0 },
  { value: 'fahrschule', label: 'In der Fahrschule', rang: 1 },
  { value: 'b', label: 'Klasse B (PKW)', rang: 2 },
  { value: 'c', label: 'Klasse C (LKW, Anhänger, etc.)', rang: 3 },
];

/** Frage 9 — Deutschkenntnisse. */
export const DEUTSCH: RangOption[] = [
  { value: 'keine', label: 'Keine Kenntnisse', rang: 0 },
  { value: 'grundkenntnisse', label: 'Grundkenntnisse', rang: 1 },
  { value: 'verhandlungssicher', label: 'Verhandlungssicher', rang: 2 },
  { value: 'muttersprachlich', label: 'Muttersprachlich', rang: 3 },
];

/** Frage 10 — gewünschter Start. Rang ≈ Monate bis zum Beginn. */
export const START: RangOption[] = [
  { value: 'sofort', label: 'Ab sofort', rang: 0 },
  { value: '2_monate', label: 'Innerhalb der nächsten 2 Monate', rang: 2 },
  { value: '6_monate', label: 'Innerhalb der nächsten 6 Monate', rang: 6 },
  { value: '6_12_monate', label: 'In 6 bis 12 Monaten', rang: 12 },
  { value: 'umschauen', label: 'Ich schaue mich nur um', rang: 24 },
];

/** Frage 6 — was im neuen Job wichtig ist (Auswahl von höchstens fünf). */
export const PRIORITAETEN: KatalogOption[] = [
  opt('firmenwagen', 'Firmenwagen'),
  opt('weiterbildung', 'Förderung von Schulungen & Weiterbildungen'),
  opt('equipment', 'Hochwertiges Equipment & Werkzeug'),
  opt('gehalt', 'Überdurchschnittliches Gehalt'),
  opt('start_zuhause', 'Option von zu Hause aus zu starten'),
  opt('meisterstelle', 'Option auf Meisterstelle'),
  opt('aufstieg', 'Aufstiegsmöglichkeiten'),
  opt('personalverantwortung', 'Personalverantwortung'),
  opt('team', 'Team & Arbeitsumfeld'),
  opt('urlaub', 'Urlaubstage & Urlaubsgeld'),
  opt('abwechslung', 'Abwechslungsreiche Tätigkeiten'),
];

export const PRIORITAETEN_MAX = 5;

// ── Nachschlagen ────────────────────────────────────────────────────────────

const bereichByValue = new Map(BEREICHE.map((b) => [b.value, b]));

export const findBereich = (value: string | null | undefined): Bereich | null =>
  (value && bereichByValue.get(value)) || null;

const rang = (skala: RangOption[], value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  return skala.find((o) => o.value === value)?.rang ?? null;
};

export const rangAusbildung = (v: unknown) => rang(AUSBILDUNGSSTATUS, v);
export const rangErfahrung = (v: unknown) => rang(ERFAHRUNG, v);
export const rangMontage = (v: unknown) => rang(MONTAGE, v);
export const rangFuehrerschein = (v: unknown) => rang(FUEHRERSCHEIN, v);
export const rangDeutsch = (v: unknown) => rang(DEUTSCH, v);
export const rangStart = (v: unknown) => rang(START, v);

/** Gültige Werte je Skala — für die Prüfung eingehender Daten. */
export const werte = (skala: KatalogOption[]): string[] => skala.map((o) => o.value);

/** Alle Berufs- bzw. Aufgabenwerte über alle Bereiche hinweg. */
export const ALLE_BERUFE: string[] = [
  ...new Set(BEREICHE.flatMap((b) => b.berufe.map((o) => o.value))),
];
export const ALLE_AUFGABEN: string[] = [
  ...new Set(BEREICHE.flatMap((b) => b.aufgaben.map((o) => o.value))),
];

/** Label zu einem Wert — für Anzeige und Begründungstexte. */
const labelIndex = new Map<string, string>();
for (const b of BEREICHE) {
  labelIndex.set(`bereich:${b.value}`, b.label);
  for (const o of b.berufe) labelIndex.set(`beruf:${o.value}`, o.label);
  for (const o of b.aufgaben) labelIndex.set(`aufgabe:${o.value}`, o.label);
}
for (const o of PRIORITAETEN) labelIndex.set(`prio:${o.value}`, o.label);
for (const [art, skala] of [
  ['ausbildung', AUSBILDUNGSSTATUS],
  ['erfahrung', ERFAHRUNG],
  ['montage', MONTAGE],
  ['fuehrerschein', FUEHRERSCHEIN],
  ['deutsch', DEUTSCH],
  ['start', START],
] as const) {
  for (const o of skala) labelIndex.set(`${art}:${o.value}`, o.label);
}

export const labelFuer = (art: string, value: string): string =>
  labelIndex.get(`${art}:${value}`) ?? value;

/** Vollständiger Katalog, wie ihn das Frontend über `GET /catalog` bekommt. */
export const katalog = () => ({
  bereiche: BEREICHE,
  ausbildungsstatus: AUSBILDUNGSSTATUS,
  erfahrung: ERFAHRUNG,
  prioritaeten: PRIORITAETEN,
  prioritaetenMax: PRIORITAETEN_MAX,
  montage: MONTAGE,
  fuehrerschein: FUEHRERSCHEIN,
  deutsch: DEUTSCH,
  start: START,
});
