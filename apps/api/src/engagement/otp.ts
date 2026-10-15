import { createHash, randomInt, timingSafeEqual } from 'crypto';

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 30_000;

export const generateOtp = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const hashOtp = (phone: string, code: string, secret = process.env.JWT_SECRET || 'dev-secret') =>
  createHash('sha256').update(`${secret}:${phone}:${code}`).digest('hex');

export interface OtpState { codeHash: string; expiresAt: Date; attempts: number; consumedAt: Date | null }
export type OtpCheck = 'OK' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS' | 'CONSUMED' | 'INVALID';

/** Pure check of a submitted code against a stored OTP. Order matters: consumed → expired → locked → mismatch. */
export function checkOtp(otp: OtpState, phone: string, code: string, now = new Date()): OtpCheck {
  if (otp.consumedAt) return 'CONSUMED';
  if (otp.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (otp.attempts >= OTP_MAX_ATTEMPTS) return 'TOO_MANY_ATTEMPTS';
  const a = Buffer.from(otp.codeHash, 'hex');
  const b = Buffer.from(hashOtp(phone, code), 'hex');
  return a.length === b.length && timingSafeEqual(a, b) ? 'OK' : 'INVALID';
}

/** Normalise Kenyan-style numbers to E.164 (+2547XXXXXXXX). Other countries pass through with '+'. */
export function normalizePhone(raw: string, countryDial = '254'): string {
  let p = (raw || '').replace(/[^\d+]/g, '');
  if (p.startsWith('+')) return p;
  if (p.startsWith('00')) return `+${p.slice(2)}`;
  if (p.startsWith('0')) return `+${countryDial}${p.slice(1)}`;
  if (p.startsWith(countryDial)) return `+${p}`;
  if (p.length === 9) return `+${countryDial}${p}`;
  return `+${p}`;
}
