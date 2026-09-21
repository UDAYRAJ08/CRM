import React, { useEffect, useState } from 'react';
import { Mail, User, CheckCircle2, Clock, Loader2, ExternalLink } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { db } from '../../lib/supabase';
import { DayEmailRecord } from '../../types/crm';

interface DayEmailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string | null; // 'YYYY-MM-DD'
}

function formatTime(isoStr: string): string {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

function formatDisplayDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date();
  const isToday =
    dt.getDate() === today.getDate() &&
    dt.getMonth() === today.getMonth() &&
    dt.getFullYear() === today.getFullYear();
  if (isToday) return 'Today';
  return dt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export const DayEmailsModal: React.FC<DayEmailsModalProps> = ({ isOpen, onClose, date }) => {
  const [emails, setEmails] = useState<DayEmailRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !date) return;
    setIsLoading(true);
    db.getEmailsForDay(date)
      .then(setEmails)
      .catch((err) => {
        console.error('Failed to load day emails', err);
        setEmails([]);
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, date]);

  const repliedCount = emails.filter((e) => e.replied_at).length;
  const displayDate = formatDisplayDate(date);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      title={
        <div>
          <h3 className="text-base font-extrabold text-slate-900">
            Emails Sent — {displayDate}
          </h3>
          {!isLoading && emails.length > 0 && (
            <p className="text-xs text-slate-500 mt-0.5">
              {emails.length} sent · {repliedCount} replied
            </p>
          )}
        </div>
      }
    >
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <p className="text-sm font-medium">Loading emails…</p>
        </div>
      ) : emails.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-300">
          <Mail className="w-10 h-10" />
          <p className="text-sm font-medium text-slate-400">No emails sent on this day</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Summary bar */}
          <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
              <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
              {emails.length} sent
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {repliedCount} replied
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              {emails.length - repliedCount} awaiting reply
            </div>
          </div>

          {/* Email rows */}
          {emails.map((email) => (
            <div
              key={email.id}
              className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all group"
            >
              {/* Avatar / icon */}
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0 text-sm font-bold uppercase">
                {email.contact_name
                  ? email.contact_name.charAt(0)
                  : email.recipient_email.charAt(0)}
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0">
                {/* Name + email */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-900">
                    {email.contact_name || email.recipient_email}
                  </span>
                  {email.contact_name && (
                    <span className="text-[11px] text-slate-400 truncate">
                      {email.recipient_email}
                    </span>
                  )}
                </div>

                {/* Subject */}
                <p className="text-xs text-slate-500 mt-0.5 truncate leading-snug">
                  {email.subject || '(no subject)'}
                </p>

                {/* Sender + time */}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {email.sender_name && (
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {email.sender_name}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-300">·</span>
                  <span className="text-[11px] text-slate-400">
                    {formatTime(email.sent_at)}
                  </span>
                </div>
              </div>

              {/* Reply badge */}
              <div className="flex-shrink-0 flex flex-col items-end gap-1">
                {email.replied_at ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold">
                    <CheckCircle2 className="w-3 h-3" />
                    Replied
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 text-[11px] font-medium">
                    <Clock className="w-3 h-3" />
                    Awaiting
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};
