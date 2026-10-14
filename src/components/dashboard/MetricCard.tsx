import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  icon: React.ReactNode;
  iconBg: string; // Tailwind bg class e.g. 'bg-indigo-100'
  iconColor: string; // Tailwind text class e.g. 'text-indigo-600'
  label: string;
  value: number | string;
  subValue?: string; // secondary stat e.g. "this week: 12"
  trend?: number; // positive = up, negative = down, 0 = flat
  trendLabel?: string; // e.g. "vs yesterday"
  emptyMessage?: string; // shown when value === 0
  isLoading?: boolean;
  suffix?: string; // e.g. "%"
}

export const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  subValue,
  trend,
  trendLabel,
  emptyMessage,
  isLoading,
  suffix = '',
}) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-pulse">
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100" />
          <div className="w-16 h-4 rounded bg-slate-100" />
        </div>
        <div className="w-20 h-9 rounded-lg bg-slate-100 mb-2" />
        <div className="w-28 h-3.5 rounded bg-slate-100 mb-1" />
        <div className="w-20 h-3 rounded bg-slate-100" />
      </div>
    );
  }

  const numericValue = typeof value === 'number' ? value : parseFloat(String(value));
  const isEmpty = numericValue === 0 && emptyMessage;

  const trendColor =
    trend === undefined || trend === 0
      ? 'text-slate-400'
      : trend > 0
      ? 'text-emerald-600'
      : 'text-red-500';

  const trendBg =
    trend === undefined || trend === 0
      ? 'bg-slate-50'
      : trend > 0
      ? 'bg-emerald-50'
      : 'bg-red-50';

  const TrendIcon =
    trend === undefined || trend === 0 ? Minus : trend > 0 ? TrendingUp : TrendingDown;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 transition-shadow duration-200 group">
      {/* Icon + trend row */}
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center ${iconColor} flex-shrink-0`}>
          {icon}
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${trendBg} ${trendColor} text-[11px] font-semibold`}>
            <TrendIcon className="w-3 h-3" />
            <span>
              {trend === 0 ? 'Flat' : `${trend > 0 ? '+' : ''}${trend}%`}
            </span>
          </div>
        )}
      </div>

      {/* Big number */}
      {isEmpty ? (
        <div className="mb-1">
          <p className="text-2xl font-bold text-slate-300">—</p>
          <p className="text-xs text-slate-400 mt-1 leading-snug">{emptyMessage}</p>
        </div>
      ) : (
        <div className="mb-1">
          <p className="text-3xl font-semibold text-slate-900 tracking-tight leading-none">
            {typeof value === 'number' ? value.toLocaleString() : value}
            {suffix && <span className="text-xl font-bold text-slate-500">{suffix}</span>}
          </p>
        </div>
      )}

      {/* Label */}
      <p className="text-xs font-medium text-slate-500 mt-2">{label}</p>

      {/* Sub-value */}
      {subValue && (
        <p className="text-[11px] text-slate-400 mt-1">{subValue}</p>
      )}

      {/* Trend label */}
      {trendLabel && trend !== undefined && (
        <p className={`text-[11px] mt-1 font-medium ${trendColor}`}>{trendLabel}</p>
      )}
    </div>
  );
};
