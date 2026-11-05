import React, { useEffect } from 'react';
import { Layers, X, LogOut, UserCheck, Settings, Sparkles } from 'lucide-react';
import { buildNavSections, NavList } from './navItems';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getInitials } from '../../lib/utils';

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: string;
  setActiveView: (view: string) => void;
  contactCount: number;
  linkedinContactCount?: number;
  reminderCount: number;
  inboxCount?: number;
  dealCount?: number;
  draftCount?: number;
  onOpenAISettings?: () => void;
  onOpenEmailSettings?: () => void;
}

export const MobileNavDrawer: React.FC<MobileNavDrawerProps> = ({
  isOpen,
  onClose,
  activeView,
  setActiveView,
  onOpenAISettings,
  onOpenEmailSettings,
  ...counts
}) => {
  const { activeMember, setIsPickerOpen, logout } = useTeam();
  const { user } = useAuth();
  const { roleTitle } = usePermissions();

  // Prevent background scrolling when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectView = (viewId: string) => {
    setActiveView(viewId);
    onClose();
  };

  const initials = getInitials(activeMember?.name || user?.email, 'U');

  return (
    <div className="fixed inset-0 z-50 md:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in Drawer Container */}
      <div className="relative w-4/5 max-w-xs bg-white h-full overflow-y-auto shadow-lg flex flex-col justify-between z-10 border-r border-slate-200">
        <div>
          {/* Header with Clickable Logo and Close button */}
          <div className="px-4 h-16 border-b border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleSelectView('dashboard')}
              className="flex items-center gap-2.5 text-left cursor-pointer focus:outline-none"
              title="Go to Dashboard"
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                <Layers className="w-4 h-4" />
              </div>
              <span className="font-semibold text-sm tracking-tight text-slate-900">Team CRM</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              aria-label="Close mobile menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Persona Quick Info */}
          <div className="p-3 mx-3 mt-3 rounded-lg bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-medium text-xs flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-900 truncate">
                  {activeMember?.name || 'Active User'}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {roleTitle}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                setIsPickerOpen(true);
              }}
              className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-white transition cursor-pointer"
              title="Switch persona"
              aria-label="Switch persona"
            >
              <UserCheck className="w-4 h-4" />
            </button>
          </div>

          <NavList
            sections={buildNavSections(counts, 'w-5 h-5')}
            activeView={activeView}
            onSelect={handleSelectView}
          />
        </div>

        {/* Footer Area with Sign Out */}
        <div className="p-3 border-t border-slate-200 space-y-0.5">
          {onOpenEmailSettings && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenEmailSettings();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
            >
              <Settings className="w-5 h-5 text-slate-400" />
              Email settings
            </button>
          )}
          {onOpenAISettings && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAISettings();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
            >
              <Sparkles className="w-5 h-5 text-slate-400" />
              AI settings
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              onClose();
              await logout();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
