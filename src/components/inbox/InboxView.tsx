import React, { useState, useEffect, useMemo } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import { Contact, EmailRecord, Interaction } from '../../types/crm';
import { db } from '../../lib/supabase';
import { formatDate, formatRelativeTime, getInitials, getStatusColor } from '../../lib/utils';
import { Button } from '../ui/Button';
import {
  Inbox,
  Mail,
  RefreshCw,
  Search,
  ExternalLink,
  Reply,
  Calendar,
  Sparkles,
  CheckCircle2,
  Clock,
  Building2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  ArrowUpRight,
  ShieldCheck,
  Share2,
} from 'lucide-react';

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

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner / Hero Card */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-indigo-950/15 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-white/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-indigo-100 mb-3">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Live Outlook Inbound Feed</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <span>Lead Replies & Inbox</span>
              <span className="text-sm font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/40 text-indigo-100 border border-indigo-400/30">
                {messages.length} {messages.length === 1 ? 'Reply' : 'Replies'}
              </span>
            </h1>
            <p className="text-indigo-200/90 text-sm mt-2 max-w-xl leading-relaxed">
              When leads reply to your emails sent from <strong className="text-white">{activeUserEmail}</strong>, they automatically sync here and update lead stage.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <div className="text-right hidden md:block mr-2">
              <div className="text-xs text-indigo-200 font-medium">Active Mailbox Account</div>
              <div className="text-xs font-bold text-white">{activeUserEmail}</div>
              {lastSyncTime && (
                <div className="text-[10px] text-indigo-300 flex items-center justify-end gap-1 mt-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  <span>Synced {formatRelativeTime(lastSyncTime)}</span>
                </div>
              )}
            </div>

            <Button
              variant="white"
              size="md"
              onClick={async () => {
                await onSyncInbox();
                await loadInboundMessages();
              }}
              disabled={isSyncing}
              leftIcon={<RefreshCw className={`w-4 h-4 text-indigo-600 ${isSyncing ? 'animate-spin' : ''}`} />}
              className="border-0 shadow-lg font-bold"
            >
              {isSyncing ? 'Checking Outlook...' : 'Sync Outlook Now'}
            </Button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search lead replies, email or subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs font-bold text-slate-500 shrink-0">Stage:</span>
          {['all', 'qualified', 'contacted', 'proposal', 'won'].map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatusFilter(status)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition cursor-pointer whitespace-nowrap ${
                selectedStatusFilter === status
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Messages List */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 flex flex-col items-center justify-center gap-3 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-sm font-medium">Scanning for lead replies...</p>
        </div>
      ) : filteredMessages.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center max-w-2xl mx-auto shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mx-auto mb-4">
            <Inbox className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {searchQuery ? 'No matching replies found' : 'No lead replies in inbox yet'}
          </h3>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            {searchQuery
              ? `No messages matched "${searchQuery}". Try clearing your search filter.`
              : 'When prospects reply to your cold emails or follow-ups, their responses will automatically show up here and qualify your contact.'}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await onSyncInbox();
                await loadInboundMessages();
              }}
              disabled={isSyncing}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />}
            >
              {isSyncing ? 'Syncing...' : 'Sync Mailbox Now'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMessages.map((msg) => {
            const isExpanded = expandedMessageId === msg.id;
            const initials = getInitials(msg.senderName, 'L');
            const contact = msg.contact;
            const statusColor = getStatusColor(contact.status);

            return (
              <div
                key={msg.id}
                className={`bg-white rounded-2xl border transition-all duration-150 overflow-hidden ${
                  isExpanded
                    ? 'border-indigo-300 shadow-md ring-1 ring-indigo-500/10'
                    : 'border-slate-200/80 hover:border-slate-300 shadow-xs'
                }`}
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedMessageId(isExpanded ? null : msg.id)}
                  className="p-4 sm:p-5 flex items-start justify-between gap-4 cursor-pointer select-none hover:bg-slate-50/50 transition"
                >
                  <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                    {/* Avatar */}
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-white font-black text-sm sm:text-base flex items-center justify-center shrink-0 shadow-xs">
                      {initials}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm sm:text-base text-slate-900">
                          {msg.senderName}
                        </span>
                        {contact.company?.name && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/60">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            {contact.company.name}
                          </span>
                        )}
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${statusColor}`}>
                          {contact.status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{msg.senderEmail}</span>
                        <span>•</span>
                        <span className="text-indigo-600 font-semibold flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(msg.receivedAt)}
                        </span>
                        <span>•</span>
                        <span className="text-slate-400">{formatDate(msg.receivedAt)}</span>
                      </div>

                      <div className="font-bold text-xs sm:text-sm text-slate-800 mt-2 truncate">
                        {msg.subject}
                      </div>

                      {!isExpanded && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-1 leading-relaxed">
                          {msg.body.replace(/\n+/g, ' ')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pt-1">
                    <button
                      type="button"
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details & Actions */}
                {isExpanded && (
                  <div className="px-4 sm:px-5 pb-5 pt-2 border-t border-slate-100 bg-slate-50/40 space-y-4">
                    {/* Message Body Box */}
                    <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-xs">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Lead Message Content</span>
                      </div>
                      <div className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-sans font-medium">
                        {msg.body}
                      </div>
                    </div>

                    {/* Quick Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenEmailComposer(contact, `Re: ${msg.subject.replace(/^re:\s*/i, '')}`);
                          }}
                          leftIcon={<Reply className="w-3.5 h-3.5" />}
                          className="font-bold"
                        >
                          Reply to {contact.name.split(' ')[0]}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectContact(contact);
                          }}
                          leftIcon={<ExternalLink className="w-3.5 h-3.5 text-slate-500" />}
                        >
                          View Contact Profile
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAddReminder(contact);
                          }}
                          leftIcon={<Calendar className="w-3.5 h-3.5 text-slate-500" />}
                        >
                          Set Follow-up Task
                        </Button>

                        {contact.linkedin_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenLinkedIn(contact);
                            }}
                            leftIcon={<Share2 className="w-3.5 h-3.5 text-blue-600" />}
                          >
                            LinkedIn Outreach
                          </Button>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400 italic">
                        Contact ID: {contact.id.slice(0, 8)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
