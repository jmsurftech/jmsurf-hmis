/**
 * Offline-first support for the staff app:
 *  - an IndexedDB outbox: allow-listed writes made while offline are queued with a client UUID (sent as Idempotency-Key)
 *    and replayed in order when the connection returns; the API's IdempotencyInterceptor makes replays safe;
 *  - a read cache for today's queue and the patient list so they can be viewed offline.
 * Hand-written on the IndexedDB API (no dependency).
 */
const DB_NAME = 'jmsurf-offline';
const DB_VERSION = 1;
const OUTBOX = 'outbox';
const CACHE = 'reads';

/** Writes that may be queued offline (path relative to the API base). */
export const OUTBOX_ALLOW: { method: string; path: RegExp; label: string }[] = [
  { method: 'POST', path: /^\/patients\/?$/, label: 'Register patient' },
  { method: 'POST', path: /^\/visits\/?$/, label: 'Open visit' },
  { method: 'POST', path: /^\/emr\/vitals\/?$/, label: 'Record vitals' },
  { method: 'POST', path: /^\/emr\/notes\/?$/, label: 'Clinical note' },
  { method: 'PATCH', path: /^\/emr\/notes\/[0-9a-f-]+\/?$/, label: 'Update note' },
  { method: 'POST', path: /^\/payments\/receipts\/?$/, label: 'Cash receipt' },
];
/** Reads cached for offline viewing. */
export const READ_CACHE_ALLOW: RegExp[] = [/^\/queue\/board/, /^\/patients(\?|$)/, /^\/visits(\?|$)/, /^\/appointments(\?|$)/, /^\/auth\/me$/];

export interface OutboxItem {
  id: string; // client UUID == Idempotency-Key
  method: string; path: string; url: string; body?: string; label: string;
  createdAt: number; attempts: number; status: 'PENDING' | 'FAILED'; error?: string;
}

const hasIdb = () => typeof window !== 'undefined' && 'indexedDB' in window;
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(OUTBOX)) d.createObjectStore(OUTBOX, { keyPath: 'id' });
      if (!d.objectStoreNames.contains(CACHE)) d.createObjectStore(CACHE);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-4${Math.random().toString(16).slice(2, 5)}`);
const emit = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('outbox-change')); };

export async function outboxList(): Promise<OutboxItem[]> {
  if (!hasIdb()) return [];
  const all = await tx<OutboxItem[]>(OUTBOX, 'readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}
async function outboxPut(i: OutboxItem) { await tx(OUTBOX, 'readwrite', (s) => s.put(i)); emit(); }
export async function outboxRemove(id: string) { await tx(OUTBOX, 'readwrite', (s) => s.delete(id)); emit(); }

const matchOutbox = (method: string, path: string) => OUTBOX_ALLOW.find((r) => r.method === method && r.path.test(path.split('?')[0]));
const isNetworkError = (e: unknown) => e instanceof TypeError || (e as any)?.name === 'TypeError';

/** fetch() wrapper used by apiFetch. Adds Idempotency-Key to allow-listed writes, queues them when offline, and serves cached reads. */
export async function offlineFetch(path: string, url: string, init: RequestInit): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const rule = method === 'GET' ? undefined : matchOutbox(method, path);
  const headers = new Headers(init.headers);
  if (rule && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', uuid());
  const req = { ...init, headers };
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (rule && hasIdb() && (offline || !(init.body instanceof FormData))) {
    if (offline) return queue(rule.label, method, path, url, init.body as string | undefined, headers.get('Idempotency-Key')!);
    try { return await fetch(url, req); } catch (e) { if (isNetworkError(e)) return queue(rule.label, method, path, url, init.body as string | undefined, headers.get('Idempotency-Key')!); throw e; }
  }
  const cacheable = method === 'GET' && hasIdb() && READ_CACHE_ALLOW.some((r) => r.test(path));
  if (!cacheable) return fetch(url, req);
  try {
    const res = await fetch(url, req);
    if (res.ok) { const text = await res.clone().text(); tx(CACHE, 'readwrite', (s) => s.put({ text, at: Date.now() }, url)).catch(() => undefined); }
    return res;
  } catch (e) {
    const hit = await tx<{ text: string; at: number } | undefined>(CACHE, 'readonly', (s) => s.get(url) as IDBRequest<any>).catch(() => undefined);
    if (hit) return new Response(hit.text, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Offline-Cache': new Date(hit.at).toISOString() } });
    throw e;
  }
}

async function queue(label: string, method: string, path: string, url: string, body: string | undefined, id: string): Promise<Response> {
  await outboxPut({ id, method, path, url, body, label, createdAt: Date.now(), attempts: 0, status: 'PENDING' });
  const echo = (() => { try { return body ? JSON.parse(body) : {}; } catch { return {}; } })();
  return new Response(JSON.stringify({ ...echo, id: `offline-${id}`, clientId: id, queued: true, offline: true }), { status: 202, headers: { 'Content-Type': 'application/json' } });
}

let syncing = false;
/** Replay pending items in order. Network errors stop the run (still offline); HTTP 4xx marks an item FAILED for review. */
export async function syncOutbox(getHeaders: () => Record<string, string>): Promise<{ sent: number; failed: number }> {
  if (syncing || !hasIdb() || (typeof navigator !== 'undefined' && !navigator.onLine)) return { sent: 0, failed: 0 };
  syncing = true;
  let sent = 0, failed = 0;
  try {
    for (const item of await outboxList()) {
      if (item.status !== 'PENDING') continue;
      try {
        const res = await fetch(item.url, { method: item.method, body: item.body, headers: { 'Content-Type': 'application/json', ...getHeaders(), 'Idempotency-Key': item.id } });
        if (res.ok) { await outboxRemove(item.id); sent++; continue; }
        if (res.status === 401) break; // wait for re-login
        if (res.status >= 500) { await outboxPut({ ...item, attempts: item.attempts + 1 }); break; }
        const msg = await res.text().catch(() => '');
        await outboxPut({ ...item, attempts: item.attempts + 1, status: 'FAILED', error: msg.slice(0, 300) || res.statusText });
        failed++;
      } catch { break; }
    }
  } finally { syncing = false; }
  return { sent, failed };
}
