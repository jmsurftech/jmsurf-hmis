import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { envInt } from './config';
import { currentTenantId } from './integration-context';

export interface IntegrationRequest {
  adapter: string; // sha, mpesa, etims, sms, dhis2
  operation: string;
  method?: 'GET' | 'POST' | 'PUT';
  url: string;
  headers?: Record<string, string>;
  /** JSON body, or a URLSearchParams for form-encoded requests. */
  body?: unknown;
  idempotencyKey?: string;
  tenantId?: string;
  retries?: number;
  /** Strip secrets before persisting the request to IntegrationMessage. */
  redact?: (body: unknown) => unknown;
}

export class IntegrationError extends Error {
  constructor(message: string, public status?: number, public response?: unknown) {
    super(message);
  }
}

export const backoffMs = (attempt: number, base = envInt('INTEGRATION_RETRY_BASE_MS', 500)) =>
  Math.min(base * 2 ** attempt, 30_000) + Math.floor(Math.random() * base);

const isRetryable = (status?: number) => status === undefined || status === 429 || status >= 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Every outbound integration HTTP call goes through here:
 * - logged to IntegrationMessage (request, response, attempts, status)
 * - idempotent: a SUCCESS message with the same adapter+operation+idempotencyKey short-circuits and returns the stored response
 * - retried with exponential backoff + jitter on network errors, 429 and 5xx
 */
@Injectable()
export class IntegrationHttpService {
  private readonly log = new Logger('Integrations');
  constructor(private prisma: PrismaService) {}

  async request<T = any>(req: IntegrationRequest): Promise<T> {
    const tenantId = req.tenantId ?? currentTenantId() ?? null;
    if (req.idempotencyKey) {
      const done = await this.prisma.integrationMessage.findFirst({
        where: { adapter: req.adapter, operation: req.operation, idempotencyKey: req.idempotencyKey, status: 'SUCCESS' },
      });
      if (done) return done.response as T;
    }
    const isForm = req.body instanceof URLSearchParams;
    const isRaw = typeof req.body === 'string'; // pre-serialised XML/text bodies (e.g. TRA VFD)
    const logged = req.redact ? req.redact(req.body) : isForm ? Object.fromEntries(req.body as URLSearchParams) : req.body;
    const msg = await this.prisma.integrationMessage.create({
      data: {
        tenantId, adapter: req.adapter, operation: req.operation, idempotencyKey: req.idempotencyKey,
        request: { method: req.method ?? 'POST', url: req.url, body: (logged ?? null) as any },
      },
    });
    const maxRetries = req.retries ?? envInt('INTEGRATION_MAX_RETRIES', 3);
    const timeout = envInt('INTEGRATION_TIMEOUT_MS', 20_000);
    let lastErr: IntegrationError | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(req.url, {
          method: req.method ?? 'POST',
          headers: {
            Accept: 'application/json',
            ...(req.body !== undefined && !isForm && !isRaw ? { 'Content-Type': 'application/json' } : {}),
            ...(isForm ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
            ...(req.idempotencyKey ? { 'Idempotency-Key': req.idempotencyKey } : {}),
            ...req.headers,
          },
          body: req.body === undefined ? undefined : isForm || isRaw ? String(req.body) : JSON.stringify(req.body),
          signal: AbortSignal.timeout(timeout),
        });
        const text = await res.text();
        let data: any = text;
        try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
        if (!res.ok) throw new IntegrationError(`${req.adapter}.${req.operation} HTTP ${res.status}`, res.status, data);
        await this.prisma.integrationMessage.update({
          where: { id: msg.id }, data: { status: 'SUCCESS', attempts: attempt + 1, response: data ?? undefined, error: null },
        });
        return data as T;
      } catch (e: any) {
        lastErr = e instanceof IntegrationError ? e : new IntegrationError(`${req.adapter}.${req.operation}: ${e?.message ?? e}`);
        const retry = isRetryable(lastErr.status) && attempt < maxRetries;
        await this.prisma.integrationMessage.update({
          where: { id: msg.id },
          data: {
            status: retry ? 'SENT' : maxRetries > 0 && isRetryable(lastErr.status) ? 'DEAD' : 'FAILED',
            attempts: attempt + 1, error: lastErr.message, response: (lastErr.response ?? undefined) as any,
          },
        });
        if (!retry) break;
        const wait = backoffMs(attempt);
        this.log.warn(`${lastErr.message} — retry ${attempt + 1}/${maxRetries} in ${wait}ms`);
        await sleep(wait);
      }
    }
    throw lastErr!;
  }

  /** Record an inbound message (callbacks/webhooks) for traceability. */
  async logInbound(adapter: string, operation: string, payload: unknown, tenantId?: string, idempotencyKey?: string) {
    return this.prisma.integrationMessage.create({
      data: { tenantId, adapter, operation, direction: 'IN', status: 'SUCCESS', attempts: 1, request: payload as any, idempotencyKey },
    });
  }
}

/** Simple in-memory OAuth token cache (per adapter + credential). Refreshes 60s before expiry. */
export class TokenCache {
  private cache = new Map<string, { token: string; exp: number }>();
  async get(key: string, fetcher: () => Promise<{ token: string; expiresIn: number }>): Promise<string> {
    const hit = this.cache.get(key);
    if (hit && hit.exp > Date.now() + 60_000) return hit.token;
    const t = await fetcher();
    this.cache.set(key, { token: t.token, exp: Date.now() + (t.expiresIn || 3600) * 1000 });
    return t.token;
  }
  clear() { this.cache.clear(); }
}
