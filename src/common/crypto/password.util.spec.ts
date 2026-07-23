import { hashPassword, verifyPassword } from './password.util';

describe('password.util', () => {
  it('hashes to the self-describing scrypt format, never plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse');
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(hash.split('$')).toHaveLength(6);
  });

  it('verifies the correct password', async () => {
    const hash = await hashPassword('S3cure-Passw0rd!');
    await expect(verifyPassword('S3cure-Passw0rd!', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('S3cure-Passw0rd!');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('uses a random salt (same password → different hashes)', async () => {
    const a = await hashPassword('same-password-123');
    const b = await hashPassword('same-password-123');
    expect(a).not.toEqual(b);
    await expect(verifyPassword('same-password-123', a)).resolves.toBe(true);
    await expect(verifyPassword('same-password-123', b)).resolves.toBe(true);
  });

  it('returns false for a malformed stored hash instead of throwing', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$16384$8$1$only-four')).resolves.toBe(
      false,
    );
  });
});
