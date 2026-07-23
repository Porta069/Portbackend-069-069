import {
  randomBytes,
  scrypt as scryptCb,
  ScryptOptions,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Password hashing with scrypt (RFC 7914) — memory-hard and built into Node,
 * so no native dependency is pulled in (consistent with crypto.util.ts).
 *
 * Stored format (self-describing, so params can evolve without a migration):
 *   scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>
 *
 * scrypt runs on the libuv threadpool (async) so it does not block the event
 * loop while an individual hash is computed.
 */

const N = 16384; // CPU/memory cost (2^14)
const R = 8;
const P = 1;
const KEY_LEN = 32;
const SALT_BYTES = 16;
const MAX_MEM = 64 * 1024 * 1024;

const scrypt = (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });

/** Derives a salted scrypt hash string for the given password. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LEN, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${derived.toString(
    'base64',
  )}`;
}

/**
 * Verifies a password against a stored hash in constant time. Returns false for
 * any malformed hash rather than throwing.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = await scrypt(password, salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: MAX_MEM,
  });
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
