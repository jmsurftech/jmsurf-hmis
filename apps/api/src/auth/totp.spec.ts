import { base32Decode, base32Encode, generateSecret, hotp, otpauthUrl, totp, verifyTotp } from './totp';

describe('TOTP', () => {
  // RFC 6238 Appendix B secret "12345678901234567890" (SHA-1)
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it('matches RFC 6238 test vectors (last 6 digits)', () => {
    expect(totp(secret, 59_000)).toBe('287082');
    expect(totp(secret, 1111111109_000)).toBe('081804');
    expect(totp(secret, 1234567890_000)).toBe('005924');
    expect(totp(secret, 2000000000_000)).toBe('279037');
  });
  it('matches RFC 4226 HOTP vectors', () => {
    expect(hotp(secret, 0)).toBe('755224');
    expect(hotp(secret, 9)).toBe('520489');
  });
  it('base32 round-trips', () => {
    const b = Buffer.from('hello world!');
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
  });
  it('verifies within ±1 step and rejects others', () => {
    const s = generateSecret(); const now = 1_700_000_000_000;
    expect(verifyTotp(s, totp(s, now), now)).toBe(true);
    expect(verifyTotp(s, totp(s, now - 30_000), now)).toBe(true);
    expect(verifyTotp(s, totp(s, now - 120_000), now)).toBe(false);
    expect(verifyTotp(s, 'abc', now)).toBe(false);
  });
  it('builds an otpauth URL', () => {
    expect(otpauthUrl('ABC', 'a@b.c')).toMatch(/^otpauth:\/\/totp\/JMSURF%20HMIS:a%40b\.c\?secret=ABC/);
  });
});
