import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Company,
  JobOfferStatus,
  JobPosting,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { JwtPayload } from '../auth/jwt';
import {
  CriterionWithQuestion,
  DeclineContext,
  MatchBreakdown,
  MatchingService,
  WorkerProfile,
} from '../matching/matching.service';
import { RoutingService } from '../matching/routing.service';
import { haversineKm, travelMinutes } from '../matching/geo.util';
import {
  APPLICATION_STATUS_DE,
  CONTACT_STATUS_DE,
  OFFER_STATUS_DE,
} from '../common/status-labels';
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

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly matching: MatchingService,
    private readonly routing: RoutingService,
  ) {}

  /**
   * Exact driving time for ONE job from a chosen origin (a saved work
   * location or the browser's current position). The listing itself shows
   * the cheap air-line estimate; this is the on-demand precision step.
   */
  async travelTime(payload: JwtPayload, jobId: string, lat: number, lng: number) {
    await this.auth.getActiveUser(payload);
    const posting = await this.prisma.jobPosting.findFirst({
      where: { id: jobId, status: { not: 'DRAFT' } },
      select: { lat: true, lng: true },
    });
    if (!posting || posting.lat == null || posting.lng == null) {
      throw new NotFoundException('Job not found');
    }
    const distanceKm =
      Math.round(
        haversineKm(lat, lng, posting.lat, posting.lng) * 10,
      ) / 10;
    const [exact] = await this.routing.drivingMinutes([
      { from: { lat, lng }, to: { lat: posting.lat, lng: posting.lng } },
    ]);
    return {
      minutes: exact ?? travelMinutes(distanceKm),
      distanceKm,
      // false = OSRM war nicht erreichbar, Wert ist die Schätzformel.
      exact: exact != null,
    };
  }

  // ── Catalog ───────────────────────────────────────────────────────────────

  listQuestions() {
    return this.matching.listQuestions();
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────

  private buildJobDto(
    posting: PostingWithRelations,
    profile: WorkerProfile,
    favoriteIds?: Set<string>,
    declineCtx?: DeclineContext,
  ): JobDto {
    let breakdown = this.matching.score(posting.criteria, profile);
    const near = this.matching.nearestLocation(profile, posting.lat, posting.lng);
    const distanceKm = near ? Math.round(near.distanceKm * 10) / 10 : null;
    const minutes = distanceKm != null ? travelMinutes(distanceKm) : null;

    // Absage-Feedback als transparenter Punktabzug.
    if (declineCtx) {
      breakdown = this.matching.applyAdjustments(
        breakdown,
        this.matching.declineAdjustments(declineCtx, {
          companyId: posting.companyId,
          travelMinutes: minutes,
          salaryMax: posting.salaryMax,
        }),
      );
    }

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

  /**
   * Schreibende Handwerker-Aktionen (bewerben, merken, Angebot/Freigabe
   * beantworten, Arbeitsorte speichern) sind APPLICANT-Konten vorbehalten —
   * ein Betriebskonto hat hier fachlich nichts verloren.
   */
  private async requireApplicant(payload: JwtPayload) {
    const user = await this.auth.getActiveUser(payload);
    if (user.role !== 'APPLICANT') {
      throw new ForbiddenException('Applicant account required');
    }
    return user;
  }

  /** Posting-IDs auf der Merkliste des Nutzers. */
  private async favoriteIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      select: { jobPostingId: true },
    });
    return new Set(rows.map((r) => r.jobPostingId));
  }

  /** Abgelehnte Angebote des Nutzers → Feedback-Kontext fürs Scoring. */
  private async declineContext(userId: string): Promise<DeclineContext> {
    const declined = await this.prisma.jobOffer.findMany({
      where: { userId, status: 'DECLINED' },
      select: {
        declineReason: true,
        jobPosting: { select: { companyId: true, salaryMax: true } },
      },
    });
    const byCompany = new Map<string, number>();
    let zuWeitCount = 0;
    let gehaltCount = 0;
    let gehaltDeclinedMax: number | null = null;
    for (const o of declined) {
      const c = o.jobPosting.companyId;
      byCompany.set(c, (byCompany.get(c) ?? 0) + 1);
      if (o.declineReason === 'zu_weit') zuWeitCount++;
      if (o.declineReason === 'gehalt') {
        gehaltCount++;
        if (o.jobPosting.salaryMax != null) {
          gehaltDeclinedMax = Math.max(
            gehaltDeclinedMax ?? 0,
            o.jobPosting.salaryMax,
          );
        }
      }
    }
    return { byCompany, zuWeitCount, gehaltCount, gehaltDeclinedMax };
  }

  private postingInclude() {
    return { company: true, criteria: { include: { question: true } } } as const;
  }

  async listJobs(payload: JwtPayload, q: ListJobsQueryDto): Promise<JobDto[]> {
    const user = await this.auth.getActiveUser(payload);
    const profile = this.matching.extractProfile(user);

    const gewerke = (q.gewerke ?? '')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
    const needle = (q.query ?? '').trim().toLowerCase();

    // Exakte Filter erledigt die Datenbank — sonst wandert die komplette
    // Inseratstabelle (inklusive Firmenlogos) in den Speicher, nur um dort
    // weggeworfen zu werden. Fahrzeit und Sortierung nach Score bleiben in
    // JavaScript, weil beide erst berechnet werden müssen.
    const [postings, favorites, declineCtx] = await Promise.all([
      this.prisma.jobPosting.findMany({
        where: {
          status: 'ACTIVE',
          ...(gewerke.length ? { gewerk: { in: gewerke } } : {}),
          ...(q.minSalary ? { salaryMax: { gte: q.minSalary } } : {}),
          ...(q.abendsZuhause ? { montage: 'Jeden Abend zuhause' } : {}),
          ...(q.fahrzeitIstArbeitszeit ? { fahrzeitIstArbeitszeit: true } : {}),
        },
        include: this.postingInclude(),
        orderBy: { createdAt: 'desc' },
      }) as Promise<PostingWithRelations[]>,
      this.favoriteIds(user.id),
      this.declineContext(user.id),
    ]);

    let jobs = postings.map((p) =>
      this.buildJobDto(p, profile, favorites, declineCtx),
    );

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
      await this.declineContext(user.id),
    );
  }

  // ── Favorites (Merkliste) ─────────────────────────────────────────────────

  async listFavorites(payload: JwtPayload): Promise<JobDto[]> {
    const user = await this.auth.getActiveUser(payload);
    const profile = this.matching.extractProfile(user);
    const favorites = await this.prisma.favorite.findMany({
      // Nur veröffentlichte Stände: ein Betrieb, der ein Inserat zurück auf
      // Entwurf setzt, darf es über die Merkliste nicht weiter preisgeben.
      where: { userId: user.id, jobPosting: { status: { in: ['ACTIVE', 'PAUSED'] } } },
      include: { jobPosting: { include: this.postingInclude() } },
      orderBy: { createdAt: 'desc' },
    });
    const ids = new Set(favorites.map((f) => f.jobPostingId));
    const declineCtx = await this.declineContext(user.id);
    return favorites.map((f) =>
      this.buildJobDto(f.jobPosting as PostingWithRelations, profile, ids, declineCtx),
    );
  }

  async addFavorite(payload: JwtPayload, jobId: string) {
    const user = await this.requireApplicant(payload);
    const posting = await this.prisma.jobPosting.findFirst({
      where: { id: jobId, status: { in: ['ACTIVE', 'PAUSED'] } },
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
    const user = await this.requireApplicant(payload);
    await this.prisma.favorite.deleteMany({
      where: { userId: user.id, jobPostingId: jobId },
    });
    return { favorite: false };
  }

  // ── Applications ──────────────────────────────────────────────────────────

  async apply(payload: JwtPayload, jobId: string) {
    const user = await this.requireApplicant(payload);
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
    const [favorites, declineCtx] = await Promise.all([
      this.favoriteIds(user.id),
      this.declineContext(user.id),
    ]);
    const apps = await this.prisma.jobApplication.findMany({
      where: { userId: user.id },
      include: { jobPosting: { include: this.postingInclude() } },
      orderBy: { updatedAt: 'desc' },
    });
    return apps.map((a) => ({
      id: a.id,
      status: APPLICATION_STATUS_DE[a.status],
      updatedAt: a.updatedAt.toISOString(),
      job: this.buildJobDto(
        a.jobPosting as PostingWithRelations,
        profile,
        favorites,
        declineCtx,
      ),
    }));
  }

  // ── Offers ────────────────────────────────────────────────────────────────

  async listOffers(payload: JwtPayload) {
    const user = await this.auth.getActiveUser(payload);
    const profile = this.matching.extractProfile(user);
    const [favorites, declineCtx] = await Promise.all([
      this.favoriteIds(user.id),
      this.declineContext(user.id),
    ]);
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
      job: this.buildJobDto(
        o.jobPosting as PostingWithRelations,
        profile,
        favorites,
        declineCtx,
      ),
    }));
  }

  async respondOffer(payload: JwtPayload, id: string, dto: RespondOfferDto) {
    const user = await this.requireApplicant(payload);
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
    const user = await this.requireApplicant(payload);
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
    const user = await this.requireApplicant(payload);
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
