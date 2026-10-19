import React, { useState, useEffect } from 'react';
import {
  X, Plus, Trash2, ChevronRight, ChevronLeft, Eye, UserPlus,
  MessageSquare, Sparkles, Clock, Users, Calendar, Rocket,
  GripVertical, AlertCircle, CheckCircle2
} from 'lucide-react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import {
  getLinkedInAccounts,
  createCampaign,
  getLinkedInCampaigns,
} from '../../lib/linkedinService';
import {
  LinkedInAccount,
  LinkedInCampaign,
  LinkedInActionType,
  CampaignBuilderForm,
  CampaignBuilderStep,
  DEFAULT_CAMPAIGN_FORM,
  ACTION_TYPE_ICONS,
  ACTION_TYPE_LABELS,
} from '../../types/linkedin';
import { Contact } from '../../types/crm';
import { executeAICompletion } from '../../lib/multiAiService';
import { getActiveAIProvider, getSelectedModel } from '../../lib/aiConfig';

const STEP_LABELS = ['Settings', 'Sequence', 'Audience', 'Schedule', 'Review'];

interface CampaignBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  editingCampaign: LinkedInCampaign | null;
  onSaved: () => void;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export const CampaignBuilderModal: React.FC<CampaignBuilderModalProps> = ({
  isOpen, onClose, contacts, editingCampaign, onSaved,
}) => {
  const { activeMember } = useTeam();
  const { success, error: showError } = useToast();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CampaignBuilderForm>(DEFAULT_CAMPAIGN_FORM);
  const [accounts, setAccounts] = useState<LinkedInAccount[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [generatingAI, setGeneratingAI] = useState<string | null>(null);

  // Resolve filtered contacts
  const [resolvedContacts, setResolvedContacts] = useState<Contact[]>([]);

  useEffect(() => {
    getLinkedInAccounts().then(setAccounts).catch(() => {});
  }, []);

  // Resolve audience filters to contact list
  useEffect(() => {
    let filtered = contacts;
    const f = form.audience_filters;

    if (f.tags.length > 0) {
      filtered = filtered.filter((c) => f.tags.some((tag) => c.tags?.includes(tag)));
    }
    if (f.company_ids.length > 0) {
      filtered = filtered.filter((c) => c.company_id && f.company_ids.includes(c.company_id));
    }
    if (f.pipeline_stages.length > 0) {
      filtered = filtered.filter((c) => f.pipeline_stages.includes(c.status));
    }

    setResolvedContacts(filtered);
  }, [form.audience_filters, contacts]);

  const updateForm = (updates: Partial<CampaignBuilderForm>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const addStep = (actionType: LinkedInActionType) => {
    const newStep: CampaignBuilderStep = {
      id: generateId(),
      step_order: form.steps.length + 1,
      action_type: actionType,
      connection_note: '',
      connection_note_ai_generated: false,
      message_body: '',
      message_ai_generated: false,
      delay_after_hours: 24,
      delay_jitter_hours: 4,
    };
    updateForm({ steps: [...form.steps, newStep] });
  };

  const removeStep = (id: string) => {
    const updated = form.steps
      .filter((s) => s.id !== id)
      .map((s, idx) => ({ ...s, step_order: idx + 1 }));
    updateForm({ steps: updated });
  };

  const updateStep = (id: string, updates: Partial<CampaignBuilderStep>) => {
    updateForm({
      steps: form.steps.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    });
  };

  const generateAIMessage = async (stepId: string, stepType: 'connection' | 'message') => {
    setGeneratingAI(stepId);
    try {
      const sampleContact = resolvedContacts[0];
      const prompt = stepType === 'connection'
        ? `Write a short, personalized LinkedIn connection request note (max 280 chars) for ${sampleContact?.name || 'a professional'}${sampleContact?.title ? `, who is a ${sampleContact.title}` : ''}. Be genuine, not salesy. No emojis. Just the note text.`
        : `Write a short, personalized LinkedIn follow-up message (2-3 sentences) for ${sampleContact?.name || 'a professional'}${sampleContact?.title ? `, who is a ${sampleContact.title}` : ''}. We recently connected on LinkedIn. Be conversational and add value. No emojis. Just the message text.`;

      const activeProvider = getActiveAIProvider();
      const model = getSelectedModel(activeProvider);
      const result = await executeAICompletion({
        provider: activeProvider,
        model,
        systemPrompt: 'You are an expert sales outreach copywriter crafting high-converting, professional LinkedIn messages.',
        userPrompt: prompt,
      });
      const generatedText = (result.text || '').trim();
      updateStep(stepId, {
        [stepType === 'connection' ? 'connection_note' : 'message_body']: generatedText,
        [stepType === 'connection' ? 'connection_note_ai_generated' : 'message_ai_generated']: true,
      });
    } catch (e: any) {
      showError('AI generation failed', e.message);
    } finally {
      setGeneratingAI(null);
    }
  };

  const handleSave = async () => {
    if (!activeMember?.id) return showError('Error', 'No active team member');
    if (!form.name.trim()) return showError('Required', 'Campaign name is required');
    if (!form.linkedin_account_id) return showError('Required', 'Select a LinkedIn account');
    if (form.steps.length === 0) return showError('Required', 'Add at least one step to your sequence');
    if (!form.start_date || !form.end_date) return showError('Required', 'Set a date range for the campaign');
    if (resolvedContacts.length === 0) return showError('No contacts', 'Your audience filter matches no contacts');

    setIsSaving(true);
    try {
      const contactIds = resolvedContacts.map((c) => c.id);
      await createCampaign(form, activeMember.id, contactIds);
      success('Campaign Created! 🎉', `"${form.name}" is ready to launch.`);
      onSaved();
      onClose();
    } catch (e: any) {
      showError('Save failed', e.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  // All unique tags from contacts
  const allTags = [...new Set(contacts.flatMap((c) => c.tags || []))].filter(Boolean);
  const allCompanies = [...new Map(
    contacts.filter((c) => c.company_id && c.company).map((c) => [c.company_id, c.company])
  ).values()];
  const pipelineStages = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'inactive'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {editingCampaign ? 'View Campaign' : 'New Campaign'}
              </h2>
              <p className="text-[11px] text-slate-400">{STEP_LABELS[step]}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 pt-4 pb-0">
          <div className="flex items-center gap-0">
            {STEP_LABELS.map((label, idx) => (
              <React.Fragment key={label}>
                <button
                  onClick={() => idx < step ? setStep(idx) : undefined}
                  className={`flex items-center gap-1.5 text-[11px] font-semibold transition ${
                    idx === step
                      ? 'text-blue-700'
                      : idx < step
                      ? 'text-emerald-600 cursor-pointer'
                      : 'text-slate-400'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    idx < step
                      ? 'bg-emerald-500 text-white'
                      : idx === step
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-400'
                  }`}>
                    {idx < step ? '✓' : idx + 1}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
                {idx < STEP_LABELS.length - 1 && (
                  <div className={`flex-1 h-px mx-1.5 ${idx < step ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* STEP 0: Settings */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Campaign Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="e.g. SaaS Founders Outreach Q4"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                  placeholder="What's the goal of this campaign?"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">LinkedIn Account <span className="text-red-500">*</span></label>
                {accounts.filter((a) => a.status === 'active').length === 0 ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    No active LinkedIn accounts. Connect one in the Accounts tab first.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {accounts.filter((a) => a.status === 'active').map((acc) => (
                      <label
                        key={acc.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                          form.linkedin_account_id === acc.id
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="account"
                          value={acc.id}
                          checked={form.linkedin_account_id === acc.id}
                          onChange={() => updateForm({ linkedin_account_id: acc.id })}
                          className="text-blue-600"
                        />
                        <div className="relative shrink-0">
                          {acc.linkedin_avatar_url ? (
                            <img
                              src={acc.linkedin_avatar_url}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full object-cover border border-slate-200"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                              {acc.linkedin_name?.charAt(0) || acc.team_member?.name?.charAt(0) || 'L'}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{acc.linkedin_name || acc.team_member?.name}</p>
                          {acc.linkedin_headline && <p className="text-xs text-slate-400">{acc.linkedin_headline}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 1: Sequence Builder */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Build your outreach sequence. Each step triggers after the configured delay.
              </p>

              {/* Existing Steps */}
              {form.steps.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-slate-400">
                  <p className="text-sm font-medium">No steps yet</p>
                  <p className="text-xs mt-1">Add your first action below</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {form.steps.map((s, idx) => (
                    <SequenceStepCard
                      key={s.id}
                      step={s}
                      index={idx}
                      isGeneratingAI={generatingAI === s.id}
                      onUpdate={(updates) => updateStep(s.id, updates)}
                      onRemove={() => removeStep(s.id)}
                      onGenerateAI={(type) => generateAIMessage(s.id, type)}
                    />
                  ))}
                </div>
              )}

              {/* Add Step Buttons */}
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Add a step:</p>
                <div className="flex flex-wrap gap-2">
                  {(['view_profile', 'send_connection', 'send_message'] as LinkedInActionType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => addStep(type)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition"
                    >
                      <span>{ACTION_TYPE_ICONS[type]}</span>
                      {ACTION_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Audience */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800">
                <Users className="w-4 h-4 shrink-0" />
                <span><strong>{resolvedContacts.length}</strong> contacts match your current filters</span>
              </div>

              {/* Tags Filter */}
              {allTags.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">Filter by Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((tag) => {
                      const selected = form.audience_filters.tags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => {
                            const tags = selected
                              ? form.audience_filters.tags.filter((t) => t !== tag)
                              : [...form.audience_filters.tags, tag];
                            updateForm({ audience_filters: { ...form.audience_filters, tags } });
                          }}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                            selected
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pipeline Stage Filter */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-2 block">Filter by Pipeline Stage</label>
                <div className="flex flex-wrap gap-2">
                  {pipelineStages.map((stage) => {
                    const selected = form.audience_filters.pipeline_stages.includes(stage);
                    return (
                      <button
                        key={stage}
                        onClick={() => {
                          const pipeline_stages = selected
                            ? form.audience_filters.pipeline_stages.filter((s) => s !== stage)
                            : [...form.audience_filters.pipeline_stages, stage];
                          updateForm({ audience_filters: { ...form.audience_filters, pipeline_stages } });
                        }}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition capitalize ${
                          selected
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        {stage}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* No filter selected = all contacts */}
              {form.audience_filters.tags.length === 0 &&
                form.audience_filters.pipeline_stages.length === 0 &&
                form.audience_filters.company_ids.length === 0 && (
                  <p className="text-xs text-slate-500 italic">
                    No filters selected — all {contacts.length} contacts will be included.
                  </p>
                )}

              {/* Preview */}
              {resolvedContacts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">Preview ({Math.min(5, resolvedContacts.length)} of {resolvedContacts.length})</p>
                  <div className="space-y-1.5">
                    {resolvedContacts.slice(0, 5).map((c) => (
                      <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 text-xs">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-[10px] shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-800">{c.name}</span>
                          {c.title && <span className="text-slate-400 ml-1">· {c.title}</span>}
                          {!c.linkedin_url && (
                            <span className="ml-2 text-amber-600 font-medium">⚠ No LinkedIn URL</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Schedule */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Start Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={form.start_date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => updateForm({ start_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1.5 block">End Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={form.end_date}
                    min={form.start_date || new Date().toISOString().split('T')[0]}
                    onChange={(e) => updateForm({ end_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Working Hours Start</label>
                  <input
                    type="time"
                    value={form.working_hours_start}
                    onChange={(e) => updateForm({ working_hours_start: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Working Hours End</label>
                  <input
                    type="time"
                    value={form.working_hours_end}
                    onChange={(e) => updateForm({ working_hours_end: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-2 block">Working Days</label>
                <div className="flex gap-1.5">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => {
                    const selected = form.working_days.includes(idx);
                    return (
                      <button
                        key={day}
                        onClick={() => {
                          const working_days = selected
                            ? form.working_days.filter((d) => d !== idx)
                            : [...form.working_days, idx].sort();
                          updateForm({ working_days });
                        }}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition ${
                          selected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600">
                <p className="font-semibold mb-1">📅 How scheduling works</p>
                <p>Actions are pre-computed with random delays (jitter) within your working hours. LinkedIn sees natural, human-like timing. While a CRM tab is open with the LinkedIn Connector extension linked, the CRM runs one due action per minute from your own browser. Actions missed while the CRM was closed run when you next open it.</p>
              </div>
            </div>
          )}

          {/* STEP 4: Review & Launch */}
          {step === 4 && (
            <div className="space-y-4">
              <ReviewRow label="Campaign" value={form.name} />
              <ReviewRow label="LinkedIn Account" value={
                accounts.find((a) => a.id === form.linkedin_account_id)?.linkedin_name ||
                accounts.find((a) => a.id === form.linkedin_account_id)?.team_member?.name ||
                'Not selected'
              } />
              <ReviewRow label="Sequence Steps" value={`${form.steps.length} step${form.steps.length !== 1 ? 's' : ''}: ${form.steps.map((s) => ACTION_TYPE_ICONS[s.action_type]).join(' → ')}`} />
              <ReviewRow label="Contacts" value={`${resolvedContacts.length} contact${resolvedContacts.length !== 1 ? 's' : ''}`} />
              <ReviewRow label="Date Range" value={form.start_date && form.end_date ? `${form.start_date} → ${form.end_date}` : 'Not set'} />
              <ReviewRow label="Working Hours" value={`${form.working_hours_start} – ${form.working_hours_end}`} />

              {resolvedContacts.some((c) => !c.linkedin_url) && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>{resolvedContacts.filter((c) => !c.linkedin_url).length} contacts</strong> have no LinkedIn URL and will be skipped during execution.
                  </span>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>The campaign will be saved as a <strong>draft</strong>. You can review it and click <strong>Launch</strong> from the Campaigns list when ready.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          <button
            onClick={() => step > 0 ? setStep(step - 1) : onClose()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-white transition"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {step === 0 ? 'Cancel' : 'Back'}
          </button>

          {step < STEP_LABELS.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 transition"
            >
              <Rocket className="w-3.5 h-3.5" />
              {isSaving ? 'Saving...' : 'Save Campaign'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Sequence Step Card
interface SequenceStepCardProps {
  step: CampaignBuilderStep;
  index: number;
  isGeneratingAI: boolean;
  onUpdate: (updates: Partial<CampaignBuilderStep>) => void;
  onRemove: () => void;
  onGenerateAI: (type: 'connection' | 'message') => void;
}

const SequenceStepCard: React.FC<SequenceStepCardProps> = ({
  step, index, isGeneratingAI, onUpdate, onRemove, onGenerateAI,
}) => {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Step Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <span className="text-xs font-semibold text-slate-700">
            {ACTION_TYPE_ICONS[step.action_type]} {ACTION_TYPE_LABELS[step.action_type]}
          </span>
        </div>
        <button onClick={onRemove} className="p-1 rounded text-slate-400 hover:text-red-500 transition">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Step Body */}
      <div className="p-3 space-y-3">
        {/* Connection Note */}
        {step.action_type === 'send_connection' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-slate-600">Connection Note (optional, max 300 chars)</label>
              <button
                onClick={() => onGenerateAI('connection')}
                disabled={isGeneratingAI}
                className="flex items-center gap-1 text-[11px] text-indigo-600 font-semibold hover:text-indigo-700 disabled:opacity-50 transition"
              >
                <Sparkles className="w-3 h-3" />
                {isGeneratingAI ? 'Generating...' : 'AI Generate'}
              </button>
            </div>
            <textarea
              value={step.connection_note}
              onChange={(e) => onUpdate({ connection_note: e.target.value })}
              maxLength={300}
              placeholder="Write a personalized connection note, or use AI to generate one..."
              rows={2}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
            />
            <p className="text-[11px] text-slate-400 text-right">{step.connection_note.length}/300</p>
          </div>
        )}

        {/* Message Body */}
        {step.action_type === 'send_message' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-slate-600">Message</label>
              <button
                onClick={() => onGenerateAI('message')}
                disabled={isGeneratingAI}
                className="flex items-center gap-1 text-[11px] text-indigo-600 font-semibold hover:text-indigo-700 disabled:opacity-50 transition"
              >
                <Sparkles className="w-3 h-3" />
                {isGeneratingAI ? 'Generating...' : 'AI Generate'}
              </button>
            </div>
            <textarea
              value={step.message_body}
              onChange={(e) => onUpdate({ message_body: e.target.value })}
              placeholder="Write your message, or use AI to generate one..."
              rows={3}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
            />
          </div>
        )}

        {/* Delay Settings */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-500">Wait</span>
          </div>
          <input
            type="number"
            value={step.delay_after_hours}
            onChange={(e) => onUpdate({ delay_after_hours: parseInt(e.target.value) || 0 })}
            min={0}
            max={720}
            className="w-16 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-center"
          />
          <span className="text-[11px] text-slate-500">hours after this step, then ±</span>
          <input
            type="number"
            value={step.delay_jitter_hours}
            onChange={(e) => onUpdate({ delay_jitter_hours: parseInt(e.target.value) || 0 })}
            min={0}
            max={24}
            className="w-12 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-center"
          />
          <span className="text-[11px] text-slate-500">h random</span>
        </div>
      </div>
    </div>
  );
};

const ReviewRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
    <span className="text-xs font-semibold text-slate-500 shrink-0">{label}</span>
    <span className="text-xs text-slate-800 text-right">{value}</span>
  </div>
);
