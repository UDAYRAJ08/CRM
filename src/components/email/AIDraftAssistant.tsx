import React, { useState } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Contact, Interaction } from '../../types/crm';
import { generateAIEmailDraft } from '../../lib/aiService';
import { Button } from '../ui/Button';
import { Sparkles, Bot, ArrowRight, Wand2 } from 'lucide-react';

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

  const [goal, setGoal] = useState('meeting_request');
  const [tone, setTone] = useState<'professional' | 'friendly' | 'concise' | 'persuasive'>('professional');
  const [customInstructions, setCustomInstructions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const goalOptions = [
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
      });

      onDraftGenerated({
        subject: draft.subject,
        body: draft.body,
      });

      success(
        'AI Draft Ready!',
        `Generated using Claude with ${interactions.length} past interaction notes.`
      );
    } catch (err: any) {
      error('Failed to generate draft', err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-slate-50 border border-indigo-200/80 rounded-2xl p-4 shadow-xs space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-indigo-950">Claude AI Email Assistant</h4>
            <p className="text-[10px] text-indigo-700">
              Injects profile + {interactions.length} past interactions to draft personalized emails.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          Special Notes or Offers (Optional)
        </label>
        <input
          type="text"
          placeholder="e.g. Offer 20% discount on annual plan, mention our mutual connection..."
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="flex items-center justify-end pt-1">
        <Button
          type="button"
          size="sm"
          variant="primary"
          isLoading={isGenerating}
          leftIcon={<Wand2 className="w-3.5 h-3.5" />}
          onClick={handleGenerate}
          className="bg-indigo-600 hover:bg-indigo-700 text-xs"
        >
          Draft with AI
        </Button>
      </div>
    </div>
  );
};
