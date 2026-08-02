import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Company,
  JobApplicationStatus,
  JobOfferStatus,
  JobPosting,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { JwtPayload } from '../auth/jwt';
import {
  CriterionWithQuestion,
  MatchBreakdown,
  MatchingService,
  WorkerProfile,
} from '../matching/matching.service';
import { travelMinutes } from '../matching/geo.util';
import {
  ListJobsQueryDto,
  RespondOfferDto,
  RespondContactRequestDto,
  SaveWorkLocationsDto,
} from './dto/jobs.dto';

type PostingWithRelations = JobPosting & {
  company: Company;
  criteria: CriterionWithQuestion[];
};

/** Wire shape of a job in the worker UI (mirrors the frontend `Job` type). */
export interface JobDto {
  id: string;
  title: string;
  employer: string;
  gewerk: string;
  description: string;
  city: string;
  distanceKm: number | null;
  travelMinutes: number | null;
  lat: number | null;
  lng: number | null;
  startLabel: string | null;
  startLat: number | null;
  startLng: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  tags: string[];
  conditions: {
    montage: string;
    fahrzeitIstArbeitszeit: boolean;
    startpunkt: string;
    urlaubstage: number | null;
    start: string;
    extras: string[];
  };
  recommended: boolean;
  matchReasons: string[];
  matchScore: number;
  matchBreakdown: MatchBreakdown;
  createdAt: string;
  /** Is this posting on the caller's Merkliste? */
  favorite: boolean;
  // Company details for the detail view / comparison.
  companyDescription: string;
  companySlogan: string;
  benefits: string[];
  companyLogo: string | null;
  companyGruendungsjahr: string;
  companyMitarbeiter: string;
  companyWebsite: string;
  companyOrt: string;
  companyStrasse: string;
  companyPlz: string;
  companyKontaktName: string;
}

const APPLICATION_STATUS_DE: Record<JobApplicationStatus, string> = {
  SENT: 'gesendet',
  SEEN: 'gesehen',
  INTERVIEW: 'im_gespraech',
  REJECTED: 'abgelehnt',
  ACCEPTED: 'zusage',
};

const OFFER_STATUS_DE: Record<JobOfferStatus, string> = {
  NEW: 'neu',
  ACCEPTED: 'angenommen',
  DECLINED: 'abgelehnt',
};

const CONTACT_STATUS_DE: Record<string, string> = {
  REQUESTED: 'angefragt',
  APPROVED: 'freigegeben',
  DECLINED: 'abgelehnt',
};

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly matching: MatchingService,
  ) {}

  // ── Catalog ───────────────────────────────────────────────────────────────

  listQuestions() {
    return this.matching.listQuestions();
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────

  private buildJobDto(
    posting: PostingWithRelations,
    profile: WorkerProfile,
    favoriteIds?: Set<string>,
  ): JobDto {
    const breakdown = this.matching.score(posting.criteria, profile);
    const near = this.matching.nearestLocation(profile, posting.lat, posting.lng);
    const distanceKm = near ? Math.round(near.distanceKm * 10) / 10 : null;
    const minutes = distanceKm != null ? travelMinutes(distanceKm) : null;

    const gewerkMatch = profile.gewerke.includes(posting.gewerk);
    const reasons: string[] = [];
    if (gewerkMatch) reasons.push('Dein Gewerk');
    if (minutes != null && minutes <= 30 && near) {
      reasons.push(`${minutes} Min. von „${near.location.label}“`);
    }
    if (posting.montage === 'Jeden Abend zuhause') reasons.push('Keine Montage');
    if (posting.fahrzeitIstArbeitszeit) reasons.push('Fahrzeit ist Arbeitszeit');

    return {
      id: posting.id,
      title: posting.title,
      employer: posting.company.name,
      gewerk: posting.gewerk,
      description: posting.description,
      city: posting.city || posting.company.ort,
      distanceKm,
      travelMinutes: minutes,
      lat: posting.lat,
      lng: posting.lng,
      startLabel: near?.location.label ?? null,
      startLat: near?.location.lat ?? null,
      startLng: near?.location.lng ?? null,
      salaryMin: posting.salaryMin,
      salaryMax: posting.salaryMax,
      tags: posting.tags,
      conditions: {
        montage: posting.montage,
        fahrzeitIstArbeitszeit: posting.fahrzeitIstArbeitszeit,
        startpunkt: posting.startpunkt,
        urlaubstage: posting.urlaubstage,
        start: posting.startText,
        extras: posting.extras,
      },
      recommended: gewerkMatch && breakdown.score >= 70,
      matchReasons: reasons,
      matchScore: breakdown.score,
      matchBreakdown: breakdown,
      createdAt: posting.createdAt.toISOString(),
      favorite: favoriteIds?.has(posting.id) ?? false,
      companyDescription: posting.company.description,
      companySlogan: posting.company.slogan,
      benefits: posting.company.benefits,
      companyLogo: posting.company.logo,
      companyGruendungsjahr: posting.company.gruendungsjahr,
      companyMitarbeiter: posting.company.mitarbeiter,
      companyWebsite: posting.company.website,
      companyOrt: posting.company.ort,
      companyStrasse: posting.company.strasse,
      companyPlz: posting.company.plz,
      companyKontaktName: posting.company.kontaktName,
    };
  }

  /** Posting-IDs auf der Merkliste des Nutzers. */
  private async favoriteIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      select: { jobPostingId: true },
    });
    return new Set(rows.map((r) => r.jobPostingId));
  }

  private postingInclude() {
    return { company: true, criteria: { include: { question: true } } } as const;
  }

  async listJobs(payload: JwtPayload, q: ListJobsQueryDto): Promise<JobDto[]> {
    const user = await this.auth.getActiveUser(payload);
    const profile = this.matching.extractProfile(user);

    const [postings, favorites] = await Promise.all([
      this.prisma.jobPosting.findMany({
        where: { status: 'ACTIVE' },
        include: this.postingInclude(),
        orderBy: { createdAt: 'desc' },
      }) as Promise<PostingWithRelations[]>,
      this.favoriteIds(user.id),
    ]);

    const gewerke = (q.gewerke ?? '')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
    const needle = (q.query ?? '').trim().toLowerCase();

    let jobs = postings.map((p) => this.buildJobDto(p, profile, favorites));

    jobs = jobs.filter((j) => {
      if (
        needle &&
        !`${j.title} ${j.employer} ${j.city} ${j.gewerk} ${j.tags.join(' ')}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      if (gewerke.length && !gewerke.includes(j.gewerk)) return false;
      if (
        q.maxTravelMinutes &&
        (j.travelMinutes == null || j.travelMinutes > q.maxTravelMinutes)
      ) {
        return false;
      }
      if (q.minSalary && (j.salaryMax ?? 0) < q.minSalary) return false;
      if (q.abendsZuhause && j.conditions.montage !== 'Jeden Abend zuhause') {
        return false;
      }
      if (q.fahrzeitIstArbeitszeit && !j.conditions.fahrzeitIstArbeitszeit) {
        return false;
      }
      return true;
    });

    const byTravel = (a: JobDto, b: JobDto) =>
      (a.travelMinutes ?? 9_999) - (b.travelMinutes ?? 9_999);

    jobs.sort((a, b) => {
      if (q.sort === 'fahrzeit') return byTravel(a, b);
      if (q.sort === 'gehalt') return (b.salaryMax ?? 0) - (a.salaryMax ?? 0);
      if (q.sort === 'neueste') return b.createdAt.localeCompare(a.createdAt);
      // Relevanz (Standard): bester Match zuerst, dann kurze Fahrzeit.
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return byTravel(a, b);
    });

    return jobs;
  }

  async getJob(payload: JwtPayload, id: string): Promise<JobDto> {
    const user = await this.auth.getActiveUser(payload);
    const posting = (await this.prisma.jobPosting.findFirst({
      where: { id, status: { not: 'DRAFT' } },
      include: this.postingInclude(),
    })) as PostingWithRelations | null;
    if (!posting) throw new NotFoundException('Job not found');
    return this.buildJobDto(
      posting,
      this.matching.extractProfile(user),
      await this.favoriteIds(user.id),
    );
  }

  // ── Favorites (Merkliste) ─────────────────────────────────────────────────

  async listFavorites(payload: JwtPayload): Promise<JobDto[]> {
    const user = await this.auth.getActiveUser(payload);
    const profile = this.matching.extractProfile(user);
    const favorites = await this.prisma.favorite.findMany({
      where: { userId: user.id, jobPosting: { status: { not: 'ARCHIVED' } } },
      include: { jobPosting: { include: this.postingInclude() } },
      orderBy: { createdAt: 'desc' },
    });
    const ids = new Set(favorites.map((f) => f.jobPostingId));
    return favorites.map((f) =>
      this.buildJobDto(f.jobPosting as PostingWithRelations, profile, ids),
    );
  }

  async addFavorite(payload: JwtPayload, jobId: string) {
    const user = await this.auth.getActiveUser(payload);
    const posting = await this.prisma.jobPosting.findFirst({
      where: { id: jobId, status: { not: 'ARCHIVED' } },
    });
    if (!posting) throw new NotFoundException('Job not found');
    await this.prisma.favorite.upsert({
      where: { userId_jobPostingId: { userId: user.id, jobPostingId: jobId } },
      create: { userId: user.id, jobPostingId: jobId },
      update: {},
    });
    return { favorite: true };
  }

  async removeFavorite(payload: JwtPayload, jobId: string) {
    const user = await this.auth.getActiveUser(payload);
    await this.prisma.favorite.deleteMany({
      where: { userId: user.id, jobPostingId: jobId },
    });
    return { favorite: false };
  }

  // ── Applications ──────────────────────────────────────────────────────────

  async apply(payload: JwtPayload, jobId: string) {
    const user = await this.auth.getActiveUser(payload);
    const posting = await this.prisma.jobPosting.findFirst({
      where: { id: jobId, status: 'ACTIVE' },
    });
    if (!posting) throw new NotFoundException('Job not found');

    try {
      const app = await this.prisma.jobApplication.create({
        data: { jobPostingId: posting.id, userId: user.id },
      });
      return { id: app.id, status: APPLICATION_STATUS_DE[app.status] };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Du hast dich hier bereits beworben.');
      }
      throw e;
    }
  }

  async listApplications(payload: JwtPayload) {
    const user = await this.auth.getActiveUser(payload);
    const profile = this.matching.extractProfile(user);
    const apps = await this.prisma.jobApplication.findMany({
      where: { userId: user.id },
      include: { jobPosting: { include: this.postingInclude() } },
      orderBy: { updatedAt: 'desc' },
    });
    return apps.map((a) => ({
      id: a.id,
      status: APPLICATION_STATUS_DE[a.status],
      updatedAt: a.updatedAt.toISOString(),
      job: this.buildJobDto(a.jobPosting as PostingWithRelations, profile),
    }));
  }

  // ── Offers ────────────────────────────────────────────────────────────────

  async listOffers(payload: JwtPayload) {
    const user = await this.auth.getActiveUser(payload);
    const profile = this.matching.extractProfile(user);
    const offers = await this.prisma.jobOffer.findMany({
      where: { userId: user.id },
      include: { jobPosting: { include: this.postingInclude() } },
      orderBy: { createdAt: 'desc' },
    });
    return offers.map((o) => ({
      id: o.id,
      message: o.message,
      contactPerson:
        o.contactPerson || o.jobPosting.company.kontaktName || '',
      receivedAt: o.createdAt.toISOString(),
      status: OFFER_STATUS_DE[o.status],
      job: this.buildJobDto(o.jobPosting as PostingWithRelations, profile),
    }));
  }

  async respondOffer(payload: JwtPayload, id: string, dto: RespondOfferDto) {
    const user = await this.auth.getActiveUser(payload);
    const offer = await this.prisma.jobOffer.findFirst({
      where: { id, userId: user.id },
    });
    if (!offer) throw new NotFoundException('Offer not found');

    const status: JobOfferStatus =
      dto.decision === 'angenommen' ? 'ACCEPTED' : 'DECLINED';
    await this.prisma.jobOffer.update({
      where: { id: offer.id },
      data: {
        status,
        declineReason: dto.decision === 'abgelehnt' ? (dto.reason ?? null) : null,
      },
    });
    return { status: dto.decision };
  }

  // ── Contact requests (worker side: approve/decline the release) ──────────

  async listContactRequests(payload: JwtPayload) {
    const user = await this.auth.getActiveUser(payload);
    const requests = await this.prisma.contactRequest.findMany({
      where: { userId: user.id },
      include: { company: true },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => ({
      id: r.id,
      company: r.company.name,
      companySlogan: r.company.slogan,
      position: r.position,
      status: CONTACT_STATUS_DE[r.status] ?? r.status.toLowerCase(),
      sentAt: r.createdAt.toISOString(),
    }));
  }

  async respondContactRequest(
    payload: JwtPayload,
    id: string,
    dto: RespondContactRequestDto,
  ) {
    const user = await this.auth.getActiveUser(payload);
    const request = await this.prisma.contactRequest.findFirst({
      where: { id, userId: user.id },
    });
    if (!request) throw new NotFoundException('Request not found');

    const status = dto.decision === 'freigeben' ? 'APPROVED' : 'DECLINED';
    await this.prisma.contactRequest.update({
      where: { id: request.id },
      data: { status },
    });
    return { status: CONTACT_STATUS_DE[status] };
  }

  // ── Work locations (stored inside User.profileData step "3") ─────────────

  async getWorkLocations(payload: JwtPayload) {
    const user = await this.auth.getActiveUser(payload);
    return this.matching.extractProfile(user).workLocations;
  }

  async saveWorkLocations(payload: JwtPayload, dto: SaveWorkLocationsDto) {
    const user = await this.auth.getActiveUser(payload);
    const pd = (user.profileData ?? {}) as Record<string, unknown>;
    const step3 = (pd['3'] ?? {}) as Record<string, unknown>;
    const profileData = {
      ...pd,
      '3': { ...step3, workLocations: dto.locations },
    } as unknown as Prisma.InputJsonValue;

    await this.prisma.user.update({
      where: { id: user.id },
      data: { profileData },
    });
    return dto.locations;
  }

  // ── Profile score ────────────────────────────────────────────────────────

  async profileScore(payload: JwtPayload) {
    const user = await this.auth.getActiveUser(payload);
    const p = this.matching.extractProfile(user);

    const checks: {
      done: boolean;
      gap: { id: string; label: string; extraJobs: number; href: string };
    }[] = [
      {
        done: p.gewerke.length > 0,
        gap: { id: 'gewerk', label: 'Gewerk angeben', extraJobs: 40, href: '/einstellungen' },
      },
      {
        done: p.erfahrungJahre !== null,
        gap: { id: 'erfahrung', label: 'Berufserfahrung ergänzen', extraJobs: 18, href: '/einstellungen' },
      },
      {
        done: p.zertifikate.length > 0,
        gap: { id: 'zertifikate', label: 'Qualifikationen eintragen (z. B. Führerschein BE)', extraJobs: 12, href: '/einstellungen' },
      },
      {
        done: p.workLocations.length > 0,
        gap: { id: 'orte', label: 'Arbeitsorte & Radius festlegen', extraJobs: 23, href: '/einstellungen' },
      },
      {
        done: user.phoneVerified,
        gap: { id: 'telefon', label: 'Telefonnummer bestätigen', extraJobs: 7, href: '/einstellungen' },
      },
      {
        done: p.hasAvatar,
        gap: { id: 'foto', label: 'Profilbild hinzufügen', extraJobs: 4, href: '/einstellungen' },
      },
    ];

    const doneCount = checks.filter((c) => c.done).length;
    return {
      percent: Math.round((doneCount / checks.length) * 100),
      gaps: checks
        .filter((c) => !c.done)
        .map((c) => c.gap)
        .sort((a, b) => b.extraJobs - a.extraJobs),
    };
  }

  /** Convenience for greeting/nav — the raw extracted profile. */
  async myMatchingProfile(payload: JwtPayload) {
    const user = await this.auth.getActiveUser(payload);
    const profile = this.matching.extractProfile(user);
    const questions = await this.matching.listQuestions();
    return {
      gewerke: profile.gewerke,
      erfahrungJahre: profile.erfahrungJahre,
      zertifikate: profile.zertifikate,
      bereitschaft: profile.bereitschaft,
      workLocations: profile.workLocations,
      // Per-question derived values — feeds the transparency view.
      values: questions.map((q) => ({
        questionKey: q.key,
        label: q.label,
        value: this.matching.workerValue(q, profile),
      })),
    };
  }
}
