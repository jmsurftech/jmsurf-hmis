import { randomBytes } from 'crypto';
import { decryptField, decryptNoteFields, encryptField, encryptNoteFields, isEncrypted, resolveKey } from './field-crypto';

describe('field encryption (AES-256-GCM)', () => {
  const key = randomBytes(32);
  it('round-trips and uses a fresh IV', () => {
    const a = encryptField('HIV positive — confidential', key)!;
    const b = encryptField('HIV positive — confidential', key)!;
    expect(isEncrypted(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(decryptField(a, key)).toBe('HIV positive — confidential');
  });
  it('detects tampering', () => {
    const a = encryptField('secret', key)!;
    const parts = a.split(':'); parts[4] = Buffer.from('xxxxxx').toString('base64');
    expect(() => decryptField(parts.join(':'), key)).toThrow();
  });
  it('rejects the wrong key', () => {
    expect(() => decryptField(encryptField('x', key)!, randomBytes(32))).toThrow();
  });
  it('passes through null and plaintext; does not double-encrypt', () => {
    expect(encryptField(null, key)).toBeNull();
    expect(decryptField('plain', key)).toBe('plain');
    const a = encryptField('x', key)!;
    expect(encryptField(a, key)).toBe(a);
  });
  it('accepts hex and base64 keys', () => {
    const k = randomBytes(32);
    expect(resolveKey(k.toString('hex')).equals(k)).toBe(true);
    expect(resolveKey(k.toString('base64')).equals(k)).toBe(true);
  });
  it('encrypts note text fields only when sensitive', () => {
    const n = { subjective: 's', plan: 'p', type: 'SOAP' };
    expect(encryptNoteFields(n, false)).toEqual(n);
    const e = encryptNoteFields(n, true);
    expect(isEncrypted(e.subjective)).toBe(true);
    expect(e.type).toBe('SOAP');
    expect(decryptNoteFields(e)).toEqual(n);
  });
});
