import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Partner, Prisma, ReferralStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthConfig, OtpConfig } from '../config/configuration';
import { hashPassword, verifyPassword } from '../common/crypto/password.util';
import { hmacHash } from '../common/crypto/crypto.util';
import { isValidPhone, normalizePhone } from '../common/contact/contact.util';
import { JwtPayload, signJwt } from '../auth/jwt';
import { verifyVerificationToken } from '../otp/verification-token';
import { RegisterPartnerDto } from './dto/register-partner.dto';
import { LoginPartnerDto } from './dto/login-partner.dto';
import { UpdatePayoutDto } from './dto/payout.dto';

// Fixed reward per successful placement: 100 €.
const REWARD_CENTS = 10_000;
// Partner sessions are long-lived (there is no separate login page yet), so the
// stored token keeps them signed in for a month.
const PARTNER_TTL_SECONDS = 60 * 60 * 24 * 30;
// Slugs we never hand out.
const RESERVED_SLUGS = new Set([
  'portawerk',
  'admin',
  'test',
  'team',
  'support',
  'info',
  'api',
  'www',
  'r',
]);
// Dummy hash so login timing doesn't reveal whether an identifier exists.
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

const MONTHS_DE = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

export interface PublicPartner {
  id: string;
  name: string;
  slug: string;
  link: string;
  phone: string;
  email: string | null;
  phoneVerified: boolean;
  status: Partner['status'];
  createdAt: string;
  lastLoginAt: string | null;
  payout: { iban: string | null; holder: string | null } | null;
}

export interface PartnerSession {
  accessToken: string;
  expiresAt: string;
  partner: PublicPartner;
}

@Injectable()
export class PartnerService {
  private readonly logger = new Logger(PartnerService.name);
  private readonly jwtSecret: string;
  private readonly verificationTokenSecret: string;
  private readonly hashingSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly audit: AuditService,
  ) {
    this.jwtSecret = config.get<AuthConfig>('auth')!.jwtSecret;
    const otp = config.get<OtpConfig>('otp')!;
    this.verificationTokenSecret = otp.verificationTokenSecret;
    this.hashingSecret = otp.hashingSecret;
  }

  // ── Slug helpers ────────────────────────────────────────────────────────────

  private normalizeSlug(input: string): string {
    return input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20);
  }

  /** Whether a slug is well-formed, not reserved, and not taken. */
  async slugAvailable(input: string): Promise<{ slug: string; available: boolean }> {
    const slug = this.normalizeSlug(input);
    if (slug.length < 3 || RESERVED_SLUGS.has(slug)) {
      return { slug, available: false };
    }
    const existing = await this.prisma.partner.findUnique({ where: { slug } });
    return { slug, available: !existing };
  }

  // ── Registration ────────────────────────────────────────────────────────────

  async register(dto: RegisterPartnerDto, ip?: string): Promise<PartnerSession> {
    const slug = this.normalizeSlug(dto.slug);
    if (slug.length < 3 || RESERVED_SLUGS.has(slug)) {
      throw new BadRequestException('This link is not available');
    }
    const phone = normalizePhone(dto.phone);
    if (!isValidPhone(phone)) {
      throw new BadRequestException('Invalid phone number');
    }

    // If a verification token is supplied it MUST be valid and match this phone
    // (→ phoneVerified). Absent is allowed so signup works before SMS delivery
    // is configured; a supplied-but-wrong token is still rejected.
    let phoneVerified = false;
    let usedJti: { jti: string; exp: number } | null = null;
    if (dto.verificationToken) {
      const proof = verifyVerificationToken(
        dto.verificationToken,
        this.verificationTokenSecret,
      );
      if (!proof || proof.channel !== 'SMS' || proof.contact !== phone) {
        throw new ForbiddenException(
          'Phone verification is invalid or does not match',
        );
      }
      phoneVerified = true;
      usedJti = { jti: proof.jti, exp: proof.exp };
    }

    // Fail early on taken slug / phone (also guarded by unique indexes).
    const clash = await this.prisma.partner.findFirst({
      where: { OR: [{ slug }, { phone }] },
    });
    if (clash) {
      throw new ConflictException(
        clash.slug === slug
          ? 'This link is already taken'
          : 'An account with this phone number already exists',
      );
    }

    const passwordHash = await hashPassword(dto.password);

    const createData = {
      name: dto.name.trim(),
      slug,
      phone,
      email: dto.email?.trim() || null,
      passwordHash,
      phoneVerified,
    };

    let partner: Partner;
    try {
      // When a token was used, consume its jti in the same transaction so one
      // SMS check can create at most one partner (replay protection).
      partner = usedJti
        ? await this.prisma.$transaction(async (tx) => {
            await tx.usedVerificationToken.create({
              data: { jti: usedJti!.jti, expiresAt: new Date(usedJti!.exp) },
            });
            return tx.partner.create({ data: createData });
          })
        : await this.prisma.partner.create({ data: createData });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const target = (err.meta?.target as string[] | undefined)?.join(',') ?? '';
        if (target.includes('jti')) {
          throw new ForbiddenException('This verification was already used');
        }
        throw new ConflictException(
          target.includes('slug')
            ? 'This link is already taken'
            : 'An account with this phone number already exists',
        );
      }
      throw err;
    }

    await this.audit.record({
      action: 'partner.registered',
      entityType: 'Partner',
      entityId: partner.id,
      actorId: partner.id,
      ip,
    });
    return this.issueSession(partner);
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginPartnerDto, ip?: string): Promise<PartnerSession> {
    const invalid = new UnauthorizedException('Invalid credentials');
    const id = dto.identifier.trim();
    // Identifier is either a phone or a slug.
    const maybePhone = normalizePhone(id);
    const partner = await this.prisma.partner.findFirst({
      where: { OR: [{ phone: maybePhone }, { slug: this.normalizeSlug(id) }] },
    });
    const ok = await verifyPassword(
      dto.password,
      partner?.passwordHash ?? DUMMY_HASH,
    );
    if (!partner || !ok || partner.status !== 'ACTIVE') {
      await this.audit.record({
        action: 'partner.login_failed',
        entityType: 'Partner',
        entityId: partner?.id,
        ip,
      });
      throw invalid;
    }
    const updated = await this.prisma.partner.update({
      where: { id: partner.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.record({
      action: 'partner.login',
      entityType: 'Partner',
      entityId: partner.id,
      actorId: partner.id,
      ip,
    });
    return this.issueSession(updated);
  }

  // ── Session / profile ───────────────────────────────────────────────────────

  async getActivePartner(payload: JwtPayload): Promise<Partner> {
    const partner = await this.prisma.partner.findUnique({
      where: { id: payload.sub },
    });
    if (
      !partner ||
      partner.status !== 'ACTIVE' ||
      partner.tokenVersion !== payload.ver
    ) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return partner;
  }

  async getProfile(payload: JwtPayload): Promise<PublicPartner> {
    return this.toPublic(await this.getActivePartner(payload));
  }

  async logout(payload: JwtPayload): Promise<void> {
    const partner = await this.getActivePartner(payload);
    await this.prisma.partner.update({
      where: { id: partner.id },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  async updatePayout(
    payload: JwtPayload,
    dto: UpdatePayoutDto,
  ): Promise<PublicPartner> {
    const partner = await this.getActivePartner(payload);
    const updated = await this.prisma.partner.update({
      where: { id: partner.id },
      data: {
        payoutIban: dto.iban ? dto.iban.replace(/\s+/g, '').toUpperCase() : undefined,
        payoutHolder: dto.holder?.trim() ?? undefined,
      },
    });
    await this.audit.record({
      action: 'partner.payout_updated',
      entityType: 'Partner',
      entityId: partner.id,
      actorId: partner.id,
    });
    return this.toPublic(updated);
  }

  // ── Dashboard aggregation ─────────────────────────────────────────────────

  async dashboard(payload: JwtPayload): Promise<Record<string, unknown>> {
    const partner = await this.getActivePartner(payload);
    const referrals = await this.prisma.referral.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'desc' },
    });

    const placed = referrals.filter(
      (r) => r.status === 'PLACED' || r.status === 'PAID',
    );
    const inPlacement = referrals.filter((r) => r.status === 'IN_PLACEMENT');
    const earnedCents = placed.reduce((s, r) => s + r.rewardCents, 0);
    const referredCount = referrals.length;
    const placedCount = placed.length;
    const conversion = referredCount
      ? Math.round((placedCount / referredCount) * 100)
      : 0;

    // Last 6 months of realized earnings, bucketed by placedAt.
    const now = new Date();
    const monthly: { month: string; cents: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const cents = placed
        .filter(
          (r) =>
            r.placedAt &&
            r.placedAt.getFullYear() === d.getFullYear() &&
            r.placedAt.getMonth() === d.getMonth(),
        )
        .reduce((s, r) => s + r.rewardCents, 0);
      monthly.push({ month: MONTHS_DE[d.getMonth()], cents });
    }

    const list = referrals.map((r) => ({
      id: r.id,
      name: r.candidateName ?? 'Handwerker',
      trade: r.candidateTrade ?? 'Handwerk',
      date: `${String(r.createdAt.getDate()).padStart(2, '0')}.${String(
        r.createdAt.getMonth() + 1,
      ).padStart(2, '0')}.`,
      status: r.status,
      rewardCents: r.rewardCents,
    }));

    return {
      name: partner.name,
      firstName: partner.name.split(' ')[0] || partner.name,
      slug: partner.slug,
      link: `portawerk.de/r/${partner.slug}`,
      earnedCents,
      referredCount,
      placedCount,
      inPlacementCount: inPlacement.length,
      conversion,
      monthly,
      referrals: list,
      payout: partner.payoutIban
        ? { iban: partner.payoutIban, holder: partner.payoutHolder }
        : null,
      ranking: await this.ranking(partner.id),
    };
  }

  /** Leaderboard by successful placements, with the caller's own rank. */
  private async ranking(
    partnerId: string,
  ): Promise<{ top: { rank: number; name: string }[]; myRank: number }> {
    const grouped = await this.prisma.referral.groupBy({
      by: ['partnerId'],
      where: { status: { in: ['PLACED', 'PAID'] } },
      _count: { _all: true },
    });
    grouped.sort((a, b) => b._count._all - a._count._all);
    const ids = grouped.map((g) => g.partnerId);
    const partners = ids.length
      ? await this.prisma.partner.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      : [];
    const nameOf = (id: string) => {
      const p = partners.find((x) => x.id === id);
      if (!p) return 'Partner';
      const [first, ...rest] = p.name.split(' ');
      const last = rest.length ? ` ${rest[rest.length - 1][0]}.` : '';
      return `${first}${last}`;
    };
    const top = grouped
      .slice(0, 6)
      .map((g, i) => ({ rank: i + 1, name: nameOf(g.partnerId) }));
    const idx = grouped.findIndex((g) => g.partnerId === partnerId);
    const myRank = idx >= 0 ? idx + 1 : grouped.length + 1;
    return { top, myRank };
  }

  // ── Referral linking (called from the applicant registration flow) ──────────

  /**
   * Best-effort: when a Handwerker registers with ?ref=<slug>, record a referral
   * for the matching partner. Never throws into the registration path.
   */
  async linkReferral(
    referredBy: string,
    user: { id: string; firstName: string; lastName: string; trade?: string | null },
  ): Promise<void> {
    try {
      const slug = this.normalizeSlug(referredBy);
      if (slug.length < 3) return;
      const partner = await this.prisma.partner.findUnique({ where: { slug } });
      if (!partner) return;
      const lastInitial = user.lastName?.trim()?.[0];
      const candidateName = `${user.firstName.trim()}${
        lastInitial ? ` ${lastInitial}.` : ''
      }`;
      await this.prisma.referral.create({
        data: {
          partnerId: partner.id,
          referredUserId: user.id,
          candidateName,
          candidateTrade: user.trade?.trim() || null,
        },
      });
      await this.audit.record({
        action: 'partner.referral_created',
        entityType: 'Partner',
        entityId: partner.id,
        metadata: { via: 'registration' },
      });
    } catch (err) {
      // A duplicate (same user already linked) or any failure must not break
      // registration — just log it.
      this.logger.warn(
        `linkReferral failed for ref="${referredBy}": ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
  }

  // ── Click tracking ──────────────────────────────────────────────────────────

  async recordClick(slugInput: string, ip?: string): Promise<{ ok: boolean }> {
    const slug = this.normalizeSlug(slugInput);
    if (slug.length < 3) return { ok: false };
    try {
      await this.prisma.referralClick.create({
        data: {
          slug,
          ipHash: ip ? hmacHash(`click:${ip}`, this.hashingSecret) : null,
        },
      });
    } catch {
      /* click tracking is best-effort */
    }
    return { ok: true };
  }

  // ── Admin: placement lifecycle ──────────────────────────────────────────────

  async listReferrals(): Promise<unknown[]> {
    return this.prisma.referral.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { partner: { select: { name: true, slug: true } } },
    });
  }

  async setReferralStatus(
    id: string,
    status: ReferralStatus,
    ip?: string,
  ): Promise<{ id: string; status: ReferralStatus; rewardCents: number }> {
    const ref = await this.prisma.referral.findUnique({ where: { id } });
    if (!ref) throw new NotFoundException('Referral not found');

    const data: Prisma.ReferralUpdateInput = { status };
    if (status === 'PLACED') {
      data.rewardCents = REWARD_CENTS;
      data.placedAt = ref.placedAt ?? new Date();
    } else if (status === 'PAID') {
      data.rewardCents = ref.rewardCents || REWARD_CENTS;
      data.placedAt = ref.placedAt ?? new Date();
      data.paidAt = new Date();
    } else if (status === 'REGISTERED' || status === 'IN_PLACEMENT') {
      // Reverting before a successful placement clears the reward.
      data.rewardCents = 0;
      data.placedAt = null;
      data.paidAt = null;
    }

    const updated = await this.prisma.referral.update({ where: { id }, data });
    await this.audit.record({
      action: 'partner.referral_status_changed',
      entityType: 'Referral',
      entityId: id,
      metadata: { status },
      ip,
    });
    return {
      id: updated.id,
      status: updated.status,
      rewardCents: updated.rewardCents,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private issueSession(partner: Partner): PartnerSession {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + PARTNER_TTL_SECONDS;
    const accessToken = signJwt(
      {
        sub: partner.id,
        purpose: 'partner',
        ver: partner.tokenVersion,
        iat: now,
        exp,
      },
      this.jwtSecret,
    );
    return {
      accessToken,
      expiresAt: new Date(exp * 1000).toISOString(),
      partner: this.toPublic(partner),
    };
  }

  private toPublic(partner: Partner): PublicPartner {
    return {
      id: partner.id,
      name: partner.name,
      slug: partner.slug,
      link: `portawerk.de/r/${partner.slug}`,
      phone: partner.phone,
      email: partner.email ?? null,
      phoneVerified: partner.phoneVerified,
      status: partner.status,
      createdAt: partner.createdAt.toISOString(),
      lastLoginAt: partner.lastLoginAt ? partner.lastLoginAt.toISOString() : null,
      payout: partner.payoutIban
        ? { iban: partner.payoutIban, holder: partner.payoutHolder ?? null }
        : null,
    };
  }
}
