import React, { useState, useEffect } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Contact, Interaction } from '../../types/crm';
import { sendEmailDirectly } from '../../lib/emailService';
import { db } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { AIDraftAssistant } from './AIDraftAssistant';
import { Mail, Sparkles, Send, Bot, CheckCircle, ChevronDown, ChevronUp, Clock, AlertTriangle, ExternalLink, ShieldCheck } from 'lucide-react';

interface EmailComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact;
  initialSubject?: string;
  initialBody?: string;
  onEmailSent?: () => void;
}

export const EmailComposerModal: React.FC<EmailComposerModalProps> = ({
  isOpen,
  onClose,
  contact,
  initialSubject,
  initialBody,
  onEmailSent,
}) => {
  const { activeMember } = useTeam();
  const { user } = useAuth();
  const { success, error, info } = useToast();

  const activeSenderEmail = (activeMember?.email || user?.email || '').trim();
  const activeSenderName = (activeMember?.name || user?.user_metadata?.full_name || 'Team Member').trim();

  const [recipientEmail, setRecipientEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showAIAssistant, setShowAIAssistant] = useState(true);
  const [isAiGenerated, setIsAiGenerated] = useState(false);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  const ownerEmail = activeSenderEmail || 'my-email@company.com';
  const configuredSender = localStorage.getItem('crm_sender_email') || import.meta.env.VITE_RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const isSandboxSender = configuredSender.includes('onboarding@resend.dev');

  useEffect(() => {
    if (isOpen && contact) {
      const firstName = contact.name.split(' ')[0] || contact.name;
      const compName = contact.company?.name || 'your team';
      setRecipientEmail(contact.email || '');
      setSubject(initialSubject || `Helping ${compName} meet project deadlines`);
      setBody(
        initialBody ||
          `Hyy ${firstName},\n\nIf you are looking for a reliable team to help you with your tasks and ensure you meet your upcoming project deadlines with ease, we would love to support you.\n\nWe specialize in assisting teams with execution, removing workflow bottlenecks, and delivering on target.\n\nWould you be open to a quick 10-minute chat this week to explore how we can help?\n\nBest regards,\n${activeMember?.name || 'CRM Team'}`
      );
      setIsAiGenerated(false);
      setSandboxError(null);

      // Fetch interactions for AI context
      db.getInteractions(contact.id).then(setInteractions);
    }
  }, [isOpen, contact, activeMember, initialSubject, initialBody]);

  const handleDraftGenerated = (draft: { subject: string; body: string }) => {
    setSubject(draft.subject);
    setBody(draft.body);
    setIsAiGenerated(true);
  };

  const executeSend = async (logOnly = false, overrideEmail?: string) => {
    const targetEmail = (overrideEmail || recipientEmail).trim();
    if (!targetEmail || !subject.trim() || !body.trim()) {
      error('Missing information', 'Recipient email, subject, and body are required.');
      return;
    }

    setIsSending(true);
    setSandboxError(null);

    try {
      const result = await sendEmailDirectly({
        contactId: contact.id,
        recipientEmail: targetEmail,
        recipientName: contact.name,
        subject: subject.trim(),
        body: body.trim(),
        senderId: activeMember?.id,
        senderName: activeSenderName,
        senderEmail: activeSenderEmail,
        aiGenerated: isAiGenerated,
        logOnly,
      });

      success('Email Sent!', result.message);
      if (onEmailSent) onEmailSent();
      onClose();
    } catch (err: any) {
      const msg = err.message || '';
      if (
        err.isSandboxRestricted ||
        msg.includes('only send testing emails') ||
        msg.includes('not verified') ||
        msg.includes('resend.com/domains')
      ) {
        setSandboxError(msg);
      } else {
        error('Failed to send email', msg);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    executeSend(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={
        <div className="flex items-center justify-between w-full pr-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Compose Email to {contact.name}
              </h3>
              <p className="text-xs text-slate-500">
                {contact.company?.name ? `${contact.company.name} • ` : ''}{contact.email || 'No email set'}
              </p>
            </div>
          </div>

          <span className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>{activeSenderEmail || 'Dynamic Sender'}</span>
          </span>
        </div>
      }
    >
      <form onSubmit={handleSend} className="space-y-4">
        {/* Sandbox & Domain Restriction Warning Panel if triggered */}
        {sandboxError && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2.5 text-xs text-amber-900 animate-in fade-in duration-200">
            <div className="flex items-start gap-2 font-bold text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                {sandboxError.includes('not verified')
                  ? 'Domain Verification Notice'
                  : 'Resend Free Sandbox Limitation'}
              </span>
            </div>
            <p className="text-amber-800 text-[11px] leading-relaxed">
              {sandboxError.includes('not verified')
                ? sandboxError
                : `When using the free Resend test address (onboarding@resend.dev), Resend only permits live delivery to your registered account owner email (${ownerEmail}).`}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200/60">
              <button
                type="button"
                onClick={() => {
                  setRecipientEmail(ownerEmail);
                  executeSend(false, ownerEmail);
                }}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition shadow-sm flex items-center gap-1"
              >
                <Send className="w-3 h-3" /> Send test to my inbox ({ownerEmail})
              </button>
              <button
                type="button"
                onClick={() => executeSend(true)}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold text-xs transition"
              >
                💾 Save to CRM History anyway
              </button>
              <a
                href="https://resend.com/domains"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-amber-900 hover:underline font-semibold flex items-center gap-1 ml-auto"
              >
                <span>Verify Custom Domain</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* AI Assistant Accordion */}
        <div className="border border-indigo-100 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAIAssistant(!showAIAssistant)}
            className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 hover:bg-indigo-100/60 transition text-left"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>AI Draft Assistant (Claude Sonnet)</span>
              {isAiGenerated && (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Draft Applied
                </span>
              )}
            </div>
            {showAIAssistant ? (
              <ChevronUp className="w-4 h-4 text-indigo-600" />
            ) : (
              <ChevronDown className="w-4 h-4 text-indigo-600" />
            )}
          </button>

          {showAIAssistant && (
            <div className="p-3 bg-white border-t border-indigo-100">
              <AIDraftAssistant
                contact={contact}
                interactions={interactions}
                onDraftGenerated={handleDraftGenerated}
              />
            </div>
          )}
        </div>

        {/* Prior Communications Drawer */}
        {interactions.length > 0 && (
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/60">
            <div className="p-2.5 px-3 flex items-center justify-between text-xs font-bold text-slate-700">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Prior Communications ({interactions.length} recorded)</span>
              </div>
              <span className="text-[11px] text-slate-400 font-normal">
                Most recent on {new Date(interactions[0].created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="p-3 pt-0 max-h-36 overflow-y-auto space-y-2 border-t border-slate-200/60 bg-white">
              {interactions.slice(0, 4).map((item) => (
                <div key={item.id} className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1">
                    <span className="uppercase tracking-wider text-[10px] px-1.5 py-0.2 rounded bg-slate-200/80 text-slate-700">
                      {item.type}
                    </span>
                    <span className="text-slate-400">
                      {item.creator?.name ? `by ${item.creator.name} • ` : ''}
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-slate-700 text-xs line-clamp-2 leading-relaxed whitespace-pre-wrap">
                    {item.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Email Fields */}
        <div className="space-y-3">
          {/* Dynamic Active Sender Banner */}
          <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">From:</span>
              <span className="font-semibold text-slate-800">
                {activeSenderName}
              </span>
              <span className="text-slate-500 font-mono text-[11px]">
                &lt;{activeSenderEmail || 'Configure in Settings'}&gt;
              </span>
            </div>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-medium">
              Dynamic Sender Active
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                Recipient Email *
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRecipientEmail(ownerEmail)}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                >
                  <span>Test to my inbox ({ownerEmail})</span>
                </button>
              </div>
            </div>
            <Input
              type="email"
              placeholder="recipient@example.com"
              value={recipientEmail}
              onChange={(e) => {
                setRecipientEmail(e.target.value);
                setSandboxError(null);
              }}
              required
            />
          </div>

          <Input
            label="Subject Line *"
            placeholder="Enter subject..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />

          {/* Quick Detail Templates */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Message Body *
              </label>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="font-medium">Insert detail template:</span>
                <button
                  type="button"
                  onClick={() => {
                    const firstName = contact.name.split(' ')[0] || contact.name;
                    const compName = contact.company?.name || 'your organization';
                    setSubject(`Team Capabilities & Task Execution Details for ${compName}`);
                    setBody(`Hyy ${firstName},\n\nIf you are looking for a dedicated team to help you execute your tasks and ensure you hit your upcoming project deadlines on time, here are the core details of how we can support you:\n\n1. What We Handle:\n- End-to-end task execution and deliverable management\n- Rapid sprint turnaround to meet tight deadlines\n- Ongoing technical and operational workflow support\n\n2. How We Work:\n- Dedicated point of contact and daily/weekly progress updates\n- Transparent milestone tracking with zero bandwidth strain on your team\n- Flexible scoping based on your immediate priorities\n\nWould you be open to a quick 10-minute call this week to review your current tasks and see how we can assist?\n\nBest regards,\n${activeMember?.name || 'CRM Team'}`);
                  }}
                  className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold border border-indigo-200 transition"
                >
                  ⚡ Team & Capabilities
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const firstName = contact.name.split(' ')[0] || contact.name;
                    const compName = contact.company?.name || 'your company';
                    setSubject(`Project Scope & Execution Plan for ${compName}`);
                    setBody(`Hyy ${firstName},\n\nFollowing up on our recent conversation regarding your initiatives at ${compName}, here is a summary of the scope and deliverables we can handle for your team:\n\n• Objective: Accelerate project delivery and meet critical milestones.\n• Scope of Work: Complete execution of assigned tasks, QA review, and weekly delivery sprints.\n• Timeline: Ready to kick off immediately with dedicated allocation.\n\nPlease let me know if you would like any adjustments to this plan or if you have time for a brief sync tomorrow.\n\nBest regards,\n${activeMember?.name || 'CRM Team'}`);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border border-slate-200 transition"
                >
                  📋 Scope & Plan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const firstName = contact.name.split(' ')[0] || contact.name;
                    setSubject(`Meeting Summary & Next Steps - ${contact.name}`);
                    setBody(`Hyy ${firstName},\n\nThank you for connecting earlier! Here are the key details and action items we discussed:\n\n• Key Priority: Resolving task bottlenecks and hitting scheduled deadlines.\n• Next Deliverable: Reviewing requirements and finalizing kickoff details.\n• Action Item: Schedule a brief onboarding check-in.\n\nLooking forward to working together!\n\nBest regards,\n${activeMember?.name || 'CRM Team'}`);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border border-slate-200 transition"
                >
                  📝 Meeting Recap
                </button>
              </div>
            </div>

            <Textarea
              placeholder="Write your email here..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="font-normal text-slate-800 leading-relaxed min-h-[190px]"
              required
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Sending as: <strong className="text-slate-800 font-semibold">{activeSenderName} &lt;{activeSenderEmail || 'Configured Gateway'}&gt;</strong>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Discard
            </Button>
            
            {/* 1-Click Send via Gmail Web (Sends directly from logged in user's Gmail account) */}
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const targetEmail = recipientEmail.trim();
                if (!targetEmail || !subject.trim() || !body.trim()) {
                  error('Missing information', 'Recipient email, subject, and body are required.');
                  return;
                }

                // 1. Log to CRM database & interaction history
                await executeSend(true);

                // 2. Open Gmail Web Compose with active user's account pre-selected
                const userParam = activeSenderEmail ? `u/${encodeURIComponent(activeSenderEmail)}/` : '';
                const gmailUrl = `https://mail.google.com/mail/${userParam}?view=cm&fs=1&to=${encodeURIComponent(targetEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                window.open(gmailUrl, '_blank', 'noopener,noreferrer');
                success('Opened in Gmail', `Dispatched under ${activeSenderEmail || 'your Google account'}`);
              }}
              className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200 font-semibold"
            >
              ✉️ Send via Gmail {activeSenderEmail ? `(${activeSenderEmail.split('@')[0]})` : ''}
            </Button>

            <Button
              type="submit"
              variant="primary"
              isLoading={isSending}
              leftIcon={<Send className="w-4 h-4" />}
            >
              Send Email
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};

