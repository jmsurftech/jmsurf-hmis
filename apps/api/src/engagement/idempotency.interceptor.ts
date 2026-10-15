import { CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, map, of, switchMap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

/** Endpoints the offline outbox may replay. Matched against the path after the /api prefix. */
export const IDEMPOTENT_ROUTES: { method: string; path: RegExp }[] = [
  { method: 'POST', path: /^\/patients\/?$/ },
  { method: 'POST', path: /^\/visits\/?$/ },
  { method: 'POST', path: /^\/emr\/vitals\/?$/ },
  { method: 'POST', path: /^\/emr\/notes\/?$/ },
  { method: 'PATCH', path: /^\/emr\/notes\/[0-9a-f-]+\/?$/ },
  { method: 'POST', path: /^\/payments\/receipts\/?$/ },
];

export function isIdempotentRoute(method: string, url: string): boolean {
  const path = url.split('?')[0].replace(/^\/api(?=\/)/, '');
  return IDEMPOTENT_ROUTES.some((r) => r.method === method.toUpperCase() && r.path.test(path));
}

export interface IdempotencyStore {
  find(tenantId: string, key: string): Promise<{ method: string; path: string; statusCode: number; response: unknown } | null>;
  save(rec: { tenantId: string; key: string; method: string; path: string; statusCode: number; response: unknown }): Promise<void>;
}

export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private prisma: PrismaService) {}
  find(tenantId: string, key: string) {
    return this.prisma.idempotencyRecord.findUnique({ where: { tenantId_key: { tenantId, key } } }) as any;
  }
  async save(rec: { tenantId: string; key: string; method: string; path: string; statusCode: number; response: unknown }) {
    await this.prisma.idempotencyRecord.upsert({
      where: { tenantId_key: { tenantId: rec.tenantId, key: rec.key } },
      create: { ...rec, response: (rec.response ?? null) as any },
      update: {},
    });
  }
}

/**
 * Makes allow-listed writes safe to replay: the first successful response for an Idempotency-Key is stored and returned
 * for every later request with the same key (per tenant). Reusing a key on a different endpoint is a conflict.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private store: IdempotencyStore;
  constructor(prisma: PrismaService) { this.store = new PrismaIdempotencyStore(prisma); }
  static withStore(store: IdempotencyStore) { const i = Object.create(IdempotencyInterceptor.prototype) as IdempotencyInterceptor; i.store = store; return i; }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const key: string | undefined = req.headers?.['idempotency-key'];
    const tenantId: string | undefined = req.user?.tenantId;
    const url: string = req.originalUrl ?? req.url;
    if (!key || !tenantId || !isIdempotentRoute(req.method, url) || key.length > 100) return next.handle();
    const path = url.split('?')[0];
    const res = ctx.switchToHttp().getResponse();
    return from(this.store.find(tenantId, key)).pipe(
      switchMap((hit) => {
        if (hit) {
          if (hit.method !== req.method || hit.path !== path) throw new ConflictException('Idempotency-Key reused for a different request');
          res?.setHeader?.('Idempotent-Replayed', 'true');
          res?.status?.(hit.statusCode);
          return of(hit.response);
        }
        return next.handle().pipe(
          switchMap((body) => from(this.store.save({ tenantId, key, method: req.method, path, statusCode: res?.statusCode ?? 201, response: body }).catch(() => undefined)).pipe(map(() => body))),
        );
      }),
    );
  }
}
