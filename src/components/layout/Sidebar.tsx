import React from 'react';
import {
  Users,
  CalendarCheck2,
  Building2,
  FileSpreadsheet,
  Layers,
  Sparkles,
  HelpCircle,
} from 'lucide-react';

interface SidebarProps {
  activeView: string;
  setActiveView: (view: string) => void;
  contactCount: number;
  reminderCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setActiveView,
  contactCount,
  reminderCount,
}) => {
  const navItems = [
    {
      id: 'contacts',
      label: 'Contacts',
      icon: <Users className="w-4 h-4" />,
      badge: contactCount,
    },
    {
      id: 'reminders',
      label: 'Follow-ups & Tasks',
      icon: <CalendarCheck2 className="w-4 h-4" />,
      badge: reminderCount > 0 ? reminderCount : undefined,
      badgeColor: 'bg-amber-100 text-amber-700',
    },
    {
      id: 'companies',
      label: 'Companies',
      icon: <Building2 className="w-4 h-4" />,
    },
    {
      id: 'imports',
      label: 'Import History',
      icon: <FileSpreadsheet className="w-4 h-4" />,
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-200/80 bg-white flex flex-col justify-between shrink-0 h-screen sticky top-0 hidden md:flex">
      <div>
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="font-extrabold text-base tracking-tight text-slate-900 flex items-center gap-1.5">
              <span>Team CRM</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                v1.0
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">Internal Workspace</div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          <div className="px-3 pt-2 pb-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Main Menu
          </div>
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5">
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

      {/* Footer Info Box */}
      <div className="p-4 border-t border-slate-100">
        <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border border-indigo-100/80">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>AI Assistant Enabled</span>
          </div>
          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
            Claude Sonnet drafts personalized emails directly in the contact compose view.
          </p>
        </div>
      </div>
    </aside>
  );
};
