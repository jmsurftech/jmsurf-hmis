import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Field-level AES-256-GCM encryption. Ciphertext format: `enc:v1:<iv b64>:<tag b64>:<data b64>`.
 * Key: FIELD_ENCRYPTION_KEY = 32 bytes as base64 or 64 hex chars (any other string is SHA-256 derived — dev only).
 */
const PREFIX = 'enc:v1:';

let warned = false;
/** True when encryption is active. In production without FIELD_ENCRYPTION_KEY, fields are stored as plain text (logged once). */
export function encryptionEnabled(raw = process.env.FIELD_ENCRYPTION_KEY): boolean {
  if (raw || process.env.NODE_ENV !== 'production') return true;
  if (!warned) { warned = true; console.warn('[field-crypto] FIELD_ENCRYPTION_KEY is not set: sensitive fields are stored unencrypted'); }
  return false;
}

export function resolveKey(raw = process.env.FIELD_ENCRYPTION_KEY): Buffer {
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('FIELD_ENCRYPTION_KEY is required to read encrypted fields');
    raw = 'jmsurf-dev-field-key';
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const b = Buffer.from(raw, 'base64');
  if (b.length === 32 && /^[A-Za-z0-9+/=]+$/.test(raw)) return b;
  return createHash('sha256').update(raw).digest();
}

export function isEncrypted(v: unknown): v is string { return typeof v === 'string' && v.startsWith(PREFIX); }

export function encryptField(plain: string | null | undefined, key?: Buffer): string | null | undefined {
  if (plain === null || plain === undefined || isEncrypted(plain)) return plain;
  if (!key && !encryptionEnabled()) return plain;
  key ??= resolveKey();
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${PREFIX}${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

export function decryptField(v: string | null | undefined, key?: Buffer): string | null | undefined {
  if (!isEncrypted(v)) return v;
  key ??= resolveKey();
  const [iv, tag, data] = v.slice(PREFIX.length).split(':');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

export const NOTE_TEXT_FIELDS = ['subjective', 'objective', 'assessment', 'plan'] as const;

/** Encrypts the SOAP text fields of a ClinicalNote payload when sensitive=true. */
export function encryptNoteFields<T extends Record<string, any>>(note: T, sensitive: boolean): T {
  if (!sensitive) return note;
  const out: any = { ...note };
  for (const f of NOTE_TEXT_FIELDS) if (typeof out[f] === 'string') out[f] = encryptField(out[f]);
  return out;
}
export function decryptNoteFields<T extends Record<string, any>>(note: T): T {
  const out: any = { ...note };
  for (const f of NOTE_TEXT_FIELDS) if (isEncrypted(out[f])) {
    try { out[f] = decryptField(out[f]); } catch { out[f] = '[unable to decrypt]'; }
  }
  return out;
}
