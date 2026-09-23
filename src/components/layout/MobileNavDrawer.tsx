import React, { useEffect } from 'react';
import {
  Users,
  Inbox,
  CalendarCheck2,
  Building2,
  FileSpreadsheet,
  Layers,
  LayoutDashboard,
  DollarSign,
  X,
  Sparkles,
  LogOut,
  UserCheck,
} from 'lucide-react';
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
  reminderCount: number;
  inboxCount?: number;
  dealCount?: number;
}

export const MobileNavDrawer: React.FC<MobileNavDrawerProps> = ({
  isOpen,
  onClose,
  activeView,
  setActiveView,
  contactCount,
  reminderCount,
  inboxCount = 0,
  dealCount = 0,
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

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      id: 'pipeline',
      label: 'Sales Pipeline',
      icon: <DollarSign className="w-5 h-5" />,
      badge: dealCount > 0 ? dealCount : undefined,
      badgeColor: 'bg-emerald-100 text-emerald-800 font-bold',
    },
    {
      id: 'contacts',
      label: 'Contacts',
      icon: <Users className="w-5 h-5" />,
      badge: contactCount,
    },
    {
      id: 'inbox',
      label: 'Inbox & Replies',
      icon: <Inbox className="w-5 h-5" />,
      badge: inboxCount > 0 ? inboxCount : undefined,
      badgeColor: 'bg-emerald-100 text-emerald-800 font-bold',
    },
    {
      id: 'reminders',
      label: 'Follow-ups & Tasks',
      icon: <CalendarCheck2 className="w-5 h-5" />,
      badge: reminderCount > 0 ? reminderCount : undefined,
      badgeColor: 'bg-amber-100 text-amber-700',
    },
    {
      id: 'companies',
      label: 'Companies',
      icon: <Building2 className="w-5 h-5" />,
    },
    {
      id: 'imports',
      label: 'Import History',
      icon: <FileSpreadsheet className="w-5 h-5" />,
    },
  ];

  const handleSelectView = (viewId: string) => {
    setActiveView(viewId);
    onClose();
  };

  const initials = getInitials(activeMember?.name || user?.email, 'U');

  return (
    <div className="fixed inset-0 z-50 md:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in Drawer Container */}
      <div className="relative w-4/5 max-w-xs bg-white h-full shadow-2xl flex flex-col justify-between z-10 animate-in slide-in-from-left duration-200 border-r border-slate-200">
        <div>
          {/* Header with Clickable Logo and Close button */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleSelectView('dashboard')}
              className="flex items-center gap-2.5 text-left cursor-pointer focus:outline-none"
              title="Go to Dashboard"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="font-extrabold text-sm tracking-tight text-slate-900 flex items-center gap-1.5">
                  <span>Team CRM</span>
                  <span className="text-[9px] uppercase font-bold px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                    v1.0
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-medium">Internal Workspace</div>
              </div>
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
          <div className="p-3 mx-3 mt-3 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">
                  {activeMember?.name || 'Active User'}
                </div>
                <div className="text-[10px] text-indigo-600 font-medium truncate">
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
              title="Switch Persona"
            >
              <UserCheck className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-1">
            <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Navigation
            </div>
            {navItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectView(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={isActive ? 'text-indigo-600' : 'text-slate-400'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                        item.badgeColor || (isActive ? 'bg-indigo-200/70 text-indigo-800' : 'bg-slate-100 text-slate-600')
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer Area with Sign Out */}
        <div className="p-3 border-t border-slate-100 space-y-2">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border border-indigo-100/80">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>AI Assisted Workspace</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
              Claude Sonnet email drafting & follow-up suggestions ready.
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              onClose();
              await logout();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-rose-500" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
