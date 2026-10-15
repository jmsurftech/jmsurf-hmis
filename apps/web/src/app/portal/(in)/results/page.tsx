'use client';
import { FlaskConical, Hourglass, ScanLine } from 'lucide-react';
import { Card, EmptyState, ErrorNote, Loading, PageHeader, StatusBadge } from '@/components/ui';
import { date } from '@/lib/format';
import { usePortal } from '@/lib/portal';

export default function Results() {
  const { data, isLoading, error } = usePortal<any[]>('/results');
  return (
    <div>
      <PageHeader title="Results" subtitle="Lab and imaging results appear here once a clinician has checked them. Talk to your doctor about what they mean." />
      <ErrorNote error={error} />
      {isLoading ? <Loading /> : !data?.length ? <Card><EmptyState icon={FlaskConical} title="No tests yet" message="When the hospital orders a test for you, it shows here." /></Card> :
        <div className="grid gap-4 lg:grid-cols-2">{data.map((o) => (
          <Card key={o.id} title={<span className="flex items-center gap-2">{o.type === 'IMAGING' ? <ScanLine className="h-4 w-4 text-brand" /> : <FlaskConical className="h-4 w-4 text-brand" />}{o.description}</span>}
            subtitle={`${date(o.createdAt)} · visit ${o.visit?.visitNumber ?? ''}`} actions={o.ready ? <StatusBadge status="READY" tone="green" /> : <StatusBadge status="IN_PROGRESS" />}>
            {!o.ready ? <p className="m-0 flex items-center gap-2 text-sm text-slate-500"><Hourglass className="h-4 w-4" />Not ready yet.</p>
              : o.imaging ? <div className="space-y-2 text-sm">{o.imaging.findings && <p className="m-0"><b>Findings: </b>{o.imaging.findings}</p>}{o.imaging.impression && <p className="m-0"><b>Conclusion: </b>{o.imaging.impression}</p>}</div>
              : <div className="tablewrap"><table className="t text-sm"><thead><tr><th>Test</th><th className="text-right">Result</th><th /></tr></thead><tbody>
                {o.lab.map((r: any) => <tr key={r.testCode}><td>{r.name}</td><td className="text-right font-bold">{r.value} <span className="font-normal text-slate-500">{r.unit}</span></td><td className="w-px">{r.flag && r.flag !== 'N' ? <StatusBadge status={r.flag} dot={false} /> : <span className="badge green">Normal</span>}</td></tr>)}
              </tbody></table></div>}
          </Card>
        ))}</div>}
    </div>
  );
}
