import { useEffect, useRef, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { compact, money } from './Primitives';
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Recharts' ResponsiveContainer renders once at width(-1)/height(-1) and logs a warning before its own
// observer fires. Measuring the wrapper ourselves and passing real pixels keeps the charts responsive
// without that first invalid pass.
function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setSize(current => current && current.w === Math.round(width) && current.h === Math.round(height) ? current : { w: Math.round(width), h: Math.round(height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}
export const HistoryChart = ({ data, id = 'history-chart' }: { data: { month: string; emissions: number }[]; id?: string }) => {
  const { ref, size } = useSize();
  return <div ref={ref} className="chart-wrap" data-testid={id} role="img" aria-label={`Monthly emissions: ${data.map(d => `${d.month} ${d.emissions} tCO2e`).join(', ')}`}>{size && <AreaChart width={size.w} height={size.h} data={data} margin={{ top: 12, right: 15, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e7eaf0"/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#5c687b', fontSize: 11 }}/><YAxis tickFormatter={compact} axisLine={false} tickLine={false} tick={{ fill: '#5c687b', fontSize: 11 }}/><Tooltip formatter={(v: any) => [`${compact(Number(v))} tCO₂e`, 'Emissions']}/><Area type="monotone" dataKey="emissions" stroke="#275ce8" fill="#edf2ff" strokeWidth={2} isAnimationActive={!reduced()}/></AreaChart>}</div>;
};
export const CashFlowChart = ({ data }: { data: { month: number; value: number }[] }) => {
  const { ref, size } = useSize();
  return <div ref={ref} className="chart-wrap cash-chart" data-testid="cashflow-chart" role="img" aria-label={`36-month cash flow. Initial outlay ${money(data[0].value)}. Month 36 net cash ${money(data[36].value)}.`}>{size && <LineChart width={size.w} height={size.h} data={data} margin={{ top: 12, right: 22, left: 18, bottom: 10 }}><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e7eaf0"/><XAxis dataKey="month" type="number" domain={[0, 36]} ticks={[0, 6, 12, 18, 24, 30, 36]} tickFormatter={n => `M${n}`} axisLine={false} tickLine={false} tick={{ fill: '#5c687b', fontSize: 11 }}/><YAxis tickFormatter={money} axisLine={false} tickLine={false} tick={{ fill: '#5c687b', fontSize: 11 }}/><Tooltip labelFormatter={n => `Month ${n}`} formatter={(v: any) => [money(Number(v)), 'Cumulative net cash']}/><ReferenceLine y={0} stroke="#8e98a8" strokeDasharray="4 4"/><Line type="linear" dataKey="value" stroke="#275ce8" strokeWidth={2.5} dot={false} isAnimationActive={!reduced()}/></LineChart>}</div>;
};
export const ReductionChart = ({ data }: { data: { name: string; reduction: number }[] }) => {
  const { ref, size } = useSize();
  return <div ref={ref} className="chart-wrap" data-testid="ledger-reduction-chart" role="img" aria-label={data.map(d => `${d.name}: ${compact(d.reduction)} estimated tCO2e per year`).join('; ')}>{size && <BarChart width={size.w} height={size.h} data={data} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 4" vertical={false}/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#5c687b', fontSize: 11 }}/><YAxis tickFormatter={compact} axisLine={false} tickLine={false} tick={{ fill: '#5c687b', fontSize: 11 }}/><Tooltip formatter={(v: any) => [`${compact(Number(v))} tCO₂e/yr`, 'Estimated reduction']}/><Bar dataKey="reduction" fill="#3264e8" radius={[3, 3, 0, 0]} maxBarSize={44} isAnimationActive={!reduced()}/></BarChart>}</div>;
};
