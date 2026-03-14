'use client';

import { useEffect, useState, useCallback } from 'react';
import { Download, Filter } from 'lucide-react';
import { NetworkAggregate, DailyAggregate, CampaignAggregate, KPIs } from '@/lib/calculations';

type Range = '7d' | '30d' | '90d' | 'custom';
type MetricKey = 'ad_spend' | 'impressions' | 'clicks' | 'attributed_revenue' | 'attributed_orders' | 'new_to_brand_orders' | 'roas' | 'ntb_rate';

interface MetricsResponse {
  dateRange: { start: string; end: string };
  kpis: KPIs;
  byNetwork: NetworkAggregate[];
  byDay: DailyAggregate[];
  topCampaigns: CampaignAggregate[];
  availableNetworks: string[];
}

const ALL_METRICS: { key: MetricKey; label: string }[] = [
  { key: 'ad_spend', label: 'Spend' },
  { key: 'attributed_revenue', label: 'Revenue' },
  { key: 'roas', label: 'ROAS' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'attributed_orders', label: 'Orders' },
  { key: 'new_to_brand_orders', label: 'NTB Orders' },
  { key: 'ntb_rate', label: 'NTB Rate' },
];

const ROWS_PER_PAGE = 15;

const fmt$ = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

function fmtMetric(key: MetricKey, row: CampaignAggregate): string {
  switch (key) {
    case 'ad_spend': return fmt$(row.spend);
    case 'attributed_revenue': return fmt$(row.revenue);
    case 'roas': return `${row.roas.toFixed(2)}x`;
    case 'impressions': return row.impressions.toLocaleString();
    case 'clicks': return row.clicks.toLocaleString();
    case 'attributed_orders': return row.orders.toLocaleString();
    case 'new_to_brand_orders': return row.ntbOrders.toLocaleString();
    case 'ntb_rate': return `${(row.ntbRate * 100).toFixed(1)}%`;
    default: return '';
  }
}

export default function ReportsPage() {
  const [range, setRange] = useState<Range>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(['ad_spend', 'attributed_revenue', 'roas', 'attributed_orders', 'ntb_rate']);
  const [selectedNetworks, setSelectedNetworks] = useState<string[]>([]);
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
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
      if (res.ok) {
        setData(json);
        setPage(1);
      }
    } finally {
      setLoading(false);
    }
  }, [range, customStart, customEnd, selectedNetworks]);

  useEffect(() => {
    if (range !== 'custom' || (customStart && customEnd)) load();
  }, [load, range, customStart, customEnd]);

  function toggleMetric(k: MetricKey) {
    setSelectedMetrics(prev =>
      prev.includes(k) ? prev.filter(m => m !== k) : [...prev, k]
    );
  }

  function toggleNetwork(n: string) {
    setSelectedNetworks(prev =>
      prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]
    );
  }

  function exportCSV() {
    if (!data) return;
    const headers = ['Campaign', 'Network', ...selectedMetrics.map(k => ALL_METRICS.find(m => m.key === k)?.label ?? k)];
    const rows = data.topCampaigns.map(c => [
      c.campaign_name,
      c.network,
      ...selectedMetrics.map(k => fmtMetric(k, c)),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meridian-report-${data.dateRange.start}-${data.dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const campaigns = data?.topCampaigns ?? [];
  const totalPages = Math.ceil(campaigns.length / ROWS_PER_PAGE);
  const paged = campaigns.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Report Builder</h1>
          <p className="text-sm text-gray-500 mt-1">Select date range, networks, and metrics to build your report.</p>
        </div>
        <button
          onClick={exportCSV}
          disabled={!data || campaigns.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">Filters</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Date range */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Date Range</label>
            <div className="space-y-1">
              {[
                { label: 'Last 7 days', value: '7d' },
                { label: 'Last 30 days', value: '30d' },
                { label: 'Last 90 days', value: '90d' },
                { label: 'Custom', value: 'custom' },
              ].map(r => (
                <label key={r.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="range"
                    value={r.value}
                    checked={range === r.value}
                    onChange={() => setRange(r.value as Range)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-gray-700">{r.label}</span>
                </label>
              ))}
              {range === 'custom' && (
                <div className="mt-2 space-y-1.5">
                  <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5" />
                  <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5" />
                </div>
              )}
            </div>
          </div>

          {/* Networks */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Networks</label>
            <div className="space-y-1">
              {(data?.availableNetworks ?? ['amazon', 'walmart', 'criteo']).map(n => (
                <label key={n} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedNetworks.includes(n)}
                    onChange={() => toggleNetwork(n)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-gray-700 capitalize">{n}</span>
                </label>
              ))}
              {selectedNetworks.length > 0 && (
                <button onClick={() => setSelectedNetworks([])} className="text-xs text-indigo-500 hover:underline mt-1">Clear</button>
              )}
            </div>
          </div>

          {/* Metrics */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Metrics</label>
            <div className="space-y-1">
              {ALL_METRICS.map(m => (
                <label key={m.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(m.key)}
                    onChange={() => toggleMetric(m.key)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-gray-700">{m.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={load}
          className="mt-5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          Apply Filters
        </button>
      </div>

      {/* Report table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400 animate-pulse">Loading report…</div>
        ) : campaigns.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No data for the selected filters. Upload some CSV files first.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Campaign</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Network</th>
                    {selectedMetrics.map(k => (
                      <th key={k} className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">
                        {ALL_METRICS.find(m => m.key === k)?.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((c, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-800 max-w-[220px] truncate" title={c.campaign_name}>
                        {c.campaign_name}
                      </td>
                      <td className="px-5 py-3 capitalize text-gray-600">{c.network}</td>
                      {selectedMetrics.map(k => (
                        <td key={k} className="px-5 py-3 text-right tabular-nums text-gray-700">
                          {fmtMetric(k, c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Showing {((page - 1) * ROWS_PER_PAGE) + 1}–{Math.min(page * ROWS_PER_PAGE, campaigns.length)} of {campaigns.length}
                </p>
                <div className="flex gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-7 h-7 text-xs rounded-md font-medium ${
                        p === page ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Summary stats */}
      {data && !loading && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Spend', value: fmt$(data.kpis.totalSpend) },
            { label: 'Total Revenue', value: fmt$(data.kpis.totalRevenue) },
            { label: 'Blended ROAS', value: `${data.kpis.blendedROAS.toFixed(2)}x` },
            { label: 'Total Orders', value: data.kpis.totalOrders.toLocaleString() },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
