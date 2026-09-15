import React, { useState, useEffect } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Contact } from '../../types/crm';
import { db } from '../../lib/supabase';
import {
  fetchLinkedInQuota,
  sendLinkedInConnectionInvite,
  LinkedInQuotaInfo,
} from '../../lib/linkedinAutomationService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Input';
import {
  ExternalLink,
  Sparkles,
  Copy,
  Search,
  Building,
  User,
  Share2,
  Send,
  Globe,
  Zap,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

interface LinkedInComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  onOutreachLogged?: () => void;
}

export const LinkedInComposerModal: React.FC<LinkedInComposerModalProps> = ({
  isOpen,
  onClose,
  contact,
  onOutreachLogged,
}) => {
  const { activeMember } = useTeam();
  const { success, error, info } = useToast();

  const [message, setMessage] = useState('');
  const [activeTemplate, setActiveTemplate] = useState<'connect' | 'pitch' | 'followup'>('connect');
  const [isSendingAutoInvite, setIsSendingAutoInvite] = useState(false);
  const [quota, setQuota] = useState<LinkedInQuotaInfo>({
    date: new Date().toISOString().slice(0, 10),
    sentToday: 0,
    maxDailyLimit: 20,
    remaining: 20,
    hasSessionCookie: true,
  });

  // Extract or detect LinkedIn URL from contact fields
  const getLinkedInUrl = (): string | null => {
    if (!contact) return null;
    if (contact.linkedin_url) return contact.linkedin_url;

    // Check in custom fields
    if (contact.custom_fields) {
      for (const [, val] of Object.entries(contact.custom_fields)) {
        const strVal = String(val || '').trim();
        if (strVal.includes('linkedin.com/in/') || strVal.includes('linkedin.com/')) {
          return strVal.startsWith('http') ? strVal : `https://${strVal}`;
        }
      }
    }
    return null;
  };

  const linkedInProfileUrl = getLinkedInUrl();
  const linkedInSearchUrl = contact
    ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
        `${contact.name} ${contact.company?.name || ''}`.trim()
      )}`
    : 'https://www.linkedin.com';

  const firstName = contact?.name ? contact.name.split(' ')[0] : 'there';
  const compName = contact?.company?.name || 'your company';

  const applyTemplate = (type: 'connect' | 'pitch' | 'followup') => {
    setActiveTemplate(type);
    if (type === 'connect') {
      setMessage(
        `Hyy ${firstName}, came across your work at ${compName}. We help teams streamline task execution and ensure they hit upcoming deadlines on time. Would love to connect!`
      );
    } else if (type === 'pitch') {
      setMessage(
        `Hyy ${firstName},\n\nIf you are looking for a reliable team to help you with your tasks and ensure you meet your upcoming project deadlines with ease, we would love to support you.\n\nWe specialize in assisting teams with execution, removing workflow bottlenecks, and delivering on target.\n\nWould you be open to a quick 10-minute chat this week to explore how we can help?\n\nBest regards,\n${activeMember?.name || 'CRM Team'}`
      );
    } else if (type === 'followup') {
      setMessage(
        `Hyy ${firstName}, wanted to follow up on our previous note regarding your initiatives at ${compName}. Do you have 10 minutes tomorrow for a brief check-in?\n\nBest,\n${activeMember?.name || 'CRM Team'}`
      );
    }
  };

  useEffect(() => {
    if (isOpen && contact) {
      applyTemplate('connect');
      // Load current quota
      fetchLinkedInQuota().then(setQuota);
    }
  }, [isOpen, contact]);

  if (!contact) return null;

  // 1. Fully Automated Dispatch via Session Cookie
  const handleAutoSendInvite = async () => {
    if (!message.trim()) {
      error('Empty Message', 'Please write a message before sending.');
      return;
    }

    if (message.length > 300) {
      error(
        'Message Too Long',
        `LinkedIn connection notes must be under 300 characters (current: ${message.length}). Please shorten your note.`
      );
      return;
    }

    if (quota.remaining <= 0) {
      error(
        'Daily Limit Reached',
        `You have reached today's limit of ${quota.maxDailyLimit} requests to keep your account safe. Please try tomorrow.`
      );
      return;
    }

    setIsSendingAutoInvite(true);

    try {
      const result = await sendLinkedInConnectionInvite({
        contact,
        profileUrl: linkedInProfileUrl,
        note: message.trim(),
        userId: activeMember?.id,
      });

      if (!result.success) {
        error('Dispatch Failed', result.message || result.error || 'Could not send invitation.');
        setIsSendingAutoInvite(false);
        return;
      }

      // Update quota in state
      if (result.remaining !== undefined) {
        setQuota((prev) => ({
          ...prev,
          sentToday: result.sentToday || prev.sentToday + 1,
          remaining: result.remaining!,
        }));
      }

      success(
        result.alreadySent ? 'Invite Pending' : '⚡ Connection Invite Sent!',
        result.message || `Invite dispatched to ${contact.name} and logged in CRM.`
      );

      if (onOutreachLogged) onOutreachLogged();
      onClose();
    } catch (err: any) {
      error('Error sending invite', err.message || 'Network error');
    } finally {
      setIsSendingAutoInvite(false);
    }
  };

  // 2. Manual 1-Click Clipboard & Browser Launch
  const handleOpenAndCopy = async () => {
    if (!message.trim()) {
      error('Empty Message', 'Please write a message before launching LinkedIn.');
      return;
    }

    try {
      // Copy message text to clipboard
      await navigator.clipboard.writeText(message.trim());

      // Open LinkedIn in a new tab
      const targetUrl = linkedInProfileUrl || linkedInSearchUrl;
      window.open(targetUrl, '_blank', 'noopener,noreferrer');

      // Log interaction to CRM database
      await db.addInteraction({
        contact_id: contact.id,
        type: 'linkedin',
        content: `💼 LinkedIn Outreach Sent (${activeTemplate.toUpperCase()}):\n\n${message.trim()}`,
        created_by: activeMember?.id || null,
      });

      // Update status to 'contacted' if it was 'new'
      if (contact.status === 'new') {
        await db.saveContact({
          id: contact.id,
          status: 'contacted',
        });
      }

      success(
        'Copied & Opened in LinkedIn!',
        `Message copied to clipboard and outreach logged under ${contact.name}.`
      );

      if (onOutreachLogged) onOutreachLogged();
      onClose();
    } catch (err: any) {
      error('Failed to copy', err.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      title={
        <div className="flex items-center justify-between w-full pr-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0077b5] text-white flex items-center justify-center font-bold shadow-xs">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                LinkedIn Outreach to {contact.name}
              </h3>
              <p className="text-xs text-slate-500">
                {contact.title ? `${contact.title} • ` : ''}
                {contact.company?.name || 'Professional Contact'}
              </p>
            </div>
          </div>

          {/* Daily Quota Counter Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              <strong>{quota.remaining}</strong> / {quota.maxDailyLimit} Daily Invites Left
            </span>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Profile Target Info Banner */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center shrink-0 shadow-2xs">
              {contact.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <span className="font-bold text-slate-900 block text-xs truncate">
                {contact.name}
              </span>
              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                {contact.company && (
                  <span className="flex items-center gap-1 font-medium text-slate-700">
                    <Building className="w-3 h-3 text-slate-400" />
                    {contact.company.name}
                  </span>
                )}
                {contact.owner && (
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-400" />
                    Owner: {contact.owner.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div>
            {linkedInProfileUrl ? (
              <a
                href={linkedInProfileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 transition"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Open Profile</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <a
                href={linkedInSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 transition"
                title="Search LinkedIn for this person"
              >
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <span>Search on LinkedIn</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Template Selector */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Select LinkedIn Message Template:</span>
            </label>
            <span className="text-[11px] text-slate-400">
              Length:{' '}
              <strong
                className={message.length > 300 ? 'text-amber-600' : 'text-slate-700'}
              >
                {message.length}
              </strong>{' '}
              / 300 (connect note limit)
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyTemplate('connect')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                activeTemplate === 'connect'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              🤝 Connection Request Note
            </button>

            <button
              type="button"
              onClick={() => applyTemplate('pitch')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                activeTemplate === 'pitch'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              ⚡ Task & Deadline Support
            </button>

            <button
              type="button"
              onClick={() => applyTemplate('followup')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                activeTemplate === 'followup'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              📝 Quick Check-in
            </button>
          </div>
        </div>

        {/* Text Area */}
        <div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Write your LinkedIn outreach message..."
            className="text-xs sm:text-sm font-normal text-slate-800 leading-relaxed min-h-[130px]"
            required
          />
        </div>

        {/* Workflow Tip Box */}
        <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50/60 border border-blue-100 rounded-xl text-xs text-blue-900 leading-relaxed flex items-start gap-2.5">
          <Zap className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-[11px] text-blue-900 space-y-1">
            <p>
              <strong>⚡ 1-Click Auto Send:</strong> Dispatches the connection invitation directly through your connected LinkedIn session in the background and auto-logs to your CRM timeline.
            </p>
            <p className="text-blue-700">
              Safe account limit: Maximum 20 invites per day with built-in spam protection.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<Copy className="w-3.5 h-3.5" />}
              onClick={() => {
                navigator.clipboard.writeText(message);
                info('Copied!', 'Message copied to clipboard.');
              }}
            >
              Copy Text
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<ExternalLink className="w-3.5 h-3.5" />}
              onClick={handleOpenAndCopy}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Open in LinkedIn
            </Button>

            <Button
              type="button"
              variant="primary"
              size="sm"
              leftIcon={
                isSendingAutoInvite ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                )
              }
              onClick={handleAutoSendInvite}
              disabled={isSendingAutoInvite || quota.remaining <= 0}
              className="bg-[#0077b5] hover:bg-[#005f93] text-white font-bold shadow-xs cursor-pointer"
            >
              {isSendingAutoInvite ? 'Sending...' : '⚡ Auto Send Invite'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
