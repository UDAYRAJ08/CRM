import React, { useState, useEffect } from 'react';
import { Deal, DealStage, Contact, Company, TeamMember } from '../../types/crm';
import { db } from '../../lib/supabase';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  DollarSign,
  TrendingUp,
  Calendar,
  Building2,
  User,
  Tag,
  FileText,
  Sparkles,
} from 'lucide-react';

interface DealModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealToEdit?: Deal | null;
  initialContact?: Contact | null;
  initialCompany?: Company | null;
  onSuccess?: () => void;
}

const STAGES: { id: DealStage; label: string; defaultProbability: number; color: string }[] = [
  { id: 'discovery', label: 'Discovery', defaultProbability: 10, color: 'bg-slate-100 text-slate-700' },
  { id: 'qualified', label: 'Qualified', defaultProbability: 25, color: 'bg-blue-100 text-blue-800' },
  { id: 'proposal', label: 'Proposal Sent', defaultProbability: 50, color: 'bg-indigo-100 text-indigo-800' },
  { id: 'negotiation', label: 'Negotiation', defaultProbability: 75, color: 'bg-amber-100 text-amber-800' },
  { id: 'won', label: 'Closed Won', defaultProbability: 100, color: 'bg-emerald-100 text-emerald-800' },
  { id: 'lost', label: 'Closed Lost', defaultProbability: 0, color: 'bg-rose-100 text-rose-800' },
];

export const DealModal: React.FC<DealModalProps> = ({
  isOpen,
  onClose,
  dealToEdit,
  initialContact,
  initialCompany,
  onSuccess,
}) => {
  const { teamMembers, activeMember } = useTeam();
  const { success, error } = useToast();

  const [title, setTitle] = useState('');
  const [value, setValue] = useState<number | string>(5000);
  const [currency, setCurrency] = useState('USD');
  const [stage, setStage] = useState<DealStage>('discovery');
  const [probability, setProbability] = useState<number>(10);
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [contactId, setContactId] = useState<string>('');
  const [companyId, setCompanyId] = useState<string>('');
  const [ownerId, setOwnerId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available options
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Load contacts and companies for selectors
  useEffect(() => {
    if (isOpen) {
      Promise.all([db.getContacts(), db.getCompanies()]).then(([cList, compList]) => {
        setContacts(cList);
        setCompanies(compList);
      });
    }
  }, [isOpen]);

  // Reset or Populate form
  useEffect(() => {
    if (!isOpen) return;

    if (dealToEdit) {
      setTitle(dealToEdit.title);
      setValue(dealToEdit.value);
      setCurrency(dealToEdit.currency || 'USD');
      setStage(dealToEdit.stage);
      setProbability(dealToEdit.probability);
      setExpectedCloseDate(dealToEdit.expected_close_date || '');
      setContactId(dealToEdit.contact_id || '');
      setCompanyId(dealToEdit.company_id || '');
      setOwnerId(dealToEdit.owner_id || activeMember?.id || '');
      setNotes(dealToEdit.notes || '');
    } else {
      const defaultTitle = initialContact
        ? `${initialContact.name} - Opportunity`
        : initialCompany
        ? `${initialCompany.name} - Deal`
        : '';
      setTitle(defaultTitle);
      setValue(5000);
      setCurrency('USD');
      setStage('discovery');
      setProbability(10);

      // Default expected close date = 30 days from now
      const in30Days = new Date();
      in30Days.setDate(in30Days.getDate() + 30);
      setExpectedCloseDate(in30Days.toISOString().split('T')[0]);

      setContactId(initialContact?.id || '');
      setCompanyId(initialContact?.company_id || initialCompany?.id || '');
      setOwnerId(activeMember?.id || '');
      setNotes('');
    }
  }, [isOpen, dealToEdit, initialContact, initialCompany, activeMember]);

  // When stage changes, auto-update default probability
  const handleStageChange = (newStage: DealStage) => {
    setStage(newStage);
    const found = STAGES.find((s) => s.id === newStage);
    if (found) {
      setProbability(found.defaultProbability);
    }
  };

  const handlePresetValue = (presetAmount: number) => {
    setValue(presetAmount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      error('Title Required', 'Please provide a name for this deal.');
      return;
    }

    setIsSubmitting(true);
    try {
      const numValue = Number(value) || 0;
      const dealPayload: Partial<Deal> = {
        title: title.trim(),
        value: numValue,
        currency,
        stage,
        probability: Number(probability) || 0,
        expected_close_date: expectedCloseDate || null,
        contact_id: contactId || null,
        company_id: companyId || null,
        owner_id: ownerId || null,
        notes: notes.trim() || null,
        actual_close_date: stage === 'won' || stage === 'lost' ? new Date().toISOString().split('T')[0] : null,
      };

      if (dealToEdit) {
        await db.updateDeal(dealToEdit.id, dealPayload);
        success('Deal Updated', `Updated "${title}" successfully.`);
      } else {
        await db.addDeal(dealPayload);
        success('Deal Created!', `Added "${title}" to your sales pipeline.`);
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      error('Failed to save deal', err.message || 'An error occurred while saving.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {dealToEdit ? 'Edit Opportunity' : 'New Sales Opportunity'}
            </h3>
            <p className="text-xs text-slate-500">
              Track value, stage progression, and probability toward closing.
            </p>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        {/* Deal Title */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Deal Name / Opportunity Title *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Enterprise License Expansion - Q3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-xs sm:text-sm bg-white border border-slate-300 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {/* Value & Currency */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Deal Value ({currency}) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-sm font-bold text-slate-400">$</span>
              <input
                type="number"
                min="0"
                step="100"
                required
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full text-xs sm:text-sm bg-white border border-slate-300 focus:border-emerald-500 rounded-xl pl-8 pr-3.5 py-2.5 font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            {/* Quick Value Presets */}
            <div className="flex gap-1.5 mt-1.5">
              {[1000, 5000, 15000, 25000, 50000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handlePresetValue(amt)}
                  className="px-2 py-0.5 text-[11px] rounded-md bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 font-medium transition cursor-pointer border border-slate-200/60"
                >
                  ${amt >= 1000 ? `${amt / 1000}k` : amt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full text-xs sm:text-sm bg-white border border-slate-300 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD ($)</option>
              <option value="AUD">AUD ($)</option>
            </select>
          </div>
        </div>

        {/* Stage & Probability */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Pipeline Stage
            </label>
            <select
              value={stage}
              onChange={(e) => handleStageChange(e.target.value as DealStage)}
              className="w-full text-xs sm:text-sm bg-white border border-slate-300 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.defaultProbability}%)
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-700">Win Probability</label>
              <span className="text-xs font-bold text-emerald-600">{probability}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={probability}
              onChange={(e) => setProbability(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 mt-2"
            />
          </div>
        </div>

        {/* Linked Contact & Company */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Linked Contact (Lead)
            </label>
            <select
              value={contactId}
              onChange={(e) => {
                const cId = e.target.value;
                setContactId(cId);
                const foundContact = contacts.find((c) => c.id === cId);
                if (foundContact?.company_id && !companyId) {
                  setCompanyId(foundContact.company_id);
                }
              }}
              className="w-full text-xs sm:text-sm bg-white border border-slate-300 focus:border-emerald-500 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">No Contact Selected</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.title ? `(${c.title})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Company / Account
            </label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full text-xs sm:text-sm bg-white border border-slate-300 focus:border-emerald-500 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">No Company Selected</option>
              {companies.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Close Date & Deal Owner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Expected Close Date
            </label>
            <input
              type="date"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
              className="w-full text-xs sm:text-sm bg-white border border-slate-300 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Deal Owner (Sales Rep)
            </label>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full text-xs sm:text-sm bg-white border border-slate-300 focus:border-emerald-500 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Unassigned</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.role ? `(${m.role})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Deal Notes & Strategy
          </label>
          <textarea
            rows={3}
            placeholder="Key decision makers, budget approval milestones, competitor notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full text-xs sm:text-sm bg-white border border-slate-300 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
            {isSubmitting ? 'Saving...' : dealToEdit ? 'Save Changes' : 'Create Opportunity'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
