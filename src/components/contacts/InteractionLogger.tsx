import React, { useState } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { InteractionType, Interaction } from '../../types/crm';
import { db } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { PhoneCall, FileText, Users, Send, Sparkles, CornerDownLeft } from 'lucide-react';

interface InteractionLoggerProps {
  contactId: string;
  onInteractionAdded: (interaction: Interaction) => void;
}

export const InteractionLogger: React.FC<InteractionLoggerProps> = ({
  contactId,
  onInteractionAdded,
}) => {
  const { activeMember } = useTeam();
  const { success, error } = useToast();

  const [type, setType] = useState<InteractionType>('note');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const created = await db.addInteraction({
        contact_id: contactId,
        type,
        content: content.trim(),
        created_by: activeMember?.id || null,
      });

      success('Activity Logged', `Recorded ${type} attributed to ${activeMember?.name || 'You'}`);
      setContent('');
      onInteractionAdded(created);
    } catch (err: any) {
      error('Failed to log activity', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const tabs: Array<{ id: InteractionType; label: string; icon: React.ReactNode }> = [
    { id: 'note', label: 'Quick Note', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'call', label: 'Log Call', icon: <PhoneCall className="w-3.5 h-3.5" /> },
    { id: 'meeting', label: 'Log Meeting', icon: <Users className="w-3.5 h-3.5" /> },
  ];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        {/* Interaction Type Tabs */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
          {tabs.map((tab) => {
            const isActive = type === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setType(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="text-[11px] text-slate-500 font-medium">
          Author: <strong className="text-slate-800 font-semibold">{activeMember?.name || 'Team Member'}</strong>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            type === 'call'
              ? 'Summarize phone call discussion, objections, follow-ups...'
              : type === 'meeting'
              ? 'Key takeaways from meeting, attendees, next steps...'
              : 'Add an internal note about this contact or deal (Cmd/Ctrl + Enter to save)...'
          }
          className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-xl p-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all resize-none h-20"
        />

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <CornerDownLeft className="w-3 h-3" /> Press <kbd className="px-1 py-0.5 bg-slate-200/80 rounded text-[9px] font-mono text-slate-700">Ctrl+Enter</kbd> to save
          </span>

          <Button
            type="submit"
            size="sm"
            variant="primary"
            isLoading={isSubmitting}
            disabled={!content.trim()}
            leftIcon={<Send className="w-3.5 h-3.5" />}
          >
            Save {type.toUpperCase()}
          </Button>
        </div>
      </form>
    </div>
  );
};
