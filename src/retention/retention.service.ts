import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApplicationsService } from '../applications/applications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditConfig } from '../config/configuration';

const BATCH = 500;

/**
 * Enforces the GDPR storage-limitation principle across all data classes:
 * expired applications are erased, and the ephemeral OTP/verification/audit
 * tables are pruned. Jobs are also invokable directly for tests/manual runs.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationsService,
    private readonly config: ConfigService,
  ) {}

  /** Erase applications past retention, and retry any partially-failed erasures. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async eraseExpiredApplications(): Promise<{ erased: number }> {
    const due = await this.prisma.application.findMany({
      where: {
        erasedAt: null,
        legalHold: false,
        OR: [
          { retentionUntil: { lte: new Date() } },
          { erasureRequestedAt: { not: null } },
        ],
      },
      select: { id: true },
      take: BATCH,
    });

    let erased = 0;
    for (const { id } of due) {
      try {
        await this.applications.erase(id);
        erased++;
      } catch (err) {
        this.logger.error(
          `Retention erase failed for ${id} (will retry next run)`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    if (due.length === BATCH) {
      this.logger.warn(
        `Retention batch hit the ${BATCH} cap — a backlog exists; investigate.`,
      );
    }
    if (erased > 0) {
      this.logger.log(`Retention erased ${erased} expired application(s)`);
    }
    return { erased };
  }

  /** Prune ephemeral OTP artifacts that no longer serve any purpose. */
  @Cron(CronExpression.EVERY_HOUR)
  async pruneOtpArtifacts(): Promise<void> {
    const now = Date.now();
    // Expired challenges (grace = 1h) and consumed/expired verification tokens.
    const challenges = await this.prisma.otpChallenge.deleteMany({
      where: { expiresAt: { lt: new Date(now - 3_600_000) } },
    });
    const tokens = await this.prisma.usedVerificationToken.deleteMany({
      where: { expiresAt: { lt: new Date(now) } },
    });
    // Issuance log only needs the 24h window for the daily cap (+1 day buffer).
    const issuance = await this.prisma.otpIssuance.deleteMany({
      where: { createdAt: { lt: new Date(now - 2 * 86_400_000) } },
    });
    const removed =
      challenges.count + tokens.count + issuance.count;
    if (removed > 0) {
      this.logger.debug(`Pruned ${removed} expired OTP artifact(s)`);
    }
  }

  /** Prune ephemeral auth artifacts (finished/expired drafts & reset tokens). */
  @Cron(CronExpression.EVERY_HOUR)
  async pruneAuthArtifacts(): Promise<void> {
    const now = new Date();
    const drafts = await this.prisma.registrationDraft.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { completedAt: { not: null } }] },
    });
    const resets = await this.prisma.passwordReset.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }] },
    });
    const removed = drafts.count + resets.count;
    if (removed > 0) {
      this.logger.debug(`Pruned ${removed} expired auth artifact(s)`);
    }
  }

  /** Enforce the audit-log retention window. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async pruneAuditLog(): Promise<void> {
    const days = this.config.get<AuditConfig>('audit')!.retentionDays;
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const result = await this.prisma.auditEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(`Pruned ${result.count} audit event(s) older than ${days}d`);
    }
  }

  /** Prune referral-link click logs older than 90 days (analytics only). */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async pruneReferralClicks(): Promise<void> {
    const cutoff = new Date(Date.now() - 90 * 86_400_000);
    const result = await this.prisma.referralClick.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.debug(`Pruned ${result.count} referral click(s) older than 90d`);
    }
  }
}
