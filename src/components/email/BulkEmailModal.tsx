import React, { useState, useEffect } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Contact } from '../../types/crm';
import {
  sendEmailDirectly,
  substituteMergeFields,
  resolveContactCompany,
} from '../../lib/emailService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import {
  Mail,
  Send,
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

export type BulkTemplateKey = 'agency_overflow' | 'capabilities' | 'followup' | 'scope' | 'intro';

interface BulkEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedContacts: Contact[];
  onComplete: () => void;
  initialTemplate?: BulkTemplateKey;
}

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
  const [bodyTemplate, setBodyTemplate] = useState(STATIC_TEMPLATES[initialTemplate].body);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(0);

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
      setBodyTemplate(STATIC_TEMPLATES[initialTemplate].body);
      setActiveTemplateKey(initialTemplate);
      setPreviewIndex(0);
      setProgress(0);
      setIsSending(false);
      setAiVariations([]);
    }
  }, [isOpen, initialTemplate]);

  useEffect(() => {
    const handleAIChange = () => refreshAIInfo();
    window.addEventListener('crm_ai_config_updated', handleAIChange);
    window.addEventListener('crm_service_profile_updated', handleAIChange);
    return () => {
      window.removeEventListener('crm_ai_config_updated', handleAIChange);
      window.removeEventListener('crm_service_profile_updated', handleAIChange);
    };
  }, []);

  const contactsWithEmail = selectedContacts.filter((c) => Boolean(c.email?.trim()));
  const contactsWithoutEmail = selectedContacts.length - contactsWithEmail.length;

  const previewContact = contactsWithEmail[previewIndex] || selectedContacts[0];
  const renderedSubject = previewContact
    ? substituteMergeFields(subjectTemplate, previewContact)
    : '';
  const renderedBody = previewContact
    ? substituteMergeFields(bodyTemplate, previewContact)
    : '';

  // Switch static template
  const handleSelectStaticTemplate = (key: BulkTemplateKey) => {
    setActiveTemplateKey(key);
    setSubjectTemplate(STATIC_TEMPLATES[key].subject);
    setBodyTemplate(STATIC_TEMPLATES[key].body);
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
        setBodyTemplate(first.body);
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
      setBodyTemplate(variation.body);
      setActiveTemplateKey('ai_generated');
      info('Variation Applied', `Loaded "${variation.title}" into campaign preview.`);
    }
  };

  // Send Bulk Email batch
  const handleSendBulk = async () => {
    if (!subjectTemplate.trim() || !bodyTemplate.trim()) {
      error('Missing content', 'Subject and body templates are required.');
      return;
    }

    if (contactsWithEmail.length === 0) {
      error('No valid emails', 'None of the selected contacts have an email address.');
      return;
    }

    setIsSending(true);
    setProgress(0);

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < contactsWithEmail.length; i++) {
      const contact = contactsWithEmail[i];
      const customSub = substituteMergeFields(subjectTemplate, contact);
      const customBody = substituteMergeFields(bodyTemplate, contact);

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

  const insertVariable = (tag: string) => {
    setBodyTemplate((prev) => prev + ` ${tag}`);
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
          <div className="flex items-center justify-between w-full pr-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    Professional Bulk Outreach Generator
                  </h3>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {contactsWithEmail.length} Recipient{contactsWithEmail.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Write and dispatch high-converting bulk emails for {serviceProfile.companyName} with dynamic merge fields.
                </p>
              </div>
            </div>

            {/* Quick AI Configuration Button */}
            <button
              type="button"
              onClick={() => setIsAISettingsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100 text-xs font-bold transition cursor-pointer"
              title="Configure AI API Keys & Company Services"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-600" />
              <span>AI Engine ({activeProviderMeta?.shortName})</span>
              <Settings className="w-3 h-3 text-indigo-400" />
            </button>
          </div>
        }
      >
        <div className="space-y-4 max-h-[78vh] overflow-y-auto pr-1">
          {/* AI Bulk Outreach Writer Banner & Controls */}
          <div className="rounded-2xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-slate-50 p-4 space-y-3.5 shadow-2xs">
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
                      className="w-full text-xs bg-white border border-indigo-200/80 rounded-xl px-2.5 py-2 text-slate-800 font-medium focus:ring-1 focus:ring-indigo-500 shadow-2xs"
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
                      className="w-full text-xs bg-white border border-indigo-200/80 rounded-xl px-2.5 py-2 text-slate-800 font-medium focus:ring-1 focus:ring-indigo-500 shadow-2xs"
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
                    Special Focus or Offer (Optional)
                  </label>
                  <input
                    type="text"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="e.g. Highlight senior React/Node engineers, offer 10% discount on first month sprint, mention mutual connection..."
                    className="w-full text-xs bg-white border border-indigo-200/80 rounded-xl px-3 py-1.5 text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <span className="font-semibold text-slate-700">Services Highlighted:</span>
                    <span className="text-indigo-800 font-medium truncate max-w-sm">
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
                onClick={() => insertVariable(tag)}
                className="px-2 py-0.5 rounded bg-white hover:bg-indigo-100 hover:text-indigo-700 text-slate-700 font-mono text-[11px] border border-indigo-200/60 transition cursor-pointer"
                title="Click to insert tag into message body"
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Subject & Body Inputs */}
          <div className="space-y-3">
            <Input
              label="Subject Line Template *"
              value={subjectTemplate}
              onChange={(e) => setSubjectTemplate(e.target.value)}
              placeholder="e.g. Helping {{company}} hit upcoming project deadlines"
              required
            />

            <Textarea
              label="Email Body Template *"
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              rows={9}
              className="font-normal text-slate-800 leading-relaxed font-sans"
              required
            />
          </div>

          {/* Live Preview Switcher */}
          {previewContact && (
            <div className="border border-slate-200 rounded-2xl p-3.5 bg-slate-50/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-indigo-600" />
                  Live Preview ({previewIndex + 1} of {contactsWithEmail.length}):{' '}
                  <span className="text-indigo-600 font-extrabold">{previewContact.name}</span>
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

              <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 text-xs space-y-2 font-sans shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 border-b border-slate-100 pb-1.5">
                  <div>
                    <span className="font-semibold text-slate-600">To:</span>{' '}
                    <span className="text-slate-800">{previewContact.email || 'No email set'}</span>
                  </div>
                  <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Merge Fields Populated</span>
                  </div>
                </div>
                <div className="text-slate-800 font-bold">
                  <span className="text-slate-400 font-normal mr-1">Subject:</span>
                  {renderedSubject}
                </div>
                <div className="pt-2 border-t border-slate-100 whitespace-pre-wrap text-slate-700 leading-relaxed font-sans">
                  {renderedBody}
                </div>
              </div>
            </div>
          )}

          {/* Sending Progress Bar */}
          {isSending && (
            <div className="space-y-1.5 p-3 rounded-2xl bg-indigo-50/60 border border-indigo-100">
              <div className="flex justify-between text-xs text-indigo-900 font-semibold">
                <span className="flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                  Dispatching personalized bulk outreach...
                </span>
                <span className="font-bold">{progress}%</span>
              </div>
              <div className="w-full h-2.5 bg-indigo-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-600 to-emerald-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              Sender: <strong className="text-slate-800">{activeSenderName} • {serviceProfile.companyName}</strong>
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={isSending}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                isLoading={isSending}
                leftIcon={<Send className="w-4 h-4" />}
                onClick={handleSendBulk}
                className="bg-indigo-600 hover:bg-indigo-700 shadow-sm"
              >
                Send to {contactsWithEmail.length} Contact{contactsWithEmail.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </div>
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
