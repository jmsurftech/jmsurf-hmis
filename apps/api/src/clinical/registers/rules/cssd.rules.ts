/** A load passes only when every indicator recorded passes (BI PENDING still releases the load, with recall possible on BI fail). */
export function cyclePassed(r: { chemicalIndicator?: string | null; biologicalIndicator?: string | null; bowieDick?: string | null }): boolean {
  return r.chemicalIndicator === 'PASS' && r.biologicalIndicator !== 'FAIL' && r.bowieDick !== 'FAIL';
}
