import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthConfig } from '../config/configuration';
import { JwtPayload, verifyJwt } from '../auth/jwt';

/**
 * Protects partner endpoints. Expects `Authorization: Bearer <jwt>` with a
 * token of purpose `partner`. Stateless (no DB hit) — the service re-loads the
 * partner and enforces tokenVersion / status on each protected call.
 */
@Injectable()
export class PartnerAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    const secret = this.config.get<AuthConfig>('auth')!.jwtSecret;
    const payload = verifyJwt(token, secret);
    if (!payload || payload.purpose !== 'partner') {
      throw new UnauthorizedException('Invalid or expired token');
    }
    (request as Request & { user?: JwtPayload }).user = payload;
    return true;
  }
}
