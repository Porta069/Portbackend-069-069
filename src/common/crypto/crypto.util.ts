import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Cryptographic helpers used across the app. Deliberately dependency-free
 * (Node's built-in `crypto`) and centralized so security-sensitive primitives
 * live in exactly one place.
 */

/** Generates a cryptographically secure numeric OTP of the given length. */
export function generateNumericCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    // randomInt is uniform and CSPRNG-backed (no modulo bias).
    code += randomInt(0, 10).toString();
  }
  return code;
}

/** HMAC-SHA256 of `value` using a server-side secret (pepper), hex-encoded. */
export function hmacHash(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/** SHA-256 checksum of a buffer, hex-encoded (integrity / dedupe). */
export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Constant-time comparison of two strings. Returns false for length
 * mismatches without leaking timing about where they differ.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still perform a comparison against a fixed-size buffer to reduce timing
    // signal, then return false.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Random opaque token, hex-encoded. Used for object storage keys. */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('hex');
}
