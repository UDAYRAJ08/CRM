import React, { useState, useEffect } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Contact } from '../../types/crm';
import {
  sendEmailDirectly,
  substituteMergeFields,
  resolveContactCompany,
} from '../../lib/emailService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import {
  Mail,
  Send,
  Users,
  Eye,
  Variable,
  RotateCw,
  Zap,
  FileText,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

export type BulkTemplateKey = 'followup' | 'capabilities' | 'scope' | 'intro';

interface BulkEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedContacts: Contact[];
  onComplete: () => void;
  initialTemplate?: BulkTemplateKey;
}

const TEMPLATES: Record<
  BulkTemplateKey,
  { label: string; icon: React.ReactNode; subject: string; body: string }
> = {
  followup: {
    label: 'Generic Follow-up',
    icon: <RotateCw className="w-3.5 h-3.5" />,
    subject: 'Following up - {{company}}',
    body: `Hi {{first_name}},\n\nI hope you're having a productive week.\n\nI wanted to quickly follow up on my previous note and see if you had a chance to review it. We'd love to explore how we can support you and {{company}} in executing your upcoming initiatives and hitting your deadlines smoothly.\n\nDo you have 10-15 minutes for a brief call sometime this week?\n\nBest regards,\nUday Raj\nIngversions Digital`,
  },
  capabilities: {
    label: 'Team & Capabilities',
    icon: <Zap className="w-3.5 h-3.5" />,
    subject: 'Team Capabilities & Task Execution Details for {{company}}',
    body: `Hi {{first_name}},\n\nIf you are looking for a dedicated team to help you execute your tasks and ensure you hit your upcoming project deadlines on time, here are the core details of how we can support you:\n\n1. What We Handle:\n- End-to-end task execution and deliverable management\n- Rapid sprint turnaround to meet tight deadlines\n- Ongoing technical and operational workflow support\n\n2. How We Work:\n- Dedicated point of contact and daily/weekly progress updates\n- Transparent milestone tracking with zero bandwidth strain on your team\n- Flexible scoping based on your immediate priorities\n\nWould you be open to a quick 10-minute call this week to review your current tasks and see how we can assist?\n\nBest regards,\nUday Raj\nIngversions Digital`,
  },
  scope: {
    label: 'Scope & Plan',
    icon: <FileText className="w-3.5 h-3.5" />,
    subject: 'Project Scope & Execution Plan for {{company}}',
    body: `Hi {{first_name}},\n\nFollowing up on our recent conversation regarding your initiatives at {{company}}, here is a summary of the scope and deliverables we can handle for your team:\n\n• Objective: Accelerate project delivery and meet critical milestones.\n• Scope of Work: Complete execution of assigned tasks, QA review, and weekly delivery sprints.\n• Timeline: Ready to kick off immediately with dedicated allocation.\n\nPlease let me know if you would like any adjustments to this plan or if you have time for a brief sync tomorrow.\n\nBest regards,\nUday Raj\nIngversions Digital`,
  },
  intro: {
    label: 'Cold Introduction',
    icon: <Mail className="w-3.5 h-3.5" />,
    subject: 'Quick question regarding {{company}}',
    body: `Hi {{first_name}},\n\nI noticed the impressive work your team is doing at {{company}} and wanted to reach out directly.\n\nWe partner with high-velocity companies to streamline operations, eliminate bottleneck delays, and ensure every milestone ships reliably.\n\nWould you have 10 minutes to connect this Thursday or Friday?\n\nBest regards,\nUday Raj\nIngversions Digital`,
  },
};

export const BulkEmailModal: React.FC<BulkEmailModalProps> = ({
  isOpen,
  onClose,
  selectedContacts,
  onComplete,
  initialTemplate = 'followup',
}) => {
  const { activeMember } = useTeam();
  const { user } = useAuth();
  const { success, error } = useToast();

  const activeSenderEmail = (activeMember?.email || user?.email || '').trim();
  const activeSenderName = (activeMember?.name || user?.user_metadata?.full_name || 'Uday Raj').trim();

  const [activeTemplateKey, setActiveTemplateKey] = useState<BulkTemplateKey>(initialTemplate);
  const [subjectTemplate, setSubjectTemplate] = useState(TEMPLATES[initialTemplate].subject);
  const [bodyTemplate, setBodyTemplate] = useState(TEMPLATES[initialTemplate].body);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(0);

  // Switch template
  const handleSelectTemplate = (key: BulkTemplateKey) => {
    setActiveTemplateKey(key);
    setSubjectTemplate(TEMPLATES[key].subject);
    setBodyTemplate(TEMPLATES[key].body);
  };

  useEffect(() => {
    if (isOpen) {
      handleSelectTemplate(initialTemplate);
      setPreviewIndex(0);
      setProgress(0);
      setIsSending(false);
    }
  }, [isOpen, initialTemplate]);

  const contactsWithEmail = selectedContacts.filter((c) => Boolean(c.email?.trim()));
  const contactsWithoutEmail = selectedContacts.length - contactsWithEmail.length;

  const previewContact = contactsWithEmail[previewIndex] || selectedContacts[0];
  const renderedSubject = previewContact
    ? substituteMergeFields(subjectTemplate, previewContact)
    : '';
  const renderedBody = previewContact
    ? substituteMergeFields(bodyTemplate, previewContact)
    : '';

  const handleSendBulk = async () => {
    if (!subjectTemplate.trim() || !bodyTemplate.trim()) {
      error('Missing content', 'Subject and body templates are required.');
      return;
    }

    if (contactsWithEmail.length === 0) {
      error('No valid emails', 'None of the selected contacts have an email address.');
      return;
    }

    setIsSending(true);
    setProgress(0);

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < contactsWithEmail.length; i++) {
      const contact = contactsWithEmail[i];
      const customSub = substituteMergeFields(subjectTemplate, contact);
      const customBody = substituteMergeFields(bodyTemplate, contact);

      try {
        await sendEmailDirectly({
          contactId: contact.id,
          recipientEmail: contact.email!,
          recipientName: contact.name,
          subject: customSub,
          body: customBody,
          senderEmail: activeSenderEmail || undefined,
          senderId: activeMember?.id,
          senderName: activeSenderName,
          aiGenerated: false,
        });
        sentCount++;
      } catch (err) {
        console.error('Failed sending to', contact.email, err);
        failedCount++;
      }

      setProgress(Math.round(((i + 1) / contactsWithEmail.length) * 100));
      // Stagger slightly for queue stability
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    setIsSending(false);

    if (sentCount > 0) {
      success(
        activeTemplateKey === 'followup' ? 'Bulk Follow-ups Sent!' : 'Bulk Campaign Sent!',
        `Successfully delivered to ${sentCount} contact${sentCount === 1 ? '' : 's'}.${
          failedCount > 0 ? ` (${failedCount} failed)` : ''
        }`
      );
    } else {
      error('Dispatch Failed', 'Could not deliver messages to the selected contacts.');
    }

    onComplete();
    onClose();
  };

  const insertVariable = (tag: string) => {
    setBodyTemplate((prev) => prev + ` ${tag}`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shadow-xs">
            {activeTemplateKey === 'followup' ? (
              <RotateCw className="w-5 h-5 text-emerald-600" />
            ) : (
              <Users className="w-5 h-5 text-indigo-600" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                {activeTemplateKey === 'followup' ? 'Bulk Follow-Up Sender' : 'Bulk Outreach Sender'}
              </h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                {contactsWithEmail.length} Recipient{contactsWithEmail.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Send personalized follow-up sequences with dynamic merge fields to selected contacts.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Template Selector Tabs */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Select Campaign Template:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(TEMPLATES) as BulkTemplateKey[]).map((key) => {
              const tmpl = TEMPLATES[key];
              const isSelected = activeTemplateKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectTemplate(key)}
                  className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-2xs font-bold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <span className={isSelected ? 'text-emerald-600' : 'text-slate-400'}>
                    {tmpl.icon}
                  </span>
                  <span className="text-xs truncate">{tmpl.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Sender Identity Indicator */}
        <div className="flex flex-wrap items-center justify-between text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-500">Sender Identity:</span>
            <span className="font-bold text-slate-900">
              {activeSenderName} &lt;{activeSenderEmail || 'active-user@company.com'}&gt;
            </span>
          </div>
          <span className="text-[11px] text-emerald-700 bg-emerald-50 font-semibold px-2 py-0.5 rounded border border-emerald-200">
            Ingversions Digital
          </span>
        </div>

        {/* Warning if any contacts lack an email */}
        {contactsWithoutEmail > 0 && (
          <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>{contactsWithoutEmail}</strong> contact{contactsWithoutEmail === 1 ? '' : 's'} without an email address will be skipped.
            </span>
          </div>
        )}

        {/* Merge tag toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 p-2.5 bg-indigo-50/50 border border-indigo-100 rounded-xl text-xs">
          <span className="text-indigo-900 font-semibold flex items-center gap-1 mr-1">
            <Variable className="w-3.5 h-3.5 text-indigo-600" />
            Insert merge tag:
          </span>
          {[
            '{{first_name}}',
            '{{company}}',
            '{{name}}',
            '{{title}}',
            '{{email}}',
          ].map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => insertVariable(tag)}
              className="px-2 py-0.5 rounded bg-white hover:bg-indigo-100 hover:text-indigo-700 text-slate-700 font-mono text-[11px] border border-indigo-200/60 transition cursor-pointer"
              title="Click to insert tag into message body"
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <Input
            label="Subject Line Template *"
            value={subjectTemplate}
            onChange={(e) => setSubjectTemplate(e.target.value)}
            placeholder="e.g. Following up - {{company}}"
            required
          />

          <Textarea
            label="Email Body Template *"
            value={bodyTemplate}
            onChange={(e) => setBodyTemplate(e.target.value)}
            rows={8}
            className="font-normal text-slate-800 leading-relaxed font-sans"
            required
          />
        </div>

        {/* Live Preview Switcher */}
        {previewContact && (
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-indigo-600" />
                Live Preview ({previewIndex + 1} of {contactsWithEmail.length}):{' '}
                <span className="text-indigo-600 font-extrabold">{previewContact.name}</span>
                {resolveContactCompany(previewContact) && (
                  <span className="text-slate-400 font-normal">
                    ({resolveContactCompany(previewContact)})
                  </span>
                )}
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={previewIndex === 0}
                  onClick={() => setPreviewIndex((p) => Math.max(0, p - 1))}
                  className="px-2.5 py-0.5 text-xs bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 cursor-pointer font-medium"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={previewIndex >= contactsWithEmail.length - 1}
                  onClick={() =>
                    setPreviewIndex((p) =>
                      Math.min(contactsWithEmail.length - 1, p + 1)
                    )
                  }
                  className="px-2.5 py-0.5 text-xs bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 cursor-pointer font-medium"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 text-xs space-y-2 font-sans shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 border-b border-slate-100 pb-1.5">
                <div>
                  <span className="font-semibold text-slate-600">To:</span>{' '}
                  <span className="text-slate-800">{previewContact.email || 'No email set'}</span>
                </div>
                <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Variables Populated</span>
                </div>
              </div>
              <div className="text-slate-800 font-bold">
                <span className="text-slate-400 font-normal mr-1">Subject:</span>
                {renderedSubject}
              </div>
              <div className="pt-2 border-t border-slate-100 whitespace-pre-wrap text-slate-700 leading-relaxed">
                {renderedBody}
              </div>
            </div>
          </div>
        )}

        {/* Sending Progress Bar */}
        {isSending && (
          <div className="space-y-1.5 p-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
            <div className="flex justify-between text-xs text-indigo-900 font-semibold">
              <span className="flex items-center gap-1.5">
                <RotateCw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                Dispatching personalized follow-up batch...
              </span>
              <span className="font-bold">{progress}%</span>
            </div>
            <div className="w-full h-2.5 bg-indigo-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-600 to-emerald-500 transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Sender: <strong className="text-slate-800">Uday Raj • Ingversions Digital</strong>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              isLoading={isSending}
              leftIcon={activeTemplateKey === 'followup' ? <RotateCw className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              onClick={handleSendBulk}
              className={activeTemplateKey === 'followup' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            >
              Send to {contactsWithEmail.length} Contact{contactsWithEmail.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
