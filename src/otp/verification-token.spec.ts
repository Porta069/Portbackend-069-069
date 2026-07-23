import {
  signVerificationToken,
  verifyVerificationToken,
} from './verification-token';

const SECRET = 'a'.repeat(48);

describe('verification-token', () => {
  it('round-trips a valid token', () => {
    const exp = Date.now() + 60_000;
    const token = signVerificationToken(
      { contact: 'user@mail.de', channel: 'EMAIL', jti: 'nonce-1234', exp },
      SECRET,
    );
    const payload = verifyVerificationToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.contact).toBe('user@mail.de');
    expect(payload?.channel).toBe('EMAIL');
  });

  it('rejects a tampered payload', () => {
    const token = signVerificationToken(
      { contact: 'user@mail.de', channel: 'EMAIL', jti: 'nonce-1234', exp: Date.now() + 60_000 },
      SECRET,
    );
    const [, sig] = token.split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({
        contact: 'attacker@mail.de',
        channel: 'EMAIL',
        exp: Date.now() + 60_000,
      }),
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(verifyVerificationToken(`${forgedBody}.${sig}`, SECRET)).toBeNull();
  });

  it('rejects a wrong secret', () => {
    const token = signVerificationToken(
      { contact: 'user@mail.de', channel: 'EMAIL', jti: 'nonce-1234', exp: Date.now() + 60_000 },
      SECRET,
    );
    expect(verifyVerificationToken(token, 'b'.repeat(48))).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signVerificationToken(
      { contact: 'user@mail.de', channel: 'EMAIL', jti: 'nonce-1234', exp: Date.now() - 1 },
      SECRET,
    );
    expect(verifyVerificationToken(token, SECRET)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyVerificationToken('nonsense', SECRET)).toBeNull();
    expect(verifyVerificationToken('a.b.c', SECRET)).toBeNull();
  });
});
