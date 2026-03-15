'use client';

import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, X } from 'lucide-react';
import { CampaignAggregate } from '@/lib/calculations';

interface Props { campaigns: CampaignAggregate[] }

const fmt$ = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

const NETWORK_BADGE: Record<string, string> = {
  amazon: 'bg-orange-100 text-orange-700',
  walmart: 'bg-blue-100 text-blue-700',
  criteo: 'bg-green-100 text-green-700',
};

export default function CampaignTable({ campaigns }: Props) {
  const [search, setSearch] = useState('');
  const [networkFilter, setNetworkFilter] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const networks = useMemo(
    () => Array.from(new Set(campaigns.map(c => c.network))).sort(),
    [campaigns]
  );

  const filtered = useMemo(() => {
    return campaigns
      .filter(c => {
        const matchSearch = !search || c.campaign_name.toLowerCase().includes(search.toLowerCase());
        const matchNetwork = !networkFilter || c.network === networkFilter;
        return matchSearch && matchNetwork;
      })
      .sort((a, b) => sortDir === 'desc' ? b.roas - a.roas : a.roas - b.roas);
  }, [campaigns, search, networkFilter, sortDir]);

  if (campaigns.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">No campaign data available.</p>;
  }

  return (
    <div>
      {/* Search + filter controls */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <input
            type="text"
            placeholder="Search campaigns…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 pr-7 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {networks.length > 1 && (
          <select
            value={networkFilter}
            onChange={e => setNetworkFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
          >
            <option value="">All Networks</option>
            {networks.map(n => (
              <option key={n} value={n} className="capitalize">{n.charAt(0).toUpperCase() + n.slice(1)}</option>
            ))}
          </select>
        )}
        {(search || networkFilter) && (
          <button
            onClick={() => { setSearch(''); setNetworkFilter(''); }}
            className="text-xs text-indigo-500 hover:underline"
          >
            Clear
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} campaigns</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Campaign', 'Network', 'Impressions', 'Spend', 'Revenue', '', 'Orders', 'NTB Rate'].map((h, i) =>
                h === '' ? (
                  <th
                    key="roas"
                    onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                    className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide py-3 pr-4 cursor-pointer select-none hover:text-gray-800 transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      ROAS
                      {sortDir === 'desc'
                        ? <ChevronDown className="w-3 h-3" />
                        : <ChevronUp className="w-3 h-3" />}
                    </span>
                  </th>
                ) : (
                  <th key={i} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide py-3 pr-4 first:pl-0">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-sm text-gray-400">No campaigns match your filters.</td>
              </tr>
            ) : (
              filtered.map((c, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 pr-4 font-medium text-gray-800 max-w-[180px] truncate" title={c.campaign_name}>
                    {c.campaign_name}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${NETWORK_BADGE[c.network] ?? 'bg-gray-100 text-gray-600'}`}>
                        {c.network}
                      </span>
                      {c.attributed_window && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium bg-gray-100 text-gray-500">
                          {c.attributed_window}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4 tabular-nums text-gray-700">{c.impressions.toLocaleString()}</td>
                  <td className="py-3 pr-4 tabular-nums text-gray-700">{fmt$(c.spend)}</td>
                  <td className="py-3 pr-4 tabular-nums text-gray-700">{fmt$(c.revenue)}</td>
                  <td className="py-3 pr-4 tabular-nums font-semibold text-indigo-600">{c.roas.toFixed(2)}x</td>
                  <td className="py-3 pr-4 tabular-nums text-gray-700">{c.orders.toLocaleString()}</td>
                  <td className="py-3 pr-4 tabular-nums text-gray-700">{(c.ntbRate * 100).toFixed(1)}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
