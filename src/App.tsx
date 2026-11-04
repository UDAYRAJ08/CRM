import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TeamProvider, useTeam } from './context/TeamContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { Contact, Reminder } from './types/crm';
import { db, EmailDraft } from './lib/supabase';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { TeamMemberModal } from './components/layout/TeamMemberModal';
import { ContactList } from './components/contacts/ContactList';
import { ContactFormModal } from './components/contacts/ContactFormModal';
import { ContactDetailModal } from './components/contacts/ContactDetailModal';
import { ReminderFormModal } from './components/reminders/ReminderFormModal';
import { syncOutlookInbox } from './lib/inboundSyncService';
import { sendDueScheduledEmails } from './lib/scheduledEmailRunner';
import { runNextLinkedInAction } from './lib/linkedinQueueRunner';
import { LoginPage } from './components/auth/LoginPage';
import { OAuthConsentPage } from './components/auth/OAuthConsentPage';
import { MobileNavDrawer } from './components/layout/MobileNavDrawer';
import { Footer } from './components/layout/Footer';
import { NotFoundView } from './components/common/NotFoundView';
import { Loader2 } from 'lucide-react';
import type { BulkTemplateKey } from './components/email/BulkEmailModal';

// Heavy views and rarely-opened modals are split into their own chunks
const ExcelImportModal = lazy(() => import('./components/import/ExcelImportModal').then((m) => ({ default: m.ExcelImportModal })));
const ImportHistoryView = lazy(() => import('./components/import/ImportHistoryView').then((m) => ({ default: m.ImportHistoryView })));
const EmailComposerModal = lazy(() => import('./components/email/EmailComposerModal').then((m) => ({ default: m.EmailComposerModal })));
const BulkEmailModal = lazy(() => import('./components/email/BulkEmailModal').then((m) => ({ default: m.BulkEmailModal })));
const EmailSettingsModal = lazy(() => import('./components/email/EmailSettingsModal').then((m) => ({ default: m.EmailSettingsModal })));
const AISettingsModal = lazy(() => import('./components/email/AISettingsModal').then((m) => ({ default: m.AISettingsModal })));
const DraftsView = lazy(() => import('./components/email/DraftsView').then((m) => ({ default: m.DraftsView })));
const RemindersDashboard = lazy(() => import('./components/reminders/RemindersDashboard').then((m) => ({ default: m.RemindersDashboard })));
const CompaniesView = lazy(() => import('./components/companies/CompaniesView').then((m) => ({ default: m.CompaniesView })));
const InboxView = lazy(() => import('./components/inbox/InboxView').then((m) => ({ default: m.InboxView })));
const LinkedInComposerModal = lazy(() => import('./components/linkedin/LinkedInComposerModal').then((m) => ({ default: m.LinkedInComposerModal })));
const LinkedInView = lazy(() => import('./components/linkedin/LinkedInView').then((m) => ({ default: m.LinkedInView })));
const InviteModal = lazy(() => import('./components/team/InviteModal').then((m) => ({ default: m.InviteModal })));
const DashboardView = lazy(() => import('./components/dashboard/DashboardView').then((m) => ({ default: m.DashboardView })));
const PipelineView = lazy(() => import('./components/pipeline/PipelineView').then((m) => ({ default: m.PipelineView })));

export type ViewType = 'dashboard' | 'pipeline' | 'contacts' | 'inbox' | 'drafts' | 'reminders' | 'companies' | 'imports' | 'linkedin' | '404';

const ViewFallback: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    <p className="text-xs font-medium">Loading...</p>
  </div>
);

const CRMMain: React.FC = () => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { activeMember, isLoading: isTeamLoading, accessDenied, logout } = useTeam();
  const { success, info, error: toastError } = useToast();

  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [dealCount, setDealCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingInbox, setIsSyncingInbox] = useState(false);

  // Modals state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isContactFormOpen, setIsContactFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const selectedContactIdRef = React.useRef<string | null>(null);

  // Keep ref synchronized with state
  useEffect(() => {
    selectedContactIdRef.current = selectedContact?.id || null;
  }, [selectedContact]);

  const [isEmailComposerOpen, setIsEmailComposerOpen] = useState(false);
  const [emailTargetContact, setEmailTargetContact] = useState<Contact | null>(null);
  const [emailReplySubject, setEmailReplySubject] = useState<string | undefined>(undefined);
  const [isLinkedInComposerOpen, setIsLinkedInComposerOpen] = useState(false);
  const [linkedInTargetContact, setLinkedInTargetContact] = useState<Contact | null>(null);
  const [isBulkEmailOpen, setIsBulkEmailOpen] = useState(false);
  const [bulkEmailContacts, setBulkEmailContacts] = useState<Contact[]>([]);
  const [bulkEmailInitialTemplate, setBulkEmailInitialTemplate] = useState<BulkTemplateKey>('followup');
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [reminderTargetContact, setReminderTargetContact] = useState<Contact | null>(null);
  const [isEmailSettingsOpen, setIsEmailSettingsOpen] = useState(false);
  const [isAISettingsOpen, setIsAISettingsOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [resumingDraft, setResumingDraft] = useState<EmailDraft | null>(null);

  const countInboundReplies = async (_contactList: Contact[]) => {
    try {
      setInboxCount(await db.countInboundEmails());
    } catch (e) {
      console.warn('Error counting inbound replies:', e);
    }
  };

  const refreshAllData = useCallback(async () => {
    if (!user) return;
    try {
      const [fetchedContacts, fetchedReminders, fetchedDeals] = await Promise.all([
        db.getContacts(),
        db.getReminders(),
        db.getDeals(),
      ]);
      setContacts(fetchedContacts);
      setReminders(fetchedReminders);
      setDealCount(fetchedDeals.filter((d) => d.stage !== 'won' && d.stage !== 'lost').length);
      countInboundReplies(fetchedContacts);

      // Only update selectedContact if a contact is STILL selected (check ref)
      if (selectedContactIdRef.current) {
        const updated = fetchedContacts.find((c) => c.id === selectedContactIdRef.current);
        if (updated) {
          setSelectedContact(updated);
        }
      }
    } catch (e) {
      console.error('Error refreshing CRM data', e);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  const handleSyncInbox = async (silent = false) => {
    setIsSyncingInbox(true);
    try {
      const result = await syncOutlookInbox();
      if (result.newRepliesCount > 0) {
        success(
          '📥 New Email Reply Received!',
          `Found ${result.newRepliesCount} reply from ${result.matchedContacts.map((m) => m.contactName).join(', ')}`
        );
        await refreshAllData();
      } else if (!silent) {
        info('Inbox Synced', result.message);
        await refreshAllData();
      }
    } catch (err: any) {
      if (!silent) {
        console.error('Sync failed', err);
      }
    } finally {
      setIsSyncingInbox(false);
    }
  };

  // Sync on startup once contacts are loaded
  useEffect(() => {
    if (!isLoading && contacts.length > 0) {
      handleSyncInbox(true);
    }
  }, [isLoading]);

  // Background inbox sync: every 5 minutes only when tab is active and visible
  useEffect(() => {
    if (!user) return;

    // Check on tab refocus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleSyncInbox(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        handleSyncInbox(true);
      }
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  // Scheduled emails: send due drafts every 30s, and right away on load.
  useEffect(() => {
    if (!user) return;
    const sender = { id: activeMember?.id, name: activeMember?.name || user.user_metadata?.full_name };
    const tick = () =>
      sendDueScheduledEmails(sender)
        .then((outcomes) => {
          for (const o of outcomes) {
            if (o.ok) success('Scheduled email sent', o.message);
            else toastError('Scheduled email failed', `${o.message} It is back in Drafts.`);
          }
        })
        .catch((e) => console.warn('Scheduled email runner failed:', e));
    tick();
    const interval = setInterval(tick, 30 * 1000);
    return () => clearInterval(interval);
  }, [user, activeMember?.id, activeMember?.name]);

  // LinkedIn campaign queue: run one due action per minute through the extension.
  useEffect(() => {
    if (!user || !activeMember?.id) return;
    const memberId = activeMember.id;
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const res = await runNextLinkedInAction(memberId);
        if (res.processed && res.message) (res.ok ? info : toastError)('LinkedIn campaign', res.message);
      } catch (e) {
        console.warn('LinkedIn queue runner failed:', e);
      } finally {
        running = false;
      }
    };
    tick();
    const interval = setInterval(tick, 60 * 1000);
    return () => clearInterval(interval);
  }, [user, activeMember?.id]);

  // Hash-based routing synchronization & 404 detection
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').trim();
  const validViews: ViewType[] = ['dashboard', 'pipeline', 'contacts', 'inbox', 'drafts', 'reminders', 'companies', 'imports', 'linkedin'];
      if (!hash) {
        setActiveView('dashboard');
      } else if (validViews.includes(hash as ViewType)) {
        setActiveView(hash as ViewType);
      } else {
        setActiveView('404');
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleNavigate = (view: ViewType | string) => {
    window.location.hash = view;
    setActiveView(view as ViewType);
  };

  const activeRemindersCount = reminders.filter((r) => !r.done).length;

  // Dynamic document title updates
  useEffect(() => {
    const titles: Record<string, string> = {
      dashboard: 'Dashboard | Team CRM',
      pipeline: `Sales Pipeline (${dealCount} Deals) | Team CRM`,
      contacts: `Contacts (${contacts.length}) | Team CRM`,
      inbox: inboxCount > 0 ? `Inbox (${inboxCount} New) | Team CRM` : 'Inbox & Replies | Team CRM',
      drafts: draftCount > 0 ? `Drafts (${draftCount}) | Team CRM` : 'Email Drafts | Team CRM',
      reminders: activeRemindersCount > 0 ? `Tasks (${activeRemindersCount} Due) | Team CRM` : 'Tasks & Reminders | Team CRM',
      companies: 'Companies & Accounts | Team CRM',
      imports: 'Import History | Team CRM',
      linkedin: 'LinkedIn Outreach | Team CRM',
      '404': '404 Not Found | Team CRM',
    };
    document.title = titles[activeView] || 'Team CRM - Collaborative Workspace';
  }, [activeView, contacts.length, dealCount, inboxCount, draftCount, activeRemindersCount]);

  const handleOpenEmailComposer = (contact: Contact, replySubject?: string, draft?: EmailDraft) => {
    setEmailTargetContact(contact);
    setEmailReplySubject(replySubject);
    setResumingDraft(draft || null);
    setIsEmailComposerOpen(true);
  };

  const handleResumeDraft = (draft: EmailDraft) => {
    // Find the contact associated with the draft, or use a placeholder
    const contact = contacts.find((c) => c.id === draft.contact_id) ||
      (contacts.length > 0 ? contacts[0] : null);
    if (!contact) return;
    handleOpenEmailComposer(contact, undefined, draft);
  };

  const refreshDraftCount = useCallback(() => {
    setDraftCount(db.getDraftCount());
  }, []);

  // Sync draft count on load & view changes
  useEffect(() => {
    refreshDraftCount();
  }, [activeView, refreshDraftCount]);

  // Real-time synchronization for drafts, contacts, deals, and reminders without reloading
  useEffect(() => {
    const handleDraftsChange = () => {
      refreshDraftCount();
    };
    const handleDataChange = () => {
      refreshAllData();
    };

    window.addEventListener('crm_drafts_updated', handleDraftsChange);
    window.addEventListener('crm_contacts_updated', handleDataChange);
    window.addEventListener('crm_deals_updated', handleDataChange);
    window.addEventListener('crm_reminders_updated', handleDataChange);

    return () => {
      window.removeEventListener('crm_drafts_updated', handleDraftsChange);
      window.removeEventListener('crm_contacts_updated', handleDataChange);
      window.removeEventListener('crm_deals_updated', handleDataChange);
      window.removeEventListener('crm_reminders_updated', handleDataChange);
    };
  }, [refreshDraftCount, refreshAllData]);

  const handleOpenLinkedInComposer = (contact: Contact) => {
    setLinkedInTargetContact(contact);
    setIsLinkedInComposerOpen(true);
  };

  const handleOpenBulkEmail = (targetList: Contact[], initialTemplate: BulkTemplateKey = 'followup') => {
    setBulkEmailContacts(targetList);
    setBulkEmailInitialTemplate(initialTemplate);
    setIsBulkEmailOpen(true);
  };

  const handleOpenAddReminder = (contact?: Contact) => {
    setReminderTargetContact(contact || null);
    setIsReminderModalOpen(true);
  };

  if (isAuthLoading || (user && isTeamLoading)) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-400">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold animate-pulse">
          C
        </div>
        <p className="text-xs font-medium">Initializing workspace...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
          <h1 className="text-lg font-semibold text-white">You're not on this CRM team</h1>
          <p className="text-sm text-slate-400">
            <span className="text-slate-200">{user.email}</span> isn't on the team list. Ask an admin to invite
            you with this email, then sign in again.
          </p>
          <button
            onClick={logout}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (window.location.pathname === '/oauth/consent') {
    return <OAuthConsentPage />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 overflow-x-clip w-full">
      {/* Name Picker Modal (triggered on load or manually) */}
      <TeamMemberModal />

      {/* Slide-in Mobile Navigation Drawer */}
      <MobileNavDrawer
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        activeView={activeView}
        setActiveView={(v) => handleNavigate(v)}
        contactCount={contacts.length}
        reminderCount={activeRemindersCount}
        inboxCount={inboxCount}
        dealCount={dealCount}
        draftCount={draftCount}
        onOpenAISettings={() => setIsAISettingsOpen(true)}
        onOpenEmailSettings={() => setIsEmailSettingsOpen(true)}
      />

      {/* Sidebar for Desktop */}
      <Sidebar
        activeView={activeView}
        setActiveView={(v) => handleNavigate(v)}
        contactCount={contacts.length}
        reminderCount={activeRemindersCount}
        inboxCount={inboxCount}
        dealCount={dealCount}
        draftCount={draftCount}
        onOpenAISettings={() => setIsAISettingsOpen(true)}
        onOpenEmailSettings={() => setIsEmailSettingsOpen(true)}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          activeView={activeView}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSyncInbox={() => handleSyncInbox(false)}
          isSyncingInbox={isSyncingInbox}
          onOpenImport={() => setIsImportModalOpen(true)}
          onOpenInvite={() => setIsInviteModalOpen(true)}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onNavigateHome={() => handleNavigate('dashboard')}
          onOpenAddContact={() => {
            setEditingContact(null);
            setIsContactFormOpen(true);
          }}
        />

        <main className="flex-1 p-3 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-xs font-medium">Loading CRM data...</p>
            </div>
          ) : (
            <Suspense fallback={<ViewFallback />}>
              {activeView === 'dashboard' && (
                <DashboardView />
              )}

              {activeView === 'pipeline' && (
                <PipelineView
                  onOpenContact={(c) => setSelectedContact(c)}
                  onRefresh={refreshAllData}
                />
              )}

              {activeView === 'contacts' && (
                <ContactList
                  contacts={contacts}
                  searchQuery={searchQuery}
                  onSelectContact={(c) => setSelectedContact(c)}
                  onEditContact={(c) => {
                    setEditingContact(c);
                    setIsContactFormOpen(true);
                  }}
                  onOpenEmailComposer={(c) => handleOpenEmailComposer(c)}
                  onOpenLinkedIn={handleOpenLinkedInComposer}
                  onOpenBulkEmail={handleOpenBulkEmail}
                  onAddNewContact={() => {
                    setEditingContact(null);
                    setIsContactFormOpen(true);
                  }}
                  onRefresh={refreshAllData}
                />
              )}

              {activeView === 'inbox' && (
                <InboxView
                  contacts={contacts}
                  onSelectContact={(c) => setSelectedContact(c)}
                  onOpenEmailComposer={(c, sub) => handleOpenEmailComposer(c, sub)}
                  onOpenLinkedIn={handleOpenLinkedInComposer}
                  onOpenAddReminder={handleOpenAddReminder}
                  onSyncInbox={() => handleSyncInbox(false)}
                  isSyncing={isSyncingInbox}
                  onRefresh={refreshAllData}
                />
              )}

              {activeView === 'drafts' && (
                <DraftsView
                  contacts={contacts}
                  onResumeDraft={handleResumeDraft}
                  onRefresh={refreshDraftCount}
                />
              )}

              {activeView === 'reminders' && (
                <RemindersDashboard
                  contacts={contacts}
                  reminders={reminders}
                  onRefresh={refreshAllData}
                  onOpenContact={(c) => setSelectedContact(c)}
                  onOpenEmailComposer={(c) => handleOpenEmailComposer(c)}
                  onOpenBulkEmail={(contacts) => handleOpenBulkEmail(contacts, 'followup')}
                  onAddNewReminder={() => handleOpenAddReminder()}
                />
              )}

              {activeView === 'companies' && (
                <CompaniesView
                  contacts={contacts}
                  onSelectContact={(c) => setSelectedContact(c)}
                />
              )}

              {activeView === 'imports' && (
                <ImportHistoryView onRefreshNeeded={refreshAllData} />
              )}

              {activeView === 'linkedin' && (
                <LinkedInView contacts={contacts} onRefresh={refreshAllData} onOpenContact={(c) => setSelectedContact(c)} />
              )}

              {activeView === '404' && (
                <NotFoundView
                  onNavigate={(v) => handleNavigate(v)}
                  requestedView={window.location.hash}
                />
              )}
            </Suspense>
          )}
        </main>

        {/* Global Workspace Footer */}
        <Footer />
      </div>

      {/* Modals (lazy chunks load on first open) */}
      <Suspense fallback={null}>
      {isImportModalOpen && (
        <ExcelImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          existingContacts={contacts}
          onImportComplete={refreshAllData}
        />
      )}

      <ContactFormModal
        isOpen={isContactFormOpen}
        onClose={() => {
          setIsContactFormOpen(false);
          setEditingContact(null);
        }}
        contact={editingContact}
        onSaveComplete={() => {
          refreshAllData();
        }}
      />

      <ContactDetailModal
        isOpen={Boolean(selectedContact)}
        onClose={() => setSelectedContact(null)}
        contact={selectedContact}
        onEditContact={(c) => {
          setEditingContact(c);
          setIsContactFormOpen(true);
        }}
        onOpenEmail={(c) => handleOpenEmailComposer(c)}
        onOpenLinkedIn={(c) => handleOpenLinkedInComposer(c)}
        onAddReminder={(c) => handleOpenAddReminder(c)}
        onContactUpdated={refreshAllData}
      />

      {emailTargetContact && (
        <EmailComposerModal
          isOpen={isEmailComposerOpen}
          onClose={() => {
            setIsEmailComposerOpen(false);
            setEmailTargetContact(null);
            setEmailReplySubject(undefined);
            setResumingDraft(null);
            refreshDraftCount();
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('crm_drafts_updated'));
            }
          }}
          contact={emailTargetContact}
          initialSubject={emailReplySubject}
          onEmailSent={() => {
            refreshAllData();
            refreshDraftCount();
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('crm_drafts_updated'));
            }
          }}
          resumeDraft={resumingDraft}
          onDraftSaved={() => {
            refreshDraftCount();
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('crm_drafts_updated'));
            }
          }}
        />
      )}

      {linkedInTargetContact && (
        <LinkedInComposerModal
          isOpen={isLinkedInComposerOpen}
          onClose={() => {
            setIsLinkedInComposerOpen(false);
            setLinkedInTargetContact(null);
          }}
          contact={linkedInTargetContact}
          onOutreachLogged={refreshAllData}
        />
      )}

      {bulkEmailContacts.length > 0 && (
        <BulkEmailModal
          isOpen={isBulkEmailOpen}
          onClose={() => {
            setIsBulkEmailOpen(false);
            setBulkEmailContacts([]);
          }}
          selectedContacts={bulkEmailContacts}
          initialTemplate={bulkEmailInitialTemplate}
          onComplete={refreshAllData}
        />
      )}

      <ReminderFormModal
        isOpen={isReminderModalOpen}
        onClose={() => {
          setIsReminderModalOpen(false);
          setReminderTargetContact(null);
        }}
        contact={reminderTargetContact}
        onSaveComplete={refreshAllData}
      />

      {isEmailSettingsOpen && (
        <EmailSettingsModal
          isOpen={isEmailSettingsOpen}
          onClose={() => setIsEmailSettingsOpen(false)}
        />
      )}

      {isAISettingsOpen && (
        <AISettingsModal
          isOpen={isAISettingsOpen}
          onClose={() => setIsAISettingsOpen(false)}
        />
      )}

      {isInviteModalOpen && (
        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
        />
      )}
      </Suspense>
    </div>
  );
};

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <TeamProvider>
          <CRMMain />
        </TeamProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
