import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  change: number | null; // decimal e.g. 0.12 = +12%
  subtitle?: string;
  invertChange?: boolean; // for metrics where lower is better (e.g. CPC)
}

export default function KPICard({ title, value, change, subtitle, invertChange }: KPICardProps) {
  const hasChange = change !== null && !isNaN(change);
  const rawPositive = hasChange && change! > 0;
  const rawNegative = hasChange && change! < 0;
  // When invertChange: up is bad (red), down is good (green)
  const isGood = invertChange ? rawNegative : rawPositive;
  const isBad = invertChange ? rawPositive : rawNegative;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
      {hasChange && (
        <div className={`mt-3 flex items-center gap-1 text-xs font-semibold ${
          isGood ? 'text-emerald-600' : isBad ? 'text-red-500' : 'text-gray-400'
        }`}>
          {rawPositive ? (
            <TrendingUp className="w-3.5 h-3.5" />
          ) : rawNegative ? (
            <TrendingDown className="w-3.5 h-3.5" />
          ) : (
            <Minus className="w-3.5 h-3.5" />
          )}
          <span>
            {rawPositive ? '+' : ''}{(change! * 100).toFixed(1)}% vs prior period
          </span>
        </div>
      )}
    </div>
  );
}
