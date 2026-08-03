import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { Request } from 'express';
import { AuthConfig } from '../../config/configuration';
import { verifyJwt } from '../../auth/jwt';

/**
 * Rate limiting per ACCOUNT instead of per IP — aber nur mit GÜLTIGEM Token.
 *
 * Warum überhaupt kontobezogen: Mobilfunkanbieter teilen sich wenige
 * NAT-Adressen (CGNAT), und unsere Nutzer sind fast ausschließlich mobil
 * unterwegs. Bei IP-Zählung könnte ein aktiver Nutzer fremde Handwerker im
 * selben Netz aussperren.
 *
 * Warum die Signatur hier geprüft wird: Der Zähler-Schlüssel darf NICHT aus
 * einem ungeprüften Token stammen. Sonst hängt ein Angreifer an jeden Versuch
 * eine erfundene Nutzer-ID und bekommt pro Anfrage einen frischen Zähler —
 * womit die strengen Limits auf Login, OTP und Passwort-Zurücksetzen
 * wirkungslos wären. Ungültige oder fehlende Token fallen deshalb immer auf
 * die IP zurück.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  private readonly jwtSecret: string;

  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    config: ConfigService,
  ) {
    super(options, storageService, reflector);
    this.jwtSecret = config.get<AuthConfig>('auth')!.jwtSecret;
  }

  protected async getTracker(req: Request): Promise<string> {
    const header = req.header('authorization');
    if (header?.startsWith('Bearer ')) {
      const payload = verifyJwt(header.slice(7).trim(), this.jwtSecret);
      // Nur echte, unverfälschte Sitzungstoken bekommen einen eigenen Zähler.
      if (payload && payload.purpose === 'access') {
        return `user:${payload.sub}`;
      }
    }
    return `ip:${req.ip ?? 'unknown'}`;
  }
}
