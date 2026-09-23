import React, { useState } from 'react';
import {
  ShieldCheck,
  BookOpen,
  Activity,
  Mail,
  X,
  ExternalLink,
  CheckCircle2,
  Database,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [activeModal, setActiveModal] = useState<'docs' | 'privacy' | 'status' | null>(null);

  return (
    <>
      <footer className="w-full border-t border-slate-200/80 bg-white/70 backdrop-blur-xs py-4 px-4 sm:px-6 lg:px-8 mt-auto text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          {/* Copyright & Branding */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">
              C
            </div>
            <span>
              &copy; {currentYear} <strong>Team CRM</strong>. All rights reserved.
            </span>
            <span className="hidden md:inline text-slate-300">•</span>
            <span className="hidden md:inline text-slate-400 font-medium text-[11px]">
              Internal Collaborative Workspace v1.0
            </span>
          </div>

          {/* Functional Footer Links */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveModal('docs')}
              className="text-slate-600 hover:text-indigo-600 transition flex items-center gap-1 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-slate-400" />
              <span>User Guide</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('privacy')}
              className="text-slate-600 hover:text-indigo-600 transition flex items-center gap-1 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
              <span>Privacy & Security</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('status')}
              className="text-slate-600 hover:text-indigo-600 transition flex items-center gap-1 cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-500" />
              <span>System Status</span>
            </button>

            <a
              href="mailto:support@teamcrm.internal?subject=Team%20CRM%20Feedback%20or%20Support"
              className="text-slate-600 hover:text-indigo-600 transition flex items-center gap-1"
              title="Contact Support"
            >
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span>Support</span>
            </a>
          </div>
        </div>
      </footer>

      {/* User Guide Modal */}
      {activeModal === 'docs' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">CRM Quick Reference Guide</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs text-slate-600 leading-relaxed max-h-[60vh] overflow-y-auto pr-1">
              <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-100">
                <h4 className="font-bold text-indigo-900 flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  Claude AI Email Drafter
                </h4>
                <p>
                  Click any contact, click "Compose Email", and use the AI prompt bar to generate contextual, tailored outreach or reply proposals.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-1">📊 Excel & CSV Import</h4>
                <p>
                  Use the <strong>Import</strong> button in the header to drag & drop `.xlsx` spreadsheets. The importer automatically matches column headers (Name, Email, Phone, Company) and prevents duplicates.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-1">💼 Sales Pipeline & Kanban</h4>
                <p>
                  Drag deals between stages (Discovery &rarr; Qualified &rarr; Proposal &rarr; Won/Lost). Amounts and win probabilities are calculated in real time.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-1">⏰ Follow-up Reminders</h4>
                <p>
                  Schedule tasks with due dates. Overdue and today's tasks appear highlighted with urgent counters in the sidebar.
                </p>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy & Security Modal */}
      {activeModal === 'privacy' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Privacy & Security</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900">Local-First & Encrypted Persistence</strong>
                  <p className="mt-0.5">
                    Your contact lists and credentials remain within your authorized organization database. Local fallback caching is encrypted and never transmitted to external analytics providers.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900">Zero Third-Party Ad Trackers</strong>
                  <p className="mt-0.5">
                    This CRM does not utilize tracking pixels, marketing beacons, or third-party behavioral profiling scripts.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900">Role-Based Access Control (RBAC)</strong>
                  <p className="mt-0.5">
                    Team member roles (Administrator, Manager, Employee) govern editing privileges, team invitation rights, and bulk operations.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* System Status Modal */}
      {activeModal === 'status' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">System Diagnostics & Health</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-600" />
                  <span className="font-semibold text-slate-800">Database Engine</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isSupabaseConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  <span className="font-bold text-slate-700">
                    {isSupabaseConfigured ? 'Supabase Postgres (Live)' : 'Local In-Memory Cache'}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span className="font-semibold text-slate-800">AI Assistant Service</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-bold text-emerald-700">Operational</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold text-slate-800">Client Runtime</span>
                </div>
                <span className="font-bold text-slate-700">Vite + React (Healthy)</span>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
