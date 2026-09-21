import React, { useState } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getInitials } from '../../lib/utils';
import { Button } from '../ui/Button';
import {
  User,
  Users,
  ChevronDown,
  UploadCloud,
  UserPlus,
  Database,
  Search,
  Settings,
  RefreshCw,
  Share2,
} from 'lucide-react';

interface HeaderProps {
  onOpenImport: () => void;
  onOpenAddContact: () => void;
  onOpenEmailSettings?: () => void;
  onOpenInvite?: () => void;
  onSyncInbox?: () => Promise<void>;
  isSyncingInbox?: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeView: string;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenImport,
  onOpenAddContact,
  onOpenEmailSettings,
  onOpenInvite,
  onSyncInbox,
  isSyncingInbox = false,
  searchQuery,
  setSearchQuery,
  activeView,
}) => {
  const { activeMember, setIsPickerOpen, logout } = useTeam();
  const { user } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const initials = getInitials(activeMember?.name || user?.email, 'U');

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
      {/* Search Input for Contacts */}
      <div className="flex-1 max-w-md">
        {activeView === 'contacts' ? (
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, email, company, tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs sm:text-sm bg-slate-100/80 hover:bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-500 rounded-xl pl-9 pr-3 py-1.5 sm:py-2 text-slate-900 placeholder:text-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 text-xs text-slate-400 hover:text-slate-600 font-medium"
              >
                Clear
              </button>
            )}
          </div>
        ) : (
          <div className="text-sm font-semibold text-slate-700 capitalize">
            {activeView === 'inbox'
              ? 'Inbox & Lead Email Replies'
              : activeView === 'reminders'
              ? 'Follow-up & Reminders Center'
              : activeView === 'companies'
              ? 'Companies & Accounts'
              : activeView === 'pipeline'
              ? 'Sales Pipeline & Opportunities'
              : 'Excel Import History & Logs'}
          </div>
        )}
      </div>

      {/* Action Buttons & Team Member Badge */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Backend Status indicator */}
        <div
          title={
            isSupabaseConfigured
              ? 'Connected to Live Supabase Postgres Database'
              : 'Operating in Local Storage / In-Memory Mode (Supabase URL not set)'
          }
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-[11px] font-medium text-slate-600 border border-slate-200/70"
        >
          <Database className={`w-3 h-3 ${isSupabaseConfigured ? 'text-emerald-500' : 'text-amber-500'}`} />
          <span>{isSupabaseConfigured ? 'Supabase Live' : 'Local Mode'}</span>
        </div>

        {/* Sync Inbox Button */}
        {onSyncInbox && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSyncInbox}
            disabled={isSyncingInbox}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isSyncingInbox ? 'animate-spin text-indigo-500' : ''}`} />}
            className="hidden sm:inline-flex"
            title="Check connected Outlook mailbox for new replies from CRM contacts"
          >
            {isSyncingInbox ? 'Syncing...' : 'Sync Inbox'}
          </Button>
        )}

        {/* Import button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenImport}
          leftIcon={<UploadCloud className="w-4 h-4 text-indigo-600" />}
          className="hidden md:inline-flex"
        >
          Import
        </Button>

        {/* Add contact button */}
        <Button
          variant="primary"
          size="sm"
          onClick={onOpenAddContact}
          leftIcon={<UserPlus className="w-4 h-4" />}
        >
          Add Contact
        </Button>

        {/* Invite Team Button */}
        {onOpenInvite && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenInvite}
            leftIcon={<Share2 className="w-3.5 h-3.5 text-[#1e4634]" />}
            className="border-emerald-700/30 text-[#1e4634] hover:bg-emerald-50/50 hidden sm:inline-flex"
            title="Invite teammates to try this CRM"
          >
            Invite Team
          </Button>
        )}

        {/* Email Settings button */}
        {onOpenEmailSettings && (
          <button
            onClick={onOpenEmailSettings}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition border border-slate-200 bg-white cursor-pointer"
            title="Email & API Delivery Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}

        <div className="h-6 w-px bg-slate-200 mx-0.5 hidden sm:block" />

        {/* Active user dropdown menu */}
        <div className="relative">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition bg-white text-left shadow-xs cursor-pointer"
            title="Account & Persona Menu"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shadow-xs">
              {initials}
            </div>
            <div className="hidden lg:block text-left">
              <div className="text-xs font-bold text-slate-900 leading-tight">
                {activeMember?.name || 'Pick Name'}
              </div>
              <div className="text-[10px] text-slate-500 font-medium">
                {activeMember?.role || 'Team Member'}
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {isUserMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsUserMenuOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="p-2.5 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {activeMember?.name || user?.user_metadata?.full_name || 'Team Member'}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {user?.email || activeMember?.email || activeMember?.role || 'Authenticated User'}
                  </p>
                </div>

                <div className="py-1">
                  {onOpenInvite && (
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onOpenInvite();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 rounded-xl transition text-left cursor-pointer"
                    >
                      <Share2 className="w-4 h-4 text-emerald-700" />
                      <span>Invite Colleagues</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIsPickerOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-indigo-600 hover:bg-indigo-50/60 rounded-xl transition text-left cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-slate-400" />
                    <span>Switch Persona</span>
                  </button>

                  <button
                    onClick={async () => {
                      setIsUserMenuOpen(false);
                      await logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition text-left cursor-pointer"
                  >
                    <User className="w-4 h-4 text-rose-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};


