import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  change: number | null; // decimal e.g. 0.12 = +12%
  subtitle?: string;
}

export default function KPICard({ title, value, change, subtitle }: KPICardProps) {
  const hasChange = change !== null && !isNaN(change);
  const isPositive = hasChange && change > 0;
  const isNegative = hasChange && change < 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
      {hasChange && (
        <div className={`mt-3 flex items-center gap-1 text-xs font-semibold ${
          isPositive ? 'text-emerald-600' : isNegative ? 'text-red-500' : 'text-gray-400'
        }`}>
          {isPositive ? (
            <TrendingUp className="w-3.5 h-3.5" />
          ) : isNegative ? (
            <TrendingDown className="w-3.5 h-3.5" />
          ) : (
            <Minus className="w-3.5 h-3.5" />
          )}
          <span>
            {isPositive ? '+' : ''}{(change * 100).toFixed(1)}% vs prior period
          </span>
        </div>
      )}
    </div>
  );
}
