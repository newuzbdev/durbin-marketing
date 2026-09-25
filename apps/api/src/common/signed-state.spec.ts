import { createHmac, randomBytes } from 'node:crypto';
import { signState, verifyMetaSignature, verifyState } from './signed-state.js';
import { canReply, REPLY_WINDOW_MS } from '../instagram/dm.service.js';
import { periodRange, previousRange, toIsoDate } from './dates.js';

const state = { schoolId: 's1', userId: 'u1', returnOrigin: 'http://localhost:3000' };

describe('OAuth state', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });

  it("imzolangan state qaytib o'qiladi; target ko'rsatilmasa — INSTAGRAM", () => {
    expect(verifyState(signState(state))).toEqual({ ...state, target: 'INSTAGRAM' });
    expect(verifyState(signState({ ...state, target: 'ADS' }))?.target).toBe('ADS');
  });

  it("o'zgartirilgan payload rad etiladi", () => {
    const [, sig] = signState(state).split('.');
    const forged = Buffer.from(JSON.stringify({ ...state, schoolId: 'boshqa', exp: Date.now() + 1e6 })).toString(
      'base64url',
    );
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
  });

  it("muddati o'tgan state rad etiladi", () => {
    const token = signState(state, 1000, 0);
    expect(verifyState(token, 2000)).toBeNull();
  });

  it('buzilgan formatlar', () => {
    expect(verifyState('')).toBeNull();
    expect(verifyState('abc')).toBeNull();
    expect(verifyState('abc.def')).toBeNull();
  });
});

describe('Meta webhook imzosi', () => {
  const secret = 'app-secret';
  const body = Buffer.from('{"object":"instagram"}');
  const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

  it("to'g'ri imzo", () => expect(verifyMetaSignature(body, sig, secret)).toBe(true));
  it("boshqa body", () => expect(verifyMetaSignature(Buffer.from('{}'), sig, secret)).toBe(false));
  it("header yo'q", () => expect(verifyMetaSignature(body, undefined, secret)).toBe(false));
  it("secret sozlanmagan", () => expect(verifyMetaSignature(body, sig, '')).toBe(false));
});

describe('24 soatlik javob oynasi', () => {
  const now = Date.now();
  it('ichida', () => expect(canReply(new Date(now - REPLY_WINDOW_MS + 60_000), now)).toBe(true));
  it('tashqarida', () => expect(canReply(new Date(now - REPLY_WINDOW_MS - 1), now)).toBe(false));
  it('kiruvchi xabar yo‘q', () => expect(canReply(null, now)).toBe(false));
});

describe('davrlar', () => {
  const now = new Date('2026-09-24T10:00:00Z');
  it('last_7d bugunni ham qamraydi', () => {
    const r = periodRange('last_7d', now);
    expect([toIsoDate(r.from), toIsoDate(r.to)]).toEqual(['2026-09-18', '2026-09-24']);
  });
  it('previousRange bir xil uzunlikda, darhol oldin', () => {
    const p = previousRange(periodRange('last_7d', now));
    expect([toIsoDate(p.from), toIsoDate(p.to)]).toEqual(['2026-09-11', '2026-09-17']);
  });
});
