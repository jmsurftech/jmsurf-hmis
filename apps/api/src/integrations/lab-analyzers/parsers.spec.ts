import { ASTM, astmChecksum, astmDeframe, astmFrames, parseAstm } from './astm';
import { hl7Ack, mllpExtract, mllpWrap, parseOruR01 } from './hl7';
import { SAMPLE_ASTM_RECORDS, SAMPLE_ORU_R01 } from './samples';

describe('ASTM E1394 / E1381', () => {
  it('computes the modulo-256 checksum', () => {
    // '1' + 'H|\\^&' + ETX
    const body = `1H|\\^&${ASTM.ETX}`;
    const sum = [...body].reduce((a, c) => a + c.charCodeAt(0), 0) % 256;
    expect(astmChecksum(body)).toBe(sum.toString(16).toUpperCase().padStart(2, '0'));
  });

  it('frames, deframes and validates checksums (multi-frame with ETB)', () => {
    const frames = astmFrames(SAMPLE_ASTM_RECORDS, 64);
    expect(frames.length).toBeGreaterThan(1);
    expect(frames[0]).toContain(ASTM.ETB);
    expect(frames[frames.length - 1]).toContain(ASTM.ETX);
    const { text, checksumErrors } = astmDeframe(frames.join(''));
    expect(checksumErrors).toBe(0);
    expect(text).toBe(SAMPLE_ASTM_RECORDS.map((r) => `${r}\r`).join(''));
    const bad = frames.join('').replace(/\x03([0-9A-F]{2})/, '\x0300');
    expect(astmDeframe(bad).checksumErrors).toBe(1);
  });

  it('parses header, order and results', () => {
    const m = parseAstm(astmFrames(SAMPLE_ASTM_RECORDS).join(''));
    expect(m.sender).toBe('Mindray');
    expect(m.specimens).toHaveLength(1);
    const s = m.specimens[0];
    expect(s.accession).toBe('LAB-000123');
    expect(s.patientId).toBe('PAT001');
    expect(s.results.map((r) => [r.testCode, r.value, r.unit, r.flag])).toEqual([
      ['WBC', '12.4', '10*9/L', 'H'], ['HGB', '13.1', 'g/dL', 'N'], ['PLT', '95', '10*9/L', 'LL'],
    ]);
    expect(s.results[0].completedAt).toBe('2026-10-15T08:29:00.000Z');
  });

  it('parses unframed text with LF separators', () => {
    expect(parseAstm(SAMPLE_ASTM_RECORDS.join('\n')).specimens[0].results).toHaveLength(3);
  });
});

describe('HL7 v2 ORU^R01', () => {
  it('parses OBR/OBX into specimens and results', () => {
    const m = parseOruR01(SAMPLE_ORU_R01);
    expect(m.messageType).toBe('ORU^R01');
    expect(m.controlId).toBe('MSG00042');
    expect(m.sender).toBe('COBAS');
    expect(m.specimens[0].accession).toBe('LAB-000124');
    expect(m.specimens[0].patientId).toBe('PAT002');
    expect(m.specimens[0].results.map((r) => [r.testCode, r.value, r.unit, r.flag])).toEqual([
      ['GLU', '7.8', 'mmol/L', 'H'], ['CREA', '88', 'umol/L', 'N'], ['COMM', 'Slightly lipaemic', undefined, undefined],
    ]);
  });

  it('rejects non-ORU messages', () => {
    expect(() => parseOruR01('MSH|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5')).toThrow(/ORU\^R01/);
  });

  it('MLLP wrap/extract round-trip with partial buffers', () => {
    const framed = mllpWrap(SAMPLE_ORU_R01) + mllpWrap('MSH|^~\\&|X');
    const half = framed.slice(0, framed.length - 5);
    const a = mllpExtract(half);
    expect(a.messages).toEqual([SAMPLE_ORU_R01]);
    const b = mllpExtract(a.rest + framed.slice(framed.length - 5));
    expect(b.messages).toEqual(['MSH|^~\\&|X']);
    expect(b.rest).toBe('');
  });

  it('builds an ACK echoing the control id', () => {
    const ack = hl7Ack(SAMPLE_ORU_R01, 'AA', '', new Date('2026-10-15T09:00:01Z'));
    expect(ack).toContain('ACK^R01');
    expect(ack.split('\r')[1]).toBe('MSA|AA|MSG00042');
    expect(ack.split('\r')[0]).toContain('|JMSURF|HOSP|COBAS|LAB1|20261015090001|');
  });
});
