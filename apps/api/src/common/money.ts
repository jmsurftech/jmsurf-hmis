/** Money helpers. All amounts are integer minor units (cents). */
export const toMinor = (major: number) => Math.round(major * 100);
export const toMajor = (minor: number) => minor / 100;
export const vatOf = (grossMinor: number, rate: number) => (rate > 0 ? Math.round((grossMinor * rate) / (1 + rate)) : 0);
