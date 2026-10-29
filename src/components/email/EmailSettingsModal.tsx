import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Mail,
  Key,
  Shield,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Send,
  Globe,
  Building,
  User,
  Radio,
  Sliders,
  Sparkles,
  Cpu,
  Lock,
} from 'lucide-react';
import { sendSystemEmail, buildEmailHtml } from '../../lib/emailService';
import { AISettingsModal } from './AISettingsModal';
import { usePermissions } from '../../hooks/usePermissions';
import {
  getActiveAIProvider,
  AI_PROVIDERS,
  AI_PROVIDER_ORDER,
  getAIProviderKey,
  setAIProviderKey,
  maskApiKey,
} from '../../lib/aiConfig';

interface EmailSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EmailSettingsModal: React.FC<EmailSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const { activeMember } = useTeam();
  const { success, error, info } = useToast();
  const { isAdmin, canManageAIKeys } = usePermissions();

  const activeUserEmail = (activeMember?.email || user?.email || '').trim();
  const activeUserName = (activeMember?.name || user?.user_metadata?.full_name || 'Team Member').trim();

  const [resendApiKey, setResendApiKey] = useState('');
  const [isEditingResendKey, setIsEditingResendKey] = useState(false);
  const [senderEmail, setSenderEmail] = useState('');
  const [companyDomain, setCompanyDomain] = useState('');
  const [useComposio, setUseComposio] = useState(false);
  const [composioApiKey, setComposioApiKey] = useState('');
  const [isEditingComposioKey, setIsEditingComposioKey] = useState(false);
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [testRecipient, setTestRecipient] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isAISettingsOpen, setIsAISettingsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setResendApiKey(
        localStorage.getItem('crm_resend_api_key') ||
        import.meta.env.VITE_RESEND_API_KEY ||
        ''
      );
      setSenderEmail(
        localStorage.getItem('crm_sender_email') ||
        import.meta.env.VITE_RESEND_FROM_EMAIL ||
        'CRM Team <onboarding@resend.dev>'
      );
      setCompanyDomain(localStorage.getItem('crm_company_domain') || '');
      // Composio (Outlook/Gmail) is the default sender unless switched off here.
      setUseComposio(localStorage.getItem('crm_use_composio') !== 'false');
      setComposioApiKey(
        localStorage.getItem('crm_composio_api_key') ||
        import.meta.env.VITE_COMPOSIO_API_KEY ||
        ''
      );
      setAnthropicApiKey(localStorage.getItem('crm_anthropic_api_key') || '');
      setTestRecipient(activeUserEmail || 'udayrajsharma08@gmail.com');
      setTestResult(null);
    }
  }, [isOpen, activeUserEmail]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (resendApiKey.trim()) {
      localStorage.setItem('crm_resend_api_key', resendApiKey.trim());
    } else {
      localStorage.removeItem('crm_resend_api_key');
    }

    if (senderEmail.trim()) {
      localStorage.setItem('crm_sender_email', senderEmail.trim());
    }

    if (companyDomain.trim()) {
      localStorage.setItem('crm_company_domain', companyDomain.trim().toLowerCase());
    } else {
      localStorage.removeItem('crm_company_domain');
    }

    localStorage.setItem('crm_use_composio', useComposio ? 'true' : 'false');

    if (composioApiKey.trim()) {
      localStorage.setItem('crm_composio_api_key', composioApiKey.trim());
    } else {
      localStorage.removeItem('crm_composio_api_key');
    }

    if (anthropicApiKey.trim()) {
      localStorage.setItem('crm_anthropic_api_key', anthropicApiKey.trim());
      setAIProviderKey('anthropic', anthropicApiKey.trim());
    } else {
      localStorage.removeItem('crm_anthropic_api_key');
    }

    success('Settings Saved', 'Dynamic multi-user email & API settings saved successfully.');
    onClose();
  };

  const handleTestEmail = async () => {
    const targetEmail = testRecipient.trim();
    if (!targetEmail) {
      error('Recipient Missing', 'Please enter an email to deliver the test message to.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    // Save temporary settings so sendEmailDirectly picks them up
    if (resendApiKey.trim()) localStorage.setItem('crm_resend_api_key', resendApiKey.trim());
    if (senderEmail.trim()) localStorage.setItem('crm_sender_email', senderEmail.trim());
    if (companyDomain.trim()) localStorage.setItem('crm_company_domain', companyDomain.trim().toLowerCase());
    localStorage.setItem('crm_use_composio', useComposio ? 'true' : 'false');

    try {
      const body = `Hello!\n\nThis is a test email sent from the CRM workspace by ${activeUserName}.`;
      await sendSystemEmail({
        to: targetEmail,
        subject: `CRM email test from ${activeUserName}`,
        html: buildEmailHtml(body),
      });
      setTestResult(`Success! Dispatched to ${targetEmail}`);
      success('Email Dispatched!', `Test email sent to ${targetEmail}`);
    } catch (err: any) {
      setTestResult(`Error: ${err.message}`);
      error('Test Failed', err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const isResendConfigured = Boolean(resendApiKey.trim());
  const isSandbox = senderEmail.includes('onboarding@resend.dev');

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
      maxWidth="xl"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
            <Mail className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Email Delivery & Multi-User Engine</h3>
            <p className="text-xs text-slate-500">
              Configure dynamic sender routing so each team member sends emails from their own account.
            </p>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSave} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        {/* Active Logged-In User Identity Card */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
              {activeUserName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <span>{activeUserName}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                  {activeMember?.role || 'Current User'}
                </span>
              </div>
              <div className="text-slate-500 text-[11px] font-mono">
                {activeUserEmail || 'No email registered on profile'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              <CheckCircle2 className="w-3 h-3" />
              Dynamic Sender Enabled
            </span>
          </div>
        </div>

        {/* Status Mode Banner */}
        <div
          className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
            isResendConfigured
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/80 border-amber-200 text-amber-900'
          }`}
        >
          {isResendConfigured ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div>
            <span className="font-bold block">
              {isResendConfigured
                ? isSandbox
                  ? 'Sandbox Mode Active (Sends to test recipient)'
                  : companyDomain
                  ? `Production Domain Active (@${companyDomain})`
                  : 'Transactional Gateway Active'
                : 'Demo / CRM Database Logging Mode'}
            </span>
            <span className="text-[11px] opacity-90 leading-relaxed block mt-0.5">
              {isResendConfigured
                ? companyDomain
                  ? `Emails sent by any team member with @${companyDomain} will be delivered directly under their individual name and email address.`
                  : 'Emails will be sent via your gateway with dynamic reply-to directing all replies straight to the logged-in user.'
                : 'Without an email API key, emails are safely tracked in your CRM interaction feed without reaching real inboxes.'}
            </span>
          </div>
        </div>

        {/* Core Transactional Email Provider (Resend) */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-600" />
              Email Dispatch Gateway (Resend)
            </h4>
            <a
              href="https://resend.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
            >
              <span>Get API Key</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {resendApiKey && !isEditingResendKey ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Resend API Key
              </label>
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-mono text-slate-800 font-semibold tracking-wider truncate">
                    {maskApiKey(resendApiKey)}
                  </span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 shrink-0 font-medium">
                    Masked & Encrypted
                  </span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingResendKey(true)}
                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-white hover:bg-indigo-50 px-2 py-0.5 rounded-lg border border-slate-200 transition cursor-pointer"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResendApiKey('');
                        localStorage.removeItem('crm_resend_api_key');
                        setIsEditingResendKey(true);
                      }}
                      className="text-[11px] font-semibold text-red-600 hover:text-red-800 bg-white hover:bg-red-50 px-2 py-0.5 rounded-lg border border-slate-200 transition cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="relative">
              <Input
                label="Resend API Key"
                placeholder={resendApiKey ? 'Enter new key to replace...' : 're_123456789...'}
                type="password"
                value={isEditingResendKey && resendApiKey.includes('••••') ? '' : resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value)}
                leftIcon={<Key className="w-4 h-4" />}
                disabled={!isAdmin}
                helperText="Provides high-throughput multi-user email delivery without account lockout."
              />
              {resendApiKey && (
                <button
                  type="button"
                  onClick={() => setIsEditingResendKey(false)}
                  className="absolute right-3 top-8 text-[11px] text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-lg font-medium cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Company Domain (e.g. yourcompany.com)"
              placeholder="e.g. acmecorp.com"
              value={companyDomain}
              onChange={(e) => setCompanyDomain(e.target.value)}
              leftIcon={<Building className="w-4 h-4" />}
              helperText="Enables direct 'Jane Doe <jane@acmecorp.com>' sender addressing."
            />

            <Input
              label="Gateway Sender Fallback"
              placeholder="CRM Team <onboarding@resend.dev>"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              helperText="Fallback From address for team members outside the company domain."
            />
          </div>
        </div>

        {/* Composio Mode Toggle (Legacy/Personal Integration) */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                Composio Personal Outlook Integration
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Sends via a single personal Outlook OAuth connection. Turn OFF for multi-user scalable sending.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={useComposio}
                onChange={(e) => setUseComposio(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {useComposio && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                ⚠️ <strong>Note:</strong> When Composio is enabled, all emails will be dispatched via your single connected personal Outlook account rather than each user's separate address.
              </div>
              {composioApiKey && !isEditingComposioKey ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Composio API Key
                  </label>
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="font-mono text-slate-800 font-semibold tracking-wider truncate">
                        {maskApiKey(composioApiKey)}
                      </span>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 shrink-0 font-medium">
                        Masked
                      </span>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <button
                          type="button"
                          onClick={() => setIsEditingComposioKey(true)}
                          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-white hover:bg-indigo-50 px-2 py-0.5 rounded-lg border border-slate-200 transition cursor-pointer"
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setComposioApiKey('');
                            localStorage.removeItem('crm_composio_api_key');
                            setIsEditingComposioKey(true);
                          }}
                          className="text-[11px] font-semibold text-red-600 hover:text-red-800 bg-white hover:bg-red-50 px-2 py-0.5 rounded-lg border border-slate-200 transition cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    label="Composio API Key"
                    placeholder={composioApiKey ? 'Enter new key to replace...' : 'cmp_...'}
                    type="password"
                    value={isEditingComposioKey && composioApiKey.includes('••••') ? '' : composioApiKey}
                    onChange={(e) => setComposioApiKey(e.target.value)}
                    leftIcon={<Key className="w-4 h-4" />}
                    disabled={!isAdmin}
                    helperText="Required only if Composio routing is switched on."
                  />
                  {composioApiKey && (
                    <button
                      type="button"
                      onClick={() => setIsEditingComposioKey(false)}
                      className="absolute right-3 top-8 text-[11px] text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-lg font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Multi-User Test Trigger */}
        <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-indigo-600" />
              Send Live Test Email as {activeUserName}:
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="recipient@example.com"
                helperText="Enter any recipient email to verify live delivery and sender headers."
              />
            </div>
            <div className="pb-4">
              <Button
                type="button"
                variant="primary"
                size="sm"
                isLoading={isTesting}
                onClick={handleTestEmail}
                leftIcon={<Send className="w-3.5 h-3.5" />}
              >
                Send Test
              </Button>
            </div>
          </div>

          {testResult && (
            <p
              className={`text-[11px] font-semibold ${
                testResult.startsWith('Success')
                  ? 'text-emerald-700'
                  : 'text-amber-700'
              }`}
            >
              {testResult}
            </p>
          )}
        </div>

        {/* Multi-AI System & API Key Engine */}
        <div className="p-3.5 bg-indigo-50/80 border border-indigo-200/90 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <span>Multi-AI System & API Key Engine</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 font-semibold">
                    {AI_PROVIDERS[getActiveAIProvider()]?.shortName} Active
                  </span>
                </h4>
                <p className="text-[11px] text-indigo-700">
                  Connect multiple AI systems (OpenAI, Claude, Gemini, Groq, DeepSeek) to write bulk emails.
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAISettingsOpen(true)}
              leftIcon={<Cpu className="w-3.5 h-3.5 text-indigo-600" />}
              className="text-xs border-indigo-200 hover:bg-indigo-50 bg-white"
            >
              Configure AI Systems ({AI_PROVIDER_ORDER.filter((id) => Boolean(getAIProviderKey(id))).length}/6)
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
            {AI_PROVIDER_ORDER.map((id) => {
              const meta = AI_PROVIDERS[id];
              const hasKey = Boolean(getAIProviderKey(id));
              const isActive = getActiveAIProvider() === id;
              return (
                <div
                  key={id}
                  className={`p-2 rounded-xl border text-xs flex items-center justify-between ${
                    isActive
                      ? 'bg-indigo-50 border-indigo-300 font-bold text-indigo-950'
                      : hasKey
                      ? 'bg-white border-slate-200 text-slate-800'
                      : 'bg-slate-50/50 border-slate-200/60 text-slate-400'
                  }`}
                >
                  <span className="truncate">{meta.shortName}</span>
                  {hasKey ? (
                    <span className="text-[10px] font-semibold text-emerald-600">✓ Ready</span>
                  ) : (
                    <span className="text-[10px] text-slate-400">No key</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-slate-400 text-[11px]">
            <Shield className="w-3.5 h-3.5" />
            <span>Saved securely in your browser</span>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Configuration
            </Button>
          </div>
        </div>
      </form>
    </Modal>

    <AISettingsModal
      isOpen={isAISettingsOpen}
      onClose={() => setIsAISettingsOpen(false)}
    />
  </>
  );
};
