import { isLocked, MAX_FAILED_LOGINS, onFailedLogin, passwordProblems } from './password-policy';

describe('password policy', () => {
  it('accepts a strong password', () => expect(passwordProblems('Tr0ub4dor&Horse', 'jane@x.com')).toEqual([]));
  it('rejects weak ones', () => {
    expect(passwordProblems('short')).toContain('at least 10 characters');
    expect(passwordProblems('alllowercase1!')).toContain('an uppercase letter');
    expect(passwordProblems('Janedoe123!', 'janedoe@x.com')).toContain('not containing your email name');
  });
});

describe('login lockout', () => {
  it('locks after 5 failures', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    let s = { failedLoginCount: 0, lockedUntil: null as Date | null };
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) {
      s = onFailedLogin(s.failedLoginCount, now);
      expect(isLocked(s.lockedUntil, now)).toBe(false);
    }
    s = onFailedLogin(s.failedLoginCount, now);
    expect(isLocked(s.lockedUntil, now)).toBe(true);
    expect(isLocked(s.lockedUntil, new Date(now.getTime() + 16 * 60000))).toBe(false);
  });
});
