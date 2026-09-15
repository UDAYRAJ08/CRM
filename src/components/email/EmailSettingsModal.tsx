import React, { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Mail, Key, Shield, ExternalLink, CheckCircle2, AlertCircle, Send, Globe } from 'lucide-react';
import { sendEmailDirectly } from '../../lib/emailService';

interface EmailSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EmailSettingsModal: React.FC<EmailSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { success, error, info } = useToast();

  const [resendApiKey, setResendApiKey] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const ownerEmail = 'udayrajsharma08@gmail.com';

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
      setAnthropicApiKey(localStorage.getItem('crm_anthropic_api_key') || '');
      setTestResult(null);
    }
  }, [isOpen]);

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

    if (anthropicApiKey.trim()) {
      localStorage.setItem('crm_anthropic_api_key', anthropicApiKey.trim());
    } else {
      localStorage.removeItem('crm_anthropic_api_key');
    }

    success('Settings Saved', 'Email and AI configuration updated successfully.');
    onClose();
  };

  const handleTestEmail = async () => {
    if (!resendApiKey.trim()) {
      error('API Key Missing', 'Please enter a Resend API key first.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    // Save key temporarily to ensure sendEmailDirectly picks it up
    localStorage.setItem('crm_resend_api_key', resendApiKey.trim());
    if (senderEmail.trim()) {
      localStorage.setItem('crm_sender_email', senderEmail.trim());
    }

    try {
      const res = await sendEmailDirectly({
        recipientEmail: ownerEmail,
        subject: '🎉 Resend Email Test from CRM',
        body: `Hello Uday!\n\nThis is a test email sent directly from your CRM application using Resend.\n\nEverything is connected and operational!`,
      });

      setTestResult(`Success! Test email delivered to ${ownerEmail}.`);
      success('Email Delivered!', `Test email sent to ${ownerEmail}. Check your inbox!`);
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
            <Mail className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Email Delivery & API Settings</h3>
            <p className="text-xs text-slate-500">
              Connect Resend to send emails directly to real inboxes.
            </p>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSave} className="space-y-4">
        {/* Status card */}
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
                  ? 'Sandbox Mode Active (Delivers to your verified inbox)'
                  : 'Custom Domain Active (Delivers to all recipients)'
                : 'Demo / CRM Logging Mode'}
            </span>
            <span className="text-[11px] opacity-90 leading-relaxed block mt-0.5">
              {isResendConfigured
                ? isSandbox
                  ? `With onboarding@resend.dev, Resend delivers live test emails exclusively to ${ownerEmail}.`
                  : 'Using your custom domain, emails are delivered to all external client addresses.'
                : 'Without a Resend API key, emails are recorded in your CRM interaction history for testing but not dispatched to real inboxes.'}
            </span>
          </div>
        </div>

        {/* Resend API Key */}
        <div className="space-y-1.5">
          <Input
            label="Resend API Key"
            placeholder="re_123456789..."
            type="password"
            value={resendApiKey}
            onChange={(e) => setResendApiKey(e.target.value)}
            leftIcon={<Key className="w-4 h-4" />}
            helperText="Your Resend API key (starts with re_)"
          />

          <div className="flex justify-end">
            <a
              href="https://resend.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
            >
              <span>Get Resend API Key</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* From Email */}
        <div className="space-y-1.5">
          <Input
            label="Sender 'From' Email Address"
            placeholder="CRM Team <onboarding@resend.dev>"
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
            helperText="Use 'onboarding@resend.dev' for sandbox, or your verified domain (e.g. sales@yourcompany.com)."
          />

          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-indigo-600" /> How Resend Deliverability Works:
            </div>
            <p>
              • <strong>Free Sandbox (<code className="font-mono">onboarding@resend.dev</code>):</strong> Resend sends live test emails only to <strong className="text-slate-800">{ownerEmail}</strong>.
            </p>
            <p>
              • <strong>Send to Any Client / Lead:</strong> Go to{' '}
              <a
                href="https://resend.com/domains"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:underline font-semibold"
              >
                resend.com/domains
              </a>
              , add your domain DNS records, and change the sender to <code className="font-mono">hello@yourcompany.com</code>.
            </p>
          </div>
        </div>

        {/* Quick Test Trigger */}
        {isResendConfigured && (
          <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-950">
                Verify Connection Now:
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                isLoading={isTesting}
                onClick={handleTestEmail}
                leftIcon={<Send className="w-3.5 h-3.5" />}
              >
                Send Test to {ownerEmail}
              </Button>
            </div>
            {testResult && (
              <p
                className={`text-[11px] font-semibold ${
                  testResult.startsWith('Success')
                    ? 'text-emerald-700'
                    : 'text-rose-600'
                }`}
              >
                {testResult}
              </p>
            )}
          </div>
        )}

        {/* Anthropic API Key */}
        <div className="pt-2 border-t border-slate-100">
          <Input
            label="Anthropic Claude API Key (Optional)"
            placeholder="sk-ant-api03-..."
            type="password"
            value={anthropicApiKey}
            onChange={(e) => setAnthropicApiKey(e.target.value)}
            leftIcon={<Key className="w-4 h-4" />}
            helperText="Optional: If you want live Anthropic server calls instead of local Claude simulation"
          />
        </div>

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
  );
};

