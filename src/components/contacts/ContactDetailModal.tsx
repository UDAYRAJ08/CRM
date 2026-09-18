import React, { useState, useEffect } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Contact, Interaction, EmailRecord, Reminder, ContactStatus } from '../../types/crm';
import { db } from '../../lib/supabase';
import { getInitials } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { InteractionLogger } from './InteractionLogger';
import { InteractionTimeline } from './InteractionTimeline';
import {
  User,
  Building,
  Mail,
  Phone,
  CalendarCheck2,
  Edit,
  Send,
  Clock,
  Sparkles,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Tag,
  ChevronDown,
  Layers,
  Copy,
  Check,
  Globe,
  X,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface ContactDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  onEditContact: (contact: Contact) => void;
  onOpenEmail: (contact: Contact) => void;
  onOpenLinkedIn?: (contact: Contact) => void;
  onAddReminder: (contact: Contact) => void;
  onContactUpdated: () => void;
}

const statusConfig: Record<
  ContactStatus,
  { label: string; dot: string; bg: string; text: string; border: string }
> = {
  new: {
    label: 'Not Started',
    dot: 'bg-blue-500',
    bg: 'bg-blue-50/80',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  contacted: {
    label: 'Contacted',
    dot: 'bg-amber-500',
    bg: 'bg-amber-50/80',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  qualified: {
    label: 'Replied & Qualified',
    dot: 'bg-purple-500',
    bg: 'bg-purple-50/80',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
  proposal: {
    label: 'Proposal Sent',
    dot: 'bg-orange-500',
    bg: 'bg-orange-50/80',
    text: 'text-orange-700',
    border: 'border-orange-200',
  },
  won: {
    label: 'Closed / Won',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50/80',
    text: 'text-emerald-700 font-bold',
    border: 'border-emerald-300',
  },
  lost: {
    label: 'Closed / Lost',
    dot: 'bg-rose-500',
    bg: 'bg-rose-50/80',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
  inactive: {
    label: 'Inactive',
    dot: 'bg-slate-400',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
  },
};

export const ContactDetailModal: React.FC<ContactDetailModalProps> = ({
  isOpen,
  onClose,
  contact,
  onEditContact,
  onOpenEmail,
  onOpenLinkedIn,
  onAddReminder,
  onContactUpdated,
}) => {
  const { activeMember } = useTeam();
  const { success, error, info } = useToast();

  const [activeTab, setActiveTab] = useState<'timeline' | 'emails' | 'reminders'>('timeline');
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchDetails = async () => {
    if (!contact) return;
    setIsLoadingDetails(true);
    try {
      const [fetchedInteractions, fetchedEmails, allReminders] = await Promise.all([
        db.getInteractions(contact.id),
        db.getEmails(contact.id),
        db.getReminders(),
      ]);
      setInteractions(fetchedInteractions);
      setEmails(fetchedEmails);
      setReminders(allReminders.filter((r) => r.contact_id === contact.id));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  useEffect(() => {
    if (isOpen && contact) {
      fetchDetails();
      setActiveTab('timeline');
    }
  }, [isOpen, contact]);

  if (!isOpen || !contact) return null;

  const handleStatusChange = async (newStatus: ContactStatus) => {
    try {
      await db.saveContact({ id: contact.id, status: newStatus });
      await db.addInteraction({
        contact_id: contact.id,
        type: 'note',
        content: `Stage updated to: "${statusConfig[newStatus]?.label || newStatus}"`,
        created_by: activeMember?.id || null,
      });
      success('Stage Updated', `Contact moved to ${statusConfig[newStatus]?.label || newStatus}`);
      onContactUpdated();
      fetchDetails();
    } catch (err: any) {
      error('Failed to update stage', err.message);
    }
  };

  const handleToggleReminder = async (rem: Reminder) => {
    await db.toggleReminder(rem.id, !rem.done);
    fetchDetails();
  };

  const handleDeleteContact = async () => {
    if (window.confirm(`Are you sure you want to delete ${contact.name}?`)) {
      await db.deleteContact(contact.id);
      success('Contact Deleted', `${contact.name} was removed.`);
      onContactUpdated();
      onClose();
    }
  };

  const copyToClipboard = (text: string, label: string, keyIdentifier: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyIdentifier);
    setTimeout(() => setCopiedKey(null), 1500);
    info('Copied!', `${label} copied to clipboard`);
  };

  const statuses: ContactStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'inactive'];
  const currentStatus = statusConfig[contact.status] || statusConfig.new;

  // Normalize company website url (check website field or if name itself contains a domain/url)
  const rawWebsite = contact.company?.website?.trim() || (contact.company?.name?.trim().includes('.') ? contact.company?.name?.trim() : '') || '';
  const normalizedUrl = rawWebsite
    ? rawWebsite.startsWith('http://') || rawWebsite.startsWith('https://')
      ? rawWebsite
      : `https://${rawWebsite}`
    : '';

  // Calculate overdue status
  const contactDate = new Date(contact.updated_at || contact.created_at).getTime();
  const diffDays = Math.floor((Date.now() - contactDate) / (1000 * 60 * 60 * 24));
  const isFollowUpOverdue = contact.status === 'contacted' && diffDays >= 3;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-over Drawer entering from Right */}
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-250">
        
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-200/80 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Lead Details
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onEditContact(contact)}
              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
              title="Edit Contact"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={handleDeleteContact}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
              title="Delete Contact"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-lg transition cursor-pointer ml-1"
              title="Close Drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          
          {/* Hero Lead Card */}
          <div className="rounded-2xl bg-gradient-to-b from-slate-50/90 to-white p-5 border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-extrabold text-lg flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/20">
                {getInitials(contact.name, 'C')}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    {contact.name}
                  </h2>

                  {/* Inline Stage Dropdown */}
                  <div className="relative inline-flex items-center">
                    <select
                      value={contact.status}
                      onChange={(e) => handleStatusChange(e.target.value as ContactStatus)}
                      className={`text-xs font-bold pl-7 pr-6 py-1 rounded-full border shadow-2xs cursor-pointer appearance-none transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${currentStatus.bg} ${currentStatus.text} ${currentStatus.border}`}
                    >
                      {statuses.map((st) => (
                        <option key={st} value={st} className="bg-white text-slate-800">
                          {statusConfig[st]?.label || st}
                        </option>
                      ))}
                    </select>
                    <span
                      className={`w-2 h-2 rounded-full absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${currentStatus.dot}`}
                    />
                    <ChevronDown className="w-3.5 h-3.5 opacity-60 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Subtitle & Role & Clickable Company */}
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-1.5">
                  {contact.title && <span className="font-semibold text-slate-700">{contact.title}</span>}
                  {contact.company && (
                    <span className="text-slate-400 inline-flex items-center gap-1">
                      <span>• at</span>
                      {normalizedUrl ? (
                        <a
                          href={normalizedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1 transition-colors cursor-pointer"
                          title={`Open ${normalizedUrl} in a new tab`}
                        >
                          <span>{contact.company.name}</span>
                          <ExternalLink className="w-3 h-3 text-indigo-500 shrink-0" />
                        </a>
                      ) : (
                        <strong className="text-slate-800">{contact.company.name}</strong>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ACTION HIERARCHY BAR: Highlight Next Logical Action */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
              {contact.status === 'new' ? (
                /* Primary Outreach Highlight */
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Send className="w-3.5 h-3.5" />}
                    onClick={() => onOpenEmail(contact)}
                    className="flex-1 shadow-md shadow-indigo-600/20"
                  >
                    Compose 1st Outreach Email
                  </Button>
                  {onOpenLinkedIn && (
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Send className="w-3.5 h-3.5 text-blue-600" />}
                      onClick={() => onOpenLinkedIn(contact)}
                    >
                      LinkedIn
                    </Button>
                  )}
                </>
              ) : isFollowUpOverdue ? (
                /* Overdue Follow-up Highlight */
                <>
                  <button
                    type="button"
                    onClick={() => onOpenEmail(contact)}
                    className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition shadow-md shadow-rose-600/25 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Overdue Follow-up Message ({diffDays}d ago)</span>
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<CalendarCheck2 className="w-3.5 h-3.5" />}
                    onClick={() => onAddReminder(contact)}
                  >
                    Task
                  </Button>
                </>
              ) : (
                /* Standard Action Bar */
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Mail className="w-3.5 h-3.5" />}
                    onClick={() => onOpenEmail(contact)}
                    className="flex-1"
                  >
                    Send Email
                  </Button>
                  {onOpenLinkedIn && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenLinkedIn(contact)}
                    >
                      LinkedIn
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<CalendarCheck2 className="w-3.5 h-3.5" />}
                    onClick={() => onAddReminder(contact)}
                  >
                    Set Reminder
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Contact Information & Channels */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Communication Channels
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {contact.email && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-slate-800 truncate">{contact.email}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(contact.email!, 'Email', 'email')}
                    className="p-1 text-slate-400 hover:text-indigo-600 rounded transition cursor-pointer"
                    title="Copy Email"
                  >
                    {copiedKey === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              {contact.phone && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-slate-800">{contact.phone}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(contact.phone!, 'Phone', 'phone')}
                    className="p-1 text-slate-400 hover:text-indigo-600 rounded transition cursor-pointer"
                    title="Copy Phone"
                  >
                    {copiedKey === 'phone' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Personalized Connection Note & Custom Fields with 1-Click Copy */}
          {contact.custom_fields && Object.keys(contact.custom_fields).length > 0 && (
            <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-200/80 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>Personalized Notes & AI Research</span>
                </div>
              </div>

              <div className="space-y-2.5">
                {Object.entries(contact.custom_fields).map(([key, val]) => {
                  const strVal = String(val);
                  return (
                    <div
                      key={key}
                      className="p-3 bg-white rounded-xl border border-amber-200/60 shadow-2xs text-xs"
                    >
                      <div className="flex items-center justify-between text-slate-500 text-[11px] mb-1 font-semibold uppercase tracking-wider">
                        <span>{key.replace(/_/g, ' ')}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(strVal, key, key)}
                          className="flex items-center gap-1 text-[11px] font-bold text-amber-800 hover:text-amber-950 px-2 py-0.5 rounded bg-amber-100/60 hover:bg-amber-100 transition cursor-pointer"
                        >
                          {copiedKey === key ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-700">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-amber-700" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{strVal}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Activity Tabs: Timeline / Emails / Reminders */}
          <div className="space-y-3">
            <div className="flex items-center border-b border-slate-200 gap-4 text-xs font-semibold">
              <button
                onClick={() => setActiveTab('timeline')}
                className={`py-2.5 border-b-2 transition cursor-pointer ${
                  activeTab === 'timeline'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                Timeline ({interactions.length})
              </button>
              <button
                onClick={() => setActiveTab('emails')}
                className={`py-2.5 border-b-2 transition cursor-pointer ${
                  activeTab === 'emails'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                Emails ({emails.length})
              </button>
              <button
                onClick={() => setActiveTab('reminders')}
                className={`py-2.5 border-b-2 transition cursor-pointer ${
                  activeTab === 'reminders'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                Tasks & Reminders ({reminders.length})
              </button>
            </div>

            {/* Tab Contents */}
            {activeTab === 'timeline' && (
              <div className="space-y-4">
                <InteractionLogger
                  contactId={contact.id}
                  onInteractionAdded={() => {
                    fetchDetails();
                    onContactUpdated();
                  }}
                />
                <InteractionTimeline
                  interactions={interactions}
                />
              </div>
            )}

            {activeTab === 'emails' && (
              <div className="space-y-3">
                {emails.length === 0 ? (
                  <p className="text-center py-6 text-xs text-slate-400">No emails logged yet.</p>
                ) : (
                  emails.map((em) => (
                    <div
                      key={em.id}
                      className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{em.subject}</span>
                        <span className="text-[10px] text-slate-400">
                          {format(new Date(em.sent_at || Date.now()), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <p className="text-slate-600 line-clamp-3 whitespace-pre-wrap">{em.body}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'reminders' && (
              <div className="space-y-2.5">
                {reminders.length === 0 ? (
                  <p className="text-center py-6 text-xs text-slate-400">No scheduled tasks.</p>
                ) : (
                  reminders.map((rem) => (
                    <div
                      key={rem.id}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs transition ${
                        rem.done ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={rem.done}
                          onChange={() => handleToggleReminder(rem)}
                          className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div>
                          <p className={`font-medium ${rem.done ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {rem.note}
                          </p>
                          <span className="text-[10px] text-slate-500">
                            Due: {format(new Date(rem.due_date), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
