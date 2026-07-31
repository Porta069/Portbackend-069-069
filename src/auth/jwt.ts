import { createHmac } from 'node:crypto';
import { safeEqual } from '../common/crypto/crypto.util';

/**
 * Minimal, dependency-free JWT (HS256) — standard `header.payload.signature`
 * base64url format, so it interoperates with any JWT-aware client, but is
 * implemented on Node's built-in crypto to stay in line with the project's
 * hand-rolled, dependency-light token approach (see otp/verification-token.ts).
 *
 * Two token purposes share the format and signing key:
 *  - `access`       — the session token returned by login / registration.
 *  - `registration` — binds a client to its in-progress registration draft.
 *  - `partner`      — the session token for a referral/affiliate partner.
 */

export type JwtPurpose = 'access' | 'registration' | 'partner';

export interface JwtPayload {
  sub: string; // user id (access) or draft id (registration)
  purpose: JwtPurpose;
  // Token-version claim for access tokens; matched against User.tokenVersion so
  // logout / password reset can revoke outstanding tokens.
  ver?: number;
  iat: number; // issued-at (epoch seconds)
  exp: number; // expiry (epoch seconds)
}

const HEADER = { alg: 'HS256', typ: 'JWT' } as const;

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(
    input.replace(/-/g, '+').replace(/_/g, '/') + pad,
    'base64',
  );
}

function sign(signingInput: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(signingInput).digest());
}

export function signJwt(payload: JwtPayload, secret: string): string {
  const header = b64url(JSON.stringify(HEADER));
  const body = b64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  return `${signingInput}.${sign(signingInput, secret)}`;
}

/**
 * Verifies the signature and expiry and returns the payload, or null if the
 * token is malformed, tampered, or expired. Signature is compared in constant
 * time. Callers must still check `purpose` matches the expected use.
 */
export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;

  if (!safeEqual(sig, sign(`${header}.${body}`, secret))) return null;

  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as
      JwtPayload | undefined;
    if (
      !payload ||
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      (payload.purpose !== 'access' &&
        payload.purpose !== 'registration' &&
        payload.purpose !== 'partner') ||
      typeof payload.exp !== 'number' ||
      typeof payload.iat !== 'number'
    ) {
      return null;
    }
    if (Math.floor(Date.now() / 1000) >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
