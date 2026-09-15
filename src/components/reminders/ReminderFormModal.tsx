import React, { useState, useEffect } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Reminder, Contact } from '../../types/crm';
import { db } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea, Select } from '../ui/Input';
import { CalendarCheck2, Clock, User, Calendar } from 'lucide-react';

interface ReminderFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact?: Contact | null;
  reminder?: Reminder | null;
  onSaveComplete: (saved: Reminder) => void;
}

export const ReminderFormModal: React.FC<ReminderFormModalProps> = ({
  isOpen,
  onClose,
  contact,
  reminder,
  onSaveComplete,
}) => {
  const { teamMembers, activeMember } = useTeam();
  const { success, error } = useToast();

  const [contactId, setContactId] = useState('');
  const [contactsList, setContactsList] = useState<Contact[]>([]);
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      db.getContacts().then(setContactsList);

      if (reminder) {
        setContactId(reminder.contact_id);
        setAssignedTo(reminder.assigned_to || activeMember?.id || '');
        setDueDate(reminder.due_date ? reminder.due_date.slice(0, 16) : '');
        setNote(reminder.note || '');
      } else {
        setContactId(contact?.id || '');
        setAssignedTo(activeMember?.id || '');
        // Default due date: tomorrow at 10:00 AM
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        setDueDate(tomorrow.toISOString().slice(0, 16));
        setNote('');
      }
    }
  }, [isOpen, contact, reminder, activeMember]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactId) {
      error('Contact required', 'Please select a contact for this reminder.');
      return;
    }
    if (!note.trim() || !dueDate) {
      error('Missing fields', 'Due date and reminder note are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const saved = await db.saveReminder({
        id: reminder?.id,
        contact_id: contactId,
        assigned_to: assignedTo || activeMember?.id || null,
        due_date: new Date(dueDate).toISOString(),
        note: note.trim(),
        done: reminder?.done || false,
      });

      success(
        reminder ? 'Reminder Updated' : 'Reminder Scheduled',
        `Follow-up due on ${new Date(dueDate).toLocaleDateString()}`
      );
      onSaveComplete(saved);
      onClose();
    } catch (err: any) {
      error('Failed to save reminder', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const contactOptions = [
    { value: '', label: '-- Select Contact --' },
    ...contactsList.map((c) => ({
      value: c.id,
      label: `${c.name} ${c.company?.name ? `(${c.company.name})` : ''}`,
    })),
  ];

  const assigneeOptions = [
    { value: '', label: '-- Unassigned --' },
    ...teamMembers.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
            <CalendarCheck2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {reminder ? 'Edit Follow-up Reminder' : 'Set Follow-up Reminder'}
            </h3>
            <p className="text-xs text-slate-500">
              Schedule follow-up tasks and assign them to any team member.
            </p>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!contact && (
          <Select
            label="Related Contact *"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            options={contactOptions}
            required
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Due Date & Time *"
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />

          <Select
            label="Assigned To"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            options={assigneeOptions}
          />
        </div>

        <Textarea
          label="Reminder Note / Action Item *"
          placeholder="e.g. Call to finalize contract terms, send updated pricing..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          required
        />

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            {reminder ? 'Update Reminder' : 'Set Reminder'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
