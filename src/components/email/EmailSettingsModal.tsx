import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Mail,
  Shield,
  CheckCircle2,
  AlertCircle,
  Send,
  Sparkles,
  Cpu,
} from 'lucide-react';
import { sendSystemEmail, buildEmailHtml } from '../../lib/emailService';
import { AISettingsModal } from './AISettingsModal';
import { EmailAccountsSection } from './EmailAccountsSection';
import { usePermissions } from '../../hooks/usePermissions';
import {
  getActiveAIProvider,
  AI_PROVIDERS,
  AI_PROVIDER_ORDER,
  getAIProviderKey,
  setAIProviderKey,
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

  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [testRecipient, setTestRecipient] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isAISettingsOpen, setIsAISettingsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAnthropicApiKey(localStorage.getItem('crm_anthropic_api_key') || '');
      setTestRecipient(activeUserEmail || 'udayrajsharma08@gmail.com');
      setTestResult(null);
    }
  }, [isOpen, activeUserEmail]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

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

        <EmailAccountsSection />

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
