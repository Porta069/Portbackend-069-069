import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../notifications/email.service';
import { AuthConfig } from '../config/configuration';
import { hashPassword, verifyPassword } from '../common/crypto/password.util';
import { randomToken, sha256 } from '../common/crypto/crypto.util';
import { promises as dnsPromises } from 'dns';
import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
} from '../common/contact/contact.util';

// A small blocklist of throwaway/disposable email domains.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'trashmail.com',
  'yopmail.com',
  'sharklasers.com',
  'getnada.com',
  'dispostable.com',
  'temp-mail.org',
]);
import { JwtPayload, signJwt, verifyJwt } from './jwt';
import { PLACEHOLDER_STEPS, TOTAL_STEPS } from './registration-steps';
import { CompleteRegistrationDto } from './dto/complete-registration.dto';
import { UpdateProfileDto } from './dto/account.dto';
import { OtpService } from '../otp/otp.service';

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: User['role'];
  companyName: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  avatar: string | null;
  status: User['status'];
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthSession {
  accessToken: string;
  expiresAt: string;
  user: PublicUser;
}

export interface WizardProgress {
  currentStep: number;
  totalSteps: number;
  steps: typeof PLACEHOLDER_STEPS;
}

// A stored dummy hash for a non-existent account, so login timing does not
// reveal whether an email is registered (equalizes the verify cost).
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly cfg: AuthConfig;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly otp: OtpService,
  ) {
    this.cfg = config.get<AuthConfig>('auth')!;
  }

  // ── Registration wizard ────────────────────────────────────────────────────

  /** Starts a new registration draft and returns a token to carry through it. */
  async startRegistration(ip?: string): Promise<{
    draftToken: string;
    progress: WizardProgress;
  }> {
    const expiresAt = new Date(
      Date.now() + this.cfg.registrationDraftTtlSeconds * 1000,
    );
    const draft = await this.prisma.registrationDraft.create({
      data: { expiresAt },
    });

    const draftToken = signJwt(
      {
        sub: draft.id,
        purpose: 'registration',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(expiresAt.getTime() / 1000),
      },
      this.cfg.jwtSecret,
    );

    await this.audit.record({
      action: 'registration.started',
      entityType: 'RegistrationDraft',
      entityId: draft.id,
      ip,
    });

    return {
      draftToken,
      progress: {
        currentStep: draft.currentStep,
        totalSteps: TOTAL_STEPS,
        steps: PLACEHOLDER_STEPS,
      },
    };
  }

  /** Stores an opaque payload for one of the placeholder steps (1–5). */
  async saveStep(
    draftToken: string,
    step: number,
    data: Record<string, unknown> | undefined,
  ): Promise<WizardProgress> {
    const draft = await this.loadDraft(draftToken);

    const stepData = {
      ...(draft.stepData as Record<string, unknown>),
      [String(step)]: data ?? {},
    };

    // Bound the accumulated wizard JSON (anti-abuse / storage bloat) — mirrors
    // the cap enforced on profileData in updateProfile.
    if (JSON.stringify(stepData).length > 200_000) {
      throw new BadRequestException('Registration data is too large');
    }

    const updated = await this.prisma.registrationDraft.update({
      where: { id: draft.id },
      data: {
        stepData: stepData as Prisma.InputJsonValue,
        currentStep: Math.max(draft.currentStep, step),
      },
    });

    return {
      currentStep: updated.currentStep,
      totalSteps: TOTAL_STEPS,
      steps: PLACEHOLDER_STEPS,
    };
  }

  /** Final contact step: validates, creates the account, issues a session. */
  async completeRegistration(
    dto: CompleteRegistrationDto,
    ip?: string,
  ): Promise<AuthSession> {
    const draft = await this.loadDraft(dto.draftToken);

    const email = normalizeEmail(dto.email);
    const phone = normalizePhone(dto.phone);
    if (!isValidPhone(phone)) {
      throw new BadRequestException('Invalid phone number');
    }

    // Fail early on a known-taken email (also guarded by the unique index).
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await hashPassword(dto.password);

    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        // Re-check the draft inside the transaction (single-use promotion).
        const fresh = await tx.registrationDraft.findUnique({
          where: { id: draft.id },
        });
        if (!fresh || fresh.completedAt || fresh.expiresAt < new Date()) {
          throw new BadRequestException(
            'Registration session is no longer valid',
          );
        }
        // Guard the JSON copied into profileData with the same cap as
        // updateProfile, so the registration path can't bypass it.
        const profileData = (fresh.stepData ?? {}) as Prisma.InputJsonValue;
        if (JSON.stringify(profileData).length > 200_000) {
          throw new BadRequestException('Registration data is too large');
        }
        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            phone,
            referredBy: dto.referredBy?.trim() || null,
            // Persist every onboarding answer (survey step 1 + AI step 4) so the
            // full profile is queryable per-user later.
            profileData,
          },
        });
        await tx.registrationDraft.update({
          where: { id: draft.id },
          data: { completedAt: new Date(), currentStep: TOTAL_STEPS },
        });
        return created;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw err;
    }

    await this.audit.record({
      action: 'registration.completed',
      entityType: 'User',
      entityId: user.id,
      actorId: user.id,
      ip,
    });

    return this.issueSession(user);
  }

  // ── Login / session ─────────────────────────────────────────────────────────

  /** Verifies credentials and issues an access token. Generic errors only. */
  async login(
    emailInput: string,
    password: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthSession> {
    const email = normalizeEmail(emailInput);
    const invalid = new UnauthorizedException('Invalid email or password');

    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always run a verify to equalize timing between "no such user" and
    // "wrong password".
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !ok || user.status !== 'ACTIVE') {
      await this.audit.record({
        action: 'auth.login_failed',
        entityType: 'User',
        entityId: user?.id,
        ip,
      });
      throw invalid;
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.record({
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      actorId: user.id,
      ip,
      metadata: userAgent ? { userAgent: userAgent.slice(0, 400) } : undefined,
    });

    return this.issueSession(updated);
  }

  /** Loads the current user profile for a valid access token. */
  async getProfile(payload: JwtPayload): Promise<PublicUser> {
    return this.toPublic(await this.getActiveUser(payload));
  }

  /** Revokes all outstanding tokens by bumping the user's token version. */
  async logout(payload: JwtPayload, ip?: string): Promise<void> {
    const user = await this.getActiveUser(payload);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    await this.audit.record({
      action: 'auth.logout',
      entityType: 'User',
      entityId: user.id,
      actorId: user.id,
      ip,
    });
  }

  /**
   * Resolves the user behind an access token and enforces revocation: the
   * account must exist, be active, and the token's `ver` must match.
   */
  async getActiveUser(payload: JwtPayload): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.tokenVersion !== payload.ver
    ) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }

  // ── Email deliverability check ──────────────────────────────────────────────

  /**
   * Live check whether an email is plausibly deliverable: valid syntax, not a
   * known disposable domain, and the domain publishes MX records (i.e. it can
   * actually receive mail). Does NOT probe the mailbox itself (unreliable +
   * privacy-invasive) — the real proof of ownership stays the OTP code.
   */
  async checkEmail(
    emailInput: string,
  ): Promise<{ deliverable: boolean; reason: string }> {
    const email = normalizeEmail(emailInput);
    if (!isValidEmail(email)) {
      return { deliverable: false, reason: 'invalid_syntax' };
    }
    const domain = email.split('@')[1];
    if (!domain) return { deliverable: false, reason: 'invalid_syntax' };
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return { deliverable: false, reason: 'disposable' };
    }
    try {
      // Bound the DNS lookup so a slow resolver can't pin the request.
      const mx = await Promise.race([
        dnsPromises.resolveMx(domain),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('dns_timeout')), 4000),
        ),
      ]);
      if (Array.isArray(mx) && mx.length > 0) {
        return { deliverable: true, reason: 'ok' };
      }
      return { deliverable: false, reason: 'no_mx' };
    } catch {
      // No MX (or lookup failed) — treat as not deliverable but non-fatal.
      return { deliverable: false, reason: 'no_mx' };
    }
  }

  // ── Account management (self-service) ───────────────────────────────────────

  /** PATCH /auth/me — edit name, phone and onboarding answers. */
  async updateProfile(
    payload: JwtPayload,
    dto: UpdateProfileDto,
    ip?: string,
  ): Promise<PublicUser> {
    const user = await this.getActiveUser(payload);
    const data: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) {
      const phone = normalizePhone(dto.phone);
      if (!isValidPhone(phone)) {
        throw new BadRequestException('Invalid phone number');
      }
      data.phone = phone;
      // A changed number is no longer proven — drop the verified flag so it
      // can't report "verified" for a number the user never confirmed.
      if (phone !== user.phone) data.phoneVerified = false;
    }
    if (dto.profileData !== undefined) {
      // Bound the JSON size to keep rows small (anti-abuse / storage bloat).
      if (JSON.stringify(dto.profileData).length > 200_000) {
        throw new BadRequestException('profileData is too large');
      }
      data.profileData = dto.profileData as Prisma.InputJsonValue;
    }
    if (dto.avatar !== undefined) {
      // Empty string clears the avatar; otherwise store the (resized) data URL.
      data.avatar = dto.avatar ? dto.avatar : null;
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data,
    });
    await this.audit.record({
      action: 'user.profile_updated',
      entityType: 'User',
      entityId: user.id,
      actorId: user.id,
      ip,
    });
    return this.toPublic(updated);
  }

  /** Marks the current user's email or phone as verified (after OTP success). */
  async setContactVerified(
    payload: JwtPayload,
    channel: 'email' | 'sms',
  ): Promise<PublicUser> {
    const user = await this.getActiveUser(payload);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data:
        channel === 'email'
          ? { emailVerified: true }
          : { phoneVerified: true },
    });
    await this.audit.record({
      action: channel === 'email' ? 'user.email_verified' : 'user.phone_verified',
      entityType: 'User',
      entityId: user.id,
      actorId: user.id,
    });
    return this.toPublic(updated);
  }

  /** Verifies the current user's email/phone with an OTP code + sets the flag. */
  async verifyContact(
    payload: JwtPayload,
    channel: 'email' | 'sms',
    code: string,
    ip?: string,
  ): Promise<PublicUser> {
    const user = await this.getActiveUser(payload);
    const contact = channel === 'email' ? user.email : user.phone;
    // Throws BadRequestException if the code is invalid/expired.
    await this.otp.verify(channel, contact, code, ip);
    return this.setContactVerified(payload, channel);
  }

  /** Changes the password (requires the current one) and re-issues the session. */
  async changePassword(
    payload: JwtPayload,
    currentPassword: string,
    newPassword: string,
    ip?: string,
  ): Promise<AuthSession> {
    const user = await this.getActiveUser(payload);
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await hashPassword(newPassword);
    // Bumping tokenVersion revokes every OTHER session; re-issue for this one.
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await this.audit.record({
      action: 'user.password_changed',
      entityType: 'User',
      entityId: user.id,
      actorId: user.id,
      ip,
    });
    return this.issueSession(updated);
  }

  /** Changes the email (requires the password to confirm). */
  async changeEmail(
    payload: JwtPayload,
    password: string,
    newEmailInput: string,
    ip?: string,
  ): Promise<PublicUser> {
    const user = await this.getActiveUser(payload);
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Password is incorrect');
    const email = normalizeEmail(newEmailInput);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== user.id) {
      throw new ConflictException('This email is already in use');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email,
        // A changed address is no longer proven — require re-verification so
        // the account can't claim "verified" for an unproven mailbox.
        ...(email !== user.email ? { emailVerified: false } : {}),
      },
    });
    await this.audit.record({
      action: 'user.email_changed',
      entityType: 'User',
      entityId: user.id,
      actorId: user.id,
      ip,
    });
    return this.toPublic(updated);
  }

  /** Permanently deletes the account (requires the password to confirm). */
  async deleteAccount(
    payload: JwtPayload,
    password: string,
    ip?: string,
  ): Promise<void> {
    const user = await this.getActiveUser(payload);
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Password is incorrect');
    await this.audit.record({
      action: 'user.deleted',
      entityType: 'User',
      entityId: user.id,
      actorId: user.id,
      ip,
    });
    await this.prisma.user.delete({ where: { id: user.id } });
  }

  /** GDPR data export — everything we hold about the user (no secrets). */
  async exportData(payload: JwtPayload): Promise<Record<string, unknown>> {
    const user = await this.getActiveUser(payload);
    return {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        companyName: user.companyName,
        referredBy: user.referredBy,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt
          ? user.lastLoginAt.toISOString()
          : null,
      },
      onboardingAnswers: user.profileData ?? null,
    };
  }

  /** Recent account activity (logins etc.) for the security screen. */
  async loginActivity(
    payload: JwtPayload,
  ): Promise<Array<{ at: string; action: string; device: string | null }>> {
    const user = await this.getActiveUser(payload);
    const events = await this.prisma.auditEvent.findMany({
      where: {
        actorId: user.id,
        action: {
          in: [
            'auth.login',
            'auth.logout',
            'user.password_changed',
            'auth.login_failed',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    return events.map((e) => ({
      at: e.createdAt.toISOString(),
      action: e.action,
      device:
        (e.metadata as { userAgent?: string } | null)?.userAgent ?? null,
    }));
  }

  // ── Password reset ──────────────────────────────────────────────────────────

  /**
   * Starts a password reset. Always returns the same generic result regardless
   * of whether the email exists (no account enumeration).
   */
  async forgotPassword(emailInput: string, ip?: string): Promise<void> {
    const email = normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user && user.status === 'ACTIVE') {
      const token = randomToken(32); // 256-bit, high entropy
      const tokenHash = sha256(Buffer.from(token, 'utf8'));
      const expiresAt = new Date(
        Date.now() + this.cfg.passwordResetTtlSeconds * 1000,
      );
      await this.prisma.passwordReset.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      const resetUrl = `${this.cfg.passwordResetUrl}?token=${token}`;
      try {
        await this.email.sendPasswordResetLink(user.email, resetUrl);
      } catch (err) {
        // Never surface delivery issues to the caller (enumeration channel).
        this.logger.error(
          'Password-reset email delivery failed',
          err instanceof Error ? err.stack : String(err),
        );
      }

      await this.audit.record({
        action: 'auth.password_reset_requested',
        entityType: 'User',
        entityId: user.id,
        ip,
      });
    }
  }

  /** Consumes a reset token, sets the new password, and revokes old tokens. */
  async resetPassword(
    token: string,
    newPassword: string,
    ip?: string,
  ): Promise<void> {
    const tokenHash = sha256(Buffer.from(token, 'utf8'));
    const invalid = new BadRequestException('Invalid or expired reset token');

    const reset = await this.prisma.passwordReset.findUnique({
      where: { tokenHash },
    });
    if (!reset || reset.consumedAt || reset.expiresAt < new Date()) {
      throw invalid;
    }

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      // Bumping tokenVersion invalidates every existing session for the user.
      this.prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      this.prisma.passwordReset.update({
        where: { id: reset.id },
        data: { consumedAt: new Date() },
      }),
      // Invalidate any other outstanding reset tokens for this user.
      this.prisma.passwordReset.updateMany({
        where: {
          userId: reset.userId,
          consumedAt: null,
          id: { not: reset.id },
        },
        data: { consumedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      action: 'auth.password_reset',
      entityType: 'User',
      entityId: reset.userId,
      ip,
    });
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private async loadDraft(draftToken: string) {
    const payload = verifyJwt(draftToken, this.cfg.jwtSecret);
    if (!payload || payload.purpose !== 'registration') {
      throw new BadRequestException('Invalid or expired registration session');
    }
    const draft = await this.prisma.registrationDraft.findUnique({
      where: { id: payload.sub },
    });
    if (!draft || draft.completedAt || draft.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired registration session');
    }
    return draft;
  }

  private issueSession(user: User): AuthSession {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.cfg.jwtTtlSeconds;
    const accessToken = signJwt(
      {
        sub: user.id,
        purpose: 'access',
        ver: user.tokenVersion,
        iat: now,
        exp,
      },
      this.cfg.jwtSecret,
    );
    return {
      accessToken,
      expiresAt: new Date(exp * 1000).toISOString(),
      user: this.toPublic(user),
    };
  }

  private toPublic(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      companyName: user.companyName ?? null,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      avatar: user.avatar ?? null,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    };
  }
}
