import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Meta access token'lari DB'da AES-256-GCM bilan shifrlangan holda saqlanadi.
// Format: base64(iv[12] | tag[16] | ciphertext)
function key(): Buffer {
  const raw = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64');
  if (raw.length !== 32) throw new Error('ENCRYPTION_KEY 32 baytlik base64 bo‘lishi kerak');
  return raw;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
