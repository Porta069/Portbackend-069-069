/**
 * Normalization + light validation for contact identifiers. Normalizing before
 * hashing/storing guarantees that "User@Mail.de" and "user@mail.de" (or a phone
 * with spaces) map to the same challenge record.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmail(input: string): boolean {
  return EMAIL_RE.test(input.trim());
}

/**
 * Normalizes a phone number to a compact E.164-ish form: keep a leading `+`
 * and digits only. This is intentionally conservative — full libphonenumber
 * validation can be layered on later.
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return (hasPlus ? '+' : '') + digits;
}

export function isValidPhone(input: string): boolean {
  const normalized = normalizePhone(input);
  // E.164: optional +, 8–15 digits.
  return /^\+?\d{8,15}$/.test(normalized);
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const head = user.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(1, user.length - 1))}@${domain}`;
}

export function maskPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  return normalized.length <= 4
    ? '****'
    : `${'*'.repeat(normalized.length - 4)}${normalized.slice(-4)}`;
}
