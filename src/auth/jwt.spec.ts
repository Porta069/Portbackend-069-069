import { JwtPayload, signJwt, verifyJwt } from './jwt';

const SECRET = 'test-secret-at-least-32-characters-long!!';

function makePayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: 'user-123',
    purpose: 'access',
    ver: 0,
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
}

describe('jwt', () => {
  it('signs and verifies a valid token round-trip', () => {
    const payload = makePayload();
    const token = signJwt(payload, SECRET);
    expect(token.split('.')).toHaveLength(3);
    expect(verifyJwt(token, SECRET)).toEqual(payload);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signJwt(makePayload(), SECRET);
    expect(
      verifyJwt(token, 'a-completely-different-secret-key-32ch'),
    ).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = signJwt(makePayload(), SECRET);
    const [header, , sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify(makePayload({ sub: 'attacker' })))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(verifyJwt(`${header}.${forged}.${sig}`, SECRET)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signJwt(
      makePayload({ exp: Math.floor(Date.now() / 1000) - 1 }),
      SECRET,
    );
    expect(verifyJwt(token, SECRET)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyJwt('not-a-jwt', SECRET)).toBeNull();
    expect(verifyJwt('a.b', SECRET)).toBeNull();
  });

  it('preserves the purpose claim', () => {
    const token = signJwt(makePayload({ purpose: 'registration' }), SECRET);
    expect(verifyJwt(token, SECRET)?.purpose).toBe('registration');
  });
});
