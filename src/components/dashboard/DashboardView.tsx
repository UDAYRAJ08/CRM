import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Mail,
  UserPlus,
  MessageSquare,
  BarChart2,
  RefreshCw,
  TrendingUp,
  Percent,
} from 'lucide-react';
import { db } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { DashboardStats } from '../../types/crm';
import { MetricCard } from './MetricCard';
import { ActivityChart } from './ActivityChart';
import { RecentActivityFeed } from './RecentActivityFeed';
import { DayEmailsModal } from './DayEmailsModal';

const AUTO_REFRESH_INTERVAL_MS = 180_000; // 3 minutes

function relativeSeconds(iso: string): string {
  const diffS = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffS < 5) return 'just now';
  if (diffS < 60) return `${diffS}s ago`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  return `${Math.floor(diffM / 60)}h ago`;
}

export const DashboardView: React.FC = () => {
  const { error: toastError } = useToast();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedISO, setLastUpdatedISO] = useState<string>('');
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch stats ────────────────────────────────────────────────────────────
  const fetchStats = useCallback(
    async (silent = false) => {
      if (!silent) setIsRefreshing(true);
      try {
        const data = await db.getDashboardStats();
        setStats(data);
        const now = new Date().toISOString();
        setLastUpdatedISO(now);
        setLastUpdatedLabel(relativeSeconds(now));
      } catch (err: any) {
        console.error('Dashboard fetch error', err);
        toastError('Dashboard error', 'Failed to load dashboard data. Please try again.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [toastError]
  );

  // Initial load
  useEffect(() => {
    fetchStats(true);
  }, [fetchStats]);

  // Auto-refresh: every 3m, only when tab is active and visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchStats(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    intervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchStats(true);
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchStats]);

  // Tick the "last updated X ago" label every 15s
  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (lastUpdatedISO) setLastUpdatedLabel(relativeSeconds(lastUpdatedISO));
    }, 15_000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [lastUpdatedISO]);

  // ── Weekly trend for "Activity This Week" ─────────────────────────────────
  const weeklyTrend = stats
    ? stats.emailsLastWeek === 0
      ? stats.emailsThisWeek > 0
        ? 100
        : 0
      : Math.round(
          ((stats.emailsThisWeek - stats.emailsLastWeek) / stats.emailsLastWeek) * 100
        )
    : 0;

  // ── Reply rate sub-label ───────────────────────────────────────────────────
  const replyRateWeekLabel = stats
    ? `This week: ${stats.replyRateThisWeek}% · (${stats.repliesReceivedThisWeek} / ${stats.emailsThisWeek})`
    : '';

  return (
    <div className="space-y-8">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Organisation-wide snapshot · auto-refreshes every 60s
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdatedISO && (
            <span className="text-[11px] text-slate-400 hidden sm:block">
              Updated {lastUpdatedLabel}
            </span>
          )}
          <button
            onClick={() => fetchStats(false)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-500' : ''}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* ── TODAY'S SNAPSHOT ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-0.5">
          Today's Snapshot
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard
            icon={<Mail className="w-5 h-5" />}
            iconBg="bg-slate-100"
            iconColor="text-slate-500"
            label="Emails Sent Today"
            value={stats?.emailsSentToday ?? 0}
            subValue={
              stats
                ? stats.emailsSentToday === 0
                  ? undefined
                  : `${stats.emailsThisWeek} sent this week`
                : undefined
            }
            emptyMessage="No emails sent yet today"
            isLoading={isLoading}
          />

          <MetricCard
            icon={<UserPlus className="w-5 h-5" />}
            iconBg="bg-slate-100"
            iconColor="text-slate-500"
            label="Contacts Added Today"
            value={stats?.contactsAddedToday ?? 0}
            emptyMessage="No new contacts added today"
            isLoading={isLoading}
          />

          <MetricCard
            icon={<BarChart2 className="w-5 h-5" />}
            iconBg="bg-slate-100"
            iconColor="text-slate-500"
            label="Activity This Week"
            value={stats?.emailsThisWeek ?? 0}
            trend={weeklyTrend}
            trendLabel={
              weeklyTrend === 0
                ? 'Same as last week'
                : weeklyTrend > 0
                ? `+${weeklyTrend}% vs last week`
                : `${weeklyTrend}% vs last week`
            }
            emptyMessage="No emails sent this week"
            isLoading={isLoading}
          />

          <MetricCard
            icon={<MessageSquare className="w-5 h-5" />}
            iconBg="bg-slate-100"
            iconColor="text-slate-500"
            label="Replies Received Today"
            value={stats?.repliesReceivedToday ?? 0}
            subValue={
              stats
                ? `This week: ${stats.repliesReceivedThisWeek}`
                : undefined
            }
            emptyMessage="No replies received today"
            isLoading={isLoading}
          />
        </div>
      </section>

      {/* ── THIS WEEK ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-0.5">
          This Week
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard
            icon={<TrendingUp className="w-5 h-5" />}
            iconBg="bg-slate-100"
            iconColor="text-slate-500"
            label="Emails Sent This Week"
            value={stats?.emailsThisWeek ?? 0}
            trend={weeklyTrend}
            emptyMessage="No emails sent this week"
            isLoading={isLoading}
          />

          <MetricCard
            icon={<Percent className="w-5 h-5" />}
            iconBg="bg-slate-100"
            iconColor="text-slate-500"
            label="Reply Rate Today"
            value={stats?.replyRateToday ?? 0}
            suffix="%"
            subValue={
              stats
                ? stats.emailsSentToday === 0
                  ? 'No emails sent yet today'
                  : `${stats.repliesReceivedToday} replies / ${stats.emailsSentToday} sent`
                : undefined
            }
            emptyMessage="Send emails to track reply rate"
            isLoading={isLoading}
          />

          <MetricCard
            icon={<Percent className="w-5 h-5" />}
            iconBg="bg-slate-100"
            iconColor="text-slate-500"
            label="Reply Rate This Week"
            value={stats?.replyRateThisWeek ?? 0}
            suffix="%"
            subValue={replyRateWeekLabel || undefined}
            emptyMessage="Send emails to track reply rate"
            isLoading={isLoading}
          />

          <MetricCard
            icon={<MessageSquare className="w-5 h-5" />}
            iconBg="bg-slate-100"
            iconColor="text-slate-500"
            label="Replies This Week"
            value={stats?.repliesReceivedThisWeek ?? 0}
            emptyMessage="No replies received this week"
            isLoading={isLoading}
          />
        </div>
      </section>

      {/* ── CHART + ACTIVITY (side-by-side on large screens) ─────────────── */}
      <section>
        <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-0.5">
          Trends &amp; Recent Activity
        </h2>
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          {/* Chart — wider */}
          <div className="xl:col-span-3">
            <ActivityChart
              data={stats?.dailyBreakdown ?? []}
              isLoading={isLoading}
              onBarClick={(date) => setSelectedDay(date)}
            />
          </div>

          {/* Activity feed — narrower */}
          <div className="xl:col-span-2">
            <RecentActivityFeed
              items={stats?.recentActivity ?? []}
              isLoading={isLoading}
            />
          </div>
        </div>
      </section>

      {/* Drill-down modal: emails sent on a clicked day */}
      <DayEmailsModal
        isOpen={Boolean(selectedDay)}
        onClose={() => setSelectedDay(null)}
        date={selectedDay}
      />
    </div>
  );
};
