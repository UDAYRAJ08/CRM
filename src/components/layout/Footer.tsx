import React, { useState } from 'react';
import { CheckCircle2, Database } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

type FooterModal = 'docs' | 'privacy' | 'status' | null;

const linkClass = 'hover:text-slate-900 transition-colors cursor-pointer';

const GUIDE = [
  {
    title: 'AI email drafts',
    body: 'Open a contact, click "Compose Email", and use the AI prompt bar to draft outreach or replies.',
  },
  {
    title: 'Excel & CSV import',
    body: 'Use Import in the header to upload .xlsx or .csv files. Columns (Name, Email, Phone, Company) are matched automatically and duplicates are skipped.',
  },
  {
    title: 'Sales pipeline',
    body: 'Drag deals between stages (Discovery, Qualified, Proposal, Won/Lost). Amounts and win probabilities update in real time.',
  },
  {
    title: 'Follow-up reminders',
    body: "Schedule tasks with due dates. Overdue and today's tasks show as counts in the sidebar.",
  },
];

const PRIVACY = [
  {
    title: 'Data stays in your database',
    body: 'Contact lists and credentials remain in your organization database and are not sent to external analytics providers.',
  },
  {
    title: 'No ad trackers',
    body: 'No tracking pixels, marketing beacons or third-party profiling scripts.',
  },
  {
    title: 'Role-based access',
    body: 'Roles (Administrator, Manager, Employee) control editing, invitations and bulk actions.',
  },
];

export const Footer: React.FC = () => {
  const [activeModal, setActiveModal] = useState<FooterModal>(null);
  const close = () => setActiveModal(null);

  return (
    <>
      <footer className="w-full border-t border-slate-200 px-4 sm:px-6 lg:px-8 py-4 mt-auto text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; {new Date().getFullYear()} Team CRM</span>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1" aria-label="Footer">
            <button type="button" onClick={() => setActiveModal('docs')} className={linkClass}>
              Guide
            </button>
            <button type="button" onClick={() => setActiveModal('privacy')} className={linkClass}>
              Privacy
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('status')}
              className={`${linkClass} inline-flex items-center gap-1.5`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${isSupabaseConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`}
                aria-hidden="true"
              />
              Status
            </button>
            <a
              href="mailto:support@teamcrm.internal?subject=Team%20CRM%20Feedback%20or%20Support"
              className={linkClass}
            >
              Support
            </a>
          </nav>
        </div>
      </footer>

      <Modal isOpen={activeModal === 'docs'} onClose={close} title="Quick guide" maxWidth="lg">
        <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
          {GUIDE.map((g) => (
            <div key={g.title}>
              <h4 className="font-medium text-slate-900 mb-0.5">{g.title}</h4>
              <p>{g.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={close}>Got it</Button>
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'privacy'} onClose={close} title="Privacy & security" maxWidth="lg">
        <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
          {PRIVACY.map((p) => (
            <div key={p.title} className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-slate-900">{p.title}</h4>
                <p className="mt-0.5">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={close}>
            Close
          </Button>
        </div>
      </Modal>

      <Modal isOpen={activeModal === 'status'} onClose={close} title="System status" maxWidth="md">
        <div className="p-3 rounded-lg bg-slate-50 flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-slate-700">
            <Database className="w-4 h-4 text-slate-400" />
            Database
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-900">
            <span className={`w-2 h-2 rounded-full ${isSupabaseConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {isSupabaseConfigured ? 'Connected' : 'Local mode (not configured)'}
          </span>
        </div>
        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={close}>
            Close
          </Button>
        </div>
      </Modal>
    </>
  );
};
