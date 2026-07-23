import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hmacHash } from '../common/crypto/crypto.util';
import { AuditConfig } from '../config/configuration';

export interface AuditInput {
  action: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes append-only audit events. IPs are stored only as a keyed hash (its own
 * pepper) so the trail is useful for abuse investigation without persisting raw
 * PII. Audit writes never throw into the request path — failures are logged.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly ipPepper: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.ipPepper = config.get<AuditConfig>('audit')!.ipPepper;
  }

  async record(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          actorId: input.actorId,
          actorIpHash: input.ip ? hmacHash(input.ip, this.ipPepper) : undefined,
          metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write audit event "${input.action}"`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
