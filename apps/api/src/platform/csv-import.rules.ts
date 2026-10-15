/** CSV migration: parsing, column mapping and row validation (pure, unit-tested). */

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const out: string[][] = [];
  let row: string[] = [], field = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) out.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) out.push(row);
  const [headers = [], ...rows] = out;
  return { headers: headers.map((h) => h.trim()), rows };
}

type FieldType = 'string' | 'int' | 'money' | 'date' | 'sex' | 'number' | 'bool';
interface FieldDef { key: string; label: string; type: FieldType; required?: boolean }

export const IMPORT_TARGETS: Record<string, { label: string; uniqueKey?: string; fields: FieldDef[] }> = {
  patients: { label: 'Patients', uniqueKey: 'mrn', fields: [
    { key: 'mrn', label: 'MRN (blank = auto)', type: 'string' },
    { key: 'firstName', label: 'First name', type: 'string', required: true },
    { key: 'middleName', label: 'Middle name', type: 'string' },
    { key: 'lastName', label: 'Last name', type: 'string', required: true },
    { key: 'sex', label: 'Sex (M/F)', type: 'sex', required: true },
    { key: 'dateOfBirth', label: 'Date of birth (YYYY-MM-DD)', type: 'date' },
    { key: 'phone', label: 'Phone', type: 'string' },
    { key: 'idType', label: 'ID type', type: 'string' },
    { key: 'idNumber', label: 'ID number', type: 'string' },
    { key: 'shaNumber', label: 'SHA number', type: 'string' },
    { key: 'county', label: 'County', type: 'string' },
  ] },
  stockItems: { label: 'Stock items', uniqueKey: 'code', fields: [
    { key: 'code', label: 'Code', type: 'string', required: true },
    { key: 'name', label: 'Name', type: 'string', required: true },
    { key: 'genericName', label: 'Generic name', type: 'string' },
    { key: 'category', label: 'Category (DRUG/CONSUMABLE/REAGENT/NON_MEDICAL)', type: 'string' },
    { key: 'unit', label: 'Unit', type: 'string' },
    { key: 'form', label: 'Form', type: 'string' },
    { key: 'strength', label: 'Strength', type: 'string' },
    { key: 'reorderLevel', label: 'Reorder level', type: 'int' },
    { key: 'sellPriceMinor', label: 'Sell price (KES)', type: 'money' },
    { key: 'vatRate', label: 'VAT rate (0.16)', type: 'number' },
    { key: 'isControlled', label: 'Controlled (yes/no)', type: 'bool' },
  ] },
  serviceItems: { label: 'Service items', uniqueKey: 'code', fields: [
    { key: 'code', label: 'Code', type: 'string', required: true },
    { key: 'name', label: 'Name', type: 'string', required: true },
    { key: 'category', label: 'Category', type: 'string', required: true },
    { key: 'departmentType', label: 'Department type', type: 'string' },
    { key: 'basePriceMinor', label: 'Price (KES)', type: 'money', required: true },
    { key: 'vatRate', label: 'VAT rate', type: 'number' },
    { key: 'shaInterventionCode', label: 'SHA intervention code', type: 'string' },
  ] },
  openingBalances: { label: 'Opening balances (GL)', fields: [
    { key: 'accountCode', label: 'Account code', type: 'string', required: true },
    { key: 'debitMinor', label: 'Debit (KES)', type: 'money' },
    { key: 'creditMinor', label: 'Credit (KES)', type: 'money' },
    { key: 'memo', label: 'Memo', type: 'string' },
  ] },
};

export interface RowError { row: number; field?: string; message: string }
export interface ValidationReport { target: string; totalRows: number; validRows: number; errors: RowError[]; records: Record<string, any>[] }

function coerce(type: FieldType, raw: string): { ok: true; value: any } | { ok: false; message: string } {
  const v = raw.trim();
  switch (type) {
    case 'string': return { ok: true, value: v };
    case 'int': return /^-?\d+$/.test(v) ? { ok: true, value: Number(v) } : { ok: false, message: 'must be a whole number' };
    case 'number': return v !== '' && !isNaN(Number(v)) ? { ok: true, value: Number(v) } : { ok: false, message: 'must be a number' };
    case 'money': {
      const n = Number(v.replace(/,/g, '').replace(/^KES\s*/i, ''));
      return isNaN(n) || n < 0 ? { ok: false, message: 'must be a non-negative amount' } : { ok: true, value: Math.round(n * 100) };
    }
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) ?? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
      if (!m) return { ok: false, message: 'must be YYYY-MM-DD or DD/MM/YYYY' };
      const d = m[1].length === 4 ? new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`) : new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`);
      return isNaN(d.getTime()) || d.getTime() > Date.now() ? { ok: false, message: 'invalid or future date' } : { ok: true, value: d };
    }
    case 'sex': {
      const s = v.toUpperCase();
      const map: Record<string, string> = { M: 'MALE', MALE: 'MALE', F: 'FEMALE', FEMALE: 'FEMALE', I: 'INTERSEX', INTERSEX: 'INTERSEX', U: 'UNKNOWN', UNKNOWN: 'UNKNOWN' };
      return map[s] ? { ok: true, value: map[s] } : { ok: false, message: 'must be M, F, I or U' };
    }
    case 'bool': return { ok: true, value: /^(y|yes|true|1)$/i.test(v) };
  }
}

/**
 * Validate CSV rows against an import target. `mapping` is { targetField: csvHeader }.
 * Row numbers in errors are 1-based spreadsheet rows (header = row 1).
 */
export function validateImport(target: string, csv: { headers: string[]; rows: string[][] }, mapping: Record<string, string>, opts: { existingKeys?: Set<string>; accountCodes?: Set<string> } = {}): ValidationReport {
  const def = IMPORT_TARGETS[target];
  if (!def) throw new Error(`Unknown import target ${target}`);
  const errors: RowError[] = [];
  for (const f of def.fields) if (f.required && !mapping[f.key]) errors.push({ row: 0, field: f.key, message: `Required column "${f.label}" is not mapped` });
  for (const [k, col] of Object.entries(mapping)) {
    if (!def.fields.some((f) => f.key === k)) errors.push({ row: 0, field: k, message: `Unknown field ${k}` });
    else if (col && !csv.headers.includes(col)) errors.push({ row: 0, field: k, message: `Column "${col}" not found in CSV` });
  }
  if (errors.length) return { target, totalRows: csv.rows.length, validRows: 0, errors, records: [] };

  const records: Record<string, any>[] = [];
  const seen = new Set<string>();
  csv.rows.forEach((cells, i) => {
    const rowNo = i + 2;
    const rec: Record<string, any> = {};
    let ok = true;
    for (const f of def.fields) {
      const col = mapping[f.key];
      const raw = col ? (cells[csv.headers.indexOf(col)] ?? '') : '';
      if (raw.trim() === '') {
        if (f.required) { errors.push({ row: rowNo, field: f.key, message: `${f.label} is required` }); ok = false; }
        continue;
      }
      const c = coerce(f.type, raw);
      if (c.ok) rec[f.key] = c.value; else { errors.push({ row: rowNo, field: f.key, message: `${f.label} ${c.message}` }); ok = false; }
    }
    if (def.uniqueKey && rec[def.uniqueKey]) {
      const key = String(rec[def.uniqueKey]).toUpperCase();
      if (seen.has(key)) { errors.push({ row: rowNo, field: def.uniqueKey, message: `Duplicate ${def.uniqueKey} ${rec[def.uniqueKey]} in file` }); ok = false; }
      else if (opts.existingKeys?.has(key)) { errors.push({ row: rowNo, field: def.uniqueKey, message: `${def.uniqueKey} ${rec[def.uniqueKey]} already exists` }); ok = false; }
      seen.add(key);
    }
    if (target === 'openingBalances' && ok) {
      const d = rec.debitMinor ?? 0, c = rec.creditMinor ?? 0;
      if ((d > 0) === (c > 0)) { errors.push({ row: rowNo, message: 'Exactly one of debit or credit must be > 0' }); ok = false; }
      if (opts.accountCodes && !opts.accountCodes.has(rec.accountCode)) { errors.push({ row: rowNo, field: 'accountCode', message: `Unknown account ${rec.accountCode}` }); ok = false; }
    }
    if (ok) records.push({ ...rec, _row: rowNo });
  });
  if (target === 'openingBalances' && records.length === csv.rows.length && records.length) {
    const dr = records.reduce((s, r) => s + (r.debitMinor ?? 0), 0), cr = records.reduce((s, r) => s + (r.creditMinor ?? 0), 0);
    if (dr !== cr) errors.push({ row: 0, message: `Debits (${dr}) do not equal credits (${cr})` });
  }
  return { target, totalRows: csv.rows.length, validRows: records.length, errors, records };
}
