import { news2Score } from './news2';
import { satsPriority, tewsToCategory } from './sats';

describe('NEWS2', () => {
  it('scores normal vitals as 0 / LOW', () => {
    expect(news2Score({ respRate: 16, spo2: 98, systolic: 120, pulse: 75, temperatureC: 37, consciousness: 'A' })).toEqual({ score: 0, risk: 'LOW', anyThree: false });
  });
  it('flags a single red parameter as LOW_MEDIUM', () => {
    const r = news2Score({ respRate: 16, spo2: 98, systolic: 120, pulse: 75, temperatureC: 37, consciousness: 'V' });
    expect(r.score).toBe(3);
    expect(r.risk).toBe('LOW_MEDIUM');
  });
  it('scores a septic patient HIGH', () => {
    // RR 26 (3) SpO2 92 (2) O2 (2) SBP 95 (2) HR 120 (2) temp 39.5 (2)
    const r = news2Score({ respRate: 26, spo2: 92, onOxygen: true, systolic: 95, pulse: 120, temperatureC: 39.5 });
    expect(r.score).toBe(13);
    expect(r.risk).toBe('HIGH');
  });
  it('medium band 5-6', () => {
    expect(news2Score({ respRate: 22, pulse: 105, temperatureC: 38.5, systolic: 108 }).risk).toBe('MEDIUM');
  });
  it('uses SpO2 scale 2 for hypercapnic patients', () => {
    expect(news2Score({ spo2: 89, scale2: true }).score).toBe(0);
    expect(news2Score({ spo2: 89 }).score).toBe(3);
  });
});

describe('SATS', () => {
  it('maps colours to priority', () => {
    expect(satsPriority('RED')).toBe(1);
    expect(satsPriority('orange')).toBe(2);
    expect(satsPriority('GREEN')).toBe(4);
    expect(satsPriority('???')).toBe(3);
  });
  it('maps TEWS to category', () => {
    expect(tewsToCategory(8)).toBe('RED');
    expect(tewsToCategory(5)).toBe('ORANGE');
    expect(tewsToCategory(3)).toBe('YELLOW');
    expect(tewsToCategory(1)).toBe('GREEN');
  });
});

import { processSpecialtyForm } from './specialty-forms';
import { searchIcd11 } from './icd11-codes';

describe('specialty forms', () => {
  it('scores PHQ-9 and flags suicide item', () => {
    const r = processSpecialtyForm('MENTAL_HEALTH', { phq9: [2, 2, 2, 2, 2, 1, 1, 0, 1] })!;
    expect(r.phq9Score).toBe(13);
    expect(r.phq9Severity).toBe('MODERATE');
    expect(r.suicideRiskFlag).toBe(true);
  });
  it('rejects invalid FDI tooth', () => {
    expect(() => processSpecialtyForm('DENTAL', { teeth: { '19': {} } })).toThrow();
    expect(processSpecialtyForm('DENTAL', { teeth: { '11': {}, '85': {} } })!.teethCharted).toBe(2);
  });
  it('flags raised IOP', () => expect(processSpecialtyForm('EYE', { iop: { re: 25, le: 15 } })!.flags).toHaveLength(1));
});

describe('ICD-11 search', () => {
  it('finds malaria', () => expect(searchIcd11('malaria falciparum')[0].code).toBe('1F40'));
  it('exact code first', () => expect(searchIcd11('BA00')[0].title).toMatch(/hypertension/i));
});
