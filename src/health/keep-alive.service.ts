import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

/**
 * Keeps the service awake on Render's free tier.
 *
 * Render spins the instance down after ~15 minutes without INBOUND HTTP
 * traffic, which then costs a ~40-60s cold start on the next request — long
 * enough that a user hitting `login` sees "server unreachable". An internal
 * timer alone does NOT prevent this (spin-down is based on inbound requests,
 * not CPU). So every 10 minutes we fetch our OWN public health URL: the request
 * leaves the instance, hits Render's edge, and comes back as inbound traffic —
 * resetting the idle timer so the instance never sleeps.
 *
 * Enabled only when APP_URL points at a real https origin (i.e. on Render);
 * skipped in local dev where APP_URL is unset.
 */
@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);
  private readonly appUrl = (process.env.APP_URL ?? '').replace(/\/+$/, '');
  private readonly enabled = /^https?:\/\//.test(this.appUrl);

  @Cron('*/10 * * * *')
  async keepWarm(): Promise<void> {
    if (!this.enabled) return;
    try {
      const res = await fetch(`${this.appUrl}/api/v1/health`, {
        signal: AbortSignal.timeout(25_000),
        headers: { 'user-agent': 'portawerk-keepalive' },
      });
      this.logger.debug(`Keep-alive ping → ${res.status}`);
    } catch (err) {
      this.logger.warn(
        `Keep-alive ping failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }
}
