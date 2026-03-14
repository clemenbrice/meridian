'use client';

import { useEffect, useState, useCallback } from 'react';
import KPICard from '@/components/KPICard';
import { ROASByNetworkChart, SpendRevenueTrendChart, NTBDonutChart } from '@/components/NetworkChart';
import CampaignTable from '@/components/CampaignTable';
import InsightCard from '@/components/InsightCard';
import { KPIs, NetworkAggregate, DailyAggregate, CampaignAggregate } from '@/lib/calculations';

type Range = '7d' | '30d' | '90d' | 'custom';

interface MetricsResponse {
  dateRange: { start: string; end: string; priorStart: string; priorEnd: string };
  kpis: KPIs;
  kpiChanges: {
    spendChange: number | null;
    roasChange: number | null;
    ordersChange: number | null;
    ntbRateChange: number | null;
  };
  byNetwork: NetworkAggregate[];
  byDay: DailyAggregate[];
  topCampaigns: CampaignAggregate[];
  availableNetworks: string[];
}

const fmt$ = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

const RANGES: { label: string; value: Range }[] = [
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
  { label: 'Custom', value: 'custom' },
];

export default function DashboardPage() {
  const [range, setRange] = useState<Range>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/metrics?range=${range}`;
      if (range === 'custom' && customStart && customEnd) {
        url += `&start=${customStart}&end=${customEnd}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [range, customStart, customEnd]);

  useEffect(() => {
    if (range !== 'custom' || (customStart && customEnd)) {
      load();
    }
  }, [load, range, customStart, customEnd]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {data && (
            <p className="text-sm text-gray-400 mt-0.5">
              {data.dateRange.start} — {data.dateRange.end}
            </p>
          )}
        </div>

        {/* Range picker */}
        <div className="flex items-center gap-2 flex-wrap">
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                range === r.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300'
              }`}
            >
              {r.label}
            </button>
          ))}
          {range === 'custom' && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700"
              />
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {loading && !data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-72 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Total Spend"
              value={fmt$(data.kpis.totalSpend)}
              change={data.kpiChanges.spendChange}
            />
            <KPICard
              title="Blended ROAS"
              value={`${data.kpis.blendedROAS.toFixed(2)}x`}
              change={data.kpiChanges.roasChange}
            />
            <KPICard
              title="Total Orders"
              value={data.kpis.totalOrders.toLocaleString()}
              change={data.kpiChanges.ordersChange}
            />
            <KPICard
              title="New-to-Brand Rate"
              value={`${(data.kpis.ntbRate * 100).toFixed(1)}%`}
              change={data.kpiChanges.ntbRateChange}
              subtitle={`${data.kpis.totalNtbOrders.toLocaleString()} NTB orders`}
            />
          </div>

          {/* AI Insight */}
          <InsightCard dateRange={{ start: data.dateRange.start, end: data.dateRange.end }} />

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">ROAS by Network</h3>
              {data.byNetwork.length > 0 ? (
                <ROASByNetworkChart data={data.byNetwork} />
              ) : (
                <p className="text-sm text-gray-400 text-center py-12">No data</p>
              )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Spend vs Revenue Trend</h3>
              {data.byDay.length > 0 ? (
                <SpendRevenueTrendChart data={data.byDay} />
              ) : (
                <p className="text-sm text-gray-400 text-center py-12">No data</p>
              )}
            </div>
          </div>

          {/* NTB + Campaign table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">New-to-Brand vs Repeat</h3>
              {data.kpis.totalOrders > 0 ? (
                <NTBDonutChart data={data.kpis} />
              ) : (
                <p className="text-sm text-gray-400 text-center py-12">No data</p>
              )}
            </div>
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Top 10 Campaigns by ROAS</h3>
              <CampaignTable campaigns={data.topCampaigns} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
