import React, { useState, useEffect } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Contact, Interaction, EmailRecord, Reminder, ContactStatus } from '../../types/crm';
import { db } from '../../lib/supabase';
import { getInitials } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge, StatusBadge } from '../ui/Badge';
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
  Globe,
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
    label: 'New Lead',
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
    label: 'Qualified',
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
    text: 'text-emerald-700',
    border: 'border-emerald-200',
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

  if (!contact) return null;

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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    info('Copied!', `${label} copied to clipboard`);
  };

  const statuses: ContactStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'inactive'];
  const currentStatus = statusConfig[contact.status] || statusConfig.new;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="4xl"
      showCloseButton={true}
    >
      <div className="space-y-6">
        {/* Contact Hero Banner */}
        <div className="relative rounded-2xl bg-gradient-to-b from-slate-50/80 to-white p-5 sm:p-6 border border-slate-200/90 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              {/* Avatar Squircle */}
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-600 to-violet-600 text-white font-extrabold text-xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/25 ring-4 ring-indigo-50">
                {getInitials(contact.name, 'C')}
              </div>

              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {contact.name}
                  </h2>

                  {/* Stage Status Selector Dropdown */}
                  <div className="relative inline-flex items-center">
                    <select
                      value={contact.status}
                      onChange={(e) => handleStatusChange(e.target.value as ContactStatus)}
                      className={`text-xs font-bold pl-7 pr-7 py-1 rounded-full border shadow-2xs cursor-pointer appearance-none transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${currentStatus.bg} ${currentStatus.text} ${currentStatus.border}`}
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

                {/* Subtitle / Company / Owner info */}
                <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3">
                  {contact.title && (
                    <span className="font-semibold text-slate-800">{contact.title}</span>
                  )}
                  {contact.company && (
                    <span className="inline-flex items-center gap-1 text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                      <Building className="w-3 h-3" />
                      {contact.company.name}
                    </span>
                  )}
                  {contact.owner && (
                    <span className="text-slate-500 inline-flex items-center gap-1 font-medium">
                      <User className="w-3 h-3 text-slate-400" />
                      Owner: <strong className="text-slate-700">{contact.owner.name}</strong>
                    </span>
                  )}
                </div>

                {/* Tags */}
                {contact.tags && contact.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {contact.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-md shadow-2xs"
                      >
                        <Tag className="w-3 h-3 text-slate-400" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Top Action Toolbar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0 sm:self-start">
              {contact.phone && (
                <a
                  href={`tel:${contact.phone}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition shadow-xs"
                  title="Click to dial"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Call</span>
                </a>
              )}

              {onOpenLinkedIn && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenLinkedIn(contact)}
                  className="bg-[#0077b5]/10 hover:bg-[#0077b5]/20 text-[#0077b5] border-[#0077b5]/30 font-bold"
                  title="Send Direct Message or Connect on LinkedIn"
                >
                  💼 LinkedIn
                </Button>
              )}

              <Button
                variant="primary"
                size="sm"
                leftIcon={<Send className="w-3.5 h-3.5" />}
                onClick={() => onOpenEmail(contact)}
              >
                Compose Email
              </Button>

              <Button
                variant="outline"
                size="sm"
                leftIcon={<CalendarCheck2 className="w-3.5 h-3.5 text-amber-600" />}
                onClick={() => onAddReminder(contact)}
              >
                Reminder
              </Button>

              <button
                onClick={() => onEditContact(contact)}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 bg-white transition shadow-2xs cursor-pointer"
                title="Edit Contact"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handleDeleteContact}
                className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                title="Delete Contact"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Contact Info Pills Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/70 border border-slate-200/80 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Mail className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Email</span>
                <span className="font-semibold text-slate-800 truncate block text-xs" title={contact.email || ''}>
                  {contact.email || '—'}
                </span>
              </div>
            </div>
            {contact.email && (
              <button
                onClick={() => copyToClipboard(contact.email || '', 'Email')}
                className="text-slate-400 hover:text-slate-600 p-1 rounded transition"
                title="Copy Email"
              >
                <Copy className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/70 border border-slate-200/80 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Phone className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Phone</span>
                <span className="font-semibold text-slate-800 truncate block text-xs">
                  {contact.phone || '—'}
                </span>
              </div>
            </div>
            {contact.phone && (
              <button
                onClick={() => copyToClipboard(contact.phone || '', 'Phone')}
                className="text-slate-400 hover:text-slate-600 p-1 rounded transition"
                title="Copy Phone"
              >
                <Copy className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/70 border border-slate-200/80 text-xs">
            <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Created</span>
              <span className="font-semibold text-slate-800 truncate block text-xs">
                {contact.created_at
                  ? format(new Date(contact.created_at), 'MMM d, yyyy')
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Custom fields - Sleek Notion/Linear Style Properties List */}
        {contact.custom_fields && Object.keys(contact.custom_fields).length > 0 && (
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                Custom Attributes & Properties
              </span>
              <span className="text-[10px] font-semibold text-slate-400">
                {Object.keys(contact.custom_fields).length} fields
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {Object.entries(contact.custom_fields).map(([key, val]) => {
                const strVal = String(val || '');
                const isUrl =
                  strVal.startsWith('http://') ||
                  strVal.startsWith('https://') ||
                  strVal.startsWith('www.');
                const href = strVal.startsWith('www.') ? `https://${strVal}` : strVal;

                return (
                  <div
                    key={key}
                    className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs hover:border-indigo-200 hover:shadow-xs transition"
                  >
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-1">
                      {key}
                    </span>
                    {isUrl ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-xs text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 truncate"
                        title={strVal}
                      >
                        <Globe className="w-3 h-3 shrink-0" />
                        <span className="truncate">{strVal}</span>
                        <ExternalLink className="w-2.5 h-2.5 shrink-0 ml-auto opacity-70" />
                      </a>
                    ) : (
                      <span className="font-semibold text-xs text-slate-800 break-words line-clamp-2">
                        {strVal || '—'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sub-tabs for Timeline, Emails, Reminders */}
        <div className="space-y-4 pt-1">
          {/* Segmented Tab Buttons */}
          <div className="flex items-center gap-2 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('timeline')}
              className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'timeline'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Interactions</span>
              <span
                className={`text-[11px] px-2 py-0.2 rounded-full font-bold ${
                  activeTab === 'timeline'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {interactions.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('emails')}
              className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'emails'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Mail className="w-4 h-4" />
              <span>Emails & Replies</span>
              <span
                className={`text-[11px] px-2 py-0.2 rounded-full font-bold ${
                  activeTab === 'emails'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {emails.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('reminders')}
              className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'reminders'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <CalendarCheck2 className="w-4 h-4" />
              <span>Tasks & Reminders</span>
              <span
                className={`text-[11px] px-2 py-0.2 rounded-full font-bold ${
                  activeTab === 'reminders'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {reminders.length}
              </span>
            </button>
          </div>

          {activeTab === 'timeline' && (
            <div className="space-y-4">
              <InteractionLogger
                contactId={contact.id}
                onInteractionAdded={(newInt) => {
                  setInteractions([newInt, ...interactions]);
                  onContactUpdated();
                }}
              />
              <InteractionTimeline interactions={interactions} />
            </div>
          )}

          {activeTab === 'emails' && (
            <div className="space-y-3">
              {emails.length === 0 ? (
                <div className="p-8 text-center bg-slate-50/60 rounded-2xl border border-slate-200/80">
                  <Mail className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No email history for this contact</p>
                  <Button
                    size="sm"
                    variant="primary"
                    className="mt-3"
                    onClick={() => onOpenEmail(contact)}
                    leftIcon={<Sparkles className="w-4 h-4" />}
                  >
                    Compose Email with AI
                  </Button>
                </div>
              ) : (
                emails.map((email) => {
                  const isInbound =
                    email.is_inbound ||
                    email.status === 'received' ||
                    email.subject.toLowerCase().startsWith('re:');

                  return (
                    <div
                      key={email.id}
                      className={`p-4 rounded-xl border shadow-2xs space-y-2 transition ${
                        isInbound
                          ? 'bg-emerald-50/40 border-emerald-200/90 hover:border-emerald-300'
                          : 'bg-white border-slate-200/90 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">
                            {email.subject}
                          </span>
                          {isInbound ? (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                              📥 Received Reply
                            </span>
                          ) : (
                            email.ai_generated && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-bold">
                                <Sparkles className="w-3 h-3" /> AI Drafted
                              </span>
                            )
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {email.sent_at
                            ? formatDistanceToNow(new Date(email.sent_at), { addSuffix: true })
                            : '—'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-500">
                        {isInbound ? (
                          <>
                            Received from: <strong className="text-slate-800">{email.sender_email || contact.name}</strong> to{' '}
                            <strong className="text-slate-800">{email.recipient_email}</strong>
                          </>
                        ) : (
                          <>
                            Sent by: <strong className="text-slate-800">{email.sender?.name || 'Team Member'}</strong> to{' '}
                            <strong className="text-slate-800">{email.recipient_email}</strong>
                          </>
                        )}
                      </div>

                      <div
                        className={`p-3 rounded-lg text-xs whitespace-pre-wrap font-sans border leading-relaxed ${
                          isInbound
                            ? 'bg-white text-emerald-950 border-emerald-100'
                            : 'bg-slate-50/80 text-slate-700 border-slate-100'
                        }`}
                      >
                        {email.body}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'reminders' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<CalendarCheck2 className="w-3.5 h-3.5" />}
                  onClick={() => onAddReminder(contact)}
                >
                  Schedule Follow-up
                </Button>
              </div>

              {reminders.length === 0 ? (
                <div className="p-8 text-center bg-slate-50/60 rounded-2xl border border-slate-200/80">
                  <CalendarCheck2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No reminders for this contact</p>
                </div>
              ) : (
                reminders.map((rem) => (
                  <div
                    key={rem.id}
                    className={`flex items-center justify-between p-3.5 rounded-xl border bg-white shadow-2xs ${
                      rem.done ? 'opacity-60 bg-slate-50' : 'border-slate-200/90'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={rem.done}
                        onChange={() => handleToggleReminder(rem)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <div>
                        <p
                          className={`text-xs font-semibold ${
                            rem.done ? 'line-through text-slate-400' : 'text-slate-900'
                          }`}
                        >
                          {rem.note}
                        </p>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          Due: {format(new Date(rem.due_date), 'MMM d, yyyy • p')}
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
    </Modal>
  );
};

