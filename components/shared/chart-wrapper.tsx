'use client'

import type { ChartData } from '@/types/ai'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, ReferenceLine } from 'recharts'

interface ChartWrapperProps {
  data: ChartData
  height?: number
  className?: string
}

const COLORS = ['#6366f1', '#f59e0b', '#ef4444', '#10b981', '#3b82f6']

export function ChartWrapper({ data, height = 200, className }: ChartWrapperProps) {
  const rows = data.labels.map((label, i) => data.datasets.reduce<Record<string, number | string>>((acc, d) => ({ ...acc, label, [d.label]: d.data[i] ?? 0 }), {}))
  if (data.type === 'donut') {
    const donutRows = data.datasets[0]?.data.map((v, i) => ({ name: data.labels[i] ?? `S${i + 1}`, value: v })) ?? []
    return <div className={className}><ResponsiveContainer width="100%" height={height}><PieChart><Tooltip /><Pie data={donutRows} dataKey="value" nameKey="name" innerRadius={60}>{donutRows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie></PieChart></ResponsiveContainer></div>
  }
  const threshold = data.threshold_value !== undefined ? <ReferenceLine y={data.threshold_value} stroke="#ef4444" strokeDasharray="4 4" /> : null
  if (data.type === 'bar') return <div className={className}><ResponsiveContainer width="100%" height={height}><BarChart data={rows}><XAxis dataKey="label" /><YAxis /><Tooltip />{threshold}{data.datasets.map((d, i) => <Bar key={d.label} dataKey={d.label} fill={d.color ?? COLORS[i % COLORS.length]} />)}</BarChart></ResponsiveContainer></div>
  if (data.type === 'area') return <div className={className}><ResponsiveContainer width="100%" height={height}><AreaChart data={rows}><XAxis dataKey="label" /><YAxis /><Tooltip />{threshold}{data.datasets.map((d, i) => <Area key={d.label} type="monotone" dataKey={d.label} stroke={d.color ?? COLORS[i % COLORS.length]} fill={d.color ?? COLORS[i % COLORS.length]} fillOpacity={0.2} />)}</AreaChart></ResponsiveContainer></div>
  return <div className={className}><ResponsiveContainer width="100%" height={height}><LineChart data={rows}><XAxis dataKey="label" /><YAxis /><Tooltip />{threshold}{data.datasets.map((d, i) => <Line key={d.label} type="monotone" dataKey={d.label} stroke={d.color ?? COLORS[i % COLORS.length]} strokeDasharray={d.dashed ? '4 4' : undefined} dot={false} />)}</LineChart></ResponsiveContainer></div>
}
