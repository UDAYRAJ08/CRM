import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { DashboardDayBreakdown } from '../../types/crm';

interface ActivityChartProps {
  data: DashboardDayBreakdown[];
  isLoading?: boolean;
  onBarClick?: (date: string) => void; // called with 'YYYY-MM-DD' when a bar is clicked
}

// Short weekday labels: Mon, Tue, Wed…
function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
  if (isToday) return 'Today';
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-xs">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 mb-1">
          <span
            className="w-2.5 h-2.5 rounded-sm inline-block"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-slate-500">{entry.name}:</span>
          <span className="font-bold text-slate-800">{entry.value}</span>
        </div>
      ))}
      {total > 0 && (
        <p className="text-[11px] text-indigo-500 font-medium mt-2 pt-2 border-t border-slate-100">
          Click to see who was emailed →
        </p>
      )}
    </div>
  );
};

// Custom bar shape that shows a pointer cursor
const ClickableBar = (props: any) => {
  const { x, y, width, height, fill, onClick, radius } = props;
  if (!height || height <= 0) return null;
  const r = typeof radius === 'number'
    ? radius
    : Array.isArray(radius)
    ? (Number(radius[0]) || 4)
    : 4;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={fill}
      rx={r}
      ry={r}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    />
  );
};

export const ActivityChart: React.FC<ActivityChartProps> = ({ data, isLoading, onBarClick }) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="w-40 h-4 rounded bg-slate-100 animate-pulse mb-1" />
        <div className="w-56 h-3 rounded bg-slate-100 animate-pulse mb-6" />
        <div className="flex items-end gap-3 h-44 px-2">
          {[60, 80, 45, 90, 55, 70, 85].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col gap-1 items-center">
              <div
                className="w-full rounded-t bg-slate-100 animate-pulse"
                style={{ height: `${h}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatDateLabel(d.date),
  }));

  const totalSent = data.reduce((s, d) => s + d.sent, 0);
  const totalReplies = data.reduce((s, d) => s + d.replies, 0);

  const handleClick = (barData: any) => {
    if (!onBarClick || !barData?.activePayload?.length) return;
    const clickedEntry = barData.activePayload[0]?.payload;
    if (clickedEntry?.date) onBarClick(clickedEntry.date);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Email Activity — Last 7 Days</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {totalSent} sent · {totalReplies} replies
            {onBarClick && totalSent > 0 && (
              <span className="ml-2 text-indigo-400 font-medium">· Click a bar to see recipients</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-semibold">
          <span className="flex items-center gap-1.5 text-indigo-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />
            Sent
          </span>
          <span className="flex items-center gap-1.5 text-emerald-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
            Replies
          </span>
        </div>
      </div>

      {totalSent === 0 && totalReplies === 0 ? (
        <div className="flex flex-col items-center justify-center h-44 text-slate-300 gap-2">
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm font-medium text-slate-400">No email activity in the last 7 days</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: 320 }}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={chartData}
                barGap={3}
                barCategoryGap="30%"
                onClick={handleClick}
                style={{ cursor: onBarClick ? 'pointer' : 'default' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#eef2ff', radius: 4 }} />
                <Bar
                  dataKey="sent"
                  name="Sent"
                  fill="#6366f1"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                  shape={<ClickableBar radius={[4, 4, 0, 0]} />}
                />
                <Bar
                  dataKey="replies"
                  name="Replies"
                  fill="#34d399"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                  shape={<ClickableBar radius={[4, 4, 0, 0]} />}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
