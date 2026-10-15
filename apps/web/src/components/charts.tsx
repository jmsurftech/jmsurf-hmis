'use client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** JMSURF chart palette: crimson first, then distinguishable companions that hold up in light and dark. */
export const PALETTE = ['#bd2332', '#2f6fb0', '#e08a1e', '#23744e', '#6d3fd1', '#1f8a8f', '#8a7a83'];
const axis = { fontSize: 11.5, stroke: '#9b8c94', tickLine: false, axisLine: false } as const;
const tip = { contentStyle: { borderRadius: 14, fontSize: 12.5, border: '1px solid rgb(226 216 221 / .85)', boxShadow: '0 14px 34px -20px rgb(120 30 45 / .3)', background: 'var(--surface)', color: 'var(--ink)' }, cursor: { fill: 'rgb(189 35 50 / .06)' } };
const grid = <CartesianGrid strokeDasharray="4 4" stroke="#9b8c94" strokeOpacity={0.18} vertical={false} />;
const legend = <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" iconSize={8} />;
export type Fmt = (v: number) => string;

export function LineTrend({ data, x, lines, height = 260, fmt }: { data: any[]; x: string; lines: { key: string; label: string }[]; height?: number; fmt?: Fmt }) {
  return <ResponsiveContainer width="100%" height={height}><LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>{grid}<XAxis dataKey={x} {...axis} /><YAxis {...axis} tickFormatter={fmt} /><Tooltip {...tip} formatter={fmt ? (v: number) => fmt(v) : undefined} />{lines.length > 1 && legend}{lines.map((l, i) => <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={PALETTE[i]} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />)}</LineChart></ResponsiveContainer>;
}
export function AreaTrend({ data, x, areas, height = 260, fmt }: { data: any[]; x: string; areas: { key: string; label: string }[]; height?: number; fmt?: Fmt }) {
  return <ResponsiveContainer width="100%" height={height}><AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
    <defs>{areas.map((a, i) => <linearGradient key={a.key} id={`ga-${a.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PALETTE[i]} stopOpacity={0.32} /><stop offset="100%" stopColor={PALETTE[i]} stopOpacity={0} /></linearGradient>)}</defs>
    {grid}<XAxis dataKey={x} {...axis} /><YAxis {...axis} tickFormatter={fmt} /><Tooltip {...tip} formatter={fmt ? (v: number) => fmt(v) : undefined} />{areas.length > 1 && legend}
    {areas.map((a, i) => <Area key={a.key} type="monotone" dataKey={a.key} name={a.label} stroke={PALETTE[i]} strokeWidth={2.5} fill={`url(#ga-${a.key})`} />)}
  </AreaChart></ResponsiveContainer>;
}
export function Bars({ data, x, bars, height = 260, layout, fmt, stacked }: { data: any[]; x: string; bars: { key: string; label: string }[]; height?: number; layout?: 'vertical'; fmt?: Fmt; stacked?: boolean }) {
  const v = layout === 'vertical';
  return <ResponsiveContainer width="100%" height={height}><BarChart data={data} layout={v ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: v ? 0 : -8, bottom: 0 }} barCategoryGap="22%">
    {v ? <CartesianGrid strokeDasharray="4 4" stroke="#9b8c94" strokeOpacity={0.18} horizontal={false} /> : grid}
    {v ? <><XAxis type="number" {...axis} tickFormatter={fmt} /><YAxis type="category" dataKey={x} width={170} {...axis} /></> : <><XAxis dataKey={x} {...axis} /><YAxis {...axis} tickFormatter={fmt} /></>}
    <Tooltip {...tip} formatter={fmt ? (val: number) => fmt(val) : undefined} />{bars.length > 1 && legend}
    {bars.map((b, i) => <Bar key={b.key} dataKey={b.key} name={b.label} fill={PALETTE[i]} stackId={stacked ? 's' : undefined} radius={v ? [0, 8, 8, 0] : [8, 8, 0, 0]} maxBarSize={44} />)}
  </BarChart></ResponsiveContainer>;
}
export function Donut({ data, nameKey, valueKey, height = 260, fmt }: { data: any[]; nameKey: string; valueKey: string; height?: number; fmt?: Fmt }) {
  return <ResponsiveContainer width="100%" height={height}><PieChart><Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="58%" outerRadius="82%" paddingAngle={3} cornerRadius={6} stroke="none">{data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie><Tooltip {...tip} formatter={fmt ? (v: number) => fmt(v) : undefined} />{legend}</PieChart></ResponsiveContainer>;
}
