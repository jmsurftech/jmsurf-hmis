export type PoStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
export interface PoLine { itemId: string; quantity: number; unitCostMinor: number; received?: number }

const TRANSITIONS: Record<string, PoStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['PARTIAL', 'RECEIVED', 'CANCELLED'],
  PARTIAL: ['PARTIAL', 'RECEIVED'],
  RECEIVED: [],
  CANCELLED: [],
};

export function assertTransition(from: string, to: PoStatus) {
  if (!TRANSITIONS[from]?.includes(to)) throw new Error(`Cannot move purchase order from ${from} to ${to}`);
}

export const poTotal = (lines: PoLine[]) => lines.reduce((a, l) => a + l.quantity * l.unitCostMinor, 0);

/** Apply a (possibly partial) receipt. Returns updated lines and resulting status. Rejects over-receipt. */
export function applyReceipt(status: string, lines: PoLine[], receipt: { itemId: string; quantity: number }[]): { lines: PoLine[]; status: PoStatus } {
  if (status !== 'APPROVED' && status !== 'PARTIAL') throw new Error(`Purchase order is ${status}; only APPROVED/PARTIAL orders can be received`);
  const next = lines.map((l) => ({ ...l, received: l.received ?? 0 }));
  for (const r of receipt) {
    const line = next.find((l) => l.itemId === r.itemId);
    if (!line) throw new Error(`Item ${r.itemId} is not on this purchase order`);
    if (r.quantity <= 0) throw new Error('Received quantity must be positive');
    if (line.received! + r.quantity > line.quantity) throw new Error(`Over-receipt for item ${r.itemId}: ordered ${line.quantity}, already received ${line.received}`);
    line.received! += r.quantity;
  }
  const complete = next.every((l) => l.received! >= l.quantity);
  return { lines: next, status: complete ? 'RECEIVED' : 'PARTIAL' };
}
