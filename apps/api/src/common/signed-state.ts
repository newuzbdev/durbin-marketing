import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomToken } from './crypto.js';

// OAuth `state` parametri: callback qaysi maktab/foydalanuvchiga tegishli ekanini
// soxtalashtirib bo'lmaydigan tarzda olib yuradi. Format: base64url(json).base64url(hmac)

export interface OAuthState {
  schoolId: string;
  userId: string;
  /** Callback'dan keyin qaytiladigan web origin (WEB_ORIGIN ro'yxatidan) */
  returnOrigin: string;
}

interface Payload extends OAuthState {
  exp: number;
  nonce: string;
}

function hmac(data: string): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('ENCRYPTION_KEY sozlanmagan');
  return createHmac('sha256', secret).update(`oauth-state:${data}`).digest();
}

export function signState(state: OAuthState, ttlMs = 10 * 60_000, now = Date.now()): string {
  const payload: Payload = { ...state, exp: now + ttlMs, nonce: randomToken(8) };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body).toString('base64url')}`;
}

/** Imzo noto'g'ri yoki muddati o'tgan bo'lsa null */
export function verifyState(token: string, now = Date.now()): OAuthState | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = hmac(body);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload;
    if (typeof p.exp !== 'number' || p.exp < now) return null;
    return { schoolId: p.schoolId, userId: p.userId, returnOrigin: p.returnOrigin };
  } catch {
    return null;
  }
}

/** Meta webhook: X-Hub-Signature-256 = "sha256=" + HMAC(app_secret, raw body) */
export function verifyMetaSignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith('sha256=') || !appSecret) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const given = Buffer.from(header.slice(7), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
