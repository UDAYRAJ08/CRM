import React from 'react';
import {
  Users,
  Inbox,
  CalendarCheck2,
  Building2,
  FileSpreadsheet,
  LayoutDashboard,
  DollarSign,
  FileEdit,
} from 'lucide-react';
import { Linkedin } from '../linkedin/LinkedInIcon';

export interface NavCounts {
  contactCount: number;
  linkedinContactCount?: number;
  reminderCount: number;
  inboxCount?: number;
  dealCount?: number;
  draftCount?: number;
}

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const positive = (n = 0) => (n > 0 ? n : undefined);

// Single source for the desktop sidebar and the mobile drawer.
export const buildNavSections = (c: NavCounts, iconClass = 'w-4 h-4'): NavSection[] => [
  {
    title: 'Workspace',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className={iconClass} /> },
      { id: 'contacts', label: 'Contacts', icon: <Users className={iconClass} />, badge: c.contactCount },
      { id: 'companies', label: 'Companies', icon: <Building2 className={iconClass} /> },
      { id: 'pipeline', label: 'Pipeline', icon: <DollarSign className={iconClass} />, badge: positive(c.dealCount) },
    ],
  },
  {
    title: 'Email',
    items: [
      { id: 'inbox', label: 'Inbox', icon: <Inbox className={iconClass} />, badge: positive(c.inboxCount) },
      { id: 'drafts', label: 'Drafts', icon: <FileEdit className={iconClass} />, badge: positive(c.draftCount) },
      { id: 'reminders', label: 'Follow-ups', icon: <CalendarCheck2 className={iconClass} />, badge: positive(c.reminderCount) },
    ],
  },
  {
    title: 'Outreach',
    items: [
      { id: 'linkedin', label: 'LinkedIn', icon: <Linkedin className={iconClass} /> },
      { id: 'linkedin-contacts', label: 'LinkedIn Contacts', icon: <Users className={iconClass} />, badge: c.linkedinContactCount },
    ],
  },
  {
    title: 'Data',
    items: [{ id: 'imports', label: 'Imports', icon: <FileSpreadsheet className={iconClass} /> }],
  },
];

interface NavListProps {
  sections: NavSection[];
  activeView: string;
  onSelect: (id: string) => void;
}

export const NavList: React.FC<NavListProps> = ({ sections, activeView, onSelect }) => (
  <nav className="px-3 pb-3" aria-label="Main">
    {sections.map((section) => (
      <div key={section.title}>
        <div className="px-3 pt-5 pb-1.5 text-[11px] font-medium text-slate-400">{section.title}</div>
        <ul className="space-y-0.5">
          {section.items.map((item) => {
            const isActive = activeView === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-slate-100 text-slate-900 font-medium'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span className={isActive ? 'text-indigo-600' : 'text-slate-400'}>{item.icon}</span>
                    {item.label}
                  </span>
                  {item.badge !== undefined && (
                    <span className="text-xs tabular-nums text-slate-400">{item.badge}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    ))}
  </nav>
);
