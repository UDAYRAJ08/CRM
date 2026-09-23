import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TeamProvider, useTeam } from './context/TeamContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { Contact, Reminder } from './types/crm';
import { db } from './lib/supabase';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { TeamMemberModal } from './components/layout/TeamMemberModal';
import { ContactList } from './components/contacts/ContactList';
import { ContactFormModal } from './components/contacts/ContactFormModal';
import { ContactDetailModal } from './components/contacts/ContactDetailModal';
import { ExcelImportModal } from './components/import/ExcelImportModal';
import { ImportHistoryView } from './components/import/ImportHistoryView';
import { EmailComposerModal } from './components/email/EmailComposerModal';
import { BulkEmailModal, BulkTemplateKey } from './components/email/BulkEmailModal';
import { EmailSettingsModal } from './components/email/EmailSettingsModal';
import { RemindersDashboard } from './components/reminders/RemindersDashboard';
import { ReminderFormModal } from './components/reminders/ReminderFormModal';
import { CompaniesView } from './components/companies/CompaniesView';
import { InboxView } from './components/inbox/InboxView';
import { syncOutlookInbox } from './lib/inboundSyncService';
import { LinkedInComposerModal } from './components/linkedin/LinkedInComposerModal';
import { LoginPage } from './components/auth/LoginPage';
import { InviteModal } from './components/team/InviteModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { PipelineView } from './components/pipeline/PipelineView';
import { MobileNavDrawer } from './components/layout/MobileNavDrawer';
import { Footer } from './components/layout/Footer';
import { NotFoundView } from './components/common/NotFoundView';
import { Loader2 } from 'lucide-react';

export type ViewType = 'dashboard' | 'pipeline' | 'contacts' | 'inbox' | 'reminders' | 'companies' | 'imports' | '404';

const CRMMain: React.FC = () => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { activeMember, isLoading: isTeamLoading } = useTeam();
  const { success, info } = useToast();

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
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const countInboundReplies = async (contactList: Contact[]) => {
    try {
      let count = 0;
      const emails = await db.getEmails();
      count += emails.filter((e) => e.status === 'received' || e.is_inbound).length;

      // Also check qualified contacts from inbound
      for (const c of contactList) {
        const inters = await db.getInteractions(c.id);
        const replyInters = inters.filter(
          (i) => i.content.includes('📥 Inbound Email Reply Received') || i.content.includes('Inbound Email')
        );
        if (replyInters.length > 0) {
          count = Math.max(count, replyInters.length);
        }
      }
      setInboxCount(count);
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

  // Background inbox sync every 60 seconds (only when authenticated)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      handleSyncInbox(true);
    }, 60000);
    return () => clearInterval(interval);
  }, [user]);

  // Hash-based routing synchronization & 404 detection
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').trim();
      const validViews: ViewType[] = ['dashboard', 'pipeline', 'contacts', 'inbox', 'reminders', 'companies', 'imports'];
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
      reminders: activeRemindersCount > 0 ? `Tasks (${activeRemindersCount} Due) | Team CRM` : 'Tasks & Reminders | Team CRM',
      companies: 'Companies & Accounts | Team CRM',
      imports: 'Import History | Team CRM',
      '404': '404 Not Found | Team CRM',
    };
    document.title = titles[activeView] || 'Team CRM - Collaborative Workspace';
  }, [activeView, contacts.length, dealCount, inboxCount, activeRemindersCount]);

  const handleOpenEmailComposer = (contact: Contact, replySubject?: string) => {
    setEmailTargetContact(contact);
    setEmailReplySubject(replySubject);
    setIsEmailComposerOpen(true);
  };

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

  return (
    <div className="flex min-h-screen bg-slate-50/80 overflow-x-hidden w-full">
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
      />

      {/* Sidebar for Desktop */}
      <Sidebar
        activeView={activeView}
        setActiveView={(v) => handleNavigate(v)}
        contactCount={contacts.length}
        reminderCount={activeRemindersCount}
        inboxCount={inboxCount}
        dealCount={dealCount}
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
          onOpenEmailSettings={() => setIsEmailSettingsOpen(true)}
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
            <>
              {activeView === 'dashboard' && (
                <DashboardView />
              )}

              {activeView === 'pipeline' && (
                <PipelineView onOpenContact={(c) => setSelectedContact(c)} />
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

              {activeView === 'reminders' && (
                <RemindersDashboard
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

              {activeView === '404' && (
                <NotFoundView
                  onNavigate={(v) => handleNavigate(v)}
                  requestedView={window.location.hash}
                />
              )}
            </>
          )}
        </main>

        {/* Global Workspace Footer */}
        <Footer />
      </div>

      {/* Modals */}
      <ExcelImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingContacts={contacts}
        onImportComplete={refreshAllData}
      />

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
          }}
          contact={emailTargetContact}
          initialSubject={emailReplySubject}
          onEmailSent={refreshAllData}
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

      <EmailSettingsModal
        isOpen={isEmailSettingsOpen}
        onClose={() => setIsEmailSettingsOpen(false)}
      />

      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
      />
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
