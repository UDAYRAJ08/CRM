import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { useToast } from '../../context/ToastContext';
import {
  AIProviderId,
  AI_PROVIDERS,
  AI_PROVIDER_ORDER,
  getAIProviderKey,
  setAIProviderKey,
  getSelectedModel,
  setSelectedModel,
  getActiveAIProvider,
  setActiveAIProvider,
  isAutoFallbackEnabled,
  setAutoFallbackEnabled,
  testAIConnection,
  ConnectionTestResult,
  maskApiKey,
} from '../../lib/aiConfig';
import { usePermissions } from '../../hooks/usePermissions';
import {
  getCompanyServiceProfile,
  saveCompanyServiceProfile,
  resetCompanyServiceProfile,
  SERVICE_PRESETS,
  CompanyServiceProfile,
} from '../../lib/serviceProfile';
import {
  Sparkles,
  Key,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Layers,
  Building,
  RotateCw,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Check,
  Zap,
  ArrowRight,
  Flame,
  Globe,
  Sliders,
  Send,
  HelpCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { generateProfessionalBulkEmails } from '../../lib/aiBulkEmailGenerator';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'keys' | 'profile' | 'test';
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'keys',
}) => {
  const { success, error, info } = useToast();

  const { isAdmin, canManageAIKeys, roleTitle } = usePermissions();

  const [activeTab, setActiveTab] = useState<'keys' | 'profile' | 'test'>(initialTab);

  // Provider Keys State
  const [keys, setKeys] = useState<Record<AIProviderId, string>>({
    anthropic: '',
    openai: '',
    gemini: '',
    groq: '',
    deepseek: '',
    openrouter: '',
  });

  // Selected Models State
  const [models, setModels] = useState<Record<AIProviderId, string>>({
    anthropic: AI_PROVIDERS.anthropic.defaultModel,
    openai: AI_PROVIDERS.openai.defaultModel,
    gemini: AI_PROVIDERS.gemini.defaultModel,
    groq: AI_PROVIDERS.groq.defaultModel,
    deepseek: AI_PROVIDERS.deepseek.defaultModel,
    openrouter: AI_PROVIDERS.openrouter.defaultModel,
  });

  const [activeProvider, setActiveProviderLocal] = useState<AIProviderId>('anthropic');
  const [autoFallback, setAutoFallbackLocal] = useState(true);

  // Tracks whether the user is actively editing a new key for each provider
  const [editingKeys, setEditingKeys] = useState<Record<AIProviderId, boolean>>({
    anthropic: false,
    openai: false,
    gemini: false,
    groq: false,
    deepseek: false,
    openrouter: false,
  });

  // Testing status per provider
  const [testingStatus, setTestingStatus] = useState<Record<string, { loading: boolean; result?: ConnectionTestResult }>>({});

  // Service Profile State
  const [serviceProfile, setServiceProfile] = useState<CompanyServiceProfile>(getCompanyServiceProfile());
  const [newServiceInput, setNewServiceInput] = useState('');
  const [newValuePropInput, setNewValuePropInput] = useState('');

  // Playground Test State
  const [testTone, setTestTone] = useState<'professional' | 'persuasive' | 'concise' | 'friendly'>('professional');
  const [testGoal, setTestGoal] = useState<'agency_overflow' | 'shopify_cro' | 'capabilities' | 'deadlines' | 'followup' | 'intro'>('agency_overflow');
  const [testCustomNote, setTestCustomNote] = useState('');
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [testOutput, setTestOutput] = useState<{ subject: string; body: string; provider: string; latency: number } | null>(null);

  // Load stored settings on open
  useEffect(() => {
    if (isOpen) {
      const initialKeys: Record<AIProviderId, string> = {} as any;
      const initialModels: Record<AIProviderId, string> = {} as any;
      const initialEditing: Record<AIProviderId, boolean> = {} as any;

      AI_PROVIDER_ORDER.forEach((id) => {
        const stored = getAIProviderKey(id);
        initialKeys[id] = stored;
        initialModels[id] = getSelectedModel(id);
        initialEditing[id] = !Boolean(stored);
      });

      setKeys(initialKeys);
      setModels(initialModels);
      setEditingKeys(initialEditing);
      setActiveProviderLocal(getActiveAIProvider());
      setAutoFallbackLocal(isAutoFallbackEnabled());
      setServiceProfile(getCompanyServiceProfile());
      setActiveTab(initialTab);
      setTestingStatus({});
    }
  }, [isOpen, initialTab]);

  const handleKeyChange = (provider: AIProviderId, val: string) => {
    setKeys((prev) => ({ ...prev, [provider]: val }));
  };

  const handleClearKey = (provider: AIProviderId) => {
    setKeys((prev) => ({ ...prev, [provider]: '' }));
    setAIProviderKey(provider, '');
    setEditingKeys((prev) => ({ ...prev, [provider]: true }));
    info('Key Cleared', `Removed ${AI_PROVIDERS[provider].name} key from secure vault.`);
  };

  const handleModelChange = (provider: AIProviderId, val: string) => {
    setModels((prev) => ({ ...prev, [provider]: val }));
  };

  const handleTestKey = async (provider: AIProviderId) => {
    const key = keys[provider];
    const model = models[provider];

    if (!key.trim()) {
      error('Missing Key', `Please enter an API key for ${AI_PROVIDERS[provider].name} first.`);
      return;
    }

    setTestingStatus((prev) => ({
      ...prev,
      [provider]: { loading: true },
    }));

    const result = await testAIConnection(provider, key, model);

    setTestingStatus((prev) => ({
      ...prev,
      [provider]: { loading: false, result },
    }));

    if (result.success) {
      success('Connected!', `Verified ${AI_PROVIDERS[provider].shortName} connection in ${result.latencyMs}ms`);
    } else {
      error('Connection Failed', result.error || 'Invalid API key or network error');
    }
  };

  const handleSaveAll = () => {
    if (canManageAIKeys) {
      AI_PROVIDER_ORDER.forEach((id) => {
        // Only update if not masked asterisks
        if (keys[id] && !keys[id].includes('••••')) {
          setAIProviderKey(id, keys[id]);
        }
        setSelectedModel(id, models[id]);
      });
    } else {
      // Non-admins can still update their preferred model
      AI_PROVIDER_ORDER.forEach((id) => {
        setSelectedModel(id, models[id]);
      });
    }

    setActiveAIProvider(activeProvider);
    setAutoFallbackEnabled(autoFallback);
    saveCompanyServiceProfile(serviceProfile);

    // Reset editing states to masked
    const updatedEditing: Record<AIProviderId, boolean> = {} as any;
    AI_PROVIDER_ORDER.forEach((id) => {
      updatedEditing[id] = !Boolean(getAIProviderKey(id));
    });
    setEditingKeys(updatedEditing);

    success('AI Settings Saved', 'Your multi-AI provider preferences and service profile have been updated.');
    onClose();
  };

  // Profile actions
  const handleAddService = () => {
    if (!newServiceInput.trim()) return;
    setServiceProfile((prev) => ({
      ...prev,
      services: [...prev.services, newServiceInput.trim()],
    }));
    setNewServiceInput('');
  };

  const handleRemoveService = (index: number) => {
    setServiceProfile((prev) => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index),
    }));
  };

  const handleAddValueProp = () => {
    if (!newValuePropInput.trim()) return;
    setServiceProfile((prev) => ({
      ...prev,
      valuePropositions: [...prev.valuePropositions, newValuePropInput.trim()],
    }));
    setNewValuePropInput('');
  };

  const handleRemoveValueProp = (index: number) => {
    setServiceProfile((prev) => ({
      ...prev,
      valuePropositions: prev.valuePropositions.filter((_, i) => i !== index),
    }));
  };

  const applyPreset = (presetId: string) => {
    const p = SERVICE_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setServiceProfile((prev) => ({
      ...prev,
      ...p.profile,
    }));
    info('Preset Applied', `Loaded profile settings for ${p.name}`);
  };

  // Test playground generation
  const handleRunPlaygroundTest = async () => {
    setIsGeneratingTest(true);
    setTestOutput(null);

    // Save temporary state so generator picks it up
    AI_PROVIDER_ORDER.forEach((id) => {
      setAIProviderKey(id, keys[id]);
      setSelectedModel(id, models[id]);
    });
    setActiveAIProvider(activeProvider);
    saveCompanyServiceProfile(serviceProfile);

    try {
      const res = await generateProfessionalBulkEmails({
        campaignGoal: testGoal,
        tone: testTone,
        customInstructions: testCustomNote,
        provider: activeProvider,
        model: models[activeProvider],
        customProfile: serviceProfile,
      });

      if (res.variations.length > 0) {
        const first = res.variations[0];
        setTestOutput({
          subject: first.subject,
          body: first.body,
          provider: `${res.providerUsed} (${res.modelUsed})`,
          latency: res.latencyMs,
        });
        success('Generation Complete!', `Email generated via ${res.providerUsed} in ${res.latencyMs}ms`);
      }
    } catch (err: any) {
      error('Generation Failed', err.message || 'Failed to generate test email');
    } finally {
      setIsGeneratingTest(false);
    }
  };

  const configuredKeyCount = AI_PROVIDER_ORDER.filter((id) => Boolean(keys[id]?.trim())).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="4xl"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">Multi-AI System & API Key Engine</h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                {configuredKeyCount} Connected
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Connect multiple AI systems (OpenAI, Claude, Gemini, Groq, DeepSeek) to write professional bulk outreach for your services.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('keys')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'keys'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>AI Providers & API Keys ({configuredKeyCount}/6)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'profile'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Company & Service Profile</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('test')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'test'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Live Test Playground</span>
          </button>
        </div>

        {/* TAB 1: AI PROVIDERS & API KEYS */}
        {activeTab === 'keys' && (
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {/* Non-Admin Security Notice */}
            {!canManageAIKeys && (
              <div className="p-3 bg-amber-50 border border-amber-200/90 rounded-2xl flex items-center gap-2.5 text-xs text-amber-900">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <span className="font-bold">Administrator Managed Vault:</span>
                  <span className="text-amber-800 ml-1">
                    API keys are securely masked and restricted to workspace administrators. You can select models and generate outreach with AI using these keys.
                  </span>
                </div>
              </div>
            )}

            {/* Failover / Preference Bar */}
            <div className="p-3 bg-gradient-to-r from-indigo-50 to-purple-50/60 border border-indigo-100 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">Primary AI Engine:</span>
                <span className="font-extrabold text-indigo-700 uppercase tracking-wide bg-white px-2 py-0.5 rounded-lg border border-indigo-200">
                  {AI_PROVIDERS[activeProvider]?.name}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  ({models[activeProvider]})
                </span>
              </div>

              <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={autoFallback}
                  onChange={(e) => setAutoFallbackLocal(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span>Auto-failover to backup keys if rate-limited</span>
              </label>
            </div>

            {/* Providers Grid */}
            <div className="space-y-3">
              {AI_PROVIDER_ORDER.map((id) => {
                const meta = AI_PROVIDERS[id];
                const key = keys[id];
                const hasKey = Boolean(key?.trim());
                const isEditing = editingKeys[id];
                const isActive = activeProvider === id;
                const status = testingStatus[id];

                return (
                  <div
                    key={id}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      isActive
                        ? 'bg-white border-indigo-400 ring-2 ring-indigo-500/10 shadow-sm'
                        : hasKey
                        ? 'bg-white border-slate-200 hover:border-slate-300'
                        : 'bg-slate-50/70 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shadow-2xs ${meta.iconBg}`}
                        >
                          {meta.shortName.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs">{meta.name}</span>
                            {isActive && (
                              <span className="text-[10px] font-extrabold uppercase tracking-wide px-1.5 py-0.2 rounded bg-indigo-600 text-white">
                                Active Default
                              </span>
                            )}
                            {hasKey ? (
                              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                Key Configured
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                                No Key Set
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">{meta.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isActive && hasKey && (
                          <button
                            type="button"
                            onClick={() => setActiveProviderLocal(id)}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition cursor-pointer"
                          >
                            Set as Active
                          </button>
                        )}
                        {canManageAIKeys && (
                          <a
                            href={meta.apiKeyHelpUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-slate-400 hover:text-indigo-600 flex items-center gap-1 font-medium transition"
                          >
                            <span>Get API Key</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
                      {/* API Key Input or Masked Box */}
                      <div className="md:col-span-7">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            API Key
                          </label>
                          {hasKey && !isEditing && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                              <Lock className="w-2.5 h-2.5 text-emerald-600" />
                              Encrypted & Masked in Vault
                            </span>
                          )}
                        </div>

                        {hasKey && !isEditing ? (
                          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="font-mono text-slate-800 font-semibold tracking-wider truncate">
                                {maskApiKey(key)}
                              </span>
                            </div>
                            {canManageAIKeys && (
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingKeys((prev) => ({ ...prev, [id]: true }))}
                                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-white hover:bg-indigo-50 px-2 py-0.5 rounded-lg border border-slate-200 transition cursor-pointer"
                                >
                                  Change
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleClearKey(id)}
                                  className="text-[11px] font-semibold text-red-600 hover:text-red-800 bg-white hover:bg-red-50 px-2 py-0.5 rounded-lg border border-slate-200 transition cursor-pointer"
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="relative flex items-center">
                              <input
                                type="password"
                                value={isEditing && key.includes('••••') ? '' : key}
                                onChange={(e) => handleKeyChange(id, e.target.value)}
                                placeholder={hasKey ? 'Enter new key to replace...' : meta.apiKeyPlaceholder}
                                disabled={!canManageAIKeys}
                                className="w-full text-xs bg-white border border-slate-200 rounded-xl pl-3 pr-16 py-2 text-slate-900 placeholder:text-slate-400 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 disabled:bg-slate-50"
                              />
                              {hasKey && (
                                <button
                                  type="button"
                                  onClick={() => setEditingKeys((prev) => ({ ...prev, [id]: false }))}
                                  className="absolute right-2 text-[10px] text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg font-medium cursor-pointer"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              <span>Key will be encrypted with device salt and permanently masked upon saving</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Model Selector */}
                      <div className="md:col-span-3">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Model
                        </label>
                        <select
                          value={models[id]}
                          onChange={(e) => handleModelChange(id, e.target.value)}
                          className="w-full text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          {meta.models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} {m.recommended ? '★' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Test Connection Button */}
                      <div className="md:col-span-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!key.trim() || status?.loading}
                          isLoading={status?.loading}
                          onClick={() => handleTestKey(id)}
                          className="w-full text-xs justify-center py-2"
                        >
                          Test Key
                        </Button>
                      </div>
                    </div>

                    {/* Test result message if available */}
                    {status?.result && (
                      <div
                        className={`mt-2 p-2 rounded-xl text-[11px] font-medium flex items-center justify-between ${
                          status.result.success
                            ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                            : 'bg-red-50 text-red-900 border border-red-200'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          {status.result.success ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          )}
                          <span>{status.result.message}</span>
                        </span>
                        {status.result.success && (
                          <span className="text-[10px] font-mono text-emerald-700 bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                            {status.result.latencyMs}ms
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: COMPANY & SERVICE PROFILE */}
        {activeTab === 'profile' && (
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {/* Preset Selector */}
            <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-indigo-600" />
                  Quick Presets: Pre-load Services for Your Industry
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const res = resetCompanyServiceProfile();
                    setServiceProfile(res);
                    info('Reset', 'Default Ingversions Digital profile restored.');
                  }}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  Reset Defaults
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {SERVICE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className="p-2 text-left bg-white hover:bg-indigo-100/50 border border-indigo-200/80 rounded-xl transition cursor-pointer text-xs group"
                  >
                    <div className="font-bold text-indigo-900 group-hover:text-indigo-950 truncate">
                      {p.name}
                    </div>
                    <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{p.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Profile Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Company / Agency Name *"
                value={serviceProfile.companyName}
                onChange={(e) =>
                  setServiceProfile((prev) => ({ ...prev, companyName: e.target.value }))
                }
                placeholder="e.g. Ingversions Digital"
              />

              <Input
                label="Tagline / Core Specialty *"
                value={serviceProfile.tagline}
                onChange={(e) =>
                  setServiceProfile((prev) => ({ ...prev, tagline: e.target.value }))
                }
                placeholder="e.g. High-Velocity Engineering & Dedicated Technical Teams"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="Default Sender Name"
                value={serviceProfile.senderName}
                onChange={(e) =>
                  setServiceProfile((prev) => ({ ...prev, senderName: e.target.value }))
                }
                placeholder="e.g. Uday Raj"
              />

              <Input
                label="Sender Title / Role"
                value={serviceProfile.senderTitle}
                onChange={(e) =>
                  setServiceProfile((prev) => ({ ...prev, senderTitle: e.target.value }))
                }
                placeholder="e.g. Director of Business Solutions"
              />

              <Input
                label="Sender Email Address"
                value={serviceProfile.senderEmail}
                onChange={(e) =>
                  setServiceProfile((prev) => ({ ...prev, senderEmail: e.target.value }))
                }
                placeholder="e.g. udaysharma@ingversionsdigital.com"
              />
            </div>

            {/* Services List */}
            <div className="p-3.5 bg-white border border-slate-200 rounded-2xl space-y-2.5">
              <label className="block text-xs font-bold text-slate-800">
                Core Services Provided (The AI will highlight these in your bulk emails):
              </label>
              <div className="space-y-1.5">
                {serviceProfile.services.map((srv, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-800"
                  >
                    <span className="font-medium flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      {srv}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveService(idx)}
                      className="text-slate-400 hover:text-red-600 transition p-1 cursor-pointer"
                      title="Remove service"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newServiceInput}
                  onChange={(e) => setNewServiceInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddService())}
                  placeholder="Add another service (e.g. AI Workflow Integration, Dedicated React Sprints)..."
                  className="flex-1 text-xs bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <Button type="button" size="sm" variant="outline" onClick={handleAddService} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                  Add
                </Button>
              </div>
            </div>

            {/* Value Propositions */}
            <div className="p-3.5 bg-white border border-slate-200 rounded-2xl space-y-2.5">
              <label className="block text-xs font-bold text-slate-800">
                Key Value Propositions & Pitch Angles (Why clients choose you):
              </label>
              <div className="space-y-1.5">
                {serviceProfile.valuePropositions.map((vp, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-800"
                  >
                    <span className="font-medium flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      {vp}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveValueProp(idx)}
                      className="text-slate-400 hover:text-red-600 transition p-1 cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newValuePropInput}
                  onChange={(e) => setNewValuePropInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddValueProp())}
                  placeholder="Add value prop (e.g. Senior engineers ready within 24 hours, zero hiring overhead)..."
                  className="flex-1 text-xs bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <Button type="button" size="sm" variant="outline" onClick={handleAddValueProp} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                  Add
                </Button>
              </div>
            </div>

            {/* Target Audience & Call to Action */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Target Audience / ICP"
                value={serviceProfile.targetAudience}
                onChange={(e) =>
                  setServiceProfile((prev) => ({ ...prev, targetAudience: e.target.value }))
                }
                placeholder="e.g. Founders, CTOs, VP of Engineering, Operations Leads"
              />

              <Input
                label="Default Call-to-Action (CTA)"
                value={serviceProfile.defaultCTA}
                onChange={(e) =>
                  setServiceProfile((prev) => ({ ...prev, defaultCTA: e.target.value }))
                }
                placeholder="e.g. Would you be open to a 10-minute sync this week to review your tasks?"
              />
            </div>
          </div>
        )}

        {/* TAB 3: LIVE TEST PLAYGROUND */}
        {activeTab === 'test' && (
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 flex items-center justify-between">
              <div>
                Testing with Active Provider:{' '}
                <strong className="text-slate-900">{AI_PROVIDERS[activeProvider]?.name}</strong>{' '}
                <span className="font-mono text-slate-500">({models[activeProvider]})</span>
              </div>
              <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Service Profile Loaded
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Campaign Objective / Pitch Focus
                </label>
                <select
                  value={testGoal}
                  onChange={(e) => setTestGoal(e.target.value as any)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-slate-800 font-medium focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="agency_overflow">Discreet Agency Overflow & Capacity</option>
                  <option value="shopify_cro">Shopify CRO & Experimentation Layer</option>
                  <option value="capabilities">Team Capabilities & Task Execution</option>
                  <option value="deadlines">Helping Hit Upcoming Project Deadlines</option>
                  <option value="followup">Follow-up on Previous Note</option>
                  <option value="intro">Cold Executive Introduction</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Tone of Voice
                </label>
                <select
                  value={testTone}
                  onChange={(e) => setTestTone(e.target.value as any)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-slate-800 font-medium focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="professional">Professional & Executive</option>
                  <option value="persuasive">Persuasive & ROI-Driven</option>
                  <option value="concise">Concise & Minimalist (3 Sentences)</option>
                  <option value="friendly">Warm & Collaborative</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Custom Offer / Focus Angle (Optional)
              </label>
              <input
                type="text"
                value={testCustomNote}
                onChange={(e) => setTestCustomNote(e.target.value)}
                placeholder="e.g. Mention 20% discount on first month sprint, or offer free technical audit..."
                className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                isLoading={isGeneratingTest}
                onClick={handleRunPlaygroundTest}
                leftIcon={<Sparkles className="w-3.5 h-3.5" />}
              >
                Generate Live Email with AI
              </Button>
            </div>

            {testOutput && (
              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-2 font-sans text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="font-bold text-slate-800">
                    <span className="text-slate-400 font-normal mr-1">Generated Subject:</span>
                    {testOutput.subject}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {testOutput.provider} • {testOutput.latency}ms
                  </div>
                </div>
                <div className="pt-2 whitespace-pre-wrap text-slate-700 leading-relaxed font-sans">
                  {testOutput.body}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Global Footer */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>API keys are encrypted and stored locally in your browser.</span>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleSaveAll} leftIcon={<Check className="w-4 h-4" />}>
              Save All Settings
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
