import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, TrendingUp, CheckCircle2, MessageSquare, UserPlus, Activity, RefreshCw } from 'lucide-react';
import { getLinkedInAnalytics } from '../../lib/linkedinService';
import { LinkedInActionQueueItem } from '../../types/linkedin';

interface AnalyticsData {
  totalCampaigns: number;
  activeCampaigns: number;
  totalActionsCompleted: number;
  totalConnectionsSent: number;
  totalMessagesSent: number;
  totalReplies: number;
  recentQueue: LinkedInActionQueueItem[];
}

const ACTION_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-slate-100 text-slate-400',
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  view_profile: '👁️ Profile View',
  send_connection: '🤝 Connection',
  send_message: '💬 Message',
};

export const LinkedInAnalyticsView: React.FC = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getLinkedInAnalytics();
      setAnalytics(data);
    } catch (e) {
      console.error('Failed to load analytics', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading analytics...</span>
      </div>
    );
  }

  if (!analytics) return null;

  const stats = [
    {
      label: 'Active Campaigns',
      value: analytics.activeCampaigns,
      total: analytics.totalCampaigns,
      icon: <Activity className="w-4 h-4" />,
      color: 'text-blue-600',
      bg: 'bg-blue-50 border-blue-100',
    },
    {
      label: 'Actions Completed',
      value: analytics.totalActionsCompleted,
      icon: <CheckCircle2 className="w-4 h-4" />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 border-emerald-100',
    },
    {
      label: 'Connections Sent',
      value: analytics.totalConnectionsSent,
      icon: <UserPlus className="w-4 h-4" />,
      color: 'text-purple-600',
      bg: 'bg-purple-50 border-purple-100',
    },
    {
      label: 'Replies Received',
      value: analytics.totalReplies,
      icon: <MessageSquare className="w-4 h-4" />,
      color: 'text-amber-600',
      bg: 'bg-amber-50 border-amber-100',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className={`rounded-xl border p-4 ${stat.bg}`}>
            <div className={`flex items-center gap-2 mb-2 ${stat.color}`}>
              {stat.icon}
              <span className="text-xs font-semibold text-slate-600">{stat.label}</span>
            </div>
            <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
            {stat.total !== undefined && (
              <div className="text-xs text-slate-500 mt-0.5">of {stat.total} total</div>
            )}
          </div>
        ))}
      </div>

      {/* Recent Activity Feed */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Recent Activity</h2>
          <button onClick={load} className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {analytics.recentQueue.length === 0 ? (
          <div className="rounded-xl border border-slate-200 p-8 text-center text-slate-400">
            <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No activity yet. Launch a campaign to get started.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Action</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Scheduled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {analytics.recentQueue.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-medium text-slate-800">
                        {(item as any).contact?.name || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">
                      {ACTION_TYPE_LABELS[item.action_type] || item.action_type}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ACTION_STATUS_COLORS[item.status] || 'bg-slate-100 text-slate-600'}`}>
                        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">
                      {new Date(item.scheduled_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
