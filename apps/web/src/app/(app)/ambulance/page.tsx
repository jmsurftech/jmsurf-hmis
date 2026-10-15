'use client';
import { ModulePage } from '@/components/ModulePage';
import { PatientName } from '@/components/PatientName';
import { Card, KV, StatusBadge } from '@/components/ui';
import { useGet } from '@/lib/hooks';
import { dateTime, money } from '@/lib/format';
import { PICK } from '@/lib/pickers';
import { SPICK } from '@/lib/support-pickers';

function Fleet() {
  const { data } = useGet<any[]>('/ems/ambulances');
  return <div className="mb-4 grid gap-3 sm:grid-cols-3">{(data ?? []).map((a) => (
    <Card key={a.id}><div className="flex items-center justify-between"><div><p className="font-semibold">{a.regNumber}</p><p className="text-xs text-slate-500">{a.callSign} · {a.type} · {a.odometerKm.toLocaleString()} km</p></div><StatusBadge status={a.status} tone={a.status === 'AVAILABLE' ? 'green' : a.status === 'DISPATCHED' ? 'blue' : 'slate'} /></div></Card>))}</div>;
}
const OPEN = ['REQUESTED', 'DISPATCHED', 'AT_SCENE', 'TRANSPORTING'];
export default function Ambulance() {
  return <ModulePage title="Ambulance / EMS" subtitle="Dispatch, trip log & trip billing" tabs={[
    { id: 'trips', label: 'Trips', path: '/ems/trips', searchable: true, custom: <Fleet />, createLabel: 'New dispatch request', invalidate: ['/ems'],
      columns: [{ key: 'tripNumber', header: 'Trip' }, { key: 'requestedAt', header: 'Requested', render: (t: any) => dateTime(t.requestedAt) }, { key: 'priority', header: 'Priority', render: (t: any) => <StatusBadge status={t.priority} tone={t.priority === 'EMERGENCY' ? 'red' : t.priority === 'URGENT' ? 'amber' : 'slate'} /> }, { key: 'pickupLocation', header: 'Pickup' }, { key: 'dropoffLocation', header: 'Drop-off' }, { key: 'patient', header: 'Patient', render: (t: any) => t.patientId ? <PatientName id={t.patientId} /> : t.patientName ?? '—' }, { key: 'mileageKm', header: 'Km' }, { key: 'status', header: 'Status', render: (t: any) => <StatusBadge status={t.status} /> }],
      fields: [{ name: 'pickupLocation', label: 'Pickup location', required: true }, { name: 'dropoffLocation', label: 'Drop-off location' }, { name: 'priority', label: 'Priority', type: 'select', options: ['ROUTINE', 'URGENT', 'EMERGENCY'] }, { name: 'complaint', label: 'Complaint' }, { name: 'callerName', label: 'Caller name' }, { name: 'callerPhone', label: 'Caller phone', type: 'tel' }, { name: 'patientId', label: 'Registered patient', type: 'picker', source: PICK.patient }, { name: 'patientName', label: 'Patient name (if unregistered)' }],
      detailPath: (t: any) => `/ems/trips/${t.id}`, detailTitle: (t: any) => `Trip ${t.tripNumber}`,
      renderDetail: (d) => d && <KV items={[['Status', <StatusBadge key="s" status={d.status} />], ['Priority', d.priority], ['Caller', `${d.callerName ?? '—'} ${d.callerPhone ?? ''}`], ['Complaint', d.complaint], ['Pickup', d.pickupLocation], ['Drop-off', d.dropoffLocation], ['Patient', d.patientId ? <PatientName key="p" id={d.patientId} withMrn /> : d.patientName], ['Ambulance', d.ambulance ? `${d.ambulance.regNumber} (${d.ambulance.callSign ?? d.ambulance.type})` : '—'], ['Crew', (d.crew ?? []).join(', ')],
        ['Dispatched', dateTime(d.dispatchedAt)], ['At scene', dateTime(d.atSceneAt)], ['Picked up', dateTime(d.pickedUpAt)], ['Dropped', dateTime(d.droppedAt)], ['Odometer', d.odometerStart != null ? `${d.odometerStart} → ${d.odometerEnd ?? '…'}` : '—'], ['Mileage', d.mileageKm != null ? `${d.mileageKm} km` : '—'], ['Billed', money(d.chargedMinor)], ['Notes', d.notes]]} />,
      actions: [
        { label: 'Dispatch', tone: 'primary', path: (t: any) => `/ems/trips/${t.id}/dispatch`, show: (t: any) => t.status === 'REQUESTED', fields: [{ name: 'ambulanceId', label: 'Ambulance', type: 'picker', source: SPICK.availableAmbulance, required: true }, { name: 'crewText', label: 'Crew (comma-separated)', required: true }] },
        { label: 'At scene', path: (t: any) => `/ems/trips/${t.id}/event`, show: (t: any) => t.status === 'DISPATCHED', transform: () => ({ status: 'AT_SCENE' }) },
        { label: 'Patient picked up', path: (t: any) => `/ems/trips/${t.id}/event`, show: (t: any) => ['DISPATCHED', 'AT_SCENE'].includes(t.status), fields: [{ name: 'patientId', label: 'Registered patient', type: 'picker', source: PICK.patient }], transform: (v) => ({ ...v, status: 'TRANSPORTING' }) },
        { label: 'Complete & bill', tone: 'primary', path: (t: any) => `/ems/trips/${t.id}/complete`, show: (t: any) => ['DISPATCHED', 'AT_SCENE', 'TRANSPORTING'].includes(t.status), defaults: (t: any) => ({ odometerEnd: t.odometerStart, dropoffLocation: t.dropoffLocation }),
          fields: [{ name: 'odometerEnd', label: 'Odometer at end (km)', type: 'number', required: true }, { name: 'dropoffLocation', label: 'Drop-off' }, { name: 'patientId', label: 'Patient (for billing)', type: 'picker', source: PICK.patient }, { name: 'notes', label: 'Notes', type: 'textarea' }] },
        { label: 'Cancel', tone: 'danger', path: (t: any) => `/ems/trips/${t.id}/cancel`, show: (t: any) => OPEN.includes(t.status), fields: [{ name: 'reason', label: 'Reason' }] },
      ] },
    { id: 'fleet', label: 'Fleet', path: '/ems/ambulances', createLabel: 'Add ambulance', invalidate: ['/ems'],
      columns: [{ key: 'regNumber', header: 'Registration' }, { key: 'callSign', header: 'Call sign' }, { key: 'type', header: 'Type' }, { key: 'odometerKm', header: 'Odometer (km)' }, { key: 'status', header: 'Status', render: (a: any) => <StatusBadge status={a.status} /> }],
      fields: [{ name: 'regNumber', label: 'Registration', required: true }, { name: 'callSign', label: 'Call sign' }, { name: 'type', label: 'Type', type: 'select', options: ['BLS', 'ALS', 'TRANSPORT'] }, { name: 'odometerKm', label: 'Odometer (km)', type: 'number' }],
      actions: [
        { label: 'Mark available', path: (a: any) => `/ems/ambulances/${a.id}/status`, show: (a: any) => a.status === 'MAINTENANCE', transform: () => ({ status: 'AVAILABLE' }) },
        { label: 'Send to maintenance', path: (a: any) => `/ems/ambulances/${a.id}/status`, show: (a: any) => a.status === 'AVAILABLE', transform: () => ({ status: 'MAINTENANCE' }) },
      ] },
  ]} />;
}
