import React, { useState, useEffect, useRef } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Contact } from '../../types/crm';
import {
  sendEmailDirectly,
  substituteMergeFields,
  resolveContactCompany,
} from '../../lib/emailService';
import { db, DraftAttachment } from '../../lib/supabase';
import { SCHEDULE_PRESETS } from './EmailComposerModal';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Mail,
  Send,
  AlarmClock,
  CalendarClock,
  Users,
  Eye,
  Variable,
  RotateCw,
  Zap,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Bot,
  Settings,
  ChevronDown,
  ChevronUp,
  Sliders,
  Cpu,
  Check,
  Building,
  Bold,
  Italic,
  Underline,
  List,
  Type,
  Paperclip,
  Smile,
  Link as LinkIcon,
  X,
} from 'lucide-react';
import {
  generateProfessionalBulkEmails,
  CampaignGoalKey,
  EmailTone,
  BulkEmailVariation,
} from '../../lib/aiBulkEmailGenerator';
import {
  AIProviderId,
  AI_PROVIDERS,
  getActiveAIProvider,
  getSelectedModel,
  getAIProviderKey,
} from '../../lib/aiConfig';
import { getCompanyServiceProfile, CompanyServiceProfile } from '../../lib/serviceProfile';
import { AISettingsModal } from './AISettingsModal';
import { useEditorFormatState, toolbarToggleClass } from './editorFormatting';
import { FontSizeMenu } from './FontSizeMenu';

export type BulkTemplateKey = 'agency_overflow' | 'capabilities' | 'followup' | 'scope' | 'intro';

interface BulkEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedContacts: Contact[];
  onComplete: () => void;
  initialTemplate?: BulkTemplateKey;
}

// ── Emoji list ────────────────────────────────────────────────────────────────
const EMOJI_LIST = [
  '😊','😃','👋','🤝','✅','🎯','🚀','💡','📧','📋','👀','🙏','💪','🔥','⚡',
  '📅','⏰','📈','💼','🏆','🌟','👍','❤️','🎉','✨','📝','💬','🔔','📌','🎓',
  '😄','🤩','🤔','💭','📊','💰','🌍','🔑','🎁','📱','💻','🖥️','🔧','⚙️',
];

const formatBodyForEditor = (text: string): string => {
  if (!text) return '';
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text.replace(/\n/g, '<br>');
};

const STATIC_TEMPLATES: Record<
  BulkTemplateKey,
  { label: string; icon: React.ReactNode; subject: string; body: string }
> = {
  agency_overflow: {
    label: 'Agency Overflow & CRO',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    subject: 'Specialist implementation capacity for {{company}}',
    body: `Hi {{first_name}},\n\nI’m reaching out because {{company}}’s Shopify Plus and commerce work appears to sit at the intersection of strategy, experience, and technical delivery. I wanted to ask whether your teams ever need additional specialist capacity for the implementation and experimentation layer of client work.\n\nIngversions Digital helps ecommerce teams execute Shopify CRO and A/B testing, conversion-focused theme and landing-page work, analytics QA, and storefront performance improvements. We can take an approved hypothesis or design direction, build the required change, verify tracking and cross-device behavior, and support the QA needed before launch.\n\nFor {{company}}, this could be useful as discreet overflow or a scoped delivery partner when internal teams are balancing larger commerce transformations. I’d be happy to share how we typically work alongside an existing agency team without interrupting its client relationship or process.\n\nWould a short conversation be relevant for your talent or delivery planning?\n\nBest regards,\nUday Raj\nIngversions Digital`,
  },
  capabilities: {
    label: 'Team Capabilities',
    icon: <Zap className="w-3.5 h-3.5" />,
    subject: 'Team Capabilities & Task Execution Details for {{company}}',
    body: `Hi {{first_name}},\n\nIf you are looking for a dedicated team to help you execute your tasks and ensure you hit your upcoming project deadlines on time, here are the core details of how we can support you:\n\n1. What We Handle:\n- End-to-end task execution and deliverable management\n- Rapid sprint turnaround to meet tight deadlines\n- Ongoing technical and operational workflow support\n\n2. How We Work:\n- Dedicated point of contact and daily/weekly progress updates\n- Transparent milestone tracking with zero bandwidth strain on your team\n- Flexible scoping based on your immediate priorities\n\nWould you be open to a quick 10-minute call this week to review your current tasks and see how we can assist?\n\nBest regards,\nUday Raj\nIngversions Digital`,
  },
  followup: {
    label: 'Generic Follow-up',
    icon: <RotateCw className="w-3.5 h-3.5" />,
    subject: 'Following up - {{company}}',
    body: `Hi {{first_name}},\n\nI hope you're having a productive week.\n\nI wanted to quickly follow up on my previous note and see if you had a chance to review it. We'd love to explore how we can support you and {{company}} in executing your upcoming initiatives and hitting your deadlines smoothly.\n\nDo you have 10-15 minutes for a brief call sometime this week?\n\nBest regards,\nUday Raj\nIngversions Digital`,
  },
  scope: {
    label: 'Scope & Plan',
    icon: <FileText className="w-3.5 h-3.5" />,
    subject: 'Project Scope & Execution Plan for {{company}}',
    body: `Hi {{first_name}},\n\nFollowing up on our recent conversation regarding your initiatives at {{company}}, here is a summary of the scope and deliverables we can handle for your team:\n\n• Objective: Accelerate project delivery and meet critical milestones.\n• Scope of Work: Complete execution of assigned tasks, QA review, and weekly delivery sprints.\n• Timeline: Ready to kick off immediately with dedicated allocation.\n\nPlease let me know if you would like any adjustments to this plan or if you have time for a brief sync tomorrow.\n\nBest regards,\nUday Raj\nIngversions Digital`,
  },
  intro: {
    label: 'Cold Introduction',
    icon: <Mail className="w-3.5 h-3.5" />,
    subject: 'Quick question regarding {{company}}',
    body: `Hi {{first_name}},\n\nI noticed the impressive work your team is doing at {{company}} and wanted to reach out directly.\n\nWe partner with high-velocity companies to streamline operations, eliminate bottleneck delays, and ensure every milestone ships reliably.\n\nWould you have 10 minutes to connect this Thursday or Friday?\n\nBest regards,\nUday Raj\nIngversions Digital`,
  },
};

/** Earliest pickable send time (now + 1 min) as a local datetime-local value. */
const minScheduleAt = () => {
  const d = new Date(Date.now() + 60_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export const BulkEmailModal: React.FC<BulkEmailModalProps> = ({
  isOpen,
  onClose,
  selectedContacts,
  onComplete,
  initialTemplate = 'agency_overflow',
}) => {
  const { activeMember } = useTeam();
  const { user } = useAuth();
  const { success, error, info } = useToast();

  const activeSenderEmail = (activeMember?.email || user?.email || '').trim();
  const activeSenderName = (activeMember?.name || user?.user_metadata?.full_name || 'Uday Raj').trim();

  // Core Template state
  const [activeTemplateKey, setActiveTemplateKey] = useState<BulkTemplateKey | 'ai_generated'>(initialTemplate);
  const [subjectTemplate, setSubjectTemplate] = useState(STATIC_TEMPLATES[initialTemplate].subject);
  const [bodyTemplate, setBodyTemplate] = useState(formatBodyForEditor(STATIC_TEMPLATES[initialTemplate].body));
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(0);
  // Schedule send (null = send now)
  const [scheduledTime, setScheduledTime] = useState<Date | null>(null);
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [customScheduleValue, setCustomScheduleValue] = useState('');
  const scheduleRef = useRef<HTMLDivElement>(null);

  // Rich Text Editor & Toolbar state
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const fontSizeRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLDivElement>(null);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFontSizeMenu, setShowFontSizeMenu] = useState(false);
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkText, setLinkText] = useState('');
  const [savedRange, setSavedRange] = useState<Range | null>(null);

  // Attachments state
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);

  // AI Bulk Generator Panel State
  const [showAIGenerator, setShowAIGenerator] = useState(true);
  const [campaignGoal, setCampaignGoal] = useState<CampaignGoalKey>('agency_overflow');
  const [tone, setTone] = useState<EmailTone>('professional');
  const [customInstructions, setCustomInstructions] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiVariations, setAiVariations] = useState<BulkEmailVariation[]>([]);
  const [selectedVariationIndex, setSelectedVariationIndex] = useState(0);
  const [isAISettingsOpen, setIsAISettingsOpen] = useState(false);

  // Active AI Provider info
  const [activeAIProvider, setActiveAIProviderState] = useState<AIProviderId>(getActiveAIProvider());
  const [activeAIModel, setActiveAIModelState] = useState(getSelectedModel(activeAIProvider));
  const [serviceProfile, setServiceProfile] = useState<CompanyServiceProfile>(getCompanyServiceProfile());

  // Reload AI config and service profile on open or custom event
  const refreshAIInfo = () => {
    const prov = getActiveAIProvider();
    setActiveAIProviderState(prov);
    setActiveAIModelState(getSelectedModel(prov));
    setServiceProfile(getCompanyServiceProfile());
  };

  useEffect(() => {
    if (isOpen) {
      refreshAIInfo();
      setSubjectTemplate(STATIC_TEMPLATES[initialTemplate].subject);
      const formatted = formatBodyForEditor(STATIC_TEMPLATES[initialTemplate].body);
      setBodyTemplate(formatted);
      if (editorRef.current) {
        editorRef.current.innerHTML = formatted;
      }
      setActiveTemplateKey(initialTemplate);
      setPreviewIndex(0);
      setProgress(0);
      setIsSending(false);
      setAiVariations([]);
      setAttachments([]);
      setShowEmojiPicker(false);
      setShowFontSizeMenu(false);
      setShowLinkPopover(false);
    }
  }, [isOpen, initialTemplate]);

  // Keep editorRef innerHTML in sync when bodyTemplate changes externally
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== bodyTemplate) {
      editorRef.current.innerHTML = bodyTemplate;
    }
  }, [bodyTemplate, isOpen]);

  // Close toolbar popovers on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmojiPicker(false);
      if (fontSizeRef.current && !fontSizeRef.current.contains(e.target as Node)) setShowFontSizeMenu(false);
      if (linkRef.current && !linkRef.current.contains(e.target as Node)) setShowLinkPopover(false);
      if (scheduleRef.current && !scheduleRef.current.contains(e.target as Node)) setShowScheduleMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handleAIChange = () => refreshAIInfo();
    window.addEventListener('crm_ai_config_updated', handleAIChange);
    window.addEventListener('crm_service_profile_updated', handleAIChange);
    return () => {
      window.removeEventListener('crm_ai_config_updated', handleAIChange);
      window.removeEventListener('crm_service_profile_updated', handleAIChange);
    };
  }, []);

  // ── Rich Text Formatting Helpers ───────────────────────────────────────────
  const { formatState, refreshFormatState } = useEditorFormatState(editorRef);

  const execFormat = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      editorRef.current.focus();
      setBodyTemplate(editorRef.current.innerHTML);
    }
    refreshFormatState();
  };

  const insertEmoji = (emoji: string) => {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand('insertText', false, emoji);
      setBodyTemplate(editorRef.current.innerHTML);
    }
    setShowEmojiPicker(false);
  };

  const applyFontSize = (px: string) => {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand('fontSize', false, '7');
      editorRef.current.querySelectorAll('font[size="7"]').forEach((el) => {
        (el as HTMLElement).removeAttribute('size');
        (el as HTMLElement).style.fontSize = px;
      });
      setBodyTemplate(editorRef.current.innerHTML);
    }
    setShowFontSizeMenu(false);
  };

  const openLinkPopover = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
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
    if (!linkUrl || linkUrl === 'https://') {
      error('URL required', 'Please enter a valid URL.');
      return;
    }

    editorRef.current?.focus();

    if (savedRange) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange);
    }

    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
    const sel = window.getSelection();
    const hasSelection = sel && !sel.isCollapsed;

    if (!hasSelection && linkText.trim()) {
      document.execCommand(
        'insertHTML',
        false,
        `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;text-decoration:underline;">${linkText}</a>`
      );
    } else {
      document.execCommand('createLink', false, url);
      editorRef.current?.querySelectorAll(`a[href="${url}"]`).forEach((el) => {
        (el as HTMLElement).setAttribute('target', '_blank');
        (el as HTMLElement).setAttribute('rel', 'noopener noreferrer');
        (el as HTMLElement).style.color = '#4f46e5';
        (el as HTMLElement).style.textDecoration = 'underline';
      });
    }

    if (editorRef.current) {
      setBodyTemplate(editorRef.current.innerHTML);
    }
    setShowLinkPopover(false);
    setLinkUrl('https://');
    setLinkText('');
    setSavedRange(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        error('File too large', `${file.name} exceeds 5 MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachments((p) => [
          ...p,
          {
            name: file.name,
            size: file.size,
            type: file.type,
            dataUrl: ev.target?.result as string,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const insertVariable = (tag: string) => {
    if (editorRef.current) {
      editorRef.current.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
        document.execCommand('insertText', false, tag);
      } else {
        editorRef.current.innerHTML = (editorRef.current.innerHTML ? editorRef.current.innerHTML + ' ' : '') + tag;
      }
      setBodyTemplate(editorRef.current.innerHTML);
    } else {
      setBodyTemplate((prev) => (prev ? prev + ' ' : '') + tag);
    }
  };

  const withAddress = selectedContacts.filter((c) => Boolean(c.email?.trim()));
  // An address that bounced before will bounce again and hurts sender reputation.
  const contactsWithEmail = withAddress.filter((c) => !c.tags?.includes('Bounced'));
  const contactsWithoutEmail = selectedContacts.length - withAddress.length;
  const bouncedCount = withAddress.length - contactsWithEmail.length;

  const previewContact = contactsWithEmail[previewIndex] || selectedContacts[0];
  const renderedSubject = previewContact
    ? substituteMergeFields(subjectTemplate, previewContact)
    : '';
  const renderedBody = previewContact
    ? substituteMergeFields(bodyTemplate, previewContact, true)
    : '';

  // Switch static template
  const handleSelectStaticTemplate = (key: BulkTemplateKey) => {
    setActiveTemplateKey(key);
    setSubjectTemplate(STATIC_TEMPLATES[key].subject);
    const formatted = formatBodyForEditor(STATIC_TEMPLATES[key].body);
    setBodyTemplate(formatted);
    if (editorRef.current) {
      editorRef.current.innerHTML = formatted;
    }
  };

  // Generate Professional Bulk Email with AI
  const handleGenerateAIEmails = async () => {
    setIsGeneratingAI(true);
    try {
      const result = await generateProfessionalBulkEmails({
        campaignGoal,
        tone,
        customInstructions: customInstructions.trim() || undefined,
        senderName: activeSenderName,
        senderTitle: serviceProfile.senderTitle,
        provider: activeAIProvider,
        model: activeAIModel,
        customProfile: serviceProfile,
      });

      if (result.variations.length > 0) {
        setAiVariations(result.variations);
        setSelectedVariationIndex(0);
        // Automatically apply the first generated variation
        const first = result.variations[0];
        setSubjectTemplate(first.subject);
        const formatted = formatBodyForEditor(first.body);
        setBodyTemplate(formatted);
        if (editorRef.current) {
          editorRef.current.innerHTML = formatted;
        }
        setActiveTemplateKey('ai_generated');

        success(
          'AI Campaign Ready!',
          `Generated 3 professional variations via ${result.providerUsed} (${result.latencyMs}ms)`
        );
      }
    } catch (err: any) {
      error('AI Generation Failed', err.message || 'Could not generate email campaign.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Select a specific generated variation
  const handleApplyVariation = (index: number) => {
    setSelectedVariationIndex(index);
    const variation = aiVariations[index];
    if (variation) {
      setSubjectTemplate(variation.subject);
      const formatted = formatBodyForEditor(variation.body);
      setBodyTemplate(formatted);
      if (editorRef.current) {
        editorRef.current.innerHTML = formatted;
      }
      setActiveTemplateKey('ai_generated');
      info('Variation Applied', `Loaded "${variation.title}" into campaign preview.`);
    }
  };

  // Save one scheduled draft per recipient; the scheduled-email runner (App.tsx) sends them when due.
  const scheduleBulk = async (when: Date) => {
    if (isNaN(when.getTime()) || when <= new Date()) {
      error('Invalid time', 'Please choose a future date and time.');
      return;
    }
    setIsSending(true);
    setProgress(0);
    const ids: string[] = [];
    for (let i = 0; i < contactsWithEmail.length; i++) {
      const contact = contactsWithEmail[i];
      const draft = await db.saveDraft({
        contact_id: contact.id,
        recipient_email: contact.email!,
        subject: substituteMergeFields(subjectTemplate, contact),
        body: substituteMergeFields(bodyTemplate, contact, true),
        ai_generated: activeTemplateKey === 'ai_generated',
        sender_email: activeSenderEmail || null,
        attachments,
        scheduled_at: when.toISOString(),
      });
      ids.push(draft.id);
      setProgress(Math.round(((i + 1) / contactsWithEmail.length) * 100));
    }

    // Drafts live in localStorage and saveDraft cannot report a full store, so confirm every one landed.
    const stored = new Set((await db.getDrafts()).map((d) => d.id));
    if (ids.some((id) => !stored.has(id))) {
      for (const id of ids) await db.deleteDraft(id);
      setIsSending(false);
      error(
        'Could not schedule',
        'Not enough browser storage for these emails (attachments are copied for each recipient). Remove attachments, choose fewer contacts, or send now.'
      );
      return;
    }

    setIsSending(false);
    success(
      'Bulk Emails Scheduled! 📅',
      `${ids.length} email${ids.length === 1 ? '' : 's'} will send on ${when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}. Keep the CRM open in a browser tab; if it is closed then, they send when you next open it.`
    );
    onComplete();
    onClose();
  };

  // Send Bulk Email batch
  const handleSendBulk = async () => {
    const rawBody = editorRef.current?.innerText.trim() || bodyTemplate.replace(/<[^>]*>/g, '').trim();
    if (!subjectTemplate.trim() || !rawBody) {
      error('Missing content', 'Subject and body templates are required.');
      return;
    }

    if (contactsWithEmail.length === 0) {
      error('No valid emails', 'None of the selected contacts have an email address.');
      return;
    }

    if (scheduledTime) {
      await scheduleBulk(scheduledTime);
      return;
    }

    setIsSending(true);
    setProgress(0);

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < contactsWithEmail.length; i++) {
      const contact = contactsWithEmail[i];
      const customSub = substituteMergeFields(subjectTemplate, contact);
      const customBody = substituteMergeFields(bodyTemplate, contact, true);

      try {
        await sendEmailDirectly({
          contactId: contact.id,
          recipientEmail: contact.email!,
          recipientName: contact.name,
          subject: customSub,
          body: customBody,
          senderEmail: activeSenderEmail || undefined,
          senderId: activeMember?.id,
          senderName: activeSenderName,
          aiGenerated: activeTemplateKey === 'ai_generated',
          attachments: attachments.length > 0 ? attachments : undefined,
        });
        sentCount++;
      } catch (err) {
        console.error('Failed sending to', contact.email, err);
        failedCount++;
      }

      setProgress(Math.round(((i + 1) / contactsWithEmail.length) * 100));
      // Stagger slightly for queue stability
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    setIsSending(false);

    if (sentCount > 0) {
      success(
        'Bulk Outreach Dispatched!',
        `Successfully delivered to ${sentCount} contact${sentCount === 1 ? '' : 's'}.${
          failedCount > 0 ? ` (${failedCount} failed)` : ''
        }`
      );
    } else {
      error('Dispatch Failed', 'Could not deliver messages to the selected contacts.');
    }

    onComplete();
    onClose();
  };

  const activeProviderMeta = AI_PROVIDERS[activeAIProvider];
  const hasActiveKey = Boolean(getAIProviderKey(activeAIProvider));

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="4xl"
        title={
          <div className="flex items-center justify-between gap-3 w-full sm:pr-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden sm:flex w-10 h-10 rounded-2xl bg-indigo-600 text-white items-center justify-center font-bold shadow-md shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-base font-bold text-slate-900">
                    Professional Bulk Outreach Generator
                  </h3>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                    {contactsWithEmail.length} Recipient{contactsWithEmail.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                  Write and dispatch high-converting bulk emails for {serviceProfile.companyName} with dynamic merge fields.
                </p>
              </div>
            </div>

            {/* Quick AI Configuration Button */}
            <button
              type="button"
              onClick={() => setIsAISettingsOpen(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100 text-xs font-bold transition cursor-pointer shrink-0"
              title="Configure AI API Keys & Company Services"
              aria-label="AI engine settings"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">AI Engine ({activeProviderMeta?.shortName})</span>
              <Settings className="w-3 h-3 text-indigo-400" />
            </button>
          </div>
        }
      >
        <div className="space-y-4 max-h-[78vh] overflow-y-auto pr-1">
          {/* AI Bulk Outreach Writer Banner & Controls */}
          <div className="rounded-2xl border border-indigo-200/90 bg-indigo-50/70 p-4 space-y-3.5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-2">
                    <span>AI Bulk Outreach Engine</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 font-semibold">
                      {activeProviderMeta?.shortName} • {activeAIModel}
                    </span>
                  </h4>
                  <p className="text-[11px] text-indigo-700">
                    Customized for <strong className="text-indigo-900">{serviceProfile.companyName}</strong> ({serviceProfile.services.length} services configured)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAISettingsOpen(true)}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                >
                  Manage API Keys
                </button>
                <button
                  type="button"
                  onClick={() => setShowAIGenerator(!showAIGenerator)}
                  className="p-1 rounded-lg text-indigo-600 hover:bg-indigo-100/60 transition cursor-pointer"
                  title={showAIGenerator ? 'Collapse AI Generator' : 'Expand AI Generator'}
                >
                  {showAIGenerator ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {showAIGenerator && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Campaign Objective */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Campaign Pitch Focus & Goal
                    </label>
                    <select
                      value={campaignGoal}
                      onChange={(e) => setCampaignGoal(e.target.value as any)}
                      className="w-full text-xs bg-white border border-indigo-200/80 rounded-xl px-2.5 py-2 text-slate-800 font-medium focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="agency_overflow">Discreet Agency Overflow & Capacity</option>
                      <option value="shopify_cro">Shopify CRO & Experimentation Layer</option>
                      <option value="capabilities">Team Capabilities & Task Execution</option>
                      <option value="deadlines">Helping Hit Upcoming Project Deadlines</option>
                      <option value="followup">Follow-up on Previous Note / Discussion</option>
                      <option value="intro">Cold Executive Introduction & Value Hook</option>
                      <option value="reengagement">Re-engagement & Delivery Acceleration</option>
                      <option value="custom">Custom Campaign Angle</option>
                    </select>
                  </div>

                  {/* Tone Selector */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Tone of Voice
                    </label>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value as any)}
                      className="w-full text-xs bg-white border border-indigo-200/80 rounded-xl px-2.5 py-2 text-slate-800 font-medium focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="professional">Professional & Authoritative</option>
                      <option value="persuasive">Persuasive & ROI-Driven</option>
                      <option value="concise">Concise & Minimalist (High Reply Rate)</option>
                      <option value="friendly">Warm & Relationship-Oriented</option>
                    </select>
                  </div>
                </div>

                {/* Custom Offer or Instructions */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Special Context or offer(Optional)
                  </label>
                  <input
                    type="text"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="e.g. Highlight senior React/Node engineers, offer 10% discount on first month sprint, mention mutual connection..."
                    className="w-full text-xs bg-white border border-indigo-200/80 rounded-xl px-3 py-1.5 text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5 min-w-0 max-w-full">
                    <span className="font-semibold text-slate-700 shrink-0">Services Highlighted:</span>
                    <span className="text-indigo-800 font-medium truncate max-w-sm min-w-0">
                      {serviceProfile.services.slice(0, 2).join(', ')}...
                    </span>
                  </div>

                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    isLoading={isGeneratingAI}
                    onClick={handleGenerateAIEmails}
                    leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                    className="bg-indigo-600 hover:bg-indigo-700 shadow-xs text-xs py-2 px-3.5"
                  >
                    Generate with AI ({activeProviderMeta?.shortName})
                  </Button>
                </div>

                {/* Generated AI Variations Cards */}
                {aiVariations.length > 0 && (
                  <div className="pt-2 border-t border-indigo-100/80 space-y-2">
                    <label className="block text-[11px] font-bold text-indigo-950 uppercase tracking-wider">
                      Generated Variations (Click to Apply to Campaign):
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {aiVariations.map((v, idx) => {
                        const isSelected = selectedVariationIndex === idx;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => handleApplyVariation(idx)}
                            className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs font-semibold'
                                : 'bg-white hover:bg-indigo-50/60 border-slate-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs font-bold mb-1">
                              <span className="truncate">{v.title}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <div
                              className={`text-[10px] line-clamp-2 leading-tight ${
                                isSelected ? 'text-indigo-100' : 'text-slate-500'
                              }`}
                            >
                              {v.pitchAngle}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Static Template Quick Switcher */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Standard Campaign Presets:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(STATIC_TEMPLATES) as BulkTemplateKey[]).map((key) => {
                const tmpl = STATIC_TEMPLATES[key];
                const isSelected = activeTemplateKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectStaticTemplate(key)}
                    className={`p-2 rounded-xl border text-left transition flex items-center gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-slate-100 border-slate-400 text-slate-900 shadow-2xs font-bold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <span className={isSelected ? 'text-indigo-600' : 'text-slate-400'}>
                      {tmpl.icon}
                    </span>
                    <span className="text-xs truncate">{tmpl.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Sender Identity Indicator */}
          <div className="flex flex-wrap items-center justify-between text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-500">Sender Identity:</span>
              <span className="font-bold text-slate-900">
                {activeSenderName} &lt;{activeSenderEmail || serviceProfile.senderEmail}&gt;
              </span>
            </div>
            <span className="text-[11px] text-indigo-700 bg-indigo-50 font-semibold px-2 py-0.5 rounded border border-indigo-200">
              {serviceProfile.companyName}
            </span>
          </div>

          {/* Warning if any contacts lack an email */}
          {contactsWithoutEmail > 0 && (
            <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>{contactsWithoutEmail}</strong> contact{contactsWithoutEmail === 1 ? '' : 's'} without an email address will be skipped.
              </span>
            </div>
          )}
          {bouncedCount > 0 && (
            <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>{bouncedCount}</strong> contact{bouncedCount === 1 ? '' : 's'} tagged <strong>Bounced</strong> will be skipped (their address rejected an earlier email).
              </span>
            </div>
          )}

          {/* Merge tag toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 p-2 bg-indigo-50/50 border border-indigo-100 rounded-xl text-xs">
            <span className="text-indigo-900 font-semibold flex items-center gap-1 mr-1">
              <Variable className="w-3.5 h-3.5 text-indigo-600" />
              Insert Merge Field:
            </span>
            {[
              '{{first_name}}',
              '{{company}}',
              '{{title}}',
              '{{name}}',
              '{{email}}',
            ].map((tag) => (
              <button
                key={tag}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertVariable(tag);
                }}
                className="px-2 py-0.5 rounded bg-white hover:bg-indigo-100 hover:text-indigo-700 text-slate-700 font-mono text-[11px] border border-indigo-200/60 transition cursor-pointer"
                title="Click to insert tag into message body at cursor"
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Subject Line Input */}
          <Input
            label="Subject Line Template *"
            value={subjectTemplate}
            onChange={(e) => setSubjectTemplate(e.target.value)}
            placeholder="e.g. Specialist implementation capacity for {{company}}"
            required
          />

          {/* ── Rich Text Email Body Template & Formatting Toolbar ── */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Email Body Template *
            </label>

            {/* Formatting toolbar */}
            <div className="flex items-center gap-0.5 px-2 py-1.5 bg-slate-50 border border-slate-200 border-b-0 rounded-t-xl flex-wrap">
              {/* Bold */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  execFormat('bold');
                }}
                title="Bold (Ctrl+B)"
                aria-pressed={formatState.bold}
                className={toolbarToggleClass(formatState.bold)}
              >
                <Bold className="w-3.5 h-3.5" />
              </button>

              {/* Italic */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  execFormat('italic');
                }}
                title="Italic (Ctrl+I)"
                aria-pressed={formatState.italic}
                className={toolbarToggleClass(formatState.italic)}
              >
                <Italic className="w-3.5 h-3.5" />
              </button>

              {/* Underline */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  execFormat('underline');
                }}
                title="Underline (Ctrl+U)"
                aria-pressed={formatState.underline}
                className={toolbarToggleClass(formatState.underline)}
              >
                <Underline className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-5 bg-slate-200 mx-0.5" />

              {/* Bullet list */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  execFormat('insertUnorderedList');
                }}
                title="Bullet list"
                aria-pressed={formatState.list}
                className={toolbarToggleClass(formatState.list)}
              >
                <List className="w-3.5 h-3.5" />
              </button>

              {/* Font size */}
              <div className="relative" ref={fontSizeRef}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowFontSizeMenu(!showFontSizeMenu);
                  }}
                  className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-slate-600 transition flex items-center gap-0.5 cursor-pointer"
                  title="Font size"
                >
                  <Type className="w-3.5 h-3.5" />
                  <ChevronDown className="w-2.5 h-2.5" />
                </button>
                {showFontSizeMenu && <FontSizeMenu onSelect={applyFontSize} />}
              </div>

              <div className="w-px h-5 bg-slate-200 mx-0.5" />

              {/* Insert Link */}
              <div className="relative" ref={linkRef}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (showLinkPopover) {
                      setShowLinkPopover(false);
                    } else {
                      openLinkPopover();
                    }
                  }}
                  title="Insert link"
                  className={`p-1.5 rounded-lg hover:bg-white hover:shadow-sm transition flex items-center cursor-pointer ${
                    showLinkPopover ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                </button>

                {showLinkPopover && (
                  <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-lg p-4 z-50 w-72 animate-in fade-in zoom-in-95 duration-150">
                    <p className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                      <LinkIcon className="w-3.5 h-3.5 text-indigo-500" /> Insert Link
                    </p>
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          URL *
                        </label>
                        <input
                          type="url"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              insertLink();
                            }
                          }}
                          placeholder="https://example.com"
                          autoFocus
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Link Text (optional)
                        </label>
                        <input
                          type="text"
                          value={linkText}
                          onChange={(e) => setLinkText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              insertLink();
                            }
                          }}
                          placeholder="Display text (uses selection if empty)"
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={insertLink}
                          className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <LinkIcon className="w-3.5 h-3.5" /> Insert Link
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowLinkPopover(false)}
                          className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Emoji Picker */}
              <div className="relative" ref={emojiRef}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowEmojiPicker(!showEmojiPicker);
                  }}
                  title="Emoji"
                  className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-slate-600 transition cursor-pointer"
                >
                  <Smile className="w-3.5 h-3.5" />
                </button>
                {showEmojiPicker && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-lg p-3 z-50 w-60">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Insert Emoji
                    </p>
                    <div className="grid grid-cols-8 gap-1">
                      {EMOJI_LIST.map((emoji, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertEmoji(emoji);
                          }}
                          className="text-lg hover:bg-slate-100 rounded-lg p-0.5 transition leading-tight cursor-pointer"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* File Attachment */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }}
                title="Attach file (max 5 MB)"
                className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm text-slate-600 transition flex items-center gap-0.5 cursor-pointer"
              >
                <Paperclip className="w-3.5 h-3.5" />
                {attachments.length > 0 && (
                  <span className="text-[10px] font-bold text-indigo-600">
                    {attachments.length}
                  </span>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {/* Contenteditable Rich Text Editor */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => setBodyTemplate(editorRef.current?.innerHTML || '')}
              className="min-h-[200px] max-h-[340px] p-4 bg-white border border-slate-200 rounded-b-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 text-sm text-slate-800 leading-relaxed overflow-y-auto"
              data-placeholder="Write your email body template here..."
            />

            {/* Attachment Chips */}
            {attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg"
                  >
                    <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="max-w-[140px] truncate">{att.name}</span>
                    <span className="text-slate-400 text-[10px]">
                      ({(att.size / 1024).toFixed(0)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachments((p) => p.filter((_, i) => i !== idx))}
                      className="ml-1 text-slate-400 hover:text-red-500 transition cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Preview Switcher */}
          {previewContact && (
            <div className="border border-slate-200 rounded-2xl p-3.5 bg-slate-50/80 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
                  <Eye className="w-3.5 h-3.5 text-indigo-600" />
                  Live Preview ({previewIndex + 1} of {contactsWithEmail.length}):{' '}
                  <span className="text-indigo-600 font-semibold">{previewContact.name}</span>
                  {resolveContactCompany(previewContact) && (
                    <span className="text-slate-400 font-normal">
                      ({resolveContactCompany(previewContact)})
                    </span>
                  )}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={previewIndex === 0}
                    onClick={() => setPreviewIndex((p) => Math.max(0, p - 1))}
                    className="px-2.5 py-0.5 text-xs bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 cursor-pointer font-medium"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={previewIndex >= contactsWithEmail.length - 1}
                    onClick={() =>
                      setPreviewIndex((p) =>
                        Math.min(contactsWithEmail.length - 1, p + 1)
                      )
                    }
                    className="px-2.5 py-0.5 text-xs bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 cursor-pointer font-medium"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs space-y-2 font-sans">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-slate-500 border-b border-slate-100 pb-1.5">
                  <div className="min-w-0 break-all">
                    <span className="font-semibold text-slate-600">To:</span>{' '}
                    <span className="text-slate-800">{previewContact.email || 'No email set'}</span>
                  </div>
                  <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 whitespace-nowrap">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Merge Fields Populated</span>
                  </div>
                </div>
                <div className="text-slate-800 font-bold">
                  <span className="text-slate-400 font-normal mr-1">Subject:</span>
                  {renderedSubject}
                </div>
                <div
                  className="email-preview pt-2 border-t border-slate-100 text-slate-700 leading-relaxed font-sans text-xs"
                  dangerouslySetInnerHTML={{
                    __html: /<[a-z][\s\S]*>/i.test(renderedBody)
                      ? renderedBody
                      : renderedBody.replace(/\n/g, '<br />'),
                  }}
                />

                {/* Preview attachments */}
                {attachments.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                      <Paperclip className="w-3 h-3 text-slate-400" />
                      Attachments ({attachments.length}):
                    </span>
                    {attachments.map((att, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-600 font-medium"
                      >
                        <Paperclip className="w-2.5 h-2.5 text-slate-400" />
                        {att.name} ({(att.size / 1024).toFixed(0)} KB)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sending Progress Bar */}
          {isSending && (
            <div className="space-y-1.5 p-3 rounded-2xl bg-indigo-50/60 border border-indigo-100">
              <div className="flex justify-between text-xs text-indigo-900 font-semibold">
                <span className="flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                  {scheduledTime ? 'Scheduling personalized bulk outreach...' : 'Dispatching personalized bulk outreach...'}
                </span>
                <span className="font-bold">{progress}%</span>
              </div>
              <div className="w-full h-2.5 bg-indigo-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Scheduled-send banner */}
          {scheduledTime && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">
              <span className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-indigo-600 shrink-0" aria-hidden="true" />
                <span>
                  Scheduled for{' '}
                  <strong>{scheduledTime.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong>
                </span>
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowScheduleMenu(true)}
                  disabled={isSending}
                  className="px-2.5 py-1 rounded-lg font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => setScheduledTime(null)}
                  disabled={isSending}
                  className="px-2.5 py-1 rounded-lg font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                >
                  Remove
                </button>
              </span>
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500 min-w-0">
              Sender: <strong className="text-slate-800">{activeSenderName} • {serviceProfile.companyName}</strong>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button type="button" variant="ghost" onClick={onClose} disabled={isSending}>
                Cancel
              </Button>

              {/* Send / Schedule split button */}
              <div className="relative flex items-stretch rounded-xl shadow-sm" ref={scheduleRef}>
                <button
                  type="button"
                  onClick={handleSendBulk}
                  disabled={isSending}
                  className="flex items-center gap-2 pl-4 pr-3.5 py-2 rounded-l-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition disabled:opacity-60"
                >
                  {isSending ? (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  ) : scheduledTime ? (
                    <CalendarClock className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Send className="w-4 h-4" aria-hidden="true" />
                  )}
                  {isSending
                    ? scheduledTime ? 'Scheduling…' : 'Sending…'
                    : `${scheduledTime ? 'Schedule' : 'Send to'} ${contactsWithEmail.length} Contact${contactsWithEmail.length === 1 ? '' : 's'}`}
                </button>
                <div className="w-px bg-indigo-500/60" />
                <button
                  type="button"
                  onClick={() => setShowScheduleMenu((v) => !v)}
                  disabled={isSending}
                  aria-label="Schedule send"
                  aria-haspopup="menu"
                  aria-expanded={showScheduleMenu}
                  title="Schedule send"
                  className="flex items-center justify-center px-2.5 rounded-r-xl bg-indigo-600 hover:bg-indigo-700 text-white transition disabled:opacity-60"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showScheduleMenu ? 'rotate-180' : ''}`} />
                </button>

                {showScheduleMenu && (
                  <div
                    role="menu"
                    className="absolute bottom-full right-0 mb-2 w-72 max-w-[calc(100vw-2.5rem)] bg-white border border-slate-200 rounded-2xl shadow-lg p-3 z-50"
                  >
                    <div className="flex items-center gap-2 mb-2.5 pb-2.5 border-b border-slate-100">
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <CalendarClock className="w-4 h-4 text-indigo-600" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">Schedule bulk send</p>
                        <p className="text-[11px] text-slate-500">Every recipient gets their email at this time</p>
                      </div>
                    </div>

                    <div className="space-y-0.5 mb-2.5">
                      {SCHEDULE_PRESETS.filter((p) => p.getDate() > new Date()).map((preset) => {
                        const d = preset.getDate();
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            role="menuitem"
                            onClick={() => { setScheduledTime(d); setShowScheduleMenu(false); }}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-indigo-50 text-xs font-medium text-slate-700 hover:text-indigo-700 transition group"
                          >
                            <span className="flex items-center gap-2.5">
                              <AlarmClock className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500" aria-hidden="true" />
                              {preset.label}
                            </span>
                            <span className="text-[11px] text-slate-400 group-hover:text-indigo-500">
                              {d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })},{' '}
                              {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="border-t border-slate-100 pt-2.5 space-y-2">
                      <label className="block text-[11px] font-semibold text-slate-600 px-1" htmlFor="bulk-schedule-custom">
                        Custom date & time
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="bulk-schedule-custom"
                          type="datetime-local"
                          value={customScheduleValue}
                          min={minScheduleAt()}
                          onChange={(e) => setCustomScheduleValue(e.target.value)}
                          className="min-w-0 flex-1 px-2.5 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <button
                          type="button"
                          disabled={!customScheduleValue}
                          onClick={() => {
                            const d = new Date(customScheduleValue);
                            if (isNaN(d.getTime()) || d <= new Date()) {
                              error('Invalid time', 'Please choose a future date and time.');
                              return;
                            }
                            setScheduledTime(d);
                            setShowScheduleMenu(false);
                          }}
                          className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition disabled:opacity-40"
                        >
                          Set
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Placeholder styling for contenteditable */}
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
          /* Preview mirrors how mail clients render lists (Tailwind preflight strips them) */
          .email-preview ul { list-style: disc outside; padding-left: 1.5rem; margin: 0.75rem 0; }
          .email-preview ol { list-style: decimal outside; padding-left: 1.5rem; margin: 0.75rem 0; }
          .email-preview li { display: list-item; }
          .email-preview a { color: #4f46e5; text-decoration: underline; }
        `}</style>
      </Modal>

      {/* Embedded AI Settings & Key Manager Modal */}
      <AISettingsModal
        isOpen={isAISettingsOpen}
        onClose={() => {
          setIsAISettingsOpen(false);
          refreshAIInfo();
        }}
      />
    </>
  );
};
