import React, { useState, useEffect } from 'react';
import { Company, Contact } from '../../types/crm';
import { db } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Building2, Globe, Users, Plus, ExternalLink, RefreshCw } from 'lucide-react';

interface CompaniesViewProps {
  contacts: Contact[];
  onSelectContact: (contact: Contact) => void;
}

export const CompaniesView: React.FC<CompaniesViewProps> = ({
  contacts,
  onSelectContact,
}) => {
  const { success, error } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchCompanies = async () => {
    setIsLoading(true);
    try {
      const data = await db.getCompanies();
      setCompanies(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      error('Name required', 'Please provide a company name.');
      return;
    }

    setIsSaving(true);
    try {
      await db.addCompany({
        name: companyName.trim(),
        industry: industry.trim() || undefined,
        website: website.trim() || undefined,
      });
      success('Company Added', `${companyName} was created.`);
      setCompanyName('');
      setIndustry('');
      setWebsite('');
      setIsAddModalOpen(false);
      fetchCompanies();
    } catch (err: any) {
      error('Failed to add company', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Companies & Organizations</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage account portfolios and associate key stakeholder contacts.
          </p>
        </div>

        <Button
          size="sm"
          variant="primary"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsAddModalOpen(true)}
        >
          Add Company
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {companies.map((comp) => {
          const associatedContacts = contacts.filter((c) => c.company_id === comp.id);

          return (
            <div
              key={comp.id}
              className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-sm transition-all space-y-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{comp.name}</h3>
                    <p className="text-xs text-slate-500">{comp.industry || 'General Business'}</p>
                  </div>
                </div>

                {comp.website && (
                  <a
                    href={comp.website.startsWith('http') ? comp.website : `https://${comp.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                    title={comp.website}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>

              {/* Associated Contacts List */}
              <div className="pt-2 border-t border-slate-100">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  <span>Contacts ({associatedContacts.length})</span>
                </div>

                {associatedContacts.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No contacts linked yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {associatedContacts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onSelectContact(c)}
                        className="w-full text-left p-1.5 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs group transition"
                      >
                        <span className="font-semibold text-slate-800 group-hover:text-indigo-600">
                          {c.name}
                        </span>
                        <span className="text-[11px] text-slate-500">{c.title || c.status}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        maxWidth="md"
        title="Add Company / Organization"
      >
        <form onSubmit={handleAddCompany} className="space-y-3.5">
          <Input
            label="Company Name *"
            placeholder="e.g. Acme Corporation"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Industry"
            placeholder="e.g. Cloud Software / FinTech"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />

          <Input
            label="Website (Optional)"
            placeholder="https://acme.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>
              Save Company
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
