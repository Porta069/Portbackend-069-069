import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../notifications/email.service';
import { SmsService } from '../notifications/sms.service';
import { OtpConfig } from '../config/configuration';
import {
  generateNumericCode,
  hmacHash,
  randomToken,
  safeEqual,
} from '../common/crypto/crypto.util';
import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
} from '../common/contact/contact.util';
import { signVerificationToken } from './verification-token';

type Channel = 'email' | 'sms';

export interface RequestResult {
  status: 'sent';
  expiresInSeconds: number;
}

export interface VerifyResult {
  verified: true;
  verificationToken: string;
  tokenExpiresAt: string;
}

// A verification token stays valid long enough to complete the upload step.
const VERIFICATION_TOKEN_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly cfg: OtpConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly sms: SmsService,
    private readonly audit: AuditService,
  ) {
    this.cfg = this.config.get<OtpConfig>('otp')!;
  }

  private normalize(channel: Channel, contact: string): string {
    if (channel === 'email') {
      const normalized = normalizeEmail(contact);
      if (!isValidEmail(normalized)) {
        throw new BadRequestException('Invalid email address');
      }
      return normalized;
    }
    const normalized = normalizePhone(contact);
    if (!isValidPhone(normalized)) {
      throw new BadRequestException('Invalid phone number');
    }
    return normalized;
  }

  private toEnum(channel: Channel): OtpChannel {
    return channel === 'email' ? OtpChannel.EMAIL : OtpChannel.SMS;
  }

  private hashCode(contact: string, code: string): string {
    // Bind the hash to the contact so a code is unusable for any other target.
    return hmacHash(`${contact}:${code}`, this.cfg.hashingSecret);
  }

  private contactHash(contact: string): string {
    return hmacHash(`issuance:${contact}`, this.cfg.hashingSecret);
  }

  /** Restrict SMS delivery to the served markets (anti international pumping). */
  private assertSmsAllowed(phone: string): void {
    const prefixes = this.config.get<{ allowedCountryPrefixes: string[] }>(
      'sms',
    )!.allowedCountryPrefixes;
    if (!prefixes.some((p) => phone.startsWith(p))) {
      throw new BadRequestException(
        'SMS verification is not available for this number',
      );
    }
  }

  private tooMany(): never {
    throw new HttpException(
      'Please wait before requesting another code',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Issues a new code, enforcing issuance caps + cooldown, and delivers it. */
  async request(
    channel: Channel,
    contact: string,
    ip?: string,
  ): Promise<RequestResult> {
    const normalized = this.normalize(channel, contact);
    const enumChannel = this.toEnum(channel);
    if (channel === 'sms') this.assertSmsAllowed(normalized);

    const now = Date.now();
    const cHash = this.contactHash(normalized);

    // Rolling issuance caps per contact (anti bombing / toll fraud).
    const [perHour, perDay] = await this.prisma.$transaction([
      this.prisma.otpIssuance.count({
        where: { contactHash: cHash, createdAt: { gte: new Date(now - 3_600_000) } },
      }),
      this.prisma.otpIssuance.count({
        where: { contactHash: cHash, createdAt: { gte: new Date(now - 86_400_000) } },
      }),
    ]);
    if (perHour >= this.cfg.maxPerHour || perDay >= this.cfg.maxPerDay) {
      this.tooMany();
    }

    // Resend cooldown (best-effort; the unique constraint serializes races).
    const existing = await this.prisma.otpChallenge.findUnique({
      where: { contact_purpose: { contact: normalized, purpose: 'REGISTRATION' } },
    });
    if (
      existing &&
      now - existing.createdAt.getTime() < this.cfg.resendCooldownSeconds * 1000
    ) {
      this.tooMany();
    }

    const code = generateNumericCode(6);
    const expiresAt = new Date(now + this.cfg.ttlSeconds * 1000);
    const codeHash = this.hashCode(normalized, code);

    // A single active challenge per contact — upsert keyed on the unique
    // (contact, purpose). Concurrent inserts collapse to one row.
    let challengeId: string;
    try {
      const challenge = await this.prisma.otpChallenge.upsert({
        where: {
          contact_purpose: { contact: normalized, purpose: 'REGISTRATION' },
        },
        update: {
          channel: enumChannel,
          codeHash,
          attempts: 0,
          maxAttempts: this.cfg.maxAttempts,
          expiresAt,
          consumedAt: null,
          createdAt: new Date(now),
        },
        create: {
          contact: normalized,
          channel: enumChannel,
          purpose: 'REGISTRATION',
          codeHash,
          maxAttempts: this.cfg.maxAttempts,
          expiresAt,
        },
      });
      challengeId = challenge.id;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // A concurrent request is already issuing a code for this contact.
        this.tooMany();
      }
      throw err;
    }

    await this.prisma.otpIssuance.create({
      data: { contactHash: cHash, channel: enumChannel },
    });

    try {
      if (channel === 'email') {
        await this.email.sendVerificationCode(normalized, code);
      } else {
        await this.sms.sendVerificationCode(normalized, code);
      }
    } catch (err) {
      // Roll back exactly the challenge we just created (by id).
      await this.prisma.otpChallenge.deleteMany({ where: { id: challengeId } });
      this.logger.error(
        'Verification delivery failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new HttpException(
        'Could not deliver verification code, please try again',
        HttpStatus.BAD_GATEWAY,
      );
    }

    await this.audit.record({
      action: 'otp.requested',
      entityType: 'OtpChallenge',
      entityId: challengeId,
      ip,
      metadata: { channel },
    });

    return { status: 'sent', expiresInSeconds: this.cfg.ttlSeconds };
  }

  /** Verifies a code and, on success, mints a single-use verification token. */
  async verify(
    channel: Channel,
    contact: string,
    code: string,
    ip?: string,
  ): Promise<VerifyResult> {
    const normalized = this.normalize(channel, contact);
    const enumChannel = this.toEnum(channel);
    const genericInvalid = new BadRequestException(
      'Invalid or expired verification code',
    );

    const challenge = await this.prisma.otpChallenge.findUnique({
      where: { contact_purpose: { contact: normalized, purpose: 'REGISTRATION' } },
    });

    // Equalize work on the no-challenge / wrong-channel path (timing oracle).
    if (!challenge || challenge.channel !== enumChannel) {
      safeEqual(
        this.hashCode(normalized, '000000'),
        this.hashCode(normalized, '111111'),
      );
      throw genericInvalid;
    }

    // Atomically charge one attempt iff budget remains and it's still live.
    const charged = await this.prisma.otpChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: challenge.maxAttempts },
      },
      data: { attempts: { increment: 1 } },
    });
    if (charged.count === 0) {
      // Expired or attempt budget exhausted — invalidate.
      await this.prisma.otpChallenge.deleteMany({ where: { id: challenge.id } });
      await this.audit.record({
        action: 'otp.locked_or_expired',
        entityType: 'OtpChallenge',
        entityId: challenge.id,
        ip,
      });
      throw genericInvalid;
    }

    const ok = safeEqual(this.hashCode(normalized, code), challenge.codeHash);
    if (!ok) {
      await this.audit.record({
        action: 'otp.failed',
        entityType: 'OtpChallenge',
        entityId: challenge.id,
        ip,
      });
      throw genericInvalid;
    }

    // Conditional single-use consume — only one concurrent caller wins.
    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw genericInvalid;

    // Code is single-use: remove the challenge now. Replay protection for the
    // issued token is handled separately via its jti at submission time.
    await this.prisma.otpChallenge.deleteMany({ where: { id: challenge.id } });

    const jti = randomToken(16);
    const exp = Date.now() + VERIFICATION_TOKEN_TTL_MS;
    const verificationToken = signVerificationToken(
      { contact: normalized, channel: enumChannel, jti, exp },
      this.cfg.verificationTokenSecret,
    );

    await this.audit.record({
      action: 'otp.verified',
      entityType: 'OtpChallenge',
      entityId: challenge.id,
      ip,
      metadata: { channel },
    });

    return {
      verified: true,
      verificationToken,
      tokenExpiresAt: new Date(exp).toISOString(),
    };
  }
}
