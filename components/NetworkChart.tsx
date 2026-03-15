'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { NetworkAggregate, DailyAggregate } from '@/lib/calculations';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const fmt$ = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));

// ── ROAS by network (bar) ────────────────────────────────────────────────────
export function ROASByNetworkChart({ data }: { data: NetworkAggregate[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="network" tick={{ fontSize: 12 }} tickFormatter={v => v.charAt(0).toUpperCase() + v.slice(1)} />
        <YAxis tickFormatter={v => `${v.toFixed(1)}x`} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(v) => [`${Number(v).toFixed(2)}x`, 'ROAS']}
          labelStyle={{ fontWeight: 600 }}
        />
        <Bar dataKey="roas" name="ROAS" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Spend vs Revenue trend with Orders on secondary axis ─────────────────────
export function SpendRevenueTrendChart({ data }: { data: DailyAggregate[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 45, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          tickFormatter={v => v.slice(5)} // MM-DD
          interval="preserveStartEnd"
        />
        <YAxis yAxisId="left" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
        <YAxis yAxisId="right" orientation="right" tickFormatter={v => Number(v).toLocaleString()} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v, name) =>
            name === 'Orders'
              ? [Number(v).toLocaleString(), name]
              : [fmt$(Number(v)), name]
          }
          labelStyle={{ fontWeight: 600 }}
        />
        <Legend />
        <Line
          yAxisId="left" type="monotone" dataKey="spend" name="Spend"
          stroke="#6366f1" strokeWidth={2} dot={false}
        />
        <Line
          yAxisId="left" type="monotone" dataKey="revenue" name="Revenue"
          stroke="#10b981" strokeWidth={2} dot={false}
        />
        <Line
          yAxisId="right" type="monotone" dataKey="orders" name="Orders"
          stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── NTB vs Repeat donut ──────────────────────────────────────────────────────
interface NTBData { totalOrders: number; totalNtbOrders: number }

export function NTBDonutChart({ data }: { data: NTBData }) {
  const repeatOrders = data.totalOrders - data.totalNtbOrders;
  const pieData = [
    { name: 'New-to-Brand', value: data.totalNtbOrders },
    { name: 'Repeat', value: repeatOrders },
  ];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={pieData}
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={100}
          paddingAngle={3}
          dataKey="value"
        >
          {pieData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => [Number(v).toLocaleString(), '']} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
