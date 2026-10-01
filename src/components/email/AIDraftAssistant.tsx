import React, { useState, useEffect } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Contact, Interaction } from '../../types/crm';
import { generateAIEmailDraft } from '../../lib/aiService';
import { Button } from '../ui/Button';
import { Sparkles, Bot, Wand2, Settings, Cpu } from 'lucide-react';
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
  onDraftGenerated: (draft: { subject: string; body: string }) => void;
}

export const AIDraftAssistant: React.FC<AIDraftAssistantProps> = ({
  contact,
  interactions,
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

  useEffect(() => {
    setProvider(getActiveAIProvider());
    const handleUpdate = () => setProvider(getActiveAIProvider());
    window.addEventListener('crm_ai_config_updated', handleUpdate);
    return () => window.removeEventListener('crm_ai_config_updated', handleUpdate);
  }, []);

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
      success(
        'AI Draft Ready!',
        `Generated using ${providerLabel} with ${interactions.length} past interaction notes.`
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
                Synthesizes client profile, company services, and {interactions.length} past interactions.
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

        {/* Custom instructions */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">
            Special Focus or Offer (Optional)
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
            className="bg-indigo-600 hover:bg-indigo-700 text-xs"
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
