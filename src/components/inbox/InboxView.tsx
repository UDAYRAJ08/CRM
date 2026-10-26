import React, { useState, useEffect, useMemo } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import { Contact, EmailRecord, Interaction } from '../../types/crm';
import { db } from '../../lib/supabase';
import { formatDate, formatRelativeTime, getInitials, stripHtml } from '../../lib/utils';
import { Button } from '../ui/Button';
import { STATUS_BADGE_CONFIG } from '../ui/Badge';
import { Inbox, RefreshCw, Search, Reply, Calendar, User } from 'lucide-react';
import { Linkedin } from '../linkedin/LinkedInIcon';

const STAGE_FILTERS = ['all', 'qualified', 'contacted', 'proposal', 'won'];
const PLACEHOLDER_SUBJECTS = new Set(['no subject', 'email reply', '']);

export interface InboundMessageItem {
  id: string;
  contactId: string;
  contact: Contact;
  senderName: string;
  senderEmail: string;
  subject: string;
  body: string;
  receivedAt: string;
  interactionId?: string;
  emailRecordId?: string;
}

interface InboxViewProps {
  contacts: Contact[];
  onSelectContact: (contact: Contact) => void;
  onOpenEmailComposer: (contact: Contact, replySubject?: string) => void;
  onOpenLinkedIn: (contact: Contact) => void;
  onOpenAddReminder: (contact: Contact) => void;
  onSyncInbox: () => Promise<void>;
  isSyncing: boolean;
  onRefresh: () => Promise<void>;
}

export const InboxView: React.FC<InboxViewProps> = ({
  contacts,
  onSelectContact,
  onOpenEmailComposer,
  onOpenLinkedIn,
  onOpenAddReminder,
  onSyncInbox,
  isSyncing,
  onRefresh,
}) => {
  const { activeMember } = useTeam();
  const { user } = useAuth();
  const activeUserEmail = (activeMember?.email || user?.email || localStorage.getItem('crm_active_user_email') || 'workspace inbox').trim();

  const [messages, setMessages] = useState<InboundMessageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  const contactMap = useMemo(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => {
      map.set(c.id, c);
      if (c.email) {
        map.set(c.email.toLowerCase().trim(), c);
      }
    });
    return map;
  }, [contacts]);

  const loadInboundMessages = async () => {
    setIsLoading(true);
    try {
      const items: InboundMessageItem[] = [];
      const seenKeys = new Set<string>();

      // 1. Fetch all inbound interactions across all contacts in one unified query
      const allInboundInteractions = await db.getAllInboundInteractions();
      for (const inter of allInboundInteractions) {
        const contact = inter.contact || (inter.contact_id ? contactMap.get(inter.contact_id) : null);
        if (!contact) continue;

        // Extract from content
        const subjectMatch = inter.content.match(/Subject:\s*([^\n]+)/i);
        const fromMatch = inter.content.match(/From:\s*([^\n<]+)(?:<([^>]+)>)?/i);
        const subject = subjectMatch ? subjectMatch[1].trim() : 'Email Reply';
        const senderName = fromMatch ? fromMatch[1].trim() : contact.name;
        const senderEmail = fromMatch && fromMatch[2] ? fromMatch[2].trim() : contact.email || '';

        // Extract body (after Subject line)
        let body = inter.content;
        const lines = inter.content.split('\n');
        const subjectIdx = lines.findIndex((l) => l.toLowerCase().startsWith('subject:'));
        if (subjectIdx !== -1 && subjectIdx + 1 < lines.length) {
          body = lines
            .slice(subjectIdx + 1)
            .join('\n')
            .replace(/\[MsgID:[^\]]+\]/g, '')
            .trim();
        }

        const key = `${contact.id}_${subject}_${inter.created_at.slice(0, 16)}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          items.push({
            id: inter.id,
            contactId: contact.id,
            contact: contact,
            senderName: senderName || contact.name,
            senderEmail: senderEmail || contact.email || '',
            subject: subject,
            body: body,
            receivedAt: inter.created_at,
            interactionId: inter.id,
          });
        }
      }

      // 2. Fetch from emails table where subject starts with Inbound or status is received
      const allEmails = await db.getEmails();
      for (const email of allEmails) {
        if (
          email.status === 'received' ||
          email.is_inbound ||
          email.subject.toLowerCase().startsWith('re:') ||
          email.subject.toLowerCase().includes('inbound')
        ) {
          const contact = email.contact_id ? contactMap.get(email.contact_id) : null;
          const senderEmail = (email.sender_email || email.recipient_email || '').toLowerCase().trim();
          const matchedContact = contact || (senderEmail ? contactMap.get(senderEmail) : null);

          if (matchedContact) {
            const key = `${matchedContact.id}_${email.subject}_${(email.sent_at || email.created_at || '').slice(0, 16)}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              items.push({
                id: email.id,
                contactId: matchedContact.id,
                contact: matchedContact,
                senderName: matchedContact.name,
                senderEmail: email.sender_email || matchedContact.email || '',
                subject: email.subject,
                body: email.body,
                receivedAt: email.sent_at || email.created_at || new Date().toISOString(),
                emailRecordId: email.id,
              });
            }
          }
        }
      }

      // Sort newest first
      items.sort(
        (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      );

      setMessages(items);
      if (items.length > 0 && !expandedMessageId) {
        setExpandedMessageId(items[0].id);
      }
    } catch (err) {
      console.error('Error loading inbound messages:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInboundMessages();
  }, [contacts]);

  const lastSyncTime = localStorage.getItem('crm_last_inbox_sync');

  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      if (selectedStatusFilter !== 'all' && msg.contact.status !== selectedStatusFilter) {
        return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        msg.senderName.toLowerCase().includes(q) ||
        msg.senderEmail.toLowerCase().includes(q) ||
        msg.subject.toLowerCase().includes(q) ||
        msg.body.toLowerCase().includes(q) ||
        (msg.contact.company?.name && msg.contact.company.name.toLowerCase().includes(q))
      );
    });
  }, [messages, searchQuery, selectedStatusFilter]);

  const handleSync = async () => {
    await onSyncInbox();
    await loadInboundMessages();
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2.5">
            Inbox
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 tabular-nums">
              {messages.length}
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-1 truncate">
            Replies to {activeUserEmail}
            {lastSyncTime && <> · synced {formatRelativeTime(lastSyncTime)}</>}
          </p>
        </div>

        <Button
          variant="outline"
          onClick={handleSync}
          disabled={isSyncing}
          leftIcon={<RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />}
          className="shrink-0"
        >
          {isSyncing ? 'Syncing...' : 'Sync'}
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            placeholder="Search replies"
            aria-label="Search replies"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-sm bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div
          role="tablist"
          aria-label="Filter by stage"
          className="inline-flex p-0.5 bg-slate-100 rounded-lg overflow-x-auto no-scrollbar self-start sm:self-auto"
        >
          {STAGE_FILTERS.map((status) => {
            const isActive = selectedStatusFilter === status;
            return (
              <button
                key={status}
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedStatusFilter(status)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize whitespace-nowrap transition-colors cursor-pointer ${
                  isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {status}
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 flex items-center justify-center gap-2 text-sm text-slate-500">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading replies...
        </div>
      ) : filteredMessages.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 px-6 text-center">
          <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-slate-900">
            {searchQuery || selectedStatusFilter !== 'all' ? 'No matching replies' : 'No replies yet'}
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery || selectedStatusFilter !== 'all'
              ? 'Try a different search or stage.'
              : 'When leads reply to your emails, they show up here.'}
          </p>
        </div>
      ) : (
        <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {filteredMessages.map((msg) => {
            const isExpanded = expandedMessageId === msg.id;
            const contact = msg.contact;
            const text = stripHtml(msg.body);
            const hasSubject = !PLACEHOLDER_SUBJECTS.has(msg.subject.trim().toLowerCase());

            return (
              <li
                key={msg.id}
                className={isExpanded ? 'bg-indigo-50/30 shadow-[inset_3px_0_0_theme(colors.indigo.500)]' : ''}
              >
                <button
                  type="button"
                  onClick={() => setExpandedMessageId(isExpanded ? null : msg.id)}
                  aria-expanded={isExpanded}
                  className="w-full text-left px-4 sm:px-6 py-4 sm:py-5 flex items-start gap-4 hover:bg-slate-50/80 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 text-sm font-semibold flex items-center justify-center shrink-0">
                    {getInitials(msg.senderName, 'L')}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-[15px] font-semibold text-slate-900 truncate">{msg.senderName}</span>
                      <time
                        dateTime={msg.receivedAt}
                        title={formatDate(msg.receivedAt)}
                        className="text-xs text-slate-400 shrink-0 tabular-nums"
                      >
                        {formatRelativeTime(msg.receivedAt)}
                      </time>
                    </div>

                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {contact.company?.name && <>{contact.company.name} · </>}
                      {STATUS_BADGE_CONFIG[contact.status]?.label || contact.status}
                    </p>

                    {(hasSubject || (!isExpanded && text)) && (
                      <div className="mt-2.5 max-w-3xl space-y-0.5">
                        {hasSubject && <p className="text-sm font-medium text-slate-800 truncate">{msg.subject}</p>}
                        {!isExpanded && text && (
                          <p className="text-sm text-slate-500 leading-relaxed line-clamp-2 sm:line-clamp-1 break-words">{text.replace(/\s+/g, ' ')}</p>
                        )}
                      </div>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="pl-[4.5rem] sm:pl-20 pr-4 sm:pr-6 pb-6">
                    <p className="text-xs text-slate-400 mb-3 break-all">
                      {msg.senderEmail} · {formatDate(msg.receivedAt)}
                    </p>
                    {/* Inbound mail is untrusted: render as escaped text, never as HTML. */}
                    <div className="max-w-prose text-sm text-slate-700 leading-7 whitespace-pre-line break-words max-h-96 overflow-y-auto">
                      {text || 'No message body.'}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-5">
                      <Button
                        size="sm"
                        onClick={() => onOpenEmailComposer(contact, `Re: ${msg.subject.replace(/^re:\s*/i, '')}`)}
                        leftIcon={<Reply className="w-3.5 h-3.5" />}
                      >
                        Reply
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onSelectContact(contact)}
                        leftIcon={<User className="w-3.5 h-3.5" />}
                      >
                        Contact
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenAddReminder(contact)}
                        leftIcon={<Calendar className="w-3.5 h-3.5" />}
                      >
                        Follow-up
                      </Button>
                      {contact.linkedin_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onOpenLinkedIn(contact)}
                          leftIcon={<Linkedin className="w-3.5 h-3.5" />}
                        >
                          LinkedIn
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
