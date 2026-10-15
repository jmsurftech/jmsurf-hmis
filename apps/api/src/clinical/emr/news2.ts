/** NEWS2 (Royal College of Physicians 2017) aggregate score. Uses SpO2 scale 1 unless scale2 is set. */
export interface News2Input {
  respRate?: number | null;
  spo2?: number | null;
  onOxygen?: boolean;
  systolic?: number | null;
  pulse?: number | null;
  consciousness?: 'A' | 'C' | 'V' | 'P' | 'U';
  temperatureC?: number | null;
  scale2?: boolean;
}

export function news2Score(v: News2Input): { score: number; risk: 'LOW' | 'LOW_MEDIUM' | 'MEDIUM' | 'HIGH'; anyThree: boolean } {
  const parts: number[] = [];
  const rr = v.respRate;
  if (rr != null) parts.push(rr <= 8 ? 3 : rr <= 11 ? 1 : rr <= 20 ? 0 : rr <= 24 ? 2 : 3);
  const s = v.spo2;
  if (s != null) {
    if (!v.scale2) parts.push(s <= 91 ? 3 : s <= 93 ? 2 : s <= 95 ? 1 : 0);
    else if (v.onOxygen && s >= 93) parts.push(s <= 94 ? 1 : s <= 96 ? 2 : 3);
    else parts.push(s <= 83 ? 3 : s <= 85 ? 2 : s <= 87 ? 1 : 0);
  }
  if (v.onOxygen) parts.push(2);
  const sbp = v.systolic;
  if (sbp != null) parts.push(sbp <= 90 ? 3 : sbp <= 100 ? 2 : sbp <= 110 ? 1 : sbp <= 219 ? 0 : 3);
  const p = v.pulse;
  if (p != null) parts.push(p <= 40 ? 3 : p <= 50 ? 1 : p <= 90 ? 0 : p <= 110 ? 1 : p <= 130 ? 2 : 3);
  if (v.consciousness && v.consciousness !== 'A') parts.push(3);
  const t = v.temperatureC;
  if (t != null) parts.push(t <= 35 ? 3 : t <= 36 ? 1 : t <= 38 ? 0 : t <= 39 ? 1 : 2);
  const score = parts.reduce((a, b) => a + b, 0);
  const anyThree = parts.includes(3);
  const risk = score >= 7 ? 'HIGH' : score >= 5 ? 'MEDIUM' : anyThree ? 'LOW_MEDIUM' : 'LOW';
  return { score, risk, anyThree };
}
