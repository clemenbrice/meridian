'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronRight, X, Presentation, Loader2 } from 'lucide-react';
import KPICard from '@/components/KPICard';
import { ROASByNetworkChart, SpendRevenueTrendChart, NTBDonutChart } from '@/components/NetworkChart';
import CampaignTable from '@/components/CampaignTable';
import InsightCard from '@/components/InsightCard';
import { KPIs, NetworkAggregate, DailyAggregate, CampaignAggregate, FunnelData } from '@/lib/calculations';

type Range = '7d' | '30d' | '90d' | 'custom';

interface MetricsResponse {
  dateRange: { start: string; end: string; priorStart: string; priorEnd: string };
  kpis: KPIs;
  kpiChanges: {
    spendChange: number | null;
    revenueChange: number | null;
    roasChange: number | null;
    ordersChange: number | null;
    ntbRateChange: number | null;
    ctrChange: number | null;
    cpcChange: number | null;
    impressionsChange: number | null;
  };
  byNetwork: NetworkAggregate[];
  byDay: DailyAggregate[];
  topCampaigns: CampaignAggregate[];
  funnelData: FunnelData | null;
  availableNetworks: string[];
}

const NETWORK_COLORS: Record<string, string> = {
  amazon: '#f97316',
  walmart: '#3b82f6',
  criteo: '#10b981',
};

const NETWORK_BG: Record<string, string> = {
  amazon: 'bg-orange-100 text-orange-700',
  walmart: 'bg-blue-100 text-blue-700',
  criteo: 'bg-green-100 text-green-700',
};

const fmt$ = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

const fmtCPC = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function fmtImpressions(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const RANGES: { label: string; value: Range }[] = [
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
  { label: 'Custom', value: 'custom' },
];

function fmtPct(n: number, decimals = 2) {
  return `${(n * 100).toFixed(decimals)}%`;
}

function FunnelStep({
  label, value, dropPct,
}: { label: string; value: number; dropPct?: number | null }) {
  return (
    <div className="flex flex-col items-center text-center flex-1 min-w-0">
      <div className="text-xl font-bold text-gray-900 tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</div>
      {dropPct != null && (
        <div className="text-xs font-medium text-orange-600 mt-0.5">
          {dropPct.toFixed(1)}% CVR
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [range, setRange] = useState<Range>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedNetworks, setSelectedNetworks] = useState<string[]>([]);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/metrics?range=${range}`;
      if (range === 'custom' && customStart && customEnd) {
        url += `&start=${customStart}&end=${customEnd}`;
      }
      if (selectedNetworks.length > 0) {
        url += `&networks=${selectedNetworks.join(',')}`;
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
  }, [range, customStart, customEnd, selectedNetworks]);

  useEffect(() => {
    if (range !== 'custom' || (customStart && customEnd)) {
      load();
    }
  }, [load, range, customStart, customEnd]);

  function toggleNetwork(n: string) {
    setSelectedNetworks(prev =>
      prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]
    );
  }

  async function exportPPTX() {
    setExporting(true);
    try {
      let url = `/api/export/pptx?range=${range}`;
      if (range === 'custom' && customStart && customEnd) {
        url += `&start=${customStart}&end=${customEnd}`;
      }
      if (selectedNetworks.length > 0) {
        url += `&networks=${selectedNetworks.join(',')}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to generate');
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `meridian-report.pptx`;
      a.click();
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  // Network spend breakdown helpers
  const totalSpendAllNetworks = data?.byNetwork.reduce((s, n) => s + n.spend, 0) ?? 0;

  const KNOWN_NETWORKS = ['amazon', 'walmart', 'criteo'];

  return (
    <div>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {data && (
            <p className="text-sm text-gray-400 mt-0.5">
              {data.dateRange.start} — {data.dateRange.end}
            </p>
          )}
          <button
            onClick={exportPPTX}
            disabled={!data || loading || exporting}
            className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {exporting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Presentation className="w-3.5 h-3.5" />}
            {exporting ? 'Generating…' : 'Export PPT'}
          </button>
        </div>

        {/* Date range picker */}
        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-2 flex-wrap justify-end">
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
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-2">
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
            </div>
          )}
        </div>
      </div>

      {/* Filter bar — always visible */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-6 flex flex-wrap items-center gap-4 shadow-sm">
        {/* Channel filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Channel</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedNetworks([])}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                selectedNetworks.length === 0
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {KNOWN_NETWORKS.map(n => (
              <button
                key={n}
                onClick={() => toggleNetwork(n)}
                className={`px-3 py-1 text-xs font-medium rounded-full capitalize transition-colors ${
                  selectedNetworks.includes(n)
                    ? (NETWORK_BG[n] ?? 'bg-indigo-100 text-indigo-700')
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-5 bg-gray-200 hidden sm:block" />

        {/* Campaign search */}
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">Campaign</span>
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search campaigns…"
              value={campaignSearch}
              onChange={e => setCampaignSearch(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 pr-7 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
            {campaignSearch && (
              <button
                onClick={() => setCampaignSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {loading && !data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
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
          {/* KPI cards — 8 cards in 2/4 responsive grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              title="Total Spend"
              value={fmt$(data.kpis.totalSpend)}
              change={data.kpiChanges.spendChange}
            />
            <KPICard
              title="Total Revenue"
              value={fmt$(data.kpis.totalRevenue)}
              change={data.kpiChanges.revenueChange}
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
              title="NTB Rate"
              value={fmtPct(data.kpis.ntbRate, 1)}
              change={data.kpiChanges.ntbRateChange}
              subtitle={`${data.kpis.totalNtbOrders.toLocaleString()} NTB orders`}
            />
            <KPICard
              title="Blended CTR"
              value={fmtPct(data.kpis.ctr, 2)}
              change={data.kpiChanges.ctrChange}
            />
            <KPICard
              title="Blended CPC"
              value={data.kpis.cpc !== null ? fmtCPC(data.kpis.cpc) : '—'}
              change={data.kpiChanges.cpcChange}
              invertChange
            />
            <KPICard
              title="Total Impressions"
              value={fmtImpressions(data.kpis.totalImpressions)}
              change={data.kpiChanges.impressionsChange}
            />
          </div>

          {/* AI Insight */}
          <InsightCard dateRange={{ start: data.dateRange.start, end: data.dateRange.end }} />

          {/* Network spend breakdown */}
          {data.byNetwork.length > 0 && totalSpendAllNetworks > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Spend by Network</h3>
              {/* Stacked bar */}
              <div className="flex h-4 rounded-full overflow-hidden mb-4">
                {data.byNetwork.map(n => (
                  <div
                    key={n.network}
                    style={{
                      width: `${(n.spend / totalSpendAllNetworks) * 100}%`,
                      backgroundColor: NETWORK_COLORS[n.network] ?? '#6366f1',
                    }}
                    title={`${n.network}: ${((n.spend / totalSpendAllNetworks) * 100).toFixed(1)}%`}
                  />
                ))}
              </div>
              {/* Mini stat blocks */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {data.byNetwork.map(n => (
                  <div key={n.network} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: NETWORK_COLORS[n.network] ?? '#6366f1' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold capitalize px-1.5 py-0.5 rounded-full ${NETWORK_BG[n.network] ?? 'bg-gray-100 text-gray-600'}`}>
                          {n.network}
                        </span>
                        <span className="text-xs text-gray-400">
                          {((n.spend / totalSpendAllNetworks) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-sm font-bold text-gray-900 tabular-nums">{fmt$(n.spend)}</span>
                        <span className="text-xs text-indigo-600 font-medium tabular-nums">{n.roas.toFixed(2)}x ROAS</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* Amazon Purchase Funnel */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <h3 className="text-sm font-semibold text-gray-800">Amazon Purchase Funnel</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">14d attribution</span>
            </div>
            {data.funnelData ? (
              <div className="flex items-center gap-1">
                {(() => {
                  const f = data.funnelData!;
                  const stages = [
                    { label: 'Impressions', value: f.impressions },
                    { label: 'Detail Page Views', value: f.detailPageViews },
                    { label: 'Add to Cart', value: f.addToCart },
                    { label: 'Orders', value: f.orders },
                  ];
                  return stages.map((stage, i) => (
                    <div key={stage.label} className="flex items-center flex-1 min-w-0">
                      <FunnelStep
                        label={stage.label}
                        value={stage.value}
                        dropPct={i > 0 && stages[i - 1].value > 0
                          ? (stage.value / stages[i - 1].value) * 100
                          : null}
                      />
                      {i < stages.length - 1 && (
                        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mx-1" />
                      )}
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-gray-400">Upload Amazon DSP data to see purchase funnel</p>
                <p className="text-xs text-gray-300 mt-1">Requires Detail Page Views column in your Amazon CSV</p>
              </div>
            )}
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
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Campaigns by ROAS</h3>
              <CampaignTable campaigns={data.topCampaigns} externalSearch={campaignSearch} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
