import React, { useState, useEffect } from 'react';
import { Users, BarChart3, Settings, Sparkles, Shield, ArrowRight, Clock } from 'lucide-react';
import { Linkedin } from './LinkedInIcon';
import { LinkedInAccountsView } from './LinkedInAccountsView';
import { LinkedInCampaignsView } from './LinkedInCampaignsView';
import { LinkedInAnalyticsView } from './LinkedInAnalyticsView';
import { LinkedInAgentModal } from './LinkedInAgentModal';
import { fetchLinkedInQuota, LinkedInQuotaInfo } from '../../lib/linkedinAutomationService';
import { Contact } from '../../types/crm';

interface LinkedInViewProps {
  contacts: Contact[];
  onRefresh?: () => void;
}

type LinkedInTab = 'accounts' | 'agent' | 'campaigns' | 'analytics';

const tabs: { id: LinkedInTab; label: string; icon: React.ReactNode }[] = [
  { id: 'accounts', label: 'Accounts', icon: <Settings className="w-4 h-4" /> },
  { id: 'agent', label: 'Prospecting Agent', icon: <Sparkles className="w-4 h-4 text-purple-600" /> },
  { id: 'campaigns', label: 'Campaigns', icon: <Users className="w-4 h-4" /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
];

export const LinkedInView: React.FC<LinkedInViewProps> = ({ contacts, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<LinkedInTab>('accounts');
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [quota, setQuota] = useState<LinkedInQuotaInfo>({
    date: new Date().toISOString().slice(0, 10),
    sentToday: 0,
    maxDailyLimit: 15,
    remaining: 15,
    hasSessionCookie: false,
  });

  useEffect(() => {
    fetchLinkedInQuota().then(setQuota);
  }, [activeTab]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Linkedin className="w-5 h-5 text-blue-600" />
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">LinkedIn Outreach</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Automate connection requests, profile views & messages via campaigns and the AI Agent
          </p>
        </div>

        {/* Primary Agent CTA Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAgentModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Launch Prospecting Agent
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200/80">
        <nav className="flex gap-1 -mb-px overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <span className={isActive ? 'text-blue-600' : 'text-slate-400'}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'accounts' && (
        <LinkedInAccountsView onOpenAgent={() => setIsAgentModalOpen(true)} />
      )}

      {activeTab === 'agent' && (
        <div className="space-y-6">
          {/* Agent intro */}
          <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-4">
            <div className="max-w-2xl space-y-1.5">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                Find prospects and send connection requests
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Enter keywords or paste a LinkedIn search URL. The agent finds 2nd-degree prospects, filters by title, and sends requests with random 45–120s delays to keep your account safe.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 text-xs">
              <div className="rounded-xl px-4 py-2.5 bg-slate-50 flex items-center gap-3">
                <Shield className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <div className="text-slate-500 text-[11px]">Daily limit</div>
                  <div className="font-medium text-slate-900">
                    {quota.sentToday} / {quota.maxDailyLimit} sent today ({quota.remaining} left)
                  </div>
                </div>
              </div>
              <div className="rounded-xl px-4 py-2.5 bg-slate-50 flex items-center gap-3">
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <div className="text-slate-500 text-[11px]">Delay between actions</div>
                  <div className="font-medium text-slate-900">45s – 120s, randomized</div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsAgentModalOpen(true)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors"
            >
              Start new batch
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                1
              </div>
              <h3 className="text-sm font-bold text-slate-900">Dual Search Input</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Enter keyword queries with target titles or paste exact LinkedIn search results URLs directly from your browser.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                2
              </div>
              <h3 className="text-sm font-bold text-slate-900">Hard Filters & Deduplication</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Automatically skips negative titles (e.g. "Intern", "Student") and prevents connecting to existing CRM leads or 1st-degree contacts.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                3
              </div>
              <h3 className="text-sm font-bold text-slate-900">Free Account Safe Invites</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Sends high-converting blank invites or AI notes (&lt;300 chars) with auto-fallback to blank requests if monthly note quotas are reached.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'campaigns' && <LinkedInCampaignsView contacts={contacts} onRefresh={onRefresh} />}
      {activeTab === 'analytics' && <LinkedInAnalyticsView />}

      {/* Prospecting Agent Modal */}
      <LinkedInAgentModal
        isOpen={isAgentModalOpen}
        onClose={() => setIsAgentModalOpen(false)}
        contacts={contacts}
        onRefreshContacts={onRefresh}
      />
    </div>
  );
};
