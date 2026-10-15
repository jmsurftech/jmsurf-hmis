export function money(minor?: number | null, currency = 'KES') {
  if (minor === undefined || minor === null) return '—';
  return `${currency} ${(minor / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function date(v?: string | Date | null) { return v ? new Date(v).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
export function dateTime(v?: string | Date | null) { return v ? new Date(v).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }
export function age(dob?: string | null) {
  if (!dob) return '—';
  const y = Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000);
  return `${y}y`;
}
export function fullName(p?: { firstName?: string; middleName?: string | null; lastName?: string } | null) {
  return p ? [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ') : '—';
}
export function toMinor(v: string | number) { return Math.round(Number(v) * 100); }
