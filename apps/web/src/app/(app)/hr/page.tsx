'use client';
import { Check, Play, X } from 'lucide-react';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { DataTable } from '@/components/DataTable';
import { Modal, StatusBadge, Tabs } from '@/components/ui';
import { useAction, useGet } from '@/lib/hooks';
import { date, money } from '@/lib/format';

export default function Hr() {
  const [tab, setTab] = useState('employees'); const [run, setRun] = useState<any>(null);
  const leaveAct = useAction<{ id: string; a: string }>('post', (b) => `/hr/leave/${b.id}/${b.a}`, { invalidate: ['/hr'], success: 'Updated' });
  const approveRun = useAction<string>('post', (id) => `/hr/payroll-runs/${id}/approve`, { invalidate: ['/hr'], success: 'Payroll approved' });
  const tabs = <Tabs value={tab} onChange={setTab} tabs={[{ id: 'employees', label: 'Employees' }, { id: 'leave', label: 'Leave' }, { id: 'payroll', label: 'Payroll runs' }]} />;
  if (tab === 'employees') return <CrudPage title="HR & Payroll" path="/hr/employees" createLabel="New employee" columns={[
    { key: 'staffNumber', header: 'Staff no.' }, { key: 'name', header: 'Name', render: (e: any) => `${e.firstName} ${e.lastName}` }, { key: 'jobTitle', header: 'Job title' }, { key: 'department', header: 'Department', render: (e: any) => e.department?.name ?? '—' },
    { key: 'basicSalaryMinor', header: 'Basic', render: (e: any) => money(e.basicSalaryMinor), className: 'text-right' }, { key: 'status', header: 'Status', render: (e: any) => <StatusBadge status={e.status ?? 'ACTIVE'} /> }]}
    fields={[{ name: 'firstName', label: 'First name', required: true }, { name: 'lastName', label: 'Last name', required: true }, { name: 'nationalId', label: 'National ID', required: true }, { name: 'kraPin', label: 'KRA PIN' }, { name: 'shaNumber', label: 'SHA number' }, { name: 'nssfNumber', label: 'NSSF number' }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'jobTitle', label: 'Job title' }, { name: 'employmentType', label: 'Employment', type: 'select', options: ['PERMANENT', 'CONTRACT', 'LOCUM', 'INTERN'] }, { name: 'hireDate', label: 'Hire date', type: 'date' }, { name: 'basicSalary', label: 'Basic salary (KES)', type: 'money' }, { name: 'bankAccount', label: 'Bank / M-Pesa account' }]}>{tabs}</CrudPage>;
  if (tab === 'leave') return <CrudPage title="HR & Payroll" path="/hr/leave" createLabel="Leave request" columns={[
    { key: 'employee', header: 'Employee', render: (l: any) => l.employee ? `${l.employee.firstName} ${l.employee.lastName}` : '—' }, { key: 'type', header: 'Type' }, { key: 'startDate', header: 'From', render: (l: any) => date(l.startDate) }, { key: 'endDate', header: 'To', render: (l: any) => date(l.endDate) }, { key: 'days', header: 'Days' },
    { key: 'status', header: 'Status', render: (l: any) => <StatusBadge status={l.status} /> },
    { key: 'a', header: '', render: (l: any) => l.status === 'PENDING' ? <span className="flex gap-1"><button className="btn-primary px-2 py-1 text-xs" onClick={() => leaveAct.mutate({ id: l.id, a: 'approve' })}><Check className="h-3 w-3" /></button><button className="btn-secondary px-2 py-1 text-xs" onClick={() => leaveAct.mutate({ id: l.id, a: 'reject' })}><X className="h-3 w-3" /></button></span> : null }]}
    fields={[{ name: 'employeeId', label: 'Employee ID', required: true }, { name: 'type', label: 'Leave type', type: 'select', options: ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'COMPASSIONATE', 'STUDY', 'UNPAID'], required: true }, { name: 'startDate', label: 'Start', type: 'date', required: true }, { name: 'endDate', label: 'End', type: 'date', required: true }, { name: 'reason', label: 'Reason', type: 'textarea' }]}>{tabs}</CrudPage>;
  return <>
    <CrudPage title="HR & Payroll" path="/hr/payroll-runs" createLabel="New payroll run" onRowClick={setRun} columns={[
      { key: 'period', header: 'Period' }, { key: 'employees', header: 'Employees', render: (r: any) => r.employeeCount ?? r._count?.payslips ?? '—' }, { key: 'grossMinor', header: 'Gross', render: (r: any) => money(r.grossMinor), className: 'text-right' },
      { key: 'paye', header: 'PAYE', render: (r: any) => money(r.payeMinor), className: 'text-right' }, { key: 'netMinor', header: 'Net', render: (r: any) => money(r.netMinor), className: 'text-right' }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
      { key: 'a', header: '', render: (r: any) => r.status === 'DRAFT' ? <button className="btn-primary px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); approveRun.mutate(r.id); }}><Play className="h-3 w-3" />Approve</button> : null }]}
      fields={[{ name: 'period', label: 'Period (YYYY-MM)', required: true, placeholder: '2026-10' }, { name: 'payDate', label: 'Pay date', type: 'date' }]}>{tabs}</CrudPage>
    {run && <PayslipsDialog run={run} onClose={() => setRun(null)} />}
  </>;
}
function PayslipsDialog({ run, onClose }: { run: any; onClose: () => void }) {
  const [slip, setSlip] = useState<string | null>(null);
  const { data: s } = useGet<any>(slip ? `/hr/payslips/${slip}` : null);
  return <Modal open onClose={onClose} title={`Payslips · ${run.period}`} wide>
    {!slip ? <DataTable path={`/hr/payroll-runs/${run.id}/payslips`} onRowClick={(p: any) => setSlip(p.id)} columns={[{ key: 'employee', header: 'Employee', render: (p: any) => p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : '—' }, { key: 'grossMinor', header: 'Gross', render: (p: any) => money(p.grossMinor) }, { key: 'payeMinor', header: 'PAYE', render: (p: any) => money(p.payeMinor) }, { key: 'netMinor', header: 'Net', render: (p: any) => money(p.netMinor) }]} />
      : <div className="text-sm"><button className="btn-secondary mb-3 py-1" onClick={() => setSlip(null)}>← Back</button>
        {s && <><p className="font-semibold">{s.employee?.firstName} {s.employee?.lastName} · {run.period}</p>
          <table className="mt-2 w-full"><tbody>{[...(s.earnings ?? []), ...(s.deductions ?? []).map((d: any) => ({ ...d, amountMinor: -d.amountMinor }))].map((l: any, i: number) => <tr key={i}><td className="td">{l.name ?? l.code}</td><td className="td text-right">{money(l.amountMinor)}</td></tr>)}
            {[['Gross', s.grossMinor], ['PAYE', s.payeMinor], ['SHIF', s.shifMinor], ['NSSF', s.nssfMinor], ['Housing levy', s.housingLevyMinor], ['Net pay', s.netMinor]].map(([k, v]) => v != null && <tr key={k as string} className="font-medium"><td className="td">{k}</td><td className="td text-right">{money(v as number)}</td></tr>)}</tbody></table>
          <button className="btn-secondary mt-3" onClick={() => window.print()}>Print payslip</button></>}</div>}
  </Modal>;
}
