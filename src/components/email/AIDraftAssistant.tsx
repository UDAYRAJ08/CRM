import React, { useState, useEffect, useMemo } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Contact, Interaction, EmailRecord } from '../../types/crm';
import { generateAIEmailDraft, buildConversationHistory } from '../../lib/aiService';
import { db } from '../../lib/supabase';
import { Button } from '../ui/Button';
import {
  Sparkles,
  Wand2,
  Settings,
  History,
  MessagesSquare,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CornerDownRight,
  MailCheck,
  Inbox,
  FileText,
} from 'lucide-react';
import {
  AIProviderId,
  AI_PROVIDERS,
  AI_PROVIDER_ORDER,
  getActiveAIProvider,
  getAIProviderKey,
  getSelectedModel,
} from '../../lib/aiConfig';
import { AISettingsModal } from './AISettingsModal';

interface AIDraftAssistantProps {
  contact: Contact;
  interactions: Interaction[];
  pastEmails?: EmailRecord[];
  onDraftGenerated: (draft: { subject: string; body: string }) => void;
}

export const AIDraftAssistant: React.FC<AIDraftAssistantProps> = ({
  contact,
  interactions,
  pastEmails,
  onDraftGenerated,
}) => {
  const { activeMember } = useTeam();
  const { success, error } = useToast();

  const [provider, setProvider] = useState<AIProviderId>(getActiveAIProvider());
  const [goal, setGoal] = useState('agency_overflow');
  const [tone, setTone] = useState<'professional' | 'friendly' | 'concise' | 'persuasive'>('professional');
  const [customInstructions, setCustomInstructions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAISettingsOpen, setIsAISettingsOpen] = useState(false);

  // Past conversation state
  const [loadedEmails, setLoadedEmails] = useState<EmailRecord[]>(pastEmails || []);
  const [readConversation, setReadConversation] = useState<boolean>(true);
  const [showThreadPreview, setShowThreadPreview] = useState<boolean>(false);

  useEffect(() => {
    setProvider(getActiveAIProvider());
    const handleUpdate = () => setProvider(getActiveAIProvider());
    window.addEventListener('crm_ai_config_updated', handleUpdate);
    return () => window.removeEventListener('crm_ai_config_updated', handleUpdate);
  }, []);

  // Sync or fetch past emails for the active contact
  useEffect(() => {
    if (pastEmails && pastEmails.length > 0) {
      setLoadedEmails(pastEmails);
    } else if (contact?.id) {
      db.getEmails(contact.id)
        .then((fetched) => setLoadedEmails(fetched || []))
        .catch(() => setLoadedEmails([]));
    }
  }, [contact?.id, pastEmails]);

  // Synthesize unified chronological conversation history
  const conversation = useMemo(() => {
    return buildConversationHistory(loadedEmails, interactions, contact?.name || 'Lead');
  }, [loadedEmails, interactions, contact?.name]);

  const inboundCount = useMemo(() => {
    return conversation.filter((m) => m.direction === 'inbound').length;
  }, [conversation]);

  const outboundCount = useMemo(() => {
    return conversation.filter((m) => m.direction === 'outbound').length;
  }, [conversation]);

  const goalOptions = [
    { value: 'agency_overflow', label: 'Discreet Agency Overflow & Capacity' },
    { value: 'shopify_cro', label: 'Shopify CRO & Experimentation Layer' },
    { value: 'send_details', label: 'Send Team Capabilities & Task Details' },
    { value: 'meeting_request', label: 'Schedule Demo / Meeting' },
    { value: 'proposal_followup', label: 'Follow up on Proposal' },
    { value: 'cold_intro', label: 'Cold Introduction' },
    { value: 'general_checkin', label: 'General Check-in' },
  ];

  const toneOptions: Array<{ value: 'professional' | 'friendly' | 'concise' | 'persuasive'; label: string }> = [
    { value: 'professional', label: 'Professional' },
    { value: 'friendly', label: 'Warm & Friendly' },
    { value: 'concise', label: 'Short & Punchy' },
    { value: 'persuasive', label: 'Value-Focused' },
  ];

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const draft = await generateAIEmailDraft({
        contact,
        recentInteractions: interactions,
        pastEmails: loadedEmails,
        conversationHistory: conversation,
        includeConversationContext: readConversation,
        senderName: activeMember?.name || 'CRM Team',
        goal,
        tone,
        customInstructions: customInstructions.trim() || undefined,
        provider,
        model: getSelectedModel(provider),
      });

      onDraftGenerated({
        subject: draft.subject,
        body: draft.body,
      });

      const providerLabel = draft.provider ? AI_PROVIDERS[draft.provider as AIProviderId]?.shortName || draft.provider : AI_PROVIDERS[provider].shortName;
      const contextMsg = (readConversation && conversation.length > 0)
        ? ` Continuously drafted by analyzing ${conversation.length} past conversation message${conversation.length > 1 ? 's' : ''}.`
        : ` Generated based on contact profile and goal.`;

      success(
        'AI Draft Ready!',
        `Generated using ${providerLabel}.${contextMsg}`
      );
    } catch (err: any) {
      error('Failed to generate draft', err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const activeProviderMeta = AI_PROVIDERS[provider];
  const hasKey = Boolean(getAIProviderKey(provider));

  return (
    <>
      <div className="bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-slate-50 border border-indigo-200/80 rounded-2xl p-4 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-indigo-950">AI Sales Copywriter</h4>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 font-semibold">
                  {activeProviderMeta?.shortName}
                </span>
              </div>
              <p className="text-[10px] text-indigo-700">
                {conversation.length > 0 && readConversation
                  ? `Reading ${conversation.length} past conversation message${conversation.length > 1 ? 's' : ''} to create a continuous follow-up.`
                  : `Synthesizes client profile, company services, and ${interactions.length} past interactions.`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsAISettingsOpen(true)}
            className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-white px-2 py-1 rounded-lg border border-indigo-200 shadow-2xs transition cursor-pointer"
            title="Configure AI API Keys"
          >
            <Settings className="w-3 h-3" />
            <span>AI Keys</span>
          </button>
        </div>

        {/* Past Conversation Reading Feature Card */}
        {conversation.length > 0 ? (
          <div className="bg-white/95 border border-indigo-200/90 rounded-xl p-3 shadow-2xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    readConversation
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <MessagesSquare className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      Read Past Conversation
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                      {conversation.length} total ({inboundCount} received, {outboundCount} sent)
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {readConversation
                      ? 'AI will inspect full email & interaction history so the new email continues the thread naturally.'
                      : 'Past conversation reading is turned off. AI will draft a cold introduction.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowThreadPreview(!showThreadPreview)}
                  className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 hover:decoration-indigo-600 cursor-pointer"
                >
                  {showThreadPreview ? (
                    <>
                      <span>Hide Thread</span>
                      <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      <span>View Thread</span>
                      <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>

                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={readConversation}
                    onChange={(e) => setReadConversation(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4.5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>

            {/* Collapsible Thread Preview */}
            {showThreadPreview && (
              <div className="mt-2.5 pt-2.5 border-t border-slate-100 max-h-52 overflow-y-auto space-y-2 pr-1">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Chronological Conversation History (Oldest to Newest)
                </div>
                {conversation.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`text-[11px] p-2.5 rounded-xl border transition ${
                      msg.direction === 'inbound'
                        ? 'bg-amber-50/70 border-amber-200/80 text-amber-950'
                        : msg.direction === 'outbound'
                        ? 'bg-indigo-50/70 border-indigo-200/80 text-indigo-950'
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-semibold mb-1">
                      <span className="flex items-center gap-1.5">
                        {msg.direction === 'inbound' && (
                          <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded">
                            <Inbox className="w-3 h-3" /> Received from {msg.sender}
                          </span>
                        )}
                        {msg.direction === 'outbound' && (
                          <span className="inline-flex items-center gap-1 text-indigo-800 bg-indigo-100/80 px-1.5 py-0.5 rounded">
                            <MailCheck className="w-3 h-3" /> Sent by {msg.sender}
                          </span>
                        )}
                        {msg.direction === 'internal_note' && (
                          <span className="inline-flex items-center gap-1 text-slate-700 bg-slate-200/80 px-1.5 py-0.5 rounded">
                            <FileText className="w-3 h-3" /> {msg.sender}
                          </span>
                        )}
                      </span>
                      <span className="text-slate-500 font-normal">
                        {new Date(msg.date).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {msg.subject && (
                      <p className="font-semibold text-[11px] text-slate-800 mb-0.5">
                        Subject: {msg.subject}
                      </p>
                    )}
                    <p className="line-clamp-3 text-slate-700 text-[11px] leading-relaxed whitespace-pre-line">
                      {msg.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white/70 border border-slate-200/80 rounded-xl px-3 py-2 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-slate-400" />
              <span>No prior conversation history recorded for {contact?.name || 'this contact'} (Cold outreach mode).</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* AI Provider selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              AI Engine
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as AIProviderId)}
              className="w-full text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
            >
              {AI_PROVIDER_ORDER.map((id) => (
                <option key={id} value={id}>
                  {AI_PROVIDERS[id].name} {getAIProviderKey(id) ? '✓' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Goal selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Communication Goal
            </label>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
            >
              {goalOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Tone selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Tone of Voice
            </label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as any)}
              className="w-full text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
            >
              {toneOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom instructions / Special Context */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">
            Special Context or offer(Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Reference their Shopify Plus work, mention discretion, or focus on A/B testing..."
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="text-[11px] text-slate-500">
            {!hasKey && (
              <span className="text-amber-600 font-medium">
                (Using smart offline generator; add key in AI Keys for live model)
              </span>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            variant="primary"
            isLoading={isGenerating}
            leftIcon={<Wand2 className="w-3.5 h-3.5" />}
            onClick={handleGenerate}
            className="bg-indigo-600 hover:bg-indigo-700 text-xs shadow-xs"
          >
            Draft with {activeProviderMeta?.shortName}
          </Button>
        </div>
      </div>

      <AISettingsModal
        isOpen={isAISettingsOpen}
        onClose={() => setIsAISettingsOpen(false)}
      />
    </>
  );
};
