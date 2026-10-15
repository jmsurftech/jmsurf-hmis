'use client';
import { useState } from 'react';
import { CrudPage } from '@/components/CrudPage';
import { Modal, Spinner, StatusBadge } from '@/components/ui';
import { useAction } from '@/lib/hooks';
import { ROLES } from '@/lib/nav';
import { date } from '@/lib/format';

export default function Users() {
  const [sel, setSel] = useState<any>(null);
  return <>
    <CrudPage title="Users & roles" subtitle="Staff accounts and access" path="/admin/users" createLabel="Invite user" onRowClick={setSel} columns={[
      { key: 'name', header: 'Name', render: (u: any) => `${u.firstName} ${u.lastName}` }, { key: 'email', header: 'Email' },
      { key: 'roles', header: 'Roles', render: (u: any) => <div className="flex flex-wrap gap-1">{(u.roles ?? []).map((r: string) => <StatusBadge key={r} status={r} tone="blue" />)}</div> },
      { key: 'lastLoginAt', header: 'Last login', render: (u: any) => date(u.lastLoginAt) }, { key: 'active', header: 'Status', render: (u: any) => <StatusBadge status={u.active === false ? 'INACTIVE' : 'ACTIVE'} /> }]}
      transform={(v) => ({ ...v, roles: v.role ? [v.role] : [] })}
      fields={[{ name: 'firstName', label: 'First name', required: true }, { name: 'lastName', label: 'Last name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'phone', label: 'Phone' }, { name: 'role', label: 'Primary role', type: 'select', options: ROLES, required: true }, { name: 'password', label: 'Temporary password', type: 'password', required: true }]} />
    {sel && <RolesDialog user={sel} onClose={() => setSel(null)} />}
  </>;
}
function RolesDialog({ user, onClose }: { user: any; onClose: () => void }) {
  const [roles, setRoles] = useState<string[]>(user.roles ?? []); const [active, setActive] = useState(user.active !== false);
  const m = useAction('patch', `/admin/users/${user.id}`, { invalidate: ['/admin/users'], success: 'User updated', onSuccess: onClose });
  return <Modal open onClose={onClose} title={`${user.firstName} ${user.lastName}`} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={m.isPending} onClick={() => m.mutate({ roles, active })}>{m.isPending && <Spinner />}Save</button></>}>
    <p className="label">Roles</p>
    <div className="grid grid-cols-2 gap-2">{ROLES.map((r) => <label key={r} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={roles.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} />{r.replace(/_/g, ' ')}</label>)}</div>
    <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Account active</label>
  </Modal>;
}
