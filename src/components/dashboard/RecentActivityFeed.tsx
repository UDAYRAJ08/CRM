import React from 'react';
import { Mail, UserPlus, MessageSquare, Phone, CalendarCheck, FileText } from 'lucide-react';
import { DashboardActivityItem } from '../../types/crm';

interface RecentActivityFeedProps {
  items: DashboardActivityItem[];
  isLoading?: boolean;
}

function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  if (isNaN(then)) return '';
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
}

const typeConfig: Record<
  DashboardActivityItem['type'],
  { icon: React.ReactNode; bg: string; color: string; dot: string }
> = {
  email_sent: {
    icon: <Mail className="w-3.5 h-3.5" />,
    bg: 'bg-indigo-50',
    color: 'text-indigo-600',
    dot: 'bg-indigo-400',
  },
  reply_received: {
    icon: <MessageSquare className="w-3.5 h-3.5" />,
    bg: 'bg-emerald-50',
    color: 'text-emerald-600',
    dot: 'bg-emerald-400',
  },
  contact_added: {
    icon: <UserPlus className="w-3.5 h-3.5" />,
    bg: 'bg-amber-50',
    color: 'text-amber-600',
    dot: 'bg-amber-400',
  },
  interaction: {
    icon: <FileText className="w-3.5 h-3.5" />,
    bg: 'bg-slate-50',
    color: 'text-slate-500',
    dot: 'bg-slate-300',
  },
};

export const RecentActivityFeed: React.FC<RecentActivityFeedProps> = ({ items, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <div className="w-36 h-4 rounded bg-slate-100 animate-pulse mb-5" />
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex-shrink-0" />
              <div className="flex-1">
                <div className="w-3/4 h-3 rounded bg-slate-100 mb-1.5" />
                <div className="w-1/3 h-2.5 rounded bg-slate-100" />
              </div>
              <div className="w-10 h-3 rounded bg-slate-100 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900 mb-5">Recent Activity</h3>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-slate-300 gap-2">
          <CalendarCheck className="w-8 h-8" />
          <p className="text-sm font-medium text-slate-400">No activity in the last 7 days</p>
          <p className="text-xs text-slate-300">Send an email or add a contact to get started</p>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item, idx) => {
            const cfg = typeConfig[item.type];
            return (
              <div
                key={idx}
                className="flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                {/* Icon badge */}
                <div
                  className={`w-7 h-7 rounded-lg ${cfg.bg} ${cfg.color} flex items-center justify-center flex-shrink-0`}
                >
                  {cfg.icon}
                </div>

                {/* Label + member */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate leading-snug">
                    {item.label}
                  </p>
                  {item.memberName && (
                    <p className="text-[11px] text-slate-400 leading-snug">
                      by {item.memberName}
                    </p>
                  )}
                </div>

                {/* Relative timestamp */}
                <span className="text-[11px] text-slate-400 flex-shrink-0 group-hover:text-slate-500 transition-colors">
                  {relativeTime(item.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
