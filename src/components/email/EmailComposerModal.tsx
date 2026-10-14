import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Contact, Interaction, EmailRecord } from '../../types/crm';
import { sendEmailDirectly, resolveContactCompany } from '../../lib/emailService';
import { cleanCompanyName, stripHtml } from '../../lib/utils';
import { db, EmailDraft, DraftAttachment } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { AIDraftAssistant } from './AIDraftAssistant';
import { useEditorFormatState, toolbarToggleClass } from './editorFormatting';
import { FontSizeMenu } from './FontSizeMenu';
import {
  Mail, Sparkles, Send, CheckCircle, ChevronDown, ChevronUp, Clock,
  AlertTriangle, ExternalLink, Bold, Italic, Underline,
  List, Type, Paperclip, Smile, Trash2, X, FileEdit,
  Link, CalendarClock, AlarmClock,
} from 'lucide-react';

// ── Emoji list ────────────────────────────────────────────────────────────────
const EMOJI_LIST = [
  '😊','😃','👋','🤝','✅','🎯','🚀','💡','📧','📋','👀','🙏','💪','🔥','⚡',
  '📅','⏰','📈','💼','🏆','🌟','👍','❤️','🎉','✨','📝','💬','🔔','📌','🎓',
  '😄','🤩','🤔','💭','📊','💰','🌍','🔑','🎁','📱','💻','🖥️','🔧','⚙️',
];

// Quick schedule presets shown in the dropdown
const SCHEDULE_PRESETS = [
  { label: 'In 1 hour',       getDate: () => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);   return d; } },
  { label: 'Tonight 8 PM',    getDate: () => { const d = new Date(); d.setHours(20, 0, 0, 0);                  return d; } },
  { label: 'Tomorrow 9 AM',   getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
  { label: 'Monday 9 AM',     getDate: () => {
      const d = new Date();
      const day = d.getDay(); // 0=Sun
      const daysUntilMon = day === 0 ? 1 : (8 - day) % 7 || 7;
      d.setDate(d.getDate() + daysUntilMon);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

// ── Inline Template Chips ─────────────────────────────────────────────────────
interface TemplateChip {
  id: string;
  label: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  btnClass: string;
  getSubject: (c: Contact) => string;
  getBody:    (c: Contact, senderName: string) => string;
}

const TEMPLATE_CHIPS: TemplateChip[] = [
  {
    id: 'agency_overflow',
    label: 'Agency Overflow & CRO',
    icon: '🎯',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
    btnClass: 'border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold',
    getSubject: (c) => `Specialist implementation capacity for ${resolveContactCompany(c) || 'your team'}`,
    getBody: (c, name) => {
      const first = c.name.split(' ')[0];
      const comp  = resolveContactCompany(c) || 'your team';
      return `Hi ${first},\n\nI’m reaching out because ${comp}’s Shopify Plus and commerce work appears to sit at the intersection of strategy, experience, and technical delivery. I wanted to ask whether your teams ever need additional specialist capacity for the implementation and experimentation layer of client work.\n\nIngversions Digital helps ecommerce teams execute Shopify CRO and A/B testing, conversion-focused theme and landing-page work, analytics QA, and storefront performance improvements. We can take an approved hypothesis or design direction, build the required change, verify tracking and cross-device behavior, and support the QA needed before launch.\n\nFor ${comp}, this could be useful as discreet overflow or a scoped delivery partner when internal teams are balancing larger commerce transformations. I’d be happy to share how we typically work alongside an existing agency team without interrupting its client relationship or process.\n\nWould a short conversation be relevant for your talent or delivery planning?\n\nBest regards,\n${name}\nIngversions Digital`;
    },
  },
  {
    id: 'capabilities',
    label: 'Team & Capabilities',
    icon: '⚡',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    btnClass: 'border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700',
    getSubject: (c) => `Team Capabilities & Task Execution Details for ${resolveContactCompany(c) || 'your organization'}`,
    getBody: (c, name) => {
      const first = c.name.split(' ')[0];
      return `Hi ${first},\n\nIf you are looking for a dedicated team to help you execute your tasks and ensure you hit your upcoming project deadlines on time, here are the core details of how we can support you:\n\n1. What We Handle:\n- End-to-end task execution and deliverable management\n- Rapid sprint turnaround to meet tight deadlines\n- Ongoing technical and operational workflow support\n\n2. How We Work:\n- Dedicated point of contact and daily/weekly progress updates\n- Transparent milestone tracking with zero bandwidth strain on your team\n- Flexible scoping based on your immediate priorities\n\nWould you be open to a quick 10-minute call this week to review your current tasks and see how we can assist?\n\nBest regards,\n${name}\nIngversions Digital`;
    },
  },
  {
    id: 'followup',
    label: 'Follow-up',
    icon: '🔄',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
    btnClass: 'border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700',
    getSubject: (c) => `Following up - ${resolveContactCompany(c) || c.name}`,
    getBody: (c, name) => {
      const first = c.name.split(' ')[0];
      const comp  = resolveContactCompany(c) || 'your team';
      return `Hi ${first},\n\nI hope you're having a productive week.\n\nI wanted to quickly follow up on my previous note and see if you had a chance to review it. We'd love to explore how we can support you and ${comp} in executing your key initiatives and hitting your deadlines on schedule.\n\nDo you have 10-15 minutes for a brief call sometime this week?\n\nBest regards,\n${name}\nIngversions Digital`;
    },
  },
  {
    id: 'scope',
    label: 'Scope & Plan',
    icon: '📋',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    btnClass: 'border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700',
    getSubject: (c) => `Project Scope & Execution Plan for ${resolveContactCompany(c) || 'your company'}`,
    getBody: (c, name) => {
      const first = c.name.split(' ')[0];
      const comp  = resolveContactCompany(c) || 'your company';
      return `Hi ${first},\n\nFollowing up on our recent conversation regarding your initiatives at ${comp}, here is a summary of the scope and deliverables we can handle for your team:\n\n• Objective: Accelerate project delivery and meet critical milestones.\n• Scope of Work: Complete execution of assigned tasks, QA review, and weekly delivery sprints.\n• Timeline: Ready to kick off immediately with dedicated allocation.\n\nPlease let me know if you would like any adjustments to this plan or if you have time for a brief sync tomorrow.\n\nBest regards,\n${name}\nIngversions Digital`;
    },
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface EmailComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact;
  initialSubject?: string;
  initialBody?: string;
  onEmailSent?: () => void;
  resumeDraft?: EmailDraft | null;
  onDraftSaved?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
export const EmailComposerModal: React.FC<EmailComposerModalProps> = ({
  isOpen,
  onClose,
  contact,
  initialSubject,
  initialBody,
  onEmailSent,
  resumeDraft,
  onDraftSaved,
}) => {
  const { activeMember } = useTeam();
  const { user } = useAuth();
  const { success, error, info } = useToast();

  const activeSenderEmail = (activeMember?.email || user?.email || '').trim();
  const activeSenderName  = (activeMember?.name  || user?.user_metadata?.full_name || 'Team Member').trim();
  const ownerEmail = activeSenderEmail || 'my-email@company.com';

  // Form state
  const [recipientEmail, setRecipientEmail] = useState('');
  const [subject, setSubject]               = useState('');
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [isAiGenerated, setIsAiGenerated]   = useState(false);
  const [interactions, setInteractions]     = useState<Interaction[]>([]);
  const [pastEmails, setPastEmails]         = useState<EmailRecord[]>([]);
  const [isSending, setIsSending]           = useState(false);
  const [sandboxError, setSandboxError]     = useState<string | null>(null);

  // Toolbar popovers
  const [showEmojiPicker, setShowEmojiPicker]   = useState(false);
  const [showFontSizeMenu, setShowFontSizeMenu] = useState(false);

  // Insert-link popover state
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkUrl, setLinkUrl]                 = useState('https://');
  const [linkText, setLinkText]               = useState('');
  const [savedRange, setSavedRange]           = useState<Range | null>(null);

  // Schedule-send state
  const [showScheduleMenu, setShowScheduleMenu]   = useState(false);
  const [scheduledTime, setScheduledTime]         = useState<Date | null>(null);
  const [showCustomDateTime, setShowCustomDateTime] = useState(false);
  const [customDateTimeValue, setCustomDateTimeValue] = useState('');

  // Attachments
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);

  // Draft
  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(undefined);
  const [draftSavedAt, setDraftSavedAt]     = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft]   = useState(false);

  // Active template
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  // Refs
  const editorRef      = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const emojiRef       = useRef<HTMLDivElement>(null);
  const fontSizeRef    = useRef<HTMLDivElement>(null);
  const linkRef        = useRef<HTMLDivElement>(null);
  const scheduleRef    = useRef<HTMLDivElement>(null);
  const hasSentRef     = useRef(false);

  const getEditorContent = () => editorRef.current?.innerHTML || '';
  const getEditorText    = () => editorRef.current?.innerText  || '';

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !contact) return;
    hasSentRef.current = false;
    setActiveTemplateId(null);
    setScheduledTime(null);
    setShowScheduleMenu(false);
    setShowLinkPopover(false);

    if (resumeDraft) {
      setRecipientEmail(resumeDraft.recipient_email || contact.email || '');
      setSubject(resumeDraft.subject || '');
      if (editorRef.current) editorRef.current.innerHTML = resumeDraft.body || '';
      setAttachments(resumeDraft.attachments || []);
      setCurrentDraftId(resumeDraft.id);
      setDraftSavedAt(resumeDraft.saved_at);
      setIsAiGenerated(resumeDraft.ai_generated || false);
    } else {
      setRecipientEmail(contact.email || '');
      setSubject(initialSubject || '');
      if (editorRef.current) {
        editorRef.current.innerHTML = initialBody ? initialBody.replace(/\n/g, '<br>') : '';
      }
      setAttachments([]);
      setCurrentDraftId(undefined);
      setDraftSavedAt(null);
      setIsAiGenerated(false);
    }

    setSandboxError(null);
    db.getInteractions(contact.id).then(setInteractions);
    db.getEmails(contact.id).then((emails) => setPastEmails(emails || []));
  }, [isOpen, contact, activeMember, initialSubject, initialBody, resumeDraft]);

  // ── Close all popovers on outside click ────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiRef.current    && !emojiRef.current.contains(e.target as Node))    setShowEmojiPicker(false);
      if (fontSizeRef.current && !fontSizeRef.current.contains(e.target as Node)) setShowFontSizeMenu(false);
      if (linkRef.current     && !linkRef.current.contains(e.target as Node))     setShowLinkPopover(false);
      if (scheduleRef.current && !scheduleRef.current.contains(e.target as Node)) setShowScheduleMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Rich text commands ──────────────────────────────────────────────────────
  const { formatState, refreshFormatState } = useEditorFormatState(editorRef);

  const execFormat = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
    refreshFormatState();
  };

  const insertEmoji = (emoji: string) => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, emoji);
    setShowEmojiPicker(false);
  };

  const applyFontSize = (px: string) => {
    editorRef.current?.focus();
    document.execCommand('fontSize', false, '7');
    editorRef.current?.querySelectorAll('font[size="7"]').forEach((el) => {
      (el as HTMLElement).removeAttribute('size');
      (el as HTMLElement).style.fontSize = px;
    });
    setShowFontSizeMenu(false);
  };

  // ── Insert Link ─────────────────────────────────────────────────────────────
  const openLinkPopover = () => {
    // Save current selection so we can restore it when inserting
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      setSavedRange(sel.getRangeAt(0).cloneRange());
      const selectedText = sel.toString();
      if (selectedText) setLinkText(selectedText);
    } else {
      setSavedRange(null);
    }
    setLinkUrl('https://');
    setShowLinkPopover(true);
  };

  const insertLink = () => {
    if (!linkUrl || linkUrl === 'https://') { error('URL required', 'Please enter a valid URL.'); return; }

    editorRef.current?.focus();

    // Restore saved selection
    if (savedRange) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange);
    }

    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;

    // If user provided custom link text (or no selection), insert text first then wrap
    const sel = window.getSelection();
    const hasSelection = sel && !sel.isCollapsed;

    if (!hasSelection && linkText.trim()) {
      document.execCommand('insertHTML', false,
        `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;text-decoration:underline;">${linkText}</a>`
      );
    } else {
      document.execCommand('createLink', false, url);
      // Style the newly created link
      editorRef.current?.querySelectorAll(`a[href="${url}"]`).forEach((el) => {
        (el as HTMLElement).setAttribute('target', '_blank');
        (el as HTMLElement).setAttribute('rel', 'noopener noreferrer');
        (el as HTMLElement).style.color = '#4f46e5';
        (el as HTMLElement).style.textDecoration = 'underline';
      });
    }

    setShowLinkPopover(false);
    setLinkUrl('https://');
    setLinkText('');
    setSavedRange(null);
  };

  // ── AI draft ────────────────────────────────────────────────────────────────
  const handleDraftGenerated = (draft: { subject: string; body: string }) => {
    setSubject(draft.subject);
    if (editorRef.current) editorRef.current.innerHTML = draft.body.replace(/\n/g, '<br>');
    setIsAiGenerated(true);
    setActiveTemplateId(null);
    scheduleAutoSave();
  };

  // ── Template chips ──────────────────────────────────────────────────────────
  const applyTemplateChip = (chip: TemplateChip) => {
    setSubject(chip.getSubject(contact));
    const body = chip.getBody(contact, activeSenderName);
    if (editorRef.current) editorRef.current.innerHTML = body.replace(/\n/g, '<br>');
    setActiveTemplateId(chip.id);
    setIsAiGenerated(false);
    editorRef.current?.focus();
    scheduleAutoSave();
  };

  // ── File attachments ────────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) { error('File too large', `${file.name} exceeds 5 MB.`); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachments((p) => [...p, { name: file.name, size: file.size, type: file.type, dataUrl: ev.target?.result as string }]);
        scheduleAutoSave();
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // ── Schedule helpers ────────────────────────────────────────────────────────
  const applyPreset = (preset: typeof SCHEDULE_PRESETS[0]) => {
    setScheduledTime(preset.getDate());
    setShowScheduleMenu(false);
    setShowCustomDateTime(false);
    info('Scheduled', `Email will be sent ${preset.label.toLowerCase()}.`);
  };

  const applyCustomDateTime = () => {
    if (!customDateTimeValue) { error('No date set', 'Please pick a date and time.'); return; }
    const d = new Date(customDateTimeValue);
    if (d <= new Date()) { error('Invalid time', 'Please choose a future date and time.'); return; }
    setScheduledTime(d);
    setShowScheduleMenu(false);
    setShowCustomDateTime(false);
    info('Scheduled', `Email scheduled for ${d.toLocaleString()}.`);
  };

  const clearSchedule = () => {
    setScheduledTime(null);
    setShowScheduleMenu(false);
  };

  // ── Auto-save & Draft management ───────────────────────────────────────────
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDraft = useCallback(async (silent = false) => {
    if (!isOpen || hasSentRef.current) return;
    const body      = getEditorContent();
    const rawText   = getEditorText().trim();
    const subjectV  = subject.trim();
    const recipient = recipientEmail.trim();

    // Check if the email is completely empty (no text, no subject, no recipient, no attachments)
    const isEmpty = !rawText && !subjectV && !recipient && attachments.length === 0;

    if (isEmpty) {
      // If user had a saved draft and has now cleared/removed everything, delete it from the database!
      if (currentDraftId) {
        try {
          await db.deleteDraft(currentDraftId);
          setCurrentDraftId(undefined);
          setDraftSavedAt(null);
          onDraftSaved?.();
        } catch (e) {
          console.error('Error removing empty draft', e);
        }
      }
      return;
    }

    setIsSavingDraft(true);
    try {
      const saved = await db.saveDraft({
        id: currentDraftId,
        contact_id: contact.id,
        recipient_email: recipient,
        subject: subjectV,
        body,
        ai_generated: isAiGenerated,
        sender_email: activeSenderEmail || null,
        attachments,
      });
      setCurrentDraftId(saved.id);
      setDraftSavedAt(saved.saved_at);
      if (!silent) info('Draft saved', 'Your email has been saved to Drafts.');
      onDraftSaved?.();
    } catch {
      if (!silent) error('Save failed', 'Could not save the draft.');
    } finally {
      setIsSavingDraft(false);
    }
  }, [isOpen, subject, recipientEmail, currentDraftId, contact.id, isAiGenerated, activeSenderEmail, attachments, onDraftSaved]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveDraft(true);
    }, 750);
  }, [saveDraft]);

  // Clean up auto-save timer
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const handleClose = useCallback(async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (!hasSentRef.current) await saveDraft(true);
    onClose();
  }, [saveDraft, onClose]);

  const handleDiscardDraft = async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    hasSentRef.current = true;
    if (currentDraftId) {
      await db.deleteDraft(currentDraftId);
      setCurrentDraftId(undefined);
      setDraftSavedAt(null);
    }
    onDraftSaved?.();
    success('Draft Discarded', 'The draft was removed.');
    onClose();
  };

  // ── Send (immediate or scheduled) ──────────────────────────────────────────
  const executeSend = async (logOnly = false, overrideEmail?: string) => {
    const targetEmail = (overrideEmail || recipientEmail).trim();
    const bodyContent = getEditorContent().trim();
    const bodyText    = getEditorText().trim();
    if (!targetEmail || !subject.trim() || !bodyText) {
      error('Missing information', 'Recipient email, subject, and body are required.');
      return;
    }

    // If there's a scheduled time, save as a draft with schedule metadata and show confirmation
    if (scheduledTime && !logOnly) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      await saveDraft(true);
      hasSentRef.current = true;
      success(
        'Email Scheduled! 📅',
        `Will send to ${targetEmail} on ${scheduledTime.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`
      );
      if (onDraftSaved) onDraftSaved();
      onClose();
      return;
    }

    setIsSending(true);
    setSandboxError(null);
    try {
      const result = await sendEmailDirectly({
        contactId: contact.id,
        recipientEmail: targetEmail,
        recipientName: contact.name,
        subject: subject.trim(),
        body: bodyContent,
        senderId: activeMember?.id,
        senderName: activeSenderName,
        senderEmail: activeSenderEmail,
        aiGenerated: isAiGenerated,
        logOnly,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      hasSentRef.current = true;
      if (currentDraftId) {
        await db.deleteDraft(currentDraftId);
        setCurrentDraftId(undefined);
        setDraftSavedAt(null);
      }
      success('Email Sent!', result.message);
      onDraftSaved?.();
      if (onEmailSent) onEmailSent();
      onClose();
    } catch (err: any) {
      const msg = err.message || '';
      if (err.isSandboxRestricted || msg.includes('only send testing emails') || msg.includes('not verified') || msg.includes('resend.com/domains')) {
        setSandboxError(msg);
      } else {
        error('Failed to send email', msg);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = (e: React.FormEvent) => { e.preventDefault(); executeSend(false); };

  // Min datetime for the custom picker (now + 1 min)
  const minDateTime = (() => {
    const d = new Date(); d.setMinutes(d.getMinutes() + 1);
    return d.toISOString().slice(0, 16);
  })();

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="3xl"
      title={
        <div className="flex items-center justify-between w-full pr-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {resumeDraft ? 'Resume Draft — ' : 'Compose Email to '}{contact.name}
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                {contact.company?.name ? `${cleanCompanyName(contact.company.name)} · ` : ''}{contact.email || 'No email set'}
                {isSavingDraft ? (
                  <span className="text-amber-600 font-medium flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Saving draft…
                  </span>
                ) : draftSavedAt ? (
                  <span className="text-emerald-700 font-medium flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle className="w-3 h-3 text-emerald-600" /> Saved {new Date(draftSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                ) : null}
                {scheduledTime && (
                  <span className="text-indigo-600 font-semibold flex items-center gap-1">
                    · <AlarmClock className="w-3 h-3" /> Scheduled {scheduledTime.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                )}
              </p>
            </div>
          </div>
          <span className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {activeSenderEmail || 'Dynamic Sender'}
          </span>
        </div>
      }
    >
      <form onSubmit={handleSend} className="space-y-4">

        {/* Sandbox Warning */}
        {sandboxError && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2.5 text-xs text-amber-900 animate-in fade-in duration-200">
            <div className="flex items-start gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              {sandboxError.includes('not verified') ? 'Domain Verification Notice' : 'Resend Free Sandbox Limitation'}
            </div>
            <p className="text-[11px] leading-relaxed">
              {sandboxError.includes('not verified') ? sandboxError : `Resend free tier only allows delivery to your registered account email (${ownerEmail}).`}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200/60">
              <button type="button" onClick={() => { setRecipientEmail(ownerEmail); executeSend(false, ownerEmail); }}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition flex items-center gap-1">
                <Send className="w-3 h-3" /> Send test to {ownerEmail}
              </button>
              <button type="button" onClick={() => executeSend(true)}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-800 font-semibold text-xs transition">
                💾 Save to CRM anyway
              </button>
              <a href="https://resend.com/domains" target="_blank" rel="noreferrer"
                className="text-[11px] text-amber-900 hover:underline font-semibold flex items-center gap-1 ml-auto">
                Verify Custom Domain <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* Scheduled Send Banner */}
        {scheduledTime && (
          <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-indigo-800 font-semibold">
              <CalendarClock className="w-4 h-4 text-indigo-500" />
              Scheduled for: <span className="font-bold">{scheduledTime.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}</span>
            </div>
            <button type="button" onClick={clearSchedule}
              className="text-indigo-500 hover:text-red-500 transition font-semibold text-[11px] flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Cancel schedule
            </button>
          </div>
        )}

        {/* AI Assistant accordion */}
        <div className="border border-indigo-100 rounded-2xl overflow-hidden">
          <button type="button" onClick={() => setShowAIAssistant(!showAIAssistant)}
            className="w-full flex items-center justify-between p-3 bg-indigo-50/80 hover:bg-indigo-100/60 transition text-left">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              AI Draft Assistant
              {isAiGenerated && (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Applied
                </span>
              )}
            </div>
            {showAIAssistant ? <ChevronUp className="w-4 h-4 text-indigo-600" /> : <ChevronDown className="w-4 h-4 text-indigo-600" />}
          </button>
          {showAIAssistant && (
            <div className="p-3 bg-white border-t border-indigo-100">
              <AIDraftAssistant
                contact={contact}
                interactions={interactions}
                pastEmails={pastEmails}
                onDraftGenerated={handleDraftGenerated}
              />
            </div>
          )}
        </div>

        {/* Prior communications */}
        {interactions.length > 0 && (
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/60">
            <div className="p-2.5 px-3 flex items-center justify-between text-xs font-bold text-slate-700">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Prior Communications ({interactions.length} recorded)
              </div>
              <span className="text-[11px] text-slate-400 font-normal">
                Most recent on {new Date(interactions[0].created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="p-3 pt-0 max-h-32 overflow-y-auto space-y-2 border-t border-slate-200/60 bg-white">
              {interactions.slice(0, 4).map((item) => (
                <div key={item.id} className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1">
                    <span className="uppercase tracking-wider text-[10px] px-1.5 rounded bg-slate-200/80 text-slate-700">{item.type}</span>
                    <span className="text-slate-400">{item.creator?.name ? `by ${item.creator.name} · ` : ''}{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-slate-700 line-clamp-2 leading-relaxed whitespace-pre-wrap">{stripHtml(item.content)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sender banner */}
        <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">From:</span>
            <span className="font-semibold text-slate-800">{activeSenderName}</span>
            <span className="text-slate-500 font-mono text-[11px]">&lt;{activeSenderEmail || 'Configure in Settings'}&gt;</span>
          </div>
          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-medium">Dynamic Sender Active</span>
        </div>

        {/* Recipient */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-slate-700">Recipient Email *</label>
            <button type="button" onClick={() => { setRecipientEmail(ownerEmail); scheduleAutoSave(); }}
              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold">
              Test to my inbox ({ownerEmail})
            </button>
          </div>
          <Input type="email" placeholder="recipient@example.com" value={recipientEmail}
            onChange={(e) => { setRecipientEmail(e.target.value); setSandboxError(null); scheduleAutoSave(); }} required />
        </div>

        {/* Subject */}
        <Input label="Subject Line *" placeholder="Enter a subject..." value={subject}
          onChange={(e) => { setSubject(e.target.value); scheduleAutoSave(); }} required />

        {/* ── Message Body ── */}
        <div>
          {/* Label + template chips row */}
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
            <label className="block text-xs font-semibold text-slate-700">Message Body *</label>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-slate-500 font-medium">Insert template:</span>
              {TEMPLATE_CHIPS.map((chip) => {
                const isActive = activeTemplateId === chip.id;
                return (
                  <button key={chip.id} type="button" onClick={() => applyTemplateChip(chip)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all duration-150 ${
                      isActive ? chip.btnClass + ' ring-1 ring-offset-1 ring-current shadow-sm' : chip.btnClass
                    }`}>
                    <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] leading-none ${chip.iconBg} ${chip.iconColor}`}>
                      {chip.icon}
                    </span>
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Formatting toolbar ── */}
          <div className="flex items-center gap-0.5 px-2 py-1.5 bg-slate-50 border border-slate-200 border-b-0 rounded-t-xl flex-wrap">
            {/* Bold */}
            <button type="button" onMouseDown={(e) => { e.preventDefault(); execFormat('bold'); }}
              title="Bold (Ctrl+B)" aria-pressed={formatState.bold} className={toolbarToggleClass(formatState.bold)}>
              <Bold className="w-3.5 h-3.5" />
            </button>
            {/* Italic */}
            <button type="button" onMouseDown={(e) => { e.preventDefault(); execFormat('italic'); }}
              title="Italic (Ctrl+I)" aria-pressed={formatState.italic} className={toolbarToggleClass(formatState.italic)}>
              <Italic className="w-3.5 h-3.5" />
            </button>
            {/* Underline */}
            <button type="button" onMouseDown={(e) => { e.preventDefault(); execFormat('underline'); }}
              title="Underline (Ctrl+U)" aria-pressed={formatState.underline} className={toolbarToggleClass(formatState.underline)}>
              <Underline className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* Bullet list */}
            <button type="button" onMouseDown={(e) => { e.preventDefault(); execFormat('insertUnorderedList'); }}
              title="Bullet list" aria-pressed={formatState.list} className={toolbarToggleClass(formatState.list)}>
              <List className="w-3.5 h-3.5" />
            </button>

            {/* Font size */}
            <div className="relative" ref={fontSizeRef}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowFontSizeMenu(!showFontSizeMenu); }}
                className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-slate-600 transition flex items-center gap-0.5" title="Font size">
                <Type className="w-3.5 h-3.5" />
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
              {showFontSizeMenu && <FontSizeMenu onSelect={applyFontSize} />}
            </div>

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* ── Insert Link ── */}
            <div className="relative" ref={linkRef}>
              <button type="button"
                onMouseDown={(e) => { e.preventDefault(); openLinkPopover(); setShowLinkPopover(!showLinkPopover); }}
                title="Insert link"
                className={`p-1.5 rounded-lg hover:bg-white hover:shadow-sm transition flex items-center ${showLinkPopover ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600'}`}>
                <Link className="w-3.5 h-3.5" />
              </button>

              {/* Link popover */}
              {showLinkPopover && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-lg p-4 z-50 w-72 animate-in fade-in zoom-in-95 duration-150">
                  <p className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                    <Link className="w-3.5 h-3.5 text-indigo-500" /> Insert Link
                  </p>
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">URL *</label>
                      <input
                        type="url"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertLink(); } }}
                        placeholder="https://example.com"
                        autoFocus
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Link Text (optional)</label>
                      <input
                        type="text"
                        value={linkText}
                        onChange={(e) => setLinkText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertLink(); } }}
                        placeholder="Display text (uses selection if empty)"
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button type="button" onClick={insertLink}
                        className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5">
                        <Link className="w-3.5 h-3.5" /> Insert Link
                      </button>
                      <button type="button" onClick={() => setShowLinkPopover(false)}
                        className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold transition">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Emoji */}
            <div className="relative" ref={emojiRef}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowEmojiPicker(!showEmojiPicker); }}
                title="Emoji" className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-slate-600 transition">
                <Smile className="w-3.5 h-3.5" />
              </button>
              {showEmojiPicker && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-lg p-3 z-50 w-60">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Insert Emoji</p>
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJI_LIST.map((emoji, i) => (
                      <button key={i} type="button"
                        onMouseDown={(e) => { e.preventDefault(); insertEmoji(emoji); }}
                        className="text-lg hover:bg-slate-100 rounded-lg p-0.5 transition leading-tight">
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Attach */}
            <button type="button" onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
              title="Attach file (max 5 MB)" className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-slate-600 transition flex items-center gap-0.5">
              <Paperclip className="w-3.5 h-3.5" />
              {attachments.length > 0 && <span className="text-[10px] font-bold text-indigo-600">{attachments.length}</span>}
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
          </div>

          {/* Contenteditable editor — blank by default */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => scheduleAutoSave()}
            className="min-h-[200px] max-h-[320px] p-4 bg-white border border-slate-200 rounded-b-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 text-sm text-slate-800 leading-relaxed overflow-y-auto"
            data-placeholder="Write your email here, or pick a template above ↑"
          />

          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {attachments.map((att, idx) => (
                <div key={idx} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg">
                  <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="max-w-[140px] truncate">{att.name}</span>
                  <span className="text-slate-400 text-[10px]">({(att.size / 1024).toFixed(0)} KB)</span>
                  <button type="button" onClick={() => { setAttachments((p) => p.filter((_, i) => i !== idx)); scheduleAutoSave(); }}
                    className="ml-1 text-slate-400 hover:text-red-500 transition">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer actions ── */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-500 hidden sm:block">
              As: <strong className="text-slate-800 font-semibold">{activeSenderName}</strong>
            </div>
            <button type="button" onClick={() => saveDraft(false)} disabled={isSavingDraft}
              className="text-[11px] text-slate-500 hover:text-indigo-600 font-semibold flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-indigo-50 transition disabled:opacity-50">
              <FileEdit className="w-3.5 h-3.5" />
              {isSavingDraft ? 'Saving…' : 'Save Draft'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={handleDiscardDraft}
              className="text-xs text-slate-500 hover:text-red-600 font-semibold flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition">
              <Trash2 className="w-3.5 h-3.5" /> Discard
            </button>

            {/* Gmail quick-send */}
            <Button type="button" variant="secondary"
              onClick={async () => {
                const targetEmail = recipientEmail.trim();
                const bodyText    = getEditorText().trim();
                if (!targetEmail || !subject.trim() || !bodyText) {
                  error('Missing information', 'Fill in recipient, subject, and body first.');
                  return;
                }
                await executeSend(true);
                const userParam = activeSenderEmail ? `u/${encodeURIComponent(activeSenderEmail)}/` : '';
                window.open(
                  `https://mail.google.com/mail/${userParam}?view=cm&fs=1&to=${encodeURIComponent(targetEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`,
                  '_blank', 'noopener,noreferrer'
                );
                success('Opened in Gmail', `Under ${activeSenderEmail || 'your Google account'}`);
              }}
              className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200 font-semibold text-xs">
              ✉️ Send via Gmail
            </Button>

            {/* ── Gmail-style Send + Schedule split button ── */}
            <div className="flex items-stretch rounded-xl overflow-visible shadow-sm" ref={scheduleRef}>
              {/* Main Send / Schedule button */}
              <button
                type="submit"
                disabled={isSending}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold text-white transition rounded-l-xl disabled:opacity-60 ${
                  scheduledTime
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {isSending ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : scheduledTime ? (
                  <CalendarClock className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {isSending ? 'Sending…' : scheduledTime ? 'Schedule Send' : 'Send'}
              </button>

              {/* Divider */}
              <div className="w-px bg-indigo-500/50" />

              {/* Chevron dropdown trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowScheduleMenu(!showScheduleMenu)}
                  className="flex items-center justify-center px-2.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white transition rounded-r-xl h-full"
                  title="Schedule send"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showScheduleMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* Schedule dropdown */}
                {showScheduleMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-white border border-slate-200 rounded-2xl shadow-lg p-3 z-50 w-72 animate-in fade-in zoom-in-95 duration-150">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-slate-100">
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <CalendarClock className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">Schedule Send</p>
                        <p className="text-[10px] text-slate-400">Pick when to send this email</p>
                      </div>
                    </div>

                    {/* Presets */}
                    <div className="space-y-1 mb-2.5">
                      {SCHEDULE_PRESETS.map((preset) => (
                        <button key={preset.label} type="button" onClick={() => applyPreset(preset)}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-indigo-50 text-xs font-medium text-slate-700 hover:text-indigo-700 transition group">
                          <div className="flex items-center gap-2.5">
                            <AlarmClock className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition" />
                            <span>{preset.label}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 group-hover:text-indigo-400 font-normal">
                            {preset.getDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {' · '}{preset.getDate().toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Custom date/time */}
                    <div className="border-t border-slate-100 pt-2.5">
                      {!showCustomDateTime ? (
                        <button type="button" onClick={() => setShowCustomDateTime(true)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-xs font-medium text-slate-600 transition">
                          <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                          Pick a custom date & time…
                        </button>
                      ) : (
                        <div className="space-y-2 px-1">
                          <p className="text-[11px] font-semibold text-slate-600">Custom date & time:</p>
                          <input
                            type="datetime-local"
                            value={customDateTimeValue}
                            min={minDateTime}
                            onChange={(e) => setCustomDateTimeValue(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                          />
                          <div className="flex gap-2">
                            <button type="button" onClick={applyCustomDateTime}
                              className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition">
                              Confirm Schedule
                            </button>
                            <button type="button" onClick={() => setShowCustomDateTime(false)}
                              className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold transition">
                              Back
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Cancel schedule (if one is set) */}
                    {scheduledTime && (
                      <div className="border-t border-slate-100 pt-2.5 mt-2">
                        <button type="button" onClick={clearSchedule}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-red-50 text-xs font-medium text-red-500 transition">
                          <X className="w-3.5 h-3.5" /> Remove scheduled time
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Placeholder for empty contenteditable */}
      <style>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
          font-style: italic;
        }
        /* Tailwind preflight strips list styling; restore it inside the editor */
        [contenteditable][data-placeholder] ul { list-style: disc outside; padding-left: 1.5rem; margin: 0.25rem 0; }
        [contenteditable][data-placeholder] ol { list-style: decimal outside; padding-left: 1.5rem; margin: 0.25rem 0; }
        [contenteditable][data-placeholder] li { display: list-item; }
        [contenteditable][data-placeholder] a { color: #4f46e5; text-decoration: underline; }
      `}</style>
    </Modal>
  );
};
