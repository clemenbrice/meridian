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
  if (campaigns.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">No campaign data available.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {['Campaign', 'Network', 'Spend', 'Revenue', 'ROAS', 'Orders', 'NTB Rate'].map(h => (
              <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide py-3 pr-4 first:pl-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {campaigns.map((c, i) => (
            <tr key={i} className="hover:bg-gray-50 transition-colors">
              <td className="py-3 pr-4 font-medium text-gray-800 max-w-[200px] truncate" title={c.campaign_name}>
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
              <td className="py-3 pr-4 tabular-nums text-gray-700">{fmt$(c.spend)}</td>
              <td className="py-3 pr-4 tabular-nums text-gray-700">{fmt$(c.revenue)}</td>
              <td className="py-3 pr-4 tabular-nums font-semibold text-indigo-600">{c.roas.toFixed(2)}x</td>
              <td className="py-3 pr-4 tabular-nums text-gray-700">{c.orders.toLocaleString()}</td>
              <td className="py-3 pr-4 tabular-nums text-gray-700">{(c.ntbRate * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
