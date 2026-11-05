import React from 'react';
import { Layers, Sparkles, Settings } from 'lucide-react';
import { buildNavSections, NavList } from './navItems';

interface SidebarProps {
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

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setActiveView,
  onOpenAISettings,
  onOpenEmailSettings,
  ...counts
}) => {
  const footerLink =
    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer';

  return (
    <aside className="w-60 border-r border-slate-200 bg-white shrink-0 h-screen sticky top-0 hidden md:flex flex-col">
      <button
        type="button"
        onClick={() => setActiveView('dashboard')}
        title="Go to dashboard"
        className="w-full text-left px-5 h-16 shrink-0 flex items-center gap-2.5 border-b border-slate-200 cursor-pointer"
      >
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
          <Layers className="w-4 h-4" />
        </div>
        <span className="font-semibold text-sm tracking-tight text-slate-900">Team CRM</span>
      </button>

      <div className="flex-1 overflow-y-auto">
        <NavList sections={buildNavSections(counts)} activeView={activeView} onSelect={setActiveView} />
      </div>

      <div className="p-3 border-t border-slate-200 space-y-0.5 shrink-0">
        {onOpenEmailSettings && (
          <button type="button" onClick={onOpenEmailSettings} className={footerLink}>
            <Settings className="w-4 h-4 text-slate-400" />
            Email settings
          </button>
        )}
        {onOpenAISettings && (
          <button type="button" onClick={onOpenAISettings} className={footerLink}>
            <Sparkles className="w-4 h-4 text-slate-400" />
            AI settings
          </button>
        )}
      </div>
    </aside>
  );
};
