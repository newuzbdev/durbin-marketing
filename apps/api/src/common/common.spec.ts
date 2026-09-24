import { randomBytes } from 'node:crypto';
import { decrypt, encrypt } from './crypto.js';
import { periodRange, toIsoDate } from './dates.js';

describe('crypto', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });

  it('encrypt/decrypt aylanadi', () => {
    const enc = encrypt('EAAG-secret-token');
    expect(enc).not.toContain('EAAG');
    expect(decrypt(enc)).toBe('EAAG-secret-token');
  });

  it("o'zgartirilgan shifrni rad etadi", () => {
    const buf = Buffer.from(encrypt('x'), 'base64');
    buf[buf.length - 1] ^= 1;
    expect(() => decrypt(buf.toString('base64'))).toThrow();
  });
});

describe('periodRange', () => {
  const now = new Date('2026-09-24T10:00:00Z'); // payshanba

  it('this_week dushanbadan boshlanadi', () => {
    const r = periodRange('this_week', now);
    expect([toIsoDate(r.from), toIsoDate(r.to)]).toEqual(['2026-09-21', '2026-09-24']);
  });

  it('this_month', () => {
    const r = periodRange('this_month', now);
    expect([toIsoDate(r.from), toIsoDate(r.to)]).toEqual(['2026-09-01', '2026-09-24']);
  });

  it("last_month to'liq oy", () => {
    const r = periodRange('last_month', now);
    expect([toIsoDate(r.from), toIsoDate(r.to)]).toEqual(['2026-08-01', '2026-08-31']);
  });
});
