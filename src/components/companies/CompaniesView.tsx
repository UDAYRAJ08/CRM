import React, { useState, useEffect } from 'react';
import { Company, Contact, Deal } from '../../types/crm';
import { db } from '../../lib/supabase';
import { cleanCompanyName, getCompanyUrl } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Building2, Globe, Users, Plus, ExternalLink, RefreshCw, DollarSign } from 'lucide-react';

interface CompaniesViewProps {
  contacts: Contact[];
  onSelectContact: (contact: Contact) => void;
}

export const CompaniesView: React.FC<CompaniesViewProps> = ({
  contacts,
  onSelectContact,
}) => {
  const { success, error } = useToast();
  const { canManageCompanies } = usePermissions();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchCompanies = async () => {
    setIsLoading(true);
    try {
      const [compData, dealsData] = await Promise.all([db.getCompanies(), db.getDeals()]);
      setCompanies(compData);
      setDeals(dealsData);
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
    if (!canManageCompanies) {
      error('Access Restricted', 'Only Administrators and Managers have permission to add company accounts.');
      return;
    }
    if (!companyName.trim()) {
      error('Name required', 'Please provide a company name.');
      return;
    }

    setIsSaving(true);
    try {
      const cleanName = cleanCompanyName(companyName) || companyName.trim();
      const websiteUrl = website.trim() || (companyName.trim().includes('.') ? getCompanyUrl({ name: companyName }) : undefined);
      await db.addCompany({
        name: cleanName,
        industry: industry.trim() || undefined,
        website: websiteUrl,
      });
      success('Company Added', `${cleanName} was created.`);
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Companies</h1>
          <p className="text-sm text-slate-500 mt-1">
            Accounts and the contacts linked to them.
          </p>
        </div>

        {canManageCompanies && (
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsAddModalOpen(true)}
          >
            Add Company
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {companies.map((comp) => {
          const associatedContacts = contacts.filter((c) => c.company_id === comp.id);
          const compDeals = deals.filter((d) => d.company_id === comp.id);
          const compDealValue = compDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
          const displayWebsite = comp.website || (comp.name.includes('.') ? getCompanyUrl(comp) : '');

          return (
            <div
              key={comp.id}
              className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-slate-300-sm transition-all space-y-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{cleanCompanyName(comp.name)}</h3>
                    <p className="text-xs text-slate-500">{comp.industry || 'General Business'}</p>
                  </div>
                </div>

                {displayWebsite && (
                  <a
                    href={displayWebsite.startsWith('http') ? displayWebsite : `https://${displayWebsite}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                    title={displayWebsite}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>

              {/* Company Deals Banner if active */}
              {compDeals.length > 0 && (
                <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-emerald-50/80 text-emerald-900 font-semibold border border-emerald-100">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{compDeals.length} {compDeals.length === 1 ? 'Opportunity' : 'Opportunities'}</span>
                  </div>
                  <span className="font-semibold text-emerald-700">${compDealValue.toLocaleString()}</span>
                </div>
              )}

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
                        className="w-full text-left p-1.5 rounded-lg hover:bg-slate-50 flex items-center justify-between gap-3 text-xs group transition"
                      >
                        <span className="font-semibold text-slate-800 group-hover:text-indigo-600 shrink-0 max-w-[60%] truncate">
                          {c.name}
                        </span>
                        <span className="text-[11px] text-slate-500 min-w-0 flex-1 truncate text-right">{c.title || c.status}</span>
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
