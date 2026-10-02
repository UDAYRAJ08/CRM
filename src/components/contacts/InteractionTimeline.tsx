import React from 'react';
import { Interaction } from '../../types/crm';
import { PhoneCall, FileText, Users, Mail, Clock, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { stripHtml } from '../../lib/utils';

interface InteractionTimelineProps {
  interactions: Interaction[];
}

export const InteractionTimeline: React.FC<InteractionTimelineProps> = ({ interactions }) => {
  if (interactions.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-slate-200/60">
        <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-xs font-semibold text-slate-600">No activity logged yet</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Use the logger above or send an email to build up interaction history.
        </p>
      </div>
    );
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'call':
        return <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />;
      case 'meeting':
        return <Users className="w-3.5 h-3.5 text-purple-600" />;
      case 'email':
        return <Mail className="w-3.5 h-3.5 text-indigo-600" />;
      case 'linkedin':
        return <span className="font-bold text-[10px] text-[#0077b5]">in</span>;
      case 'note':
      default:
        return <FileText className="w-3.5 h-3.5 text-amber-600" />;
    }
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'call':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'meeting':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'email':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'linkedin':
        return 'bg-blue-50 text-[#0077b5] border-blue-200';
      case 'note':
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  };

  return (
    <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
      {interactions.map((item) => {
        const timeAgo = item.created_at
          ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true })
          : 'Just now';

        return (
          <div key={item.id} className="relative group">
            {/* Timeline node icon */}
            <div
              className={`absolute -left-6 top-1 w-5 h-5 rounded-full bg-white border-2 flex items-center justify-center shadow-xs transition-colors ${
                item.content.includes('📥 Inbound')
                  ? 'border-emerald-500'
                  : 'border-slate-300 group-hover:border-indigo-600'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  item.content.includes('📥 Inbound')
                    ? 'bg-emerald-600'
                    : 'bg-slate-500 group-hover:bg-indigo-600'
                }`}
              />
            </div>

            <div
              className={`p-3.5 rounded-xl border shadow-xs transition-all ${
                item.content.includes('📥 Inbound')
                  ? 'bg-emerald-50/40 border-emerald-200/90'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${
                      item.content.includes('📥 Inbound')
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : getBadgeColor(item.type)
                    }`}
                  >
                    {getIcon(item.type)}
                    {item.content.includes('📥 Inbound') ? 'Inbound Reply' : item.type}
                  </span>

                  <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-400" />
                    {item.content.includes('📥 Inbound')
                      ? 'Lead Contact'
                      : item.creator?.name || 'Team Member'}
                  </span>
                </div>

                <span className="text-[11px] text-slate-400 font-medium">
                  {timeAgo}
                </span>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                {stripHtml(item.content)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
