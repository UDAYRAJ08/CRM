import React, { useState, useEffect, useCallback } from 'react';
import { Contact } from '../../types/crm';
import { db, EmailDraft } from '../../lib/supabase';
import { Button } from '../ui/Button';
import {
  FileEdit,
  Trash2,
  Send,
  Search,
  RefreshCw,
  Clock,
  Mail,
  AlertCircle,
  Paperclip,
} from 'lucide-react';
import { formatRelativeTime } from '../../lib/utils';

interface DraftsViewProps {
  contacts: Contact[];
  onResumeDraft: (draft: EmailDraft) => void;
  onRefresh?: () => void;
}

export const DraftsView: React.FC<DraftsViewProps> = ({
  contacts,
  onResumeDraft,
  onRefresh,
}) => {
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const contactMap = React.useMemo(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => {
      map.set(c.id, c);
      if (c.email) map.set(c.email.toLowerCase().trim(), c);
    });
    return map;
  }, [contacts]);

  const loadDrafts = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const all = await db.getDrafts();
      setDrafts(all);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrafts(true);

    const handleDraftsChange = () => {
      loadDrafts(false);
    };

    window.addEventListener('crm_drafts_updated', handleDraftsChange);
    window.addEventListener('focus', handleDraftsChange);

    return () => {
      window.removeEventListener('crm_drafts_updated', handleDraftsChange);
      window.removeEventListener('focus', handleDraftsChange);
    };
  }, [loadDrafts]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    // Optimistic instant removal from UI
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    try {
      await db.deleteDraft(id);
      onRefresh?.();
    } catch {
      loadDrafts(false);
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = drafts.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (d.subject || '').toLowerCase().includes(q) ||
      (d.recipient_email || '').toLowerCase().includes(q) ||
      (d.body || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2.5">
            <span>Drafts</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {drafts.length}
            </span>
          </h1>
          <p className="text-slate-500 text-sm mt-1 max-w-xl">
            Unsent emails are saved here automatically.
          </p>
        </div>

        <Button
          variant="outline"
          size="md"
          onClick={() => loadDrafts(true)}
          disabled={isLoading}
          leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
          className="shrink-0"
        >
          Refresh
        </Button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search drafts by subject, email, or body..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {/* Drafts List */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center gap-3 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-sm font-medium">Loading drafts...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-4">
            <FileEdit className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {searchQuery ? 'No matching drafts found' : 'No drafts saved yet'}
          </h3>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            {searchQuery
              ? `No drafts matched "${searchQuery}". Try clearing the filter.`
              : 'When you close the email composer without sending, your draft is automatically saved here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((draft) => {
            const contact = draft.contact_id ? contactMap.get(draft.contact_id) : null;
            const hasAttachments = draft.attachments && draft.attachments.length > 0;
            return (
              <div
                key={draft.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 transition-all duration-150 overflow-hidden"
              >
                <div className="p-4 sm:p-5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-400 text-white font-semibold text-sm flex items-center justify-center shrink-0 shadow-xs">
                      <FileEdit className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-900 truncate max-w-xs">
                          {draft.subject || '(No subject)'}
                        </span>
                        {hasAttachments && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            <Paperclip className="w-3 h-3" />
                            {draft.attachments!.length} file{draft.attachments!.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-400" />
                          {draft.recipient_email || 'No recipient'}
                        </span>
                        {contact && (
                          <>
                            <span>•</span>
                            <span className="text-indigo-600 font-semibold">{contact.name}</span>
                          </>
                        )}
                        <span>•</span>
                        <span className="text-amber-600 font-semibold flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(draft.saved_at)}
                        </span>
                      </div>

                      {draft.body && (
                        <p
                          className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: draft.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200),
                          }}
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onResumeDraft(draft)}
                      leftIcon={<Send className="w-3.5 h-3.5" />}
                      className="font-bold text-xs"
                    >
                      Resume
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleDelete(draft.id)}
                      disabled={deletingId === draft.id}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                      title="Delete draft"
                    >
                      {deletingId === draft.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {hasAttachments && (
                  <div className="px-5 pb-4 flex flex-wrap gap-2">
                    {draft.attachments!.map((att, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg"
                      >
                        <Paperclip className="w-3 h-3 text-slate-400" />
                        {att.name}
                        <span className="text-slate-400 text-[10px]">
                          ({(att.size / 1024).toFixed(0)} KB)
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {drafts.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-xl p-3.5">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <span>
            Drafts are saved automatically when you close the compose window without sending. Click <strong>Resume</strong> to continue editing any draft.
          </span>
        </div>
      )}
    </div>
  );
};
