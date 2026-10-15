import { BadRequestException } from '@nestjs/common';

/** Light structural validation and derived scores for specialty forms stored in ClinicalNote.data. */
export function processSpecialtyForm(specialty: string | undefined, data: Record<string, any> | undefined): Record<string, any> | undefined {
  if (!data || !specialty) return data;
  switch (specialty) {
    case 'DENTAL': {
      // odontogram: { teeth: { "11": { condition: "CARIES", surfaces: ["O"], procedure?: "FILLING" } } } using FDI notation
      const teeth = data.teeth ?? {};
      for (const t of Object.keys(teeth)) {
        const n = Number(t);
        const q = Math.floor(n / 10), i = n % 10;
        const valid = ([1, 2, 3, 4].includes(q) && i >= 1 && i <= 8) || ([5, 6, 7, 8].includes(q) && i >= 1 && i <= 5);
        if (!valid) throw new BadRequestException(`Invalid FDI tooth number ${t}`);
      }
      return { ...data, teethCharted: Object.keys(teeth).length };
    }
    case 'EYE': {
      // { va: {re, le}, iop: {re, le}, refraction: {re:{sph,cyl,axis,add}, le:{...}} }
      const iop = data.iop ?? {};
      const high = ['re', 'le'].filter((e) => typeof iop[e] === 'number' && iop[e] > 21);
      return { ...data, flags: high.length ? [`Raised IOP (${high.join(', ').toUpperCase()}) — glaucoma suspect`] : [] };
    }
    case 'MENTAL_HEALTH':
    case 'PSYCHIATRY': {
      const out: Record<string, any> = { ...data };
      if (Array.isArray(data.phq9)) {
        if (data.phq9.length !== 9) throw new BadRequestException('PHQ-9 needs 9 answers');
        const s = data.phq9.reduce((a: number, b: number) => a + Number(b), 0);
        out.phq9Score = s;
        out.phq9Severity = s >= 20 ? 'SEVERE' : s >= 15 ? 'MODERATELY_SEVERE' : s >= 10 ? 'MODERATE' : s >= 5 ? 'MILD' : 'MINIMAL';
        out.suicideRiskFlag = Number(data.phq9[8]) > 0;
      }
      if (Array.isArray(data.gad7)) {
        if (data.gad7.length !== 7) throw new BadRequestException('GAD-7 needs 7 answers');
        const s = data.gad7.reduce((a: number, b: number) => a + Number(b), 0);
        out.gad7Score = s;
        out.gad7Severity = s >= 15 ? 'SEVERE' : s >= 10 ? 'MODERATE' : s >= 5 ? 'MILD' : 'MINIMAL';
      }
      return out;
    }
    default:
      return data;
  }
}
