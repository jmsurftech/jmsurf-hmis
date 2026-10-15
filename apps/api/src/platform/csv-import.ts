import { BadRequestException, Body, Controller, Get, Injectable, Post } from '@nestjs/common';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { SequenceService } from '../common/sequence.service';
import { AuthUser, CurrentUser, Roles } from '../common/auth-user';
import { AccountingService } from '../backoffice/finance/finance.module';
import { IMPORT_TARGETS, parseCsv, validateImport } from './csv-import.rules';

class ImportDto {
  @IsIn(Object.keys(IMPORT_TARGETS)) target: string;
  @IsString() @MaxLength(5_000_000) csv: string;
  @IsObject() mapping: Record<string, string>;
  @IsOptional() @IsBoolean() commit?: boolean;
  @IsOptional() @IsString() memo?: string;
}
class PreviewDto { @IsString() @MaxLength(5_000_000) csv: string; @IsIn(Object.keys(IMPORT_TARGETS)) target: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** CSV migration wizard: preview headers + suggested mapping → dry-run validation report → commit (all-or-nothing). */
@Injectable()
export class CsvImportService {
  constructor(private prisma: PrismaService, private audit: AuditService, private seq: SequenceService, private accounting: AccountingService) {}

  targets() {
    return Object.entries(IMPORT_TARGETS).map(([key, t]) => ({ key, label: t.label, fields: t.fields }));
  }

  preview(dto: PreviewDto) {
    const csv = parseCsv(dto.csv);
    const fields = IMPORT_TARGETS[dto.target].fields;
    const suggested: Record<string, string> = {};
    for (const f of fields) {
      const h = csv.headers.find((x) => norm(x) === norm(f.key) || norm(x) === norm(f.label) || norm(f.label).startsWith(norm(x)) && norm(x).length > 2);
      if (h) suggested[f.key] = h;
    }
    return { headers: csv.headers, sample: csv.rows.slice(0, 5), rowCount: csv.rows.length, suggestedMapping: suggested };
  }

  private async context(tenantId: string, target: string) {
    if (target === 'patients') return { existingKeys: new Set((await this.prisma.patient.findMany({ where: { tenantId }, select: { mrn: true } })).map((p) => p.mrn.toUpperCase())) };
    if (target === 'stockItems') return { existingKeys: new Set((await this.prisma.stockItem.findMany({ where: { tenantId }, select: { code: true } })).map((p) => p.code.toUpperCase())) };
    if (target === 'serviceItems') return { existingKeys: new Set((await this.prisma.serviceItem.findMany({ where: { tenantId }, select: { code: true } })).map((p) => p.code.toUpperCase())) };
    await this.accounting.ensureChart(tenantId);
    return { accountCodes: new Set((await this.prisma.account.findMany({ where: { tenantId }, select: { code: true } })).map((a) => a.code)) };
  }

  async run(u: AuthUser, dto: ImportDto) {
    const csv = parseCsv(dto.csv);
    if (csv.rows.length > 20000) throw new BadRequestException('Max 20,000 rows per import; split the file');
    const report = validateImport(dto.target, csv, dto.mapping, await this.context(u.tenantId, dto.target));
    const { records, ...summary } = report;
    if (!dto.commit) return { ...summary, dryRun: true, preview: records.slice(0, 20) };
    if (report.errors.length) throw new BadRequestException({ message: `Fix ${report.errors.length} error(s) before committing`, report: summary });
    const T = u.tenantId;
    const strip = ({ _row, ...r }: any) => r;
    let created = 0;
    if (dto.target === 'patients') {
      for (const r of records.map(strip)) {
        await this.prisma.patient.create({ data: { ...r, tenantId: T, mrn: r.mrn || (await this.seq.next(T, 'MRN', 'MRN')) } });
        created++;
      }
    } else if (dto.target === 'stockItems') {
      created = (await this.prisma.stockItem.createMany({ data: records.map((r) => ({ ...strip(r), tenantId: T })) })).count;
    } else if (dto.target === 'serviceItems') {
      created = (await this.prisma.serviceItem.createMany({ data: records.map((r) => ({ ...strip(r), tenantId: T })) })).count;
    } else {
      const j = await this.accounting.post({
        tenantId: T, reference: 'OPENING', sourceType: 'OPENING_BALANCE', memo: dto.memo ?? 'Opening balances (CSV import)', postedBy: u.sub,
        lines: records.map((r) => ({ accountCode: r.accountCode, debitMinor: r.debitMinor ?? 0, creditMinor: r.creditMinor ?? 0 })),
      } as any);
      created = 1;
      await this.audit.log({ tenantId: T, userId: u.sub, action: 'IMPORT', entity: 'JournalEntry', entityId: j.id, data: { target: dto.target, lines: records.length } });
      return { ...summary, dryRun: false, created, journalId: j.id };
    }
    await this.audit.log({ tenantId: T, userId: u.sub, action: 'IMPORT', entity: dto.target, data: { rows: created } });
    return { ...summary, dryRun: false, created };
  }
}

@Controller('import')
@Roles('ADMIN')
export class CsvImportController {
  constructor(private svc: CsvImportService) {}
  @Get('targets') targets() { return this.svc.targets(); }
  @Post('preview') preview(@Body() dto: PreviewDto) { return this.svc.preview(dto); }
  @Post() run(@CurrentUser() u: AuthUser, @Body() dto: ImportDto) { return this.svc.run(u, dto); }
}
