import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthConfig } from '../config/configuration';
import { JwtPayload, verifyJwt } from './jwt';

/**
 * Protects endpoints that require an authenticated user. Expects a
 * `Authorization: Bearer <jwt>` header, verifies the signature + expiry
 * statelessly, and attaches the decoded payload to `req.user`.
 *
 * This guard deliberately does NOT hit the database (stateless). Endpoints that
 * need a fresh, non-revoked user load it via AuthService.getActiveUser(), which
 * also enforces the tokenVersion / account-status checks.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
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
    if (!payload || payload.purpose !== 'access') {
      throw new UnauthorizedException('Invalid or expired token');
    }

    (request as Request & { user?: JwtPayload }).user = payload;
    return true;
  }
}
