import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Company,
  ContactRequestStatus,
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
import { plzCentroid } from '../matching/geo.util';
import { hashPassword } from '../common/crypto/password.util';
import { normalizeEmail, normalizePhone } from '../common/contact/contact.util';
import {
  AdminCreateCompanyDto,
  CandidateQueryDto,
  CriterionInputDto,
  RequestContactDto,
  SaveJobDto,
  SendOfferDto,
  UpdateEmployerProfileDto,
} from './dto/employer.dto';

// ── Display maps: stored option values → labels shown to employers ──────────
const ZERTIFIKAT_LABELS: Record<string, string> = {
  geselle: 'Gesellenbrief',
  meister: 'Meisterbrief',
  techniker: 'Staatl. gepr. Techniker',
  fuehrerschein: 'Führerschein Kl. B / BE',
  stapler: 'Staplerschein',
  sonstige: 'Weitere Zertifikate',
};

const BEREITSCHAFT_LABELS: Record<string, string> = {
  montage: 'Montage / Reisetätigkeit',
  schicht: 'Schichtarbeit',
  notdienst: 'Notdienst / Rufbereitschaft',
  umzug: 'Umzug für den richtigen Job',
};

const PRAEFERENZ_LABELS: Record<string, string> = {
  gehalt: 'Besseres Gehalt',
  naehe: 'Kurzer Arbeitsweg',
  team: 'Gutes Team & Betriebsklima',
  aufstieg: 'Aufstiegsmöglichkeiten',
};

const CONTACT_STATUS_DE: Record<ContactRequestStatus, string> = {
  REQUESTED: 'angefragt',
  APPROVED: 'freigegeben',
  DECLINED: 'abgelehnt',
};

export interface CandidateDto {
  id: string;
  handle: string;
  gewerk: string;
  erfahrungJahre: number | null;
  zertifikate: string[];
  region: string;
  distanceKm: number | null;
  radiusKm: number | null;
  bereitschaft: string[];
  praeferenz: string | null;
  verfuegbarAb: string | null;
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
  ) {}

  // ── Access ────────────────────────────────────────────────────────────────

  /**
   * Resolves the calling employer and their company. Legacy EMPLOYER accounts
   * without a Company row get one created lazily from `companyName`.
   */
  private async requireEmployer(
    payload: JwtPayload,
  ): Promise<{ user: User; company: Company }> {
    const user = await this.auth.getActiveUser(payload);
    if (user.role !== 'EMPLOYER') {
      throw new ForbiddenException('Employer account required');
    }
    if (user.companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: user.companyId },
      });
      if (company) return { user, company };
    }
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
    if (dto.plz !== undefined) {
      data.plz = dto.plz;
      const centroid = plzCentroid(dto.plz);
      if (centroid) {
        data.lat = centroid.lat;
        data.lng = centroid.lng;
      }
    }
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
    const updated = await this.prisma.company.update({
      where: { id: company.id },
      data: this.profilePatch(dto),
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

  private jobInclude() {
    return { criteria: { include: { question: true } } } as const;
  }

  private toJobDto(
    posting: Prisma.JobPostingGetPayload<{
      include: { criteria: { include: { question: true } } };
    }>,
  ) {
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
      criteria: posting.criteria
        .slice()
        .sort((a, b) => a.question.sortOrder - b.question.sortOrder)
        .map((c) => ({
          questionKey: c.question.key,
          label: c.question.label,
          minValue: c.minValue,
          maxValue: c.maxValue,
          weight: c.weight,
        })),
    };
  }

  async listJobs(payload: JwtPayload) {
    const { company } = await this.requireEmployer(payload);
    const postings = await this.prisma.jobPosting.findMany({
      where: { companyId: company.id, status: { not: 'ARCHIVED' } },
      include: this.jobInclude(),
      orderBy: { createdAt: 'desc' },
    });
    const counts = await this.prisma.jobApplication.groupBy({
      by: ['jobPostingId'],
      where: { jobPostingId: { in: postings.map((p) => p.id) } },
      _count: true,
    });
    const countMap = new Map(counts.map((c) => [c.jobPostingId, c._count]));
    return postings.map((p) => ({
      ...this.toJobDto(p),
      applications: countMap.get(p.id) ?? 0,
    }));
  }

  /** Validates criterion ranges against the catalog and returns create rows. */
  private async criteriaRows(criteria: CriterionInputDto[] | undefined) {
    if (!criteria?.length) return [];
    const questions = await this.matching.listQuestions();
    const byKey = new Map(questions.map((q) => [q.key, q]));
    const rows: { questionId: string; minValue: number; maxValue: number; weight: number }[] =
      [];
    for (const c of criteria) {
      const q = byKey.get(c.questionKey);
      if (!q) {
        throw new BadRequestException(`Unknown match question: ${c.questionKey}`);
      }
      const min = Math.max(q.scaleMin, Math.min(c.minValue, c.maxValue));
      const max = Math.min(q.scaleMax, Math.max(c.minValue, c.maxValue));
      rows.push({ questionId: q.id, minValue: min, maxValue: max, weight: c.weight });
    }
    return rows;
  }

  private async saveJobData(company: Company, dto: SaveJobDto) {
    const centroid = plzCentroid(company.plz);
    return {
      title: dto.title.trim(),
      gewerk: dto.gewerk,
      description: dto.description ?? '',
      tags: (dto.tags ?? []).slice(0, 10),
      city: dto.city ?? company.ort,
      // Explicit coords win (admin/AI supplies exact ones); else company city.
      lat: dto.lat ?? company.lat ?? centroid?.lat ?? null,
      lng: dto.lng ?? company.lng ?? centroid?.lng ?? null,
      salaryMin: dto.salaryMin ?? null,
      salaryMax: dto.salaryMax ?? null,
      montage: dto.montage ?? company.montage,
      fahrzeitIstArbeitszeit: dto.fahrzeitIstArbeitszeit ?? false,
      startpunkt: dto.startpunkt ?? 'Betrieb',
      urlaubstage: dto.urlaubstage ?? company.urlaubstage,
      startText: dto.startText ?? 'Ab sofort',
      extras: (dto.extras ?? []).slice(0, 10),
      status: (dto.status ?? 'ACTIVE') as JobStatus,
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
    const rows = await this.criteriaRows(dto.criteria);
    const posting = await this.prisma.jobPosting.create({
      data: {
        ...(await this.saveJobData(company, dto)),
        companyId: company.id,
        source,
        criteria: { create: rows },
      },
      include: this.jobInclude(),
    });
    return this.toJobDto(posting);
  }

  async updateJob(payload: JwtPayload, id: string, dto: SaveJobDto) {
    const { company } = await this.requireEmployer(payload);
    const existing = await this.prisma.jobPosting.findFirst({
      where: { id, companyId: company.id },
    });
    if (!existing) throw new NotFoundException('Job posting not found');

    const rows = await this.criteriaRows(dto.criteria);
    const posting = await this.prisma.$transaction(async (tx) => {
      await tx.jobCriterion.deleteMany({ where: { jobPostingId: id } });
      return tx.jobPosting.update({
        where: { id },
        data: {
          ...(await this.saveJobData(company, dto)),
          criteria: { create: rows },
        },
        include: this.jobInclude(),
      });
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

  private candidateHandle(user: User, gewerk: string): string {
    const short = user.id.replace(/-/g, '').slice(0, 4).toUpperCase();
    const trade = gewerk.split('/')[0]?.trim() || 'Handwerker';
    return `${trade} #${short}`;
  }

  private toCandidateDto(
    user: User,
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
    const gewerk = profile.gewerke[0] ?? 'Handwerk';
    return {
      id: user.id,
      handle: this.candidateHandle(user, gewerk),
      gewerk: profile.gewerke.join(' · ') || 'Handwerk',
      erfahrungJahre: profile.erfahrungJahre,
      zertifikate: profile.zertifikate.map((z) => ZERTIFIKAT_LABELS[z] ?? z),
      region: opts.location?.label ?? '—',
      distanceKm: opts.distanceKm != null ? Math.round(opts.distanceKm) : null,
      radiusKm: opts.location?.radiusKm ?? null,
      bereitschaft: profile.bereitschaft.map((b) => BEREITSCHAFT_LABELS[b] ?? b),
      praeferenz: profile.praeferenz
        ? (PRAEFERENZ_LABELS[profile.praeferenz] ?? profile.praeferenz)
        : null,
      verfuegbarAb: null,
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
    const centroid = plzCentroid(q.plz);
    if (!centroid) {
      throw new BadRequestException('Bitte gib eine fünfstellige Postleitzahl ein.');
    }

    // Which posting are we scoring against?
    let posting =
      q.jobPostingId != null
        ? await this.prisma.jobPosting.findFirst({
            where: { id: q.jobPostingId, companyId: company.id },
            include: this.jobInclude(),
          })
        : await this.prisma.jobPosting.findFirst({
            where: { companyId: company.id, status: 'ACTIVE' },
            include: this.jobInclude(),
            orderBy: { createdAt: 'desc' },
          });
    if (q.jobPostingId && !posting) {
      throw new NotFoundException('Job posting not found');
    }

    const [workers, requests] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'APPLICANT', status: 'ACTIVE' },
      }),
      this.prisma.contactRequest.findMany({ where: { companyId: company.id } }),
    ]);
    const requestByUser = new Map(requests.map((r) => [r.userId, r]));

    const gewerkeFilter = (q.gewerke ?? '')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
    const requiredCerts = (q.zertifikate ?? '')
      .split(',')
      .map((z) => z.trim())
      .filter(Boolean);
    const requiredBereit = (q.bereitschaft ?? '')
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);

    const out: CandidateDto[] = [];
    for (const worker of workers) {
      const profile = this.matching.extractProfile(worker);
      const near = this.matching.nearestLocation(
        profile,
        centroid.lat,
        centroid.lng,
      );
      if (!near || near.distanceKm > q.radiusKm) continue;
      if (
        gewerkeFilter.length &&
        !profile.gewerke.some((g) => gewerkeFilter.includes(g))
      ) {
        continue;
      }
      if (
        q.minErfahrung != null &&
        (profile.erfahrungJahre ?? 0) < q.minErfahrung
      ) {
        continue;
      }
      const certLabels = profile.zertifikate.map(
        (z) => ZERTIFIKAT_LABELS[z] ?? z,
      );
      if (!requiredCerts.every((z) => certLabels.includes(z))) continue;
      const bereitLabels = profile.bereitschaft.map(
        (b) => BEREITSCHAFT_LABELS[b] ?? b,
      );
      if (!requiredBereit.every((b) => bereitLabels.includes(b))) continue;

      let matchScore: number;
      let matchBreakdown: MatchBreakdown | null = null;
      if (posting && posting.criteria.length > 0) {
        matchBreakdown = this.matching.score(posting.criteria, profile);
        matchScore = matchBreakdown.score;
      } else {
        // No posting to score against → transparent proximity/experience heuristic.
        const nahe = Math.max(0, 1 - near.distanceKm / Math.max(q.radiusKm, 1));
        const willFahren = near.distanceKm <= near.location.radiusKm ? 1 : 0.45;
        const erfahrung = Math.min(1, (profile.erfahrungJahre ?? 0) / 12);
        matchScore = Math.round(
          (nahe * 0.5 + willFahren * 0.3 + erfahrung * 0.2) * 100,
        );
      }

      const request = requestByUser.get(worker.id);
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
        return (b.erfahrungJahre ?? 0) - (a.erfahrungJahre ?? 0);
      }
      return b.matchScore - a.matchScore;
    });

    return {
      candidates: out,
      scoredAgainst:
        posting && posting.criteria.length > 0
          ? { id: posting.id, title: posting.title }
          : null,
    };
  }

  // ── Contact requests (employer side) ──────────────────────────────────────

  async requestContact(payload: JwtPayload, userId: string, dto: RequestContactDto) {
    const { company } = await this.requireEmployer(payload);
    const worker = await this.prisma.user.findFirst({
      where: { id: userId, role: 'APPLICANT', status: 'ACTIVE' },
    });
    if (!worker) throw new NotFoundException('Candidate not found');

    const existing = await this.prisma.contactRequest.findUnique({
      where: { companyId_userId: { companyId: company.id, userId } },
    });
    if (existing && existing.status !== 'DECLINED') {
      throw new ConflictException('Du hast diesen Kandidaten bereits angefragt.');
    }
    const request = existing
      ? await this.prisma.contactRequest.update({
          where: { id: existing.id },
          data: { status: 'REQUESTED', position: dto.position },
        })
      : await this.prisma.contactRequest.create({
          data: { companyId: company.id, userId, position: dto.position },
        });
    return { status: CONTACT_STATUS_DE[request.status] };
  }

  async listRequests(payload: JwtPayload) {
    const { company } = await this.requireEmployer(payload);
    const requests = await this.prisma.contactRequest.findMany({
      where: { companyId: company.id },
      include: { user: true },
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
    const patch = this.profilePatch(dto.profile as UpdateEmployerProfileDto);
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

    const company = await this.prisma.company.create({
      data: {
        ...(patch as Prisma.CompanyCreateInput),
        name,
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
