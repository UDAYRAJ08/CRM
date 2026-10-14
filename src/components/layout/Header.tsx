import React, { useEffect, useState } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getInitials } from '../../lib/utils';
import { usePermissions } from '../../hooks/usePermissions';
import { Button } from '../ui/Button';
import {
  User,
  Users,
  ChevronDown,
  UploadCloud,
  UserPlus,
  Database,
  Search,
  RefreshCw,
  Share2,
  Menu,
} from 'lucide-react';

interface HeaderProps {
  onOpenImport: () => void;
  onOpenAddContact: () => void;
  onOpenInvite?: () => void;
  onSyncInbox?: () => Promise<void>;
  isSyncingInbox?: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeView: string;
  onOpenMobileMenu?: () => void;
  onNavigateHome?: () => void;
}

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  pipeline: 'Pipeline',
  inbox: 'Inbox',
  drafts: 'Drafts',
  reminders: 'Follow-ups',
  companies: 'Companies',
  imports: 'Import history',
  linkedin: 'LinkedIn',
};

export const Header: React.FC<HeaderProps> = ({
  onOpenImport,
  onOpenAddContact,
  onOpenInvite,
  onSyncInbox,
  isSyncingInbox = false,
  searchQuery,
  setSearchQuery,
  activeView,
  onOpenMobileMenu,
}) => {
  const { activeMember, setIsPickerOpen, logout } = useTeam();
  const { user } = useAuth();
  const { roleTitle, isAdmin, isManager, isEmployee } = usePermissions();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsUserMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isUserMenuOpen]);

  const initials = getInitials(activeMember?.name || user?.email, 'U');

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-3 sm:px-6 h-16 shrink-0 flex items-center justify-between gap-2 sm:gap-4">
      {/* Mobile Hamburger Menu & Mobile Clickable Logo */}
      <div className="flex items-center gap-1.5 md:hidden">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Open navigation menu"
            title="Open Menu"
          >
            <Menu className="w-5 h-5 text-slate-700" />
          </button>
        )}
      </div>

      {/* Search Input for Contacts or Section Header Title */}
      <div className="flex-1 max-w-md min-w-0">
        {activeView === 'contacts' ? (
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 sm:left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, email, company, tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs sm:text-sm bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-500 rounded-lg pl-9 pr-3 py-1.5 sm:py-2 text-slate-900 placeholder:text-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
          // Page title lives in each view's own heading; show it here only on mobile.
          <div className="md:hidden text-sm font-semibold text-slate-900 truncate">
            {VIEW_TITLES[activeView] ?? ''}
          </div>
        )}
      </div>

      {/* Action Buttons & Team Member Badge */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Sync Inbox Button */}
        {onSyncInbox && (
          <button
            onClick={onSyncInbox}
            disabled={isSyncingInbox}
            className="hidden sm:inline-flex p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="Check mailbox for new replies"
            aria-label="Sync inbox"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingInbox ? 'animate-spin' : ''}`} />
          </button>
        )}

        {/* Import button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenImport}
          leftIcon={<UploadCloud className="w-4 h-4" />}
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
          aria-label="Add contact"
        >
          <span className="hidden sm:inline">Add Contact</span>
        </Button>

        <div className="h-6 w-px bg-slate-200 mx-0.5 hidden sm:block" />

        {/* Active user dropdown menu */}
        <div className="relative">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-lg hover:bg-slate-100 transition-colors text-left cursor-pointer"
            aria-haspopup="menu"
            aria-expanded={isUserMenuOpen}
            title="Account & Persona Menu"
          >
            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-medium text-xs flex items-center justify-center">
              {initials}
            </div>
            <div className="hidden lg:block text-left">
              <div className="text-xs font-medium text-slate-900 leading-tight">
                {activeMember?.name || 'Pick Name'}
              </div>
              <div className="text-[11px] text-slate-500 leading-tight">{roleTitle}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {isUserMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsUserMenuOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-1.5" role="menu">
                <div className="p-2.5 border-b border-slate-100">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {activeMember?.name || user?.user_metadata?.full_name || 'Team Member'}
                    </p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isAdmin ? 'bg-indigo-100 text-indigo-800' : isManager ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                      {roleTitle}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">
                    {user?.email || activeMember?.email || 'Authenticated User'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                    <Database className={`w-3 h-3 ${isSupabaseConfigured ? 'text-emerald-500' : 'text-amber-500'}`} />
                    {isSupabaseConfigured ? 'Database connected' : 'Local mode (no database)'}
                  </p>
                </div>

                <div className="py-1">
                  {onOpenInvite && (
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onOpenInvite();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition text-left cursor-pointer"
                    >
                      <Share2 className="w-4 h-4 text-slate-400" />
                      <span>Invite Colleagues</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIsPickerOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition text-left cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-slate-400" />
                    <span>Switch Persona</span>
                  </button>

                  <button
                    onClick={async () => {
                      setIsUserMenuOpen(false);
                      await logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition text-left cursor-pointer"
                  >
                    <User className="w-4 h-4" />
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


