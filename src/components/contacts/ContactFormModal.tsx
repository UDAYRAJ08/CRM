import React, { useState, useEffect } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Contact, Company, ContactStatus } from '../../types/crm';
import { db } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { User, Building, Mail, Phone, Tag, Briefcase, Plus, X } from 'lucide-react';

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact?: Contact | null;
  onSaveComplete: (savedContact: Contact) => void;
}

export const ContactFormModal: React.FC<ContactFormModalProps> = ({
  isOpen,
  onClose,
  contact,
  onSaveComplete,
}) => {
  const { teamMembers, activeMember } = useTeam();
  const { success, error } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [status, setStatus] = useState<ContactStatus>('new');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      db.getCompanies().then(setCompanies);

      if (contact) {
        setName(contact.name || '');
        setEmail(contact.email || '');
        setPhone(contact.phone || '');
        setTitle(contact.title || '');
        setCompanyId(contact.company_id || '');
        setOwnerId(contact.owner_id || activeMember?.id || '');
        setStatus(contact.status || 'new');
        setTags(contact.tags || []);
      } else {
        setName('');
        setEmail('');
        setPhone('');
        setTitle('');
        setCompanyId('');
        setNewCompanyName('');
        setOwnerId(activeMember?.id || '');
        setStatus('new');
        setTags([]);
      }
    }
  }, [isOpen, contact, activeMember]);

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      error('Name required', 'Please enter a contact name.');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalCompanyId = companyId || null;

      if (newCompanyName.trim()) {
        const createdComp = await db.addCompany({ name: newCompanyName.trim() });
        finalCompanyId = createdComp.id;
      }

      const payload: Partial<Contact> = {
        id: contact?.id,
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        title: title.trim() || null,
        company_id: finalCompanyId,
        owner_id: ownerId || activeMember?.id || null,
        status,
        tags,
      };

      const saved = await db.saveContact(payload);
      success(
        contact ? 'Contact Updated' : 'Contact Created',
        `${saved.name} has been saved.`
      );
      onSaveComplete(saved);
      onClose();
    } catch (err: any) {
      error('Failed to save contact', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusOptions = [
    { value: 'new', label: 'New Lead' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'qualified', label: 'Qualified' },
    { value: 'proposal', label: 'Proposal Sent' },
    { value: 'won', label: 'Closed Won' },
    { value: 'lost', label: 'Closed Lost' },
    { value: 'inactive', label: 'Inactive' },
  ];

  const companyOptions = [
    { value: '', label: '-- Select Company --' },
    ...companies.map((c) => ({ value: c.id, label: c.name })),
  ];

  const ownerOptions = [
    { value: '', label: '-- Unassigned --' },
    ...teamMembers.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      title={contact ? `Edit ${contact.name}` : 'Create New Contact'}
      description="Add details to keep track of interactions, communications, and deals."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Full Name *"
            placeholder="e.g. Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            leftIcon={<User className="w-4 h-4" />}
            required
            autoFocus
          />

          <Input
            label="Job Title"
            placeholder="e.g. VP of Product"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            leftIcon={<Briefcase className="w-4 h-4" />}
          />

          <Input
            label="Email Address"
            placeholder="jane@company.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="w-4 h-4" />}
          />

          <Input
            label="Phone Number"
            placeholder="+1 (555) 000-0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            leftIcon={<Phone className="w-4 h-4" />}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div>
            <Select
              label="Company / Account"
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                if (e.target.value) setNewCompanyName('');
              }}
              options={companyOptions}
            />
            {!companyId && (
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="Or enter new company name..."
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}
          </div>

          <Select
            label="Pipeline Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ContactStatus)}
            options={statusOptions}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Account Owner"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            options={ownerOptions}
            helperText="Attributed team member managing this relationship"
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Tags & Segments
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. VIP, Q4 Target"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="flex-1 text-xs border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddTag}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-indigo-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            {contact ? 'Save Changes' : 'Create Contact'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
