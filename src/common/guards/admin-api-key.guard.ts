import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { SecurityConfig } from '../../config/configuration';
import { safeEqual } from '../crypto/crypto.util';
import { AuditService } from '../../audit/audit.service';

/**
 * Protects privileged endpoints (application retrieval / export / erasure).
 * Expects the admin key in the `x-admin-api-key` header and compares it in
 * constant time. Every failure is audited for breach forensics.
 */
@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-admin-api-key');
    const expected = this.config.get<SecurityConfig>('security')!.adminApiKey;

    if (!provided || !safeEqual(provided, expected)) {
      await this.audit.record({
        action: 'admin.auth_failed',
        entityType: 'AdminEndpoint',
        entityId: `${request.method} ${request.path}`,
        ip: request.ip,
      });
      throw new UnauthorizedException('Invalid or missing admin credentials');
    }
    return true;
  }
}
