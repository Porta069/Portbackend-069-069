import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Resolves the client IP. Trusts `X-Forwarded-For` only because the app is
 * configured with a bounded `trust proxy` setting in main.ts (a single known
 * reverse proxy). The left-most entry is the original client.
 */
export const ClientIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    // Express populates `req.ip` using the trust-proxy setting.
    return request.ip ?? 'unknown';
  },
);
