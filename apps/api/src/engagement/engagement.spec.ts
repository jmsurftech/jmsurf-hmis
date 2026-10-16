import { lastValueFrom, of } from 'rxjs';
import { ConflictException } from '@nestjs/common';
import { OTP_MAX_ATTEMPTS, checkOtp, generateOtp, hashOtp, normalizePhone } from './otp';
import { appointmentWindow, selectAppointments, selectBillBalances, selectImmunizations, selectResultsReady } from './reminder-rules';
import { ussdRespond, ussdRoute } from './ussd';
import { IdempotencyInterceptor, IdempotencyStore, isIdempotentRoute } from './idempotency.interceptor';
import { renderTemplate, DEFAULT_TEMPLATES } from './templates';

const H = 3_600_000;
const now = new Date('2026-10-15T09:00:00Z');

describe('OTP', () => {
  const phone = '+254711271828';
  const base = (o: Partial<{ expiresAt: Date; attempts: number; consumedAt: Date | null }> = {}) => ({ codeHash: hashOtp(phone, '123456'), expiresAt: new Date(now.getTime() + 60_000), attempts: 0, consumedAt: null, ...o });
  it('generates 6 digits', () => { for (let i = 0; i < 50; i++) expect(generateOtp()).toMatch(/^\d{6}$/); });
  it('accepts the right code before expiry', () => expect(checkOtp(base(), phone, '123456', now)).toBe('OK'));
  it('rejects a wrong code', () => expect(checkOtp(base(), phone, '654321', now)).toBe('INVALID'));
  it('binds the code to the phone', () => expect(checkOtp(base(), '+254700000000', '123456', now)).toBe('INVALID'));
  it('expires', () => expect(checkOtp(base({ expiresAt: new Date(now.getTime() - 1) }), phone, '123456', now)).toBe('EXPIRED'));
  it('expires exactly at expiresAt', () => expect(checkOtp(base({ expiresAt: now }), phone, '123456', now)).toBe('EXPIRED'));
  it('locks after max attempts even with the right code', () => expect(checkOtp(base({ attempts: OTP_MAX_ATTEMPTS }), phone, '123456', now)).toBe('TOO_MANY_ATTEMPTS'));
  it('allows the last attempt', () => expect(checkOtp(base({ attempts: OTP_MAX_ATTEMPTS - 1 }), phone, '123456', now)).toBe('OK'));
  it('cannot be reused', () => expect(checkOtp(base({ consumedAt: now }), phone, '123456', now)).toBe('CONSUMED'));
  it('normalises Kenyan numbers', () => {
    expect(normalizePhone('0711 271 828')).toBe('+254711271828');
    expect(normalizePhone('254711271828')).toBe('+254711271828');
    expect(normalizePhone('711271828')).toBe('+254711271828');
    expect(normalizePhone('+254711271828')).toBe('+254711271828');
  });
});

describe('reminder selection', () => {
  const appt = (id: string, hoursAhead: number, status = 'BOOKED', patientPhone: string | null = '+254700') => ({ id, startAt: new Date(now.getTime() + hoursAhead * H), status, patientPhone });
  it('24h window is centred on now+24h', () => {
    const w = appointmentWindow('APPT_24H', now);
    expect(w.from.getTime()).toBe(now.getTime() + 23.5 * H);
    expect(w.to.getTime()).toBe(now.getTime() + 24.5 * H);
  });
  it('selects 24h appointments only', () => {
    const r = selectAppointments('APPT_24H', [appt('a', 24), appt('b', 2), appt('c', 23.6), appt('d', 25)], now, new Set());
    expect(r.map((x) => x.id)).toEqual(['a', 'c']);
  });
  it('selects 2h appointments, skipping cancelled, phoneless and already-sent', () => {
    const r = selectAppointments('APPT_2H', [appt('a', 2), appt('b', 2, 'CANCELLED'), appt('c', 2, 'BOOKED', null), appt('d', 1.8), appt('e', 2.2, 'CONFIRMED')], now, new Set(['d']));
    expect(r.map((x) => x.id)).toEqual(['a', 'e']);
  });
  it('immunizations due in the next 2 days or overdue ≤7 days', () => {
    const imm = (id: string, days: number, status = 'DUE', givenAt: Date | null = null) => ({ id, dueDate: new Date(now.getTime() + days * 24 * H), status, givenAt, phone: '+254700' });
    const r = selectImmunizations([imm('a', 1), imm('b', 3), imm('c', -3), imm('d', -10), imm('e', 1, 'GIVEN', now)], now, new Set());
    expect(r.map((x) => x.id)).toEqual(['a', 'c']);
  });
  it('bill balances above threshold and idle 48h', () => {
    const b = (id: string, bal: number, idleH: number, status = 'FINAL') => ({ id, status, patientAmountMinor: 100_000, paidMinor: 100_000 - bal, updatedAt: new Date(now.getTime() - idleH * H), phone: '+254700' });
    const r = selectBillBalances([b('a', 50_000, 72), b('b', 5_000, 72), b('c', 50_000, 10), b('d', 50_000, 72, 'PAID'), b('e', 50_000, 72, 'PARTIALLY_PAID')], now, new Set(['e']));
    expect(r.map((x) => x.id)).toEqual(['a']);
  });
  it('results verified within 24h', () => {
    const r = selectResultsReady([{ id: 'a', verifiedAt: new Date(now.getTime() - H), phone: '+2547' }, { id: 'b', verifiedAt: new Date(now.getTime() - 30 * H), phone: '+2547' }, { id: 'c', verifiedAt: null, phone: '+2547' }], now, new Set());
    expect(r.map((x) => x.id)).toEqual(['a']);
  });
  it('templates render in both languages', () => {
    expect(renderTemplate(DEFAULT_TEMPLATES.APPT_24H.sw, { name: 'Amina', facility: 'Demo', time: '10:00', phone: '0700' })).toContain('Habari Amina');
    expect(renderTemplate('Hi {{name}} {{missing}}', { name: 'A' })).toBe('Hi A');
  });
});

describe('USSD state machine', () => {
  const data = { facility: 'Demo Hospital', patientName: 'John', appointment: 'Mon 20 Oct 10:30', sha: 'Active (SHIF)', bill: 'KES 1,250.00' };
  it('shows the main menu on empty input', () => {
    expect(ussdRespond('', data)).toMatch(/^CON Welcome to Demo Hospital\n1\. My next appointment/);
  });
  it('toggles Kiswahili with 4 and back', () => {
    expect(ussdRespond('4', data)).toMatch(/^CON Karibu Demo Hospital/);
    expect(ussdRespond('4*4', data)).toMatch(/^CON Welcome/);
  });
  it('resolves actions', () => {
    expect(ussdRoute('1')).toEqual({ lang: 'en', step: 'ACTION', action: 'APPOINTMENT' });
    expect(ussdRespond('1', data)).toBe('END Your next appointment: Mon 20 Oct 10:30');
    expect(ussdRespond('4*2', data)).toBe('END Hali ya SHA: Active (SHIF)');
    expect(ussdRespond('3', data)).toBe('END Outstanding balance: KES 1,250.00');
    expect(ussdRespond('4*3', { ...data, bill: undefined })).toBe('END Huna deni lolote.');
    expect(ussdRespond('1', { ...data, appointment: undefined })).toBe('END You have no upcoming appointments.');
  });
  it('handles unknown callers and invalid input', () => {
    expect(ussdRespond('1', { facility: 'X' })).toMatch(/^END Your phone number is not registered/);
    expect(ussdRespond('9', data)).toMatch(/^END Invalid choice/);
    expect(ussdRespond('1*2', data)).toMatch(/^END Invalid choice/);
  });
});

describe('IdempotencyInterceptor', () => {
  const mkStore = (): IdempotencyStore & { rows: Map<string, any> } => {
    const rows = new Map<string, any>();
    return { rows, find: async (t, k) => rows.get(`${t}:${k}`) ?? null, save: async (r) => { if (!rows.has(`${r.tenantId}:${r.key}`)) rows.set(`${r.tenantId}:${r.key}`, r); } };
  };
  const ctx = (method: string, url: string, key?: string, tenantId = 't1') => {
    const res = { statusCode: 201, headers: {} as any, setHeader(k: string, v: string) { this.headers[k] = v; }, status(c: number) { this.statusCode = c; } };
    const req = { method, url, originalUrl: url, headers: key ? { 'idempotency-key': key } : {}, user: { tenantId } };
    return { res, c: { getType: () => 'http', switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as any };
  };
  it('allow-lists only offline endpoints', () => {
    expect(isIdempotentRoute('POST', '/api/patients')).toBe(true);
    expect(isIdempotentRoute('POST', '/api/emr/vitals')).toBe(true);
    expect(isIdempotentRoute('POST', '/api/payments/receipts')).toBe(true);
    expect(isIdempotentRoute('POST', '/api/payments/mpesa/stk')).toBe(false);
    expect(isIdempotentRoute('GET', '/api/patients')).toBe(false);
  });
  it('stores the first response and replays it', async () => {
    const store = mkStore(); const i = IdempotencyInterceptor.withStore(store);
    let calls = 0; const handler = { handle: () => { calls++; return of({ id: `p${calls}` }); } };
    const a = ctx('POST', '/api/patients', 'k1');
    expect(await lastValueFrom(i.intercept(a.c, handler))).toEqual({ id: 'p1' });
    const b = ctx('POST', '/api/patients', 'k1');
    expect(await lastValueFrom(i.intercept(b.c, handler))).toEqual({ id: 'p1' });
    expect(calls).toBe(1);
    expect(b.res.headers['Idempotent-Replayed']).toBe('true');
  });
  it('scopes keys per tenant', async () => {
    const store = mkStore(); const i = IdempotencyInterceptor.withStore(store);
    let calls = 0; const handler = { handle: () => of({ n: ++calls }) };
    await lastValueFrom(i.intercept(ctx('POST', '/api/visits', 'k', 't1').c, handler));
    expect(await lastValueFrom(i.intercept(ctx('POST', '/api/visits', 'k', 't2').c, handler))).toEqual({ n: 2 });
  });
  it('rejects a key reused on another endpoint', async () => {
    const store = mkStore(); const i = IdempotencyInterceptor.withStore(store);
    await lastValueFrom(i.intercept(ctx('POST', '/api/visits', 'k').c, { handle: () => of({}) }));
    await expect(lastValueFrom(i.intercept(ctx('POST', '/api/patients', 'k').c, { handle: () => of({}) }))).rejects.toBeInstanceOf(ConflictException);
  });
  it('passes through without a key or on other routes', async () => {
    const store = mkStore(); const i = IdempotencyInterceptor.withStore(store);
    await lastValueFrom(i.intercept(ctx('POST', '/api/patients').c, { handle: () => of({}) }));
    await lastValueFrom(i.intercept(ctx('POST', '/api/orders', 'x').c, { handle: () => of({}) }));
    expect(store.rows.size).toBe(0);
  });
  it('does not store failures', async () => {
    const store = mkStore(); const i = IdempotencyInterceptor.withStore(store);
    const { throwError } = await import('rxjs');
    await expect(lastValueFrom(i.intercept(ctx('POST', '/api/patients', 'k').c, { handle: () => throwError(() => new Error('boom')) }))).rejects.toThrow('boom');
    expect(store.rows.size).toBe(0);
  });
});
