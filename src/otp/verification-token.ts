import { createHmac } from 'node:crypto';
import { safeEqual } from '../common/crypto/crypto.util';

/**
 * Stateless, tamper-proof proof-of-verification.
 *
 * On a successful OTP check the OTP service mints a token binding the verified
 * `contact` + `channel` to a short expiry. The applications endpoint requires
 * it and re-checks that the submitted email/phone matches the verified
 * contact — so an application can only be created for a contact the caller
 * actually proved control of.
 *
 * Format: base64url(payloadJson).hmacSha256(payloadJson)
 */

export interface VerificationPayload {
  contact: string;
  channel: 'EMAIL' | 'SMS';
  // Random nonce; consumed once at submission to prevent token replay.
  jti: string;
  exp: number; // epoch ms
}

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

export function signVerificationToken(
  payload: VerificationPayload,
  secret: string,
): string {
  const json = JSON.stringify(payload);
  const body = b64url(json);
  const sig = createHmac('sha256', secret).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

/**
 * Verifies signature + expiry and returns the payload, or null if invalid.
 * Signature is compared in constant time.
 */
export function verifyVerificationToken(
  token: string,
  secret: string,
): VerificationPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expected = b64url(
    createHmac('sha256', secret).update(body).digest(),
  );
  if (!safeEqual(sig, expected)) return null;

  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as
      | VerificationPayload
      | undefined;
    if (
      !payload ||
      typeof payload.contact !== 'string' ||
      (payload.channel !== 'EMAIL' && payload.channel !== 'SMS') ||
      typeof payload.jti !== 'string' ||
      payload.jti.length < 8 ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
