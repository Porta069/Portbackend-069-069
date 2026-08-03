import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { verifyJwt } from '../../auth/jwt';

/**
 * Rate limiting per ACCOUNT instead of per IP — aber nur mit GÜLTIGEM Token.
 *
 * Warum kontobezogen: Mobilfunkanbieter teilen sich wenige NAT-Adressen
 * (CGNAT), und unsere Nutzer sind fast ausschließlich mobil unterwegs. Bei
 * reiner IP-Zählung könnte ein aktiver Nutzer fremde Handwerker im selben Netz
 * aussperren.
 *
 * Warum die Signatur hier geprüft wird: Der Zähler-Schlüssel darf NICHT aus
 * einem ungeprüften Token stammen. Sonst hängt ein Angreifer an jeden Versuch
 * eine erfundene Nutzer-ID und bekommt pro Anfrage einen frischen Zähler —
 * womit die strengen Limits auf Login, OTP und Passwort-Zurücksetzen
 * wirkungslos wären. Ungültige oder fehlende Token fallen auf die IP zurück.
 *
 * Bewusst OHNE eigenen Konstruktor: ThrottlerGuard bekommt Optionen, Speicher
 * und Reflector über feste Positionen injiziert; ein überschriebener
 * Konstruktor hat dort schon einmal die Pro-Route-Limits (@Throttle)
 * ausgehebelt. Das Secret kommt deshalb direkt aus der Umgebung — sie ist
 * beim Start bereits validiert (env.validation.ts).
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  private readonly jwtSecret = process.env.AUTH_JWT_SECRET ?? '';

  protected async getTracker(req: Request): Promise<string> {
    const header = req.header('authorization');
    if (header?.startsWith('Bearer ') && this.jwtSecret) {
      const payload = verifyJwt(header.slice(7).trim(), this.jwtSecret);
      // Nur echte, unverfälschte Sitzungstoken bekommen einen eigenen Zähler.
      if (payload && payload.purpose === 'access') {
        return `user:${payload.sub}`;
      }
    }
    return `ip:${req.ip ?? 'unknown'}`;
  }
}
