import React, { useState } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Contact } from '../../types/crm';
import { sendEmailDirectly, substituteMergeFields } from '../../lib/emailService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { Mail, Send, Users, Sparkles, CheckCircle2, Eye, Variable } from 'lucide-react';

interface BulkEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedContacts: Contact[];
  onComplete: () => void;
}

export const BulkEmailModal: React.FC<BulkEmailModalProps> = ({
  isOpen,
  onClose,
  selectedContacts,
  onComplete,
}) => {
  const { activeMember } = useTeam();
  const { success, error, info } = useToast();

  const [subjectTemplate, setSubjectTemplate] = useState('Need help meeting upcoming deadlines for {{company}}?');
  const [bodyTemplate, setBodyTemplate] = useState(
    `Hyy {{first_name}},\n\nIf you are looking for a dedicated team that can help you execute your tasks and ensure you meet upcoming project deadlines with ease, we would love to connect.\n\nWe specialize in assisting teams at {{company}} to scale their output, eliminate bandwidth bottlenecks, and hit every target on schedule.\n\nAre you available for a quick 10-minute introductory call this week?\n\nBest regards,\n${activeMember?.name || 'CRM Team'}`
  );
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(0);

  const previewContact = selectedContacts[previewIndex] || selectedContacts[0];
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

    const contactsWithEmail = selectedContacts.filter((c) => Boolean(c.email));
    if (contactsWithEmail.length === 0) {
      error('No valid emails', 'None of the selected contacts have an email address.');
      return;
    }

    setIsSending(true);
    setProgress(0);

    let sentCount = 0;
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
          senderId: activeMember?.id,
          senderName: activeMember?.name,
          aiGenerated: false,
        });
        sentCount++;
      } catch (err) {
        console.error('Failed sending to', contact.email, err);
      }

      setProgress(Math.round(((i + 1) / contactsWithEmail.length) * 100));
      // Artificial slight delay for queue feel
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    setIsSending(false);
    success(
      'Bulk Campaign Sent!',
      `Successfully queued and logged emails for ${sentCount} contacts.`
    );
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
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Bulk Email Campaign ({selectedContacts.length} Contacts)
            </h3>
            <p className="text-xs text-slate-500">
              Send personalized templated emails with dynamic merge tags to selected recipients.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Merge tag toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
          <span className="text-slate-500 font-semibold flex items-center gap-1 mr-1">
            <Variable className="w-3.5 h-3.5 text-indigo-600" />
            Merge tags:
          </span>
          {[
            '{{name}}',
            '{{first_name}}',
            '{{company}}',
            '{{title}}',
            '{{email}}',
          ].map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => insertVariable(tag)}
              className="px-2 py-0.5 rounded bg-white hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-mono text-[11px] border border-slate-200 transition"
              title="Click to insert"
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
            placeholder="e.g. Quick question for {{company}}"
            required
          />

          <Textarea
            label="Email Body Template *"
            value={bodyTemplate}
            onChange={(e) => setBodyTemplate(e.target.value)}
            rows={7}
            className="font-normal text-slate-800 leading-relaxed"
            required
          />
        </div>

        {/* Live Preview Switcher */}
        {previewContact && (
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-indigo-600" />
                Live Preview ({previewIndex + 1} of {selectedContacts.length}):{' '}
                <span className="text-indigo-600">{previewContact.name}</span>
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={previewIndex === 0}
                  onClick={() => setPreviewIndex((p) => Math.max(0, p - 1))}
                  className="px-2 py-0.5 text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={previewIndex >= selectedContacts.length - 1}
                  onClick={() =>
                    setPreviewIndex((p) =>
                      Math.min(selectedContacts.length - 1, p + 1)
                    )
                  }
                  className="px-2 py-0.5 text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-1.5 font-sans">
              <div className="text-slate-500">
                <strong>To:</strong> {previewContact.email || 'No email'}
              </div>
              <div className="text-slate-800 font-semibold">
                <strong>Subject:</strong> {renderedSubject}
              </div>
              <div className="pt-2 border-t border-slate-100 whitespace-pre-wrap text-slate-700 leading-relaxed">
                {renderedBody}
              </div>
            </div>
          </div>
        )}

        {/* Sending Progress Bar */}
        {isSending && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-600 font-semibold">
              <span>Dispatching email batch...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Attributed to: <strong className="text-slate-800">{activeMember?.name || 'CRM Team'}</strong>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              isLoading={isSending}
              leftIcon={<Send className="w-4 h-4" />}
              onClick={handleSendBulk}
            >
              Send to {selectedContacts.length} Contacts
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
