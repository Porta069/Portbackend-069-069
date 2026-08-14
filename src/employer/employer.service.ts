import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Company,
  JobApplicationStatus,
  JobPosting,
  JobStatus,
  Prisma,
  User,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/jwt';
import {
  MatchBreakdown,
  MatchingService,
  WorkerProfile,
} from '../matching/matching.service';
import { GeocodingService } from '../matching/geocoding.service';
import { PartnerService } from '../partner/partner.service';
import { hashPassword } from '../common/crypto/password.util';
import { normalizeEmail, normalizePhone } from '../common/contact/contact.util';
import {
  APPLICATION_STATUS_DE,
  CONTACT_STATUS_DE,
} from '../common/status-labels';
import {
  ALLE_AUFGABEN,
  ALLE_BERUFE,
  AUSBILDUNGSSTATUS,
  BEREICHE,
  DEUTSCH,
  ERFAHRUNG,
  FUEHRERSCHEIN,
  MONTAGE,
  PRIORITAETEN,
  START,
  labelFuer,
  rangAusbildung,
  rangErfahrung,
  rangMontage,
} from '../matching/catalog';
import {
  AdminCreateCompanyDto,
  CandidateQueryDto,
  RequestContactDto,
  SaveJobDto,
  SendOfferDto,
  UpdateEmployerProfileDto,
} from './dto/employer.dto';

const APPLICATION_STATUS_FROM_DE: Record<string, JobApplicationStatus> = {
  gesehen: 'SEEN',
  im_gespraech: 'INTERVIEW',
  abgelehnt: 'REJECTED',
  zusage: 'ACCEPTED',
};

/**
 * Spalten, die für ein anonymes Kandidatenprofil gebraucht werden.
 * Bewusst OHNE passwordHash und avatar.
 */
const CANDIDATE_FIELDS = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  profileData: true,
  lastLoginAt: true,
  updatedAt: true,
} as const;

/** Kandidat in der schlanken Form, die CANDIDATE_FIELDS liefert. */
type CandidateUser = Pick<
  User,
  'id' | 'firstName' | 'lastName' | 'email' | 'phone' | 'profileData' | 'lastLoginAt' | 'updatedAt'
>;

/**
 * Ein Kandidat, wie ihn der Betrieb sieht — anonym bis zur Freigabe.
 * Alle Textfelder sind bereits die Klartext-Bezeichnungen aus dem Katalog,
 * damit die Oberfläche keine eigene Übersetzungstabelle pflegen muss.
 */
export interface CandidateDto {
  id: string;
  handle: string;
  bereich: string;
  beruf: string | null;
  ausbildung: string | null;
  erfahrung: string | null;
  aufgaben: string[];
  prioritaeten: string[];
  montage: string | null;
  fuehrerschein: string | null;
  deutsch: string | null;
  start: string | null;
  region: string;
  distanceKm: number | null;
  radiusKm: number | null;
  matchScore: number;
  matchBreakdown: MatchBreakdown | null;
  status: string;
  zuletztAktiv: string;
  lat: number | null;
  lng: number | null;
  freigegeben?: { name: string; telefon: string; email: string };
}

@Injectable()
export class EmployerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly matching: MatchingService,
    private readonly geo: GeocodingService,
    private readonly partner: PartnerService,
  ) {}

  // ── Access ────────────────────────────────────────────────────────────────

  /**
   * Resolves the calling employer and their company. Legacy EMPLOYER accounts
   * without a Company row get one created lazily from `companyName`.
   */
  private async requireEmployer(
    payload: JwtPayload,
  ): Promise<{ user: User; company: Company }> {
    // Firma kommt in derselben Abfrage mit — der Regelfall braucht damit
    // eine Datenbank-Runde statt zwei.
    const user = await this.auth.getActiveUserWithCompany(payload);
    if (user.role !== 'EMPLOYER') {
      throw new ForbiddenException('Employer account required');
    }
    if (user.company) return { user, company: user.company };
    const company = await this.prisma.company.create({
      data: {
        name:
          user.companyName ?? `${user.firstName} ${user.lastName}`.trim(),
        kontaktName: `${user.firstName} ${user.lastName}`.trim(),
        kontaktEmail: user.email,
        kontaktTelefon: user.phone,
      },
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { companyId: company.id },
    });
    return { user, company };
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  private toProfileDto(company: Company) {
    return {
      id: company.id,
      firmenname: company.name,
      slogan: company.slogan,
      beschreibung: company.description,
      gruendungsjahr: company.gruendungsjahr,
      mitarbeiter: company.mitarbeiter,
      strasse: company.strasse,
      plz: company.plz,
      ort: company.ort,
      website: company.website,
      ueberUns: company.description ? company.description.slice(0, 1200) : '',
      kontaktName: company.kontaktName,
      kontaktPosition: company.kontaktPosition,
      kontaktTelefon: company.kontaktTelefon,
      kontaktEmail: company.kontaktEmail,
      benefits: company.benefits,
      montage: company.montage,
      urlaubstage: company.urlaubstage != null ? String(company.urlaubstage) : '',
      logo: company.logo ?? '',
      source: company.source,
    };
  }

  async getProfile(payload: JwtPayload) {
    const { company } = await this.requireEmployer(payload);
    return this.toProfileDto(company);
  }

  private profilePatch(dto: UpdateEmployerProfileDto): Prisma.CompanyUpdateInput {
    const data: Prisma.CompanyUpdateInput = {};
    if (dto.firmenname !== undefined) data.name = dto.firmenname.trim();
    if (dto.slogan !== undefined) data.slogan = dto.slogan;
    // `beschreibung` is the long description; the legacy `ueberUns` field maps
    // to the same column so older clients keep working.
    if (dto.beschreibung !== undefined) data.description = dto.beschreibung;
    else if (dto.ueberUns !== undefined) data.description = dto.ueberUns;
    if (dto.gruendungsjahr !== undefined) data.gruendungsjahr = dto.gruendungsjahr;
    if (dto.mitarbeiter !== undefined) data.mitarbeiter = dto.mitarbeiter;
    if (dto.strasse !== undefined) data.strasse = dto.strasse;
    if (dto.plz !== undefined) data.plz = dto.plz;
    if (dto.ort !== undefined) data.ort = dto.ort;
    if (dto.website !== undefined) data.website = dto.website;
    if (dto.kontaktName !== undefined) data.kontaktName = dto.kontaktName;
    if (dto.kontaktPosition !== undefined) data.kontaktPosition = dto.kontaktPosition;
    if (dto.kontaktTelefon !== undefined) data.kontaktTelefon = dto.kontaktTelefon;
    if (dto.kontaktEmail !== undefined) data.kontaktEmail = dto.kontaktEmail;
    if (dto.benefits !== undefined) data.benefits = dto.benefits.slice(0, 12);
    if (dto.montage !== undefined) data.montage = dto.montage;
    if (dto.urlaubstage !== undefined) {
      const n = parseInt(dto.urlaubstage, 10);
      data.urlaubstage = Number.isFinite(n) ? n : null;
    }
    if (dto.logo !== undefined) data.logo = dto.logo || null;
    return data;
  }

  async updateProfile(payload: JwtPayload, dto: UpdateEmployerProfileDto) {
    const { user, company } = await this.requireEmployer(payload);
    const data = this.profilePatch(dto);
    // Echte Koordinaten der VOLLSTÄNDIGEN PLZ statt der groben Leitregion —
    // daran hängen Fahrzeit, Umkreisfilter und Match-Begründung.
    if (dto.plz !== undefined) {
      const coords = await this.geo.resolve(dto.plz);
      if (coords) {
        data.lat = coords.lat;
        data.lng = coords.lng;
      }
    }
    const updated = await this.prisma.company.update({
      where: { id: company.id },
      data,
    });
    if (dto.firmenname !== undefined) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { companyName: updated.name },
      });
    }
    return this.toProfileDto(updated);
  }

  // ── Job postings ──────────────────────────────────────────────────────────

  private toJobDto(posting: JobPosting) {
    return {
      id: posting.id,
      title: posting.title,
      gewerk: posting.gewerk,
      description: posting.description,
      tags: posting.tags,
      city: posting.city,
      lat: posting.lat,
      lng: posting.lng,
      salaryMin: posting.salaryMin,
      salaryMax: posting.salaryMax,
      montage: posting.montage,
      fahrzeitIstArbeitszeit: posting.fahrzeitIstArbeitszeit,
      startpunkt: posting.startpunkt,
      urlaubstage: posting.urlaubstage,
      startText: posting.startText,
      extras: posting.extras,
      status: posting.status,
      source: posting.source,
      createdAt: posting.createdAt.toISOString(),
      updatedAt: posting.updatedAt.toISOString(),
      // Anforderungsprofil — die Grundlage des Matchings.
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
      gewichte: posting.gewichte,
    };
  }

  async listJobs(payload: JwtPayload) {
    const { company } = await this.requireEmployer(payload);
    // Die Bewerbungszahl zählt die Datenbank in derselben Abfrage mit —
    // vorher lief dafür ein eigenes groupBy als zweite Runde.
    const postings = await this.prisma.jobPosting.findMany({
      where: { companyId: company.id, status: { not: 'ARCHIVED' } },
      relationLoadStrategy: 'join',
      include: { _count: { select: { applications: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return postings.map((p) => ({
      ...this.toJobDto(p),
      applications: p._count.applications,
    }));
  }

  /**
   * Prüft das Anforderungsprofil gegen den Fachkatalog.
   *
   * Ein Wert, den der Katalog nicht kennt, würde später beim Bewerten
   * stillschweigend übersprungen — das Inserat wäre gespeichert, das Kriterium
   * aber wirkungslos. Deshalb wird hier abgewiesen statt geschluckt.
   */
  private anforderungsDaten(dto: SaveJobDto) {
    const ausListe = (
      werte: string[] | undefined,
      erlaubt: string[],
      feld: string,
    ): string[] => {
      const liste = [...new Set(werte ?? [])];
      const unbekannt = liste.filter((v) => !erlaubt.includes(v));
      if (unbekannt.length) {
        throw new BadRequestException(
          `Unbekannte Angabe bei „${feld}": ${unbekannt.join(', ')}.`,
        );
      }
      return liste;
    };

    const einzeln = (
      wert: string | undefined,
      skala: { value: string }[],
      feld: string,
    ): string | null => {
      if (wert == null || wert === '') return null;
      if (!skala.some((o) => o.value === wert)) {
        throw new BadRequestException(`Unbekannte Angabe bei „${feld}": ${wert}.`);
      }
      return wert;
    };

    const bereiche = ausListe(
      dto.bereiche,
      BEREICHE.map((b) => b.value),
      'Ausbildungsbereiche',
    );
    const aufgaben = ausListe(dto.aufgaben, ALLE_AUFGABEN, 'Aufgabenbereiche');

    // Mehr Pflichtbereiche zu verlangen als überhaupt gesucht werden, ergäbe
    // ein Inserat, das niemand erfüllen kann.
    const aufgabenMin = Math.max(0, Math.min(dto.aufgabenMin ?? 0, aufgaben.length));

    // Verdrehte Erfahrungsspanne wird getauscht statt „6–10 bis 1–2" zu speichern.
    const erfMin = einzeln(dto.erfahrungMin, ERFAHRUNG, 'Erfahrung von');
    const erfMax = einzeln(dto.erfahrungMax, ERFAHRUNG, 'Erfahrung bis');
    const rangVon = rangErfahrung(erfMin);
    const rangBis = rangErfahrung(erfMax);
    const tauschen = rangVon != null && rangBis != null && rangVon > rangBis;

    return {
      bereiche,
      berufe: ausListe(dto.berufe, ALLE_BERUFE, 'Ausbildungsberufe'),
      ausbildungMin: einzeln(dto.ausbildungMin, AUSBILDUNGSSTATUS, 'Ausbildungsstand'),
      aufgaben,
      aufgabenMin,
      erfahrungMin: tauschen ? erfMax : erfMin,
      erfahrungMax: tauschen ? erfMin : erfMax,
      montageMin: einzeln(dto.montageMin, MONTAGE, 'Montagebereitschaft'),
      fuehrerscheinMin: einzeln(dto.fuehrerscheinMin, FUEHRERSCHEIN, 'Führerschein'),
      deutschMin: einzeln(dto.deutschMin, DEUTSCH, 'Deutschkenntnisse'),
      gebotenes: ausListe(
        dto.gebotenes,
        PRIORITAETEN.map((p) => p.value),
        'Gebotene Leistungen',
      ),
      startBis: einzeln(dto.startBis, START, 'Startzeitpunkt'),
      gewichte: (dto.gewichte ?? undefined) as Prisma.InputJsonValue | undefined,
    };
  }

  private async saveJobData(company: Company, dto: SaveJobDto) {
    const centroid = company.lat == null ? await this.geo.resolve(company.plz) : null;
    return {
      title: dto.title.trim(),
      gewerk: dto.gewerk,
      description: dto.description ?? '',
      tags: (dto.tags ?? []).slice(0, 10),
      city: dto.city ?? company.ort,
      // Explicit coords win (admin/AI supplies exact ones); else company city.
      lat: dto.lat ?? company.lat ?? centroid?.lat ?? null,
      lng: dto.lng ?? company.lng ?? centroid?.lng ?? null,
      // Verdrehte Spanne wird getauscht statt "5000 – 1000 €" anzuzeigen.
      salaryMin:
        dto.salaryMin != null && dto.salaryMax != null
          ? Math.min(dto.salaryMin, dto.salaryMax)
          : (dto.salaryMin ?? null),
      salaryMax:
        dto.salaryMin != null && dto.salaryMax != null
          ? Math.max(dto.salaryMin, dto.salaryMax)
          : (dto.salaryMax ?? null),
      montage: dto.montage ?? company.montage,
      fahrzeitIstArbeitszeit: dto.fahrzeitIstArbeitszeit ?? false,
      startpunkt: dto.startpunkt ?? 'Betrieb',
      urlaubstage: dto.urlaubstage ?? company.urlaubstage,
      startText: dto.startText ?? 'Ab sofort',
      extras: (dto.extras ?? []).slice(0, 10),
      status: (dto.status ?? 'ACTIVE') as JobStatus,
      ...this.anforderungsDaten(dto),
    };
  }

  async createJob(
    payload: JwtPayload | null,
    dto: SaveJobDto,
    companyOverride?: Company,
    source: 'SELF' | 'ADMIN' | 'AI' = 'SELF',
  ) {
    const company =
      companyOverride ?? (await this.requireEmployer(payload!)).company;
    const posting = await this.prisma.jobPosting.create({
      data: {
        ...(await this.saveJobData(company, dto)),
        companyId: company.id,
        source,
      },
    });
    return this.toJobDto(posting);
  }

  async updateJob(payload: JwtPayload, id: string, dto: SaveJobDto) {
    const { company } = await this.requireEmployer(payload);
    const existing = await this.prisma.jobPosting.findFirst({
      where: { id, companyId: company.id },
    });
    if (!existing) throw new NotFoundException('Job posting not found');

    // Das Anforderungsprofil liegt jetzt in Spalten des Inserats — ein
    // Austausch der Kriterien-Zeilen (und damit die Transaktion) entfällt.
    const posting = await this.prisma.jobPosting.update({
      where: { id },
      data: await this.saveJobData(company, dto),
    });
    return this.toJobDto(posting);
  }

  async archiveJob(payload: JwtPayload, id: string) {
    const { company } = await this.requireEmployer(payload);
    const existing = await this.prisma.jobPosting.findFirst({
      where: { id, companyId: company.id },
    });
    if (!existing) throw new NotFoundException('Job posting not found');
    await this.prisma.jobPosting.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  // ── Candidate search ──────────────────────────────────────────────────────

  private candidateHandle(user: Pick<User, 'id'>, gewerk: string): string {
    const short = user.id.replace(/-/g, '').slice(0, 4).toUpperCase();
    const trade = gewerk.split('/')[0]?.trim() || 'Handwerker';
    return `${trade} #${short}`;
  }

  private toCandidateDto(
    user: CandidateUser,
    profile: WorkerProfile,
    opts: {
      distanceKm: number | null;
      location: WorkerProfile['workLocations'][number] | null;
      matchScore: number;
      matchBreakdown: MatchBreakdown | null;
      status: string;
      approved: boolean;
    },
  ): CandidateDto {
    const p = profile.profil;
    const bereichLabel = p.bereich ? labelFuer('bereich', p.bereich) : 'Handwerk';
    return {
      id: user.id,
      handle: this.candidateHandle(user, bereichLabel),
      bereich: bereichLabel,
      beruf: p.beruf ? labelFuer('beruf', p.beruf) : null,
      ausbildung: p.ausbildungsstatus
        ? labelFuer('ausbildung', p.ausbildungsstatus)
        : null,
      erfahrung: p.erfahrung ? labelFuer('erfahrung', p.erfahrung) : null,
      aufgaben: p.aufgaben.map((a) => labelFuer('aufgabe', a)),
      prioritaeten: p.prioritaeten.map((x) => labelFuer('prio', x)),
      montage: p.montage ? labelFuer('montage', p.montage) : null,
      fuehrerschein: p.fuehrerschein
        ? labelFuer('fuehrerschein', p.fuehrerschein)
        : null,
      deutsch: p.deutsch ? labelFuer('deutsch', p.deutsch) : null,
      start: p.start ? labelFuer('start', p.start) : null,
      region: opts.location?.label ?? '—',
      distanceKm: opts.distanceKm != null ? Math.round(opts.distanceKm) : null,
      radiusKm: opts.location?.radiusKm ?? null,
      matchScore: opts.matchScore,
      matchBreakdown: opts.matchBreakdown,
      status: opts.status,
      zuletztAktiv: (user.lastLoginAt ?? user.updatedAt).toISOString(),
      // Coarse position only (~1 km grid) — the map shows density, never homes.
      lat: opts.location ? Math.round(opts.location.lat * 100) / 100 : null,
      lng: opts.location ? Math.round(opts.location.lng * 100) / 100 : null,
      ...(opts.approved
        ? {
            freigegeben: {
              name: `${user.firstName} ${user.lastName}`.trim(),
              telefon: user.phone,
              email: user.email,
            },
          }
        : {}),
    };
  }

  async searchCandidates(payload: JwtPayload, q: CandidateQueryDto) {
    const { company } = await this.requireEmployer(payload);
    const centroid = await this.geo.resolve(q.plz);
    if (!centroid) {
      throw new BadRequestException('Bitte gib eine fünfstellige Postleitzahl ein.');
    }

    // Which posting are we scoring against?
    let posting =
      q.jobPostingId != null
        ? await this.prisma.jobPosting.findFirst({
            where: { id: q.jobPostingId, companyId: company.id },
          })
        : await this.prisma.jobPosting.findFirst({
            where: { companyId: company.id, status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
          });
    if (q.jobPostingId && !posting) {
      throw new NotFoundException('Job posting not found');
    }

    const [workers, requests] = await Promise.all([
      // Nur die Felder, die toCandidateDto/extractProfile wirklich brauchen.
      // Ohne `select` lädt Prisma auch passwordHash und den Avatar als
      // Data-URL (bis 700 KB je Person) — bei vielen Bewerbern der mit
      // Abstand größte Posten.
      this.prisma.user.findMany({
        where: { role: 'APPLICANT', status: 'ACTIVE' },
        select: CANDIDATE_FIELDS,
      }),
      this.prisma.contactRequest.findMany({ where: { companyId: company.id } }),
    ]);
    const requestByUser = new Map(requests.map((r) => [r.userId, r]));

    const liste = (v: string | undefined) =>
      (v ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const bereicheFilter = liste(q.bereiche);
    const aufgabenFilter = liste(q.aufgaben);
    const erfahrungMin = rangErfahrung(q.erfahrungMin);
    const ausbildungMin = rangAusbildung(q.ausbildungMin);
    const montageMin = rangMontage(q.montageMin);

    const anforderung = posting ? this.matching.anforderungVon(posting) : null;

    const out: CandidateDto[] = [];
    // Für die Sortierung wird der Katalogwert gebraucht, nicht das Label.
    const erfahrungRoh = new Map<string, string | null>();
    for (const worker of workers) {
      const profile = this.matching.extractProfile(worker);
      const p = profile.profil;
      const near = this.matching.nearestLocation(
        profile,
        centroid.lat,
        centroid.lng,
      );
      if (!near || near.distanceKm > q.radiusKm) continue;

      // Filter aus der Suchmaske.
      if (bereicheFilter.length && (!p.bereich || !bereicheFilter.includes(p.bereich))) {
        continue;
      }
      if (aufgabenFilter.length && !aufgabenFilter.every((a) => p.aufgaben.includes(a))) {
        continue;
      }
      if (erfahrungMin != null && (rangErfahrung(p.erfahrung) ?? -1) < erfahrungMin) {
        continue;
      }
      if (ausbildungMin != null && (rangAusbildung(p.ausbildungsstatus) ?? -1) < ausbildungMin) {
        continue;
      }
      if (montageMin != null && (rangMontage(p.montage) ?? -1) < montageMin) {
        continue;
      }

      let matchScore: number;
      let matchBreakdown: MatchBreakdown | null = null;
      if (anforderung) {
        matchBreakdown = this.matching.score(anforderung, profile);
        // Wer an einem Ausschlusskriterium scheitert, ist für diese Stelle
        // keine Besetzung — dann gar nicht erst vorschlagen.
        if (!matchBreakdown.passed) continue;
        matchScore = matchBreakdown.score;
      } else {
        // Ohne Inserat zum Bewerten: nachvollziehbare Näherung aus Entfernung,
        // eigenem Radius und Erfahrung.
        const nahe = Math.max(0, 1 - near.distanceKm / Math.max(q.radiusKm, 1));
        const willFahren = near.distanceKm <= near.location.radiusKm ? 1 : 0.45;
        const erfahrung = (rangErfahrung(p.erfahrung) ?? 0) / 4;
        matchScore = Math.round(
          (nahe * 0.5 + willFahren * 0.3 + erfahrung * 0.2) * 100,
        );
      }

      const request = requestByUser.get(worker.id);
      erfahrungRoh.set(worker.id, p.erfahrung);
      out.push(
        this.toCandidateDto(worker, profile, {
          distanceKm: near.distanceKm,
          location: near.location,
          matchScore,
          matchBreakdown,
          status: request ? CONTACT_STATUS_DE[request.status] : 'verfuegbar',
          approved: request?.status === 'APPROVED',
        }),
      );
    }

    out.sort((a, b) => {
      if (q.sort === 'naehe') {
        return (a.distanceKm ?? 9_999) - (b.distanceKm ?? 9_999);
      }
      if (q.sort === 'erfahrung') {
        return (
          (rangErfahrung(erfahrungRoh.get(b.id)) ?? -1) -
          (rangErfahrung(erfahrungRoh.get(a.id)) ?? -1)
        );
      }
      return b.matchScore - a.matchScore;
    });

    return {
      candidates: out,
      scoredAgainst: anforderung
        ? { id: posting!.id, title: posting!.title }
        : null,
    };
  }

  // ── Contact requests (employer side) ──────────────────────────────────────

  async requestContact(payload: JwtPayload, userId: string, dto: RequestContactDto) {
    const { company } = await this.requireEmployer(payload);
    const worker = await this.prisma.user.findFirst({
      where: { id: userId, role: 'APPLICANT', status: 'ACTIVE' },
      select: { id: true },
    });
    if (!worker) throw new NotFoundException('Candidate not found');

    const existing = await this.prisma.contactRequest.findUnique({
      where: { companyId_userId: { companyId: company.id, userId } },
    });
    if (existing && existing.status !== 'DECLINED') {
      throw new ConflictException('Du hast diesen Kandidaten bereits angefragt.');
    }
    // Ein "Nein" des Kandidaten hält. Ohne Sperre könnte ein Betrieb die
    // Ablehnung beliebig oft überschreiben und den Kandidaten zuspammen;
    // nach 90 Tagen ist eine erneute Anfrage wieder zulässig.
    if (existing?.status === 'DECLINED') {
      const days =
        (Date.now() - existing.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (days < 90) {
        throw new ConflictException(
          'Dieser Kandidat hat Ihre Anfrage abgelehnt. Eine erneute Anfrage ist erst nach 90 Tagen möglich.',
        );
      }
    }
    try {
      const request = existing
        ? await this.prisma.contactRequest.update({
            where: { id: existing.id },
            data: { status: 'REQUESTED', position: dto.position },
          })
        : await this.prisma.contactRequest.create({
            data: { companyId: company.id, userId, position: dto.position },
          });
      return { status: CONTACT_STATUS_DE[request.status] };
    } catch (e) {
      // Doppelklick/zwei Tabs: der Unique-Index greift — sauberer 409 statt 500.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Du hast diesen Kandidaten bereits angefragt.');
      }
      throw e;
    }
  }

  async listRequests(payload: JwtPayload) {
    const { company } = await this.requireEmployer(payload);
    const requests = await this.prisma.contactRequest.findMany({
      where: { companyId: company.id },
      include: { user: { select: CANDIDATE_FIELDS } },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => {
      const profile = this.matching.extractProfile(r.user);
      const location = profile.workLocations[0] ?? null;
      return {
        id: r.id,
        position: r.position,
        sentAt: r.createdAt.toISOString(),
        status: CONTACT_STATUS_DE[r.status],
        candidate: this.toCandidateDto(r.user, profile, {
          distanceKm: null,
          location,
          matchScore: 0,
          matchBreakdown: null,
          status: CONTACT_STATUS_DE[r.status],
          approved: r.status === 'APPROVED',
        }),
      };
    });
  }

  /** Actively offer a posting to a candidate (appears in their "Angebote"). */
  async sendOffer(payload: JwtPayload, userId: string, dto: SendOfferDto) {
    const { company } = await this.requireEmployer(payload);
    const posting = await this.prisma.jobPosting.findFirst({
      where: { id: dto.jobPostingId, companyId: company.id, status: 'ACTIVE' },
    });
    if (!posting) throw new NotFoundException('Job posting not found');
    const worker = await this.prisma.user.findFirst({
      where: { id: userId, role: 'APPLICANT', status: 'ACTIVE' },
      select: { id: true },
    });
    if (!worker) throw new NotFoundException('Candidate not found');

    try {
      const offer = await this.prisma.jobOffer.create({
        data: {
          jobPostingId: posting.id,
          userId,
          message: dto.message ?? '',
          contactPerson: company.kontaktName,
        },
      });
      return { id: offer.id, status: 'neu' };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'Für diese Stelle liegt dem Kandidaten bereits ein Angebot vor.',
        );
      }
      throw e;
    }
  }

  // ── Applications (Bewerbungen auf die eigenen Inserate) ──────────────────

  /**
   * Alle Bewerbungen auf Inserate des Betriebs — mit anonymisiertem
   * Kandidatenprofil, Score gegen das jeweilige Inserat und (nur nach
   * Freigabe) den Kontaktdaten.
   */
  async listApplications(payload: JwtPayload) {
    const { company } = await this.requireEmployer(payload);
    const [apps, requests] = await Promise.all([
      this.prisma.jobApplication.findMany({
        where: { jobPosting: { companyId: company.id } },
        relationLoadStrategy: 'join',
        include: {
          user: { select: CANDIDATE_FIELDS },
          jobPosting: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contactRequest.findMany({ where: { companyId: company.id } }),
    ]);
    const requestByUser = new Map(requests.map((r) => [r.userId, r]));

    return apps.map((a) => {
      const profile = this.matching.extractProfile(a.user);
      const near = this.matching.nearestLocation(
        profile,
        company.lat,
        company.lng,
      );
      // Bewerbungen zeigen den Score immer — anders als die Kandidatensuche
      // wird hier nichts ausgeblendet: wer sich beworben hat, gehört auf den
      // Tisch, auch wenn ein Ausschlusskriterium nicht erfüllt ist.
      const breakdown = this.matching.score(
        this.matching.anforderungVon(a.jobPosting),
        profile,
      );
      const request = requestByUser.get(a.userId);
      return {
        id: a.id,
        status: APPLICATION_STATUS_DE[a.status],
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        jobPosting: {
          id: a.jobPosting.id,
          title: a.jobPosting.title,
          gewerk: a.jobPosting.gewerk,
        },
        candidate: this.toCandidateDto(a.user, profile, {
          distanceKm: near?.distanceKm ?? null,
          location: near?.location ?? null,
          matchScore: breakdown?.score ?? 0,
          matchBreakdown: breakdown,
          status: request ? CONTACT_STATUS_DE[request.status] : 'verfuegbar',
          approved: request?.status === 'APPROVED',
        }),
      };
    });
  }

  /** Setzt den Bewerbungsstatus — der Handwerker sieht ihn sofort. */
  async setApplicationStatus(payload: JwtPayload, id: string, statusDe: string) {
    const { company } = await this.requireEmployer(payload);
    const app = await this.prisma.jobApplication.findFirst({
      where: { id, jobPosting: { companyId: company.id } },
    });
    if (!app) throw new NotFoundException('Application not found');
    const status = APPLICATION_STATUS_FROM_DE[statusDe];
    if (!status) throw new BadRequestException('Unknown status');
    const updated = await this.prisma.jobApplication.update({
      where: { id: app.id },
      data: { status },
    });
    // Eine Zusage ist die Vermittlung; „im Gespräch" und „gesehen" sind
    // Zwischenstände. Nur vorwärts — zurückgestuft wird ein Referral nie.
    if (status === 'ACCEPTED') {
      void this.partner.fortschreiben(app.userId, 'PLACED');
    } else if (status === 'INTERVIEW' || status === 'SEEN') {
      void this.partner.fortschreiben(app.userId, 'IN_PLACEMENT');
    }
    return { id: updated.id, status: APPLICATION_STATUS_DE[updated.status] };
  }

  // ── Admin: managed company intake (foundation for the AI pipeline) ───────

  async adminListCompanies() {
    const companies = await this.prisma.company.findMany({
      include: {
        users: { select: { id: true, email: true } },
        _count: { select: { jobPostings: true, contactRequests: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      ort: c.ort,
      plz: c.plz,
      source: c.source,
      managedNote: c.managedNote,
      accounts: c.users.map((u) => u.email),
      jobPostings: c._count.jobPostings,
      contactRequests: c._count.contactRequests,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async adminCreateCompany(dto: AdminCreateCompanyDto, ip: string) {
    // Reuse the profile field mapping (and its PLZ → centroid geocoding).
    const patch = this.profilePatch(dto.profile);
    const name = (patch.name as string) ?? '';
    if (!name || name.length < 2) {
      throw new BadRequestException('profile.firmenname is required');
    }

    if (dto.account) {
      const email = normalizeEmail(dto.account.email);
      const exists = await this.prisma.user.findUnique({ where: { email } });
      if (exists) {
        throw new ConflictException('An account with this email already exists');
      }
    }

    // Auch der KI-/Admin-Pfad bekommt die echte Position.
    const coords = patch.plz ? await this.geo.resolve(String(patch.plz)) : null;
    const company = await this.prisma.company.create({
      data: {
        ...(patch as Prisma.CompanyCreateInput),
        name,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        source: dto.source,
        managedNote: dto.managedNote ?? null,
      },
    });

    let accountEmail: string | null = null;
    if (dto.account) {
      const email = normalizeEmail(dto.account.email);
      await this.prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(dto.account.password),
          firstName: dto.account.firstName ?? 'Team',
          lastName: dto.account.lastName ?? name,
          phone: dto.account.phone ? normalizePhone(dto.account.phone) : '',
          role: 'EMPLOYER',
          companyName: name,
          companyId: company.id,
          emailVerified: true,
        },
      });
      accountEmail = email;
    }

    const jobs = [];
    for (const jobDto of dto.jobs ?? []) {
      jobs.push(await this.createJob(null, jobDto, company, dto.source));
    }

    await this.audit.record({
      action: 'employer.admin_company_created',
      entityType: 'Company',
      entityId: company.id,
      ip,
      metadata: { source: dto.source, jobs: jobs.length, hasAccount: !!accountEmail },
    });

    return {
      id: company.id,
      name: company.name,
      source: company.source,
      account: accountEmail,
      jobs,
    };
  }
}
