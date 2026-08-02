import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

/**
 * Rate limiting per ACCOUNT instead of per IP whenever the caller is
 * authenticated.
 *
 * Why: mobile carriers put thousands of subscribers behind a handful of
 * NAT addresses (CGNAT) — and our users are almost exclusively on phones.
 * With IP-based counting, one busy user could rate-limit unrelated
 * Handwerker on the same carrier. The token subject is the honest unit of
 * "one user"; anonymous traffic still falls back to the IP.
 *
 * The token is NOT verified here (that is JwtAuthGuard's job) — the value is
 * only a bucket key. A forged token would merely place the request in a
 * different bucket, never grant access.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const header = req.header('authorization');
    if (header?.startsWith('Bearer ')) {
      const payload = header.slice(7).split('.')[1];
      if (payload) {
        try {
          const json = JSON.parse(
            Buffer.from(payload, 'base64url').toString('utf8'),
          ) as { sub?: unknown };
          if (typeof json.sub === 'string' && json.sub.length > 0) {
            return `user:${json.sub}`;
          }
        } catch {
          /* malformed token → fall through to IP */
        }
      }
    }
    return `ip:${req.ip ?? 'unknown'}`;
  }
}
