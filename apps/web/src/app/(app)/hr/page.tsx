'use client';
import { Check, Download, Play, X } from 'lucide-react';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { Table } from '@/components/DataTable';
import { Modal, StatusBadge, Tabs } from '@/components/ui';
import { downloadCsv } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { date, money } from '@/lib/format';
import { PICK } from '@/lib/pickers';

export default function Hr() {
  const [tab, setTab] = useState('employees'); const [run, setRun] = useState<any>(null);
  const leaveAct = useAction<{ id: string; status: string }>('post', (b) => `/hr/leave/${b.id}/decision`, { invalidate: ['/hr'], success: 'Updated' });
  const approveRun = useAction<string>('post', (period) => `/hr/payroll/${period}/approve`, { invalidate: ['/hr'], success: 'Payroll approved' });
  const tabs = <Tabs value={tab} onChange={setTab} tabs={[{ id: 'employees', label: 'Employees' }, { id: 'leave', label: 'Leave' }, { id: 'payroll', label: 'Payroll runs' }]} />;
  if (tab === 'employees') return <CrudPage title="HR & Payroll" path="/hr/employees" createLabel="New employee" columns={[
    { key: 'staffNo', header: 'Staff no.' }, { key: 'name', header: 'Name', render: (e: any) => `${e.firstName} ${e.lastName}` }, { key: 'designation', header: 'Job title' }, { key: 'department', header: 'Department' },
    { key: 'basicSalaryMinor', header: 'Basic', render: (e: any) => money(e.basicSalaryMinor), className: 'text-right' }, { key: 'active', header: 'Status', render: (e: any) => <StatusBadge status={e.active === false ? 'INACTIVE' : 'ACTIVE'} /> }]}
    transform={(v) => ({ ...v, basicSalaryMinor: v.basicSalaryMinor ?? 0 })}
    fields={[{ name: 'staffNo', label: 'Staff no.', required: true }, { name: 'firstName', label: 'First name', required: true }, { name: 'lastName', label: 'Last name', required: true }, { name: 'idNumber', label: 'National ID' }, { name: 'kraPin', label: 'KRA PIN' }, { name: 'shifNo', label: 'SHIF number' }, { name: 'nssfNo', label: 'NSSF number' }, { name: 'designation', label: 'Job title' }, { name: 'department', label: 'Department' }, { name: 'hireDate', label: 'Hire date', type: 'date' }, { name: 'basicSalary', label: 'Basic salary (KES)', type: 'money', required: true }]}>{tabs}</CrudPage>;
  if (tab === 'leave') return <CrudPage title="HR & Payroll" path="/hr/leave" createLabel="Leave request" columns={[
    { key: 'employee', header: 'Employee', render: (l: any) => l.employee ? `${l.employee.firstName} ${l.employee.lastName}` : '—' }, { key: 'type', header: 'Type' }, { key: 'startDate', header: 'From', render: (l: any) => date(l.startDate) }, { key: 'endDate', header: 'To', render: (l: any) => date(l.endDate) }, { key: 'days', header: 'Days' },
    { key: 'status', header: 'Status', render: (l: any) => <StatusBadge status={l.status} /> },
    { key: 'a', header: '', render: (l: any) => l.status === 'PENDING' ? <span className="flex gap-1"><button className="btn-primary px-2 py-1 text-xs" aria-label="Approve" onClick={() => leaveAct.mutate({ id: l.id, status: 'APPROVED' })}><Check className="h-3 w-3" /></button><button className="btn-secondary px-2 py-1 text-xs" aria-label="Reject" onClick={() => leaveAct.mutate({ id: l.id, status: 'REJECTED' })}><X className="h-3 w-3" /></button></span> : null }]}
    fields={[{ name: 'employeeId', label: 'Employee', type: 'picker', source: PICK.employee, required: true }, { name: 'type', label: 'Leave type', type: 'select', options: ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'COMPASSIONATE', 'STUDY', 'UNPAID'], required: true }, { name: 'startDate', label: 'Start', type: 'date', required: true }, { name: 'endDate', label: 'End', type: 'date', required: true }]}>{tabs}</CrudPage>;
  return <>
    <CrudPage title="HR & Payroll" path="/hr/payroll" createPath="/hr/payroll/run" createLabel="Run payroll" searchable={false} onRowClick={setRun} columns={[
      { key: 'period', header: 'Period' }, { key: 'employees', header: 'Employees', render: (r: any) => r.summary?.employees ?? '—' }, { key: 'grossMinor', header: 'Gross', render: (r: any) => money(r.summary?.grossMinor), className: 'text-right' },
      { key: 'paye', header: 'PAYE', render: (r: any) => money(r.summary?.payeMinor), className: 'text-right' }, { key: 'netMinor', header: 'Net', render: (r: any) => money(r.summary?.netPayMinor), className: 'text-right' }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
      { key: 'a', header: '', render: (r: any) => r.status === 'DRAFT' ? <button className="btn-primary px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); approveRun.mutate(r.period); }}><Play className="h-3 w-3" />Approve</button> : null }]}
      fields={[{ name: 'period', label: 'Period (YYYY-MM)', required: true, placeholder: new Date().toISOString().slice(0, 7) }]}>{tabs}</CrudPage>
    {run && <PayslipsDialog run={run} onClose={() => setRun(null)} />}
  </>;
}
function PayslipsDialog({ run, onClose }: { run: any; onClose: () => void }) {
  const [slip, setSlip] = useState<any>(null);
  const { data } = useGet<any>(`/hr/payroll/${run.period}`);
  return <Modal open onClose={onClose} title={`Payslips · ${run.period}`} wide footer={<button className="btn-secondary" onClick={() => downloadCsv(`/hr/payroll/${run.period}/p10.csv`, {}, `P10-${run.period}.csv`)}><Download className="h-4 w-4" />KRA P10 (CSV)</button>}>
    {!slip ? <Table rows={data?.payslips ?? []} onRowClick={setSlip} columns={[{ key: 'name', header: 'Employee' }, { key: 'staffNo', header: 'Staff no.' }, { key: 'grossMinor', header: 'Gross', render: (p: any) => money(p.grossMinor) }, { key: 'payeMinor', header: 'PAYE', render: (p: any) => money(p.payeMinor) }, { key: 'netPayMinor', header: 'Net', render: (p: any) => money(p.netPayMinor) }]} />
      : <div className="text-sm"><button className="btn-secondary mb-3 py-1" onClick={() => setSlip(null)}>← Back</button>
        <p className="font-semibold">{slip.name} · {slip.staffNo} · {run.period}</p>
        <table className="mt-2 w-full"><tbody>{(slip.lines ?? []).filter((l: any) => l.type !== 'EMPLOYER').map((l: any, i: number) => <tr key={i}><td className="td">{l.name}</td><td className="td text-right">{money(l.type === 'DEDUCTION' ? -l.amountMinor : l.amountMinor)}</td></tr>)}
          {[['Gross', slip.grossMinor], ['Net pay', slip.netPayMinor]].map(([k, v]) => <tr key={k as string} className="font-medium"><td className="td">{k}</td><td className="td text-right">{money(v as number)}</td></tr>)}</tbody></table>
        <button className="btn-secondary mt-3" onClick={() => window.print()}>Print payslip</button></div>}
  </Modal>;
}
