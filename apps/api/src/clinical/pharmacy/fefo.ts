export interface BatchLike { id: string; quantity: number; expiryDate: Date | null; createdAt?: Date }

/** First-Expiry-First-Out pick list. Expired batches are skipped. Throws if insufficient stock. */
export function fefoPick<T extends BatchLike>(batches: T[], qty: number, now = new Date()): { batch: T; take: number }[] {
  const usable = batches
    .filter((b) => b.quantity > 0 && (!b.expiryDate || new Date(b.expiryDate) > now))
    .sort((a, b) => {
      const ea = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
      const eb = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
      return ea - eb || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
    });
  const out: { batch: T; take: number }[] = [];
  let left = qty;
  for (const b of usable) {
    if (left <= 0) break;
    const take = Math.min(b.quantity, left);
    out.push({ batch: b, take });
    left -= take;
  }
  if (left > 0) throw new Error(`Insufficient stock: short by ${left}`);
  return out;
}
