'use client';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
export const PALETTE = ['#139b9d', '#1e5fa8', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#64748b'];
const axis = { fontSize: 11, stroke: '#94a3b8' };
const tip = { contentStyle: { borderRadius: 8, fontSize: 12 } };
export function LineTrend({ data, x, lines, height = 260 }: { data: any[]; x: string; lines: { key: string; label: string }[]; height?: number }) {
  return <ResponsiveContainer width="100%" height={height}><LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} /><XAxis dataKey={x} {...axis} /><YAxis {...axis} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />{lines.map((l, i) => <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={PALETTE[i]} strokeWidth={2} dot={false} />)}</LineChart></ResponsiveContainer>;
}
export function Bars({ data, x, bars, height = 260, layout }: { data: any[]; x: string; bars: { key: string; label: string }[]; height?: number; layout?: 'vertical' }) {
  return <ResponsiveContainer width="100%" height={height}><BarChart data={data} layout={layout === 'vertical' ? 'vertical' : 'horizontal'}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />{layout === 'vertical' ? <><XAxis type="number" {...axis} /><YAxis type="category" dataKey={x} width={140} {...axis} /></> : <><XAxis dataKey={x} {...axis} /><YAxis {...axis} /></>}<Tooltip {...tip} />{bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}{bars.map((b, i) => <Bar key={b.key} dataKey={b.key} name={b.label} fill={PALETTE[i]} radius={[4, 4, 0, 0]} />)}</BarChart></ResponsiveContainer>;
}
export function Donut({ data, nameKey, valueKey, height = 260 }: { data: any[]; nameKey: string; valueKey: string; height?: number }) {
  return <ResponsiveContainer width="100%" height={height}><PieChart><Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="55%" outerRadius="80%" paddingAngle={2}>{data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} /></PieChart></ResponsiveContainer>;
}
