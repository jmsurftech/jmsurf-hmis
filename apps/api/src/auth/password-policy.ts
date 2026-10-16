/** Password policy: ≥10 chars, upper, lower, digit, symbol; not containing the email local part; not a common password. */
const COMMON = ['password', 'password1', 'qwerty123', '1234567890', 'welcome123', 'admin12345', 'letmein123', 'iloveyou12'];

export function passwordProblems(pw: string, email?: string): string[] {
  const p: string[] = [];
  if (!pw || pw.length < 10) p.push('at least 10 characters');
  if (pw && pw.length > 128) p.push('at most 128 characters');
  if (!/[a-z]/.test(pw ?? '')) p.push('a lowercase letter');
  if (!/[A-Z]/.test(pw ?? '')) p.push('an uppercase letter');
  if (!/\d/.test(pw ?? '')) p.push('a digit');
  if (!/[^A-Za-z0-9]/.test(pw ?? '')) p.push('a symbol');
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && pw?.toLowerCase().includes(local)) p.push('not containing your email name');
  if (COMMON.includes(pw?.toLowerCase())) p.push('not a common password');
  return p;
}

export function assertPasswordPolicy(pw: string, email?: string) {
  const p = passwordProblems(pw, email);
  if (p.length) throw new Error(`Password must have ${p.join(', ')}`);
}

// ── Login lockout ──
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

/** State after a failed login attempt. Lock after MAX failures; counter resets once the lock is applied. */
export function onFailedLogin(failedCount: number, now = new Date()): { failedLoginCount: number; lockedUntil: Date | null } {
  const n = failedCount + 1;
  if (n >= MAX_FAILED_LOGINS) return { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60000) };
  return { failedLoginCount: n, lockedUntil: null };
}
export function isLocked(lockedUntil: Date | null | undefined, now = new Date()) { return !!lockedUntil && lockedUntil.getTime() > now.getTime(); }
