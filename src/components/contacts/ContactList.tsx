import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { Contact, ContactStatus } from '../../types/crm';
import { db } from '../../lib/supabase';
import { getInitials, cleanCompanyName } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
  Users,
  Search,
  Filter,
  Phone,
  Mail,
  Building,
  User,
  LayoutGrid,
  List,
  Trash2,
  Send,
  Plus,
  Minus,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Tag,
  CheckSquare,
  Clock,
  AlertTriangle,
  Reply,
  CheckCircle2,
  SlidersHorizontal,
  ChevronDown,
  ExternalLink,
  Sparkles,
  Layers,
  X,
  Globe,
  RotateCw,
} from 'lucide-react';

interface ContactListProps {
  contacts: Contact[];
  searchQuery: string;
  onSelectContact: (contact: Contact) => void;
  onEditContact: (contact: Contact) => void;
  onOpenEmailComposer: (contact: Contact) => void;
  onOpenLinkedIn?: (contact: Contact) => void;
  onOpenBulkEmail: (selectedContacts: Contact[], initialTemplate?: 'followup' | 'capabilities' | 'scope' | 'intro') => void;
  onAddNewContact: () => void;
  onRefresh: () => void;
}

export const STATUS_CONFIG: Record<
  ContactStatus,
  { label: string; dot: string; bg: string; text: string; border: string }
> = {
  new: {
    label: 'Not Started',
    dot: 'bg-blue-500',
    bg: 'bg-blue-50/90',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  contacted: {
    label: 'Contacted',
    dot: 'bg-amber-500',
    bg: 'bg-amber-50/90',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  qualified: {
    label: 'Replied & Qualified',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50/90',
    text: 'text-emerald-800 font-bold',
    border: 'border-emerald-300',
  },
  proposal: {
    label: 'Proposal Sent',
    dot: 'bg-purple-500',
    bg: 'bg-purple-50/90',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
  won: {
    label: 'Closed / Won',
    dot: 'bg-emerald-600',
    bg: 'bg-emerald-100/90',
    text: 'text-emerald-900 font-extrabold',
    border: 'border-emerald-400',
  },
  lost: {
    label: 'Closed / Lost',
    dot: 'bg-rose-500',
    bg: 'bg-rose-50/90',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
  inactive: {
    label: 'Inactive',
    dot: 'bg-slate-400',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
  },
};

export function getCompanyUrl(company?: { name?: string; website?: string } | null) {
  if (!company) return '';
  const candidate =
    company.website?.trim() ||
    (company.name?.trim().includes('.') ? company.name?.trim() : '') ||
    '';
  if (!candidate) return '';
  if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
    return candidate;
  }
  return `https://${candidate}`;
}

function getFollowUpInfo(contact: Contact) {
  if (contact.status === 'new') {
    return {
      label: 'Not Started',
      badgeClass: 'bg-blue-50/90 text-blue-700 border-blue-200/80 font-medium',
      actionText: 'Send 1st Email',
      isOverdue: false,
      stage: 'new',
    };
  }
  if (contact.status === 'qualified') {
    return {
      label: 'Replied & Qualified',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold',
      actionText: 'View Details',
      isOverdue: false,
      stage: 'qualified',
    };
  }
  if (contact.status === 'contacted') {
    const contactDate = new Date(contact.updated_at || contact.created_at).getTime();
    const diffHours = (Date.now() - contactDate) / (1000 * 60 * 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays >= 3) {
      return {
        label: `🚨 3-Day Follow-up Due (${diffDays}d ago)`,
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-300 font-semibold shadow-2xs',
        actionText: 'Send Follow-up Message',
        isOverdue: true,
        stage: 'overdue',
      };
    } else {
      const remainingDays = Math.max(1, 3 - diffDays);
      return {
        label: `⏳ Waiting (Follow-up in ${remainingDays}d)`,
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 font-semibold',
        actionText: 'Follow-up Email',
        isOverdue: false,
        stage: 'contacted',
      };
    }
  }
  const conf = STATUS_CONFIG[contact.status] || STATUS_CONFIG.new;
  return {
    label: conf.label,
    badgeClass: `${conf.bg} ${conf.text} ${conf.border} font-medium`,
    actionText: 'Contact',
    isOverdue: false,
    stage: contact.status,
  };
}

export const ContactList: React.FC<ContactListProps> = ({
  contacts,
  searchQuery,
  onSelectContact,
  onEditContact,
  onOpenEmailComposer,
  onOpenLinkedIn,
  onOpenBulkEmail,
  onAddNewContact,
  onRefresh,
}) => {
  const { teamMembers } = useTeam();
  const { success, error, info } = useToast();
  const { canDeleteContacts, canBulkDelete, canEditContacts, canChangeStatus, isAdmin } = usePermissions();

  // Filter States
  const [pipelineTab, setPipelineTab] = useState<'all' | 'uncontacted' | 'due' | 'replied'>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'accordion' | 'table' | 'cards'>('accordion');
  const [expandedDateKeys, setExpandedDateKeys] = useState<Set<string>>(new Set());

  // Density: 'compact' | 'comfortable'
  const [density, setDensity] = useState<'compact' | 'comfortable'>(() => {
    return (localStorage.getItem('crm_table_density') as any) || 'comfortable';
  });

  // Sorting
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'company' | 'status'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Keyboard active row focus index
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Active open inline status dropdown contactId
  const [activeStatusDropdownId, setActiveStatusDropdownId] = useState<string | null>(null);

  // Save density preference
  const toggleDensity = () => {
    const next = density === 'comfortable' ? 'compact' : 'comfortable';
    setDensity(next);
    localStorage.setItem('crm_table_density', next);
  };

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    contacts.forEach((c) => c.tags?.forEach((t) => tagsSet.add(t)));
    return Array.from(tagsSet);
  }, [contacts]);

  // Counts for pipeline tabs
  const pipelineCounts = useMemo(() => {
    let uncontacted = 0;
    let due = 0;
    let replied = 0;

    for (const c of contacts) {
      if (c.status === 'new') {
        uncontacted++;
      } else if (c.status === 'qualified' || c.status === 'won' || c.status === 'proposal') {
        replied++;
      } else if (c.status === 'contacted') {
        const contactDate = new Date(c.updated_at || c.created_at).getTime();
        const diffDays = Math.floor((Date.now() - contactDate) / (1000 * 60 * 60 * 24));
        if (diffDays >= 3) {
          due++;
        }
      }
    }

    return {
      all: contacts.length,
      uncontacted,
      due,
      replied,
    };
  }, [contacts]);

  // Filter and Sort contacts
  const filteredContacts = useMemo(() => {
    return contacts
      .filter((c) => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = c.name.toLowerCase().includes(q);
          const matchEmail = c.email?.toLowerCase().includes(q) || false;
          const matchPhone = c.phone?.includes(q) || false;
          const matchCompany = c.company?.name.toLowerCase().includes(q) || false;
          const matchTag = c.tags?.some((t) => t.toLowerCase().includes(q)) || false;
          if (!matchName && !matchEmail && !matchPhone && !matchCompany && !matchTag) {
            return false;
          }
        }

        // Pipeline segment tab
        if (pipelineTab === 'uncontacted' && c.status !== 'new') {
          return false;
        }
        if (pipelineTab === 'replied' && c.status !== 'qualified' && c.status !== 'won' && c.status !== 'proposal') {
          return false;
        }
        if (pipelineTab === 'due') {
          if (c.status !== 'contacted') return false;
          const contactDate = new Date(c.updated_at || c.created_at).getTime();
          const diffDays = Math.floor((Date.now() - contactDate) / (1000 * 60 * 60 * 24));
          if (diffDays < 3) return false;
        }

        // Owner filter
        if (ownerFilter !== 'all') {
          if (ownerFilter === 'unassigned' && c.owner_id) return false;
          if (ownerFilter !== 'unassigned' && c.owner_id !== ownerFilter) return false;
        }

        // Tag filter
        if (tagFilter !== 'all' && (!c.tags || !c.tags.includes(tagFilter))) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'name') {
          comparison = a.name.localeCompare(b.name);
        } else if (sortBy === 'company') {
          comparison = (a.company?.name || '').localeCompare(b.company?.name || '');
        } else if (sortBy === 'status') {
          comparison = a.status.localeCompare(b.status);
        } else {
          comparison = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return sortOrder === 'asc' ? -comparison : comparison;
      });
  }, [contacts, searchQuery, pipelineTab, ownerFilter, tagFilter, sortBy, sortOrder]);

  // Group contacts by Date Added (created_at) for the Accordion View
  const dateGroups = useMemo(() => {
    const groups: { [key: string]: { rawDate: Date; contacts: Contact[] } } = {};

    filteredContacts.forEach((contact) => {
      const d = new Date(contact.created_at || Date.now());
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;

      if (!groups[key]) {
        groups[key] = {
          rawDate: d,
          contacts: [],
        };
      }
      groups[key].contacts.push(contact);
    });

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, data]) => {
        const d = data.rawDate;
        let displayLabel = d.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });

        if (key === todayKey) {
          displayLabel = `Today — ${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`;
        } else if (key === yesterdayKey) {
          displayLabel = `Yesterday — ${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`;
        }

        return {
          key,
          displayLabel,
          count: data.contacts.length,
          contacts: data.contacts,
        };
      });
  }, [filteredContacts]);

  // Auto-expand the first date group by default
  useEffect(() => {
    if (dateGroups.length > 0 && expandedDateKeys.size === 0) {
      setExpandedDateKeys(new Set([dateGroups[0].key]));
    }
  }, [dateGroups]);

  const toggleDateGroup = (key: string) => {
    setExpandedDateKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAllDates = () => {
    setExpandedDateKeys(new Set(dateGroups.map((g) => g.key)));
  };

  const collapseAllDates = () => {
    setExpandedDateKeys(new Set());
  };

  // Handle Sort Column Click
  const handleSort = (field: 'name' | 'created_at' | 'company' | 'status') => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Keyboard Shortcuts Listener (J/K to move, Enter/Space to open, E to email, Esc to deselect)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          (activeEl as HTMLElement).isContentEditable);

      if (isInput) return;

      if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, filteredContacts.length - 1));
      } else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (focusedIndex >= 0 && focusedIndex < filteredContacts.length) {
          e.preventDefault();
          onSelectContact(filteredContacts[focusedIndex]);
        }
      } else if (e.key === 'e' || e.key === 'E') {
        if (focusedIndex >= 0 && focusedIndex < filteredContacts.length) {
          e.preventDefault();
          onOpenEmailComposer(filteredContacts[focusedIndex]);
        }
      } else if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setActiveStatusDropdownId(null);
        setFocusedIndex(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredContacts, focusedIndex, onSelectContact, onOpenEmailComposer]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredContacts.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const selectedContacts = useMemo(() => {
    return contacts.filter((c) => selectedIds.has(c.id));
  }, [contacts, selectedIds]);

  // Bulk Status Update
  const handleBulkStatusChange = async (newStatus: ContactStatus) => {
    if (!newStatus || selectedContacts.length === 0) return;
    try {
      for (const c of selectedContacts) {
        await db.saveContact({ id: c.id, status: newStatus });
      }
      success('Status Updated', `Updated ${selectedContacts.length} contacts to ${STATUS_CONFIG[newStatus].label}.`);
      setSelectedIds(new Set());
      onRefresh();
    } catch (err: any) {
      error('Bulk Update Failed', err.message || 'Could not update contacts.');
    }
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (!canBulkDelete) {
      error('Access Restricted', 'Only Administrators have permission to delete contacts from the CRM.');
      return;
    }
    if (window.confirm(`Delete ${selectedContacts.length} selected contacts?`)) {
      for (const c of selectedContacts) {
        await db.deleteContact(c.id);
      }
      setSelectedIds(new Set());
      success('Contacts Deleted', `Removed ${selectedContacts.length} contacts.`);
      onRefresh();
    }
  };

  // Inline Status Update (Optimistic UI Update)
  const handleInlineStatusUpdate = async (contactId: string, newStatus: ContactStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveStatusDropdownId(null);
    try {
      await db.saveContact({ id: contactId, status: newStatus });
      success('Status Changed', `Contact updated to ${STATUS_CONFIG[newStatus].label}`);
      onRefresh();
    } catch (err: any) {
      error('Update Failed', err.message || 'Could not change status.');
    }
  };

  return (
    <div className="space-y-4 relative">
      {/* ===================================================================== */}
      {/* 1. TOP PIPELINE WORKFLOW TABS & TOOLBAR                               */}
      {/* ===================================================================== */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        {/* Row 1: Pipeline Stage Segmented Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Segmented Control */}
          <div className="inline-flex p-1 bg-slate-100/90 rounded-xl border border-slate-200/70 overflow-x-auto no-scrollbar max-w-full">
            <button
              onClick={() => setPipelineTab('all')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer ${
                pipelineTab === 'all'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <span>All Leads</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  pipelineTab === 'all'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-slate-200/80 text-slate-600'
                }`}
              >
                {pipelineCounts.all}
              </span>
            </button>

            <button
              onClick={() => setPipelineTab('uncontacted')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer ${
                pipelineTab === 'uncontacted'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <span>🆕 Uncontacted</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  pipelineTab === 'uncontacted'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-200/80 text-slate-600'
                }`}
              >
                {pipelineCounts.uncontacted}
              </span>
            </button>

            <button
              onClick={() => setPipelineTab('due')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer ${
                pipelineTab === 'due'
                  ? 'bg-white text-rose-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <span>🚨 Due Follow-ups</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  pipelineTab === 'due'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-slate-200/80 text-slate-600'
                }`}
              >
                {pipelineCounts.due}
              </span>
            </button>

            <button
              onClick={() => setPipelineTab('replied')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer ${
                pipelineTab === 'replied'
                  ? 'bg-white text-emerald-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <span>📥 Replied / Active</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  pipelineTab === 'replied'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200/80 text-slate-600'
                }`}
              >
                {pipelineCounts.replied}
              </span>
            </button>
          </div>

          {/* Quick Counter / Info */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 shrink-0">
            <span className="font-bold text-slate-800">{filteredContacts.length}</span>
            <span>contacts showing</span>
          </div>
        </div>

        {/* Divider line */}
        <div className="h-px bg-slate-100" />

        {/* Row 2: Filters on Left, View Modes on Right */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Filters on Left */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Tag Filter */}
            {allTags.length > 0 && (
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="bg-slate-50 hover:bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium cursor-pointer shadow-2xs transition-colors"
              >
                <option value="all">All Tags</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    #{tag}
                  </option>
                ))}
              </select>
            )}

            {/* Owner Filter */}
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="bg-slate-50 hover:bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium cursor-pointer shadow-2xs transition-colors"
            >
              <option value="all">All Owners</option>
              <option value="unassigned">Unassigned</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>

            {/* Quick 1-Click Bulk Follow-up for Due Leads */}
            {pipelineCounts.due > 0 && (
              <button
                type="button"
                onClick={() => {
                  const dueContacts = contacts.filter((c) => {
                    const contactDate = new Date(c.updated_at || c.created_at).getTime();
                    const diffDays = Math.floor((Date.now() - contactDate) / (1000 * 60 * 60 * 24));
                    return c.status === 'contacted' && diffDays >= 3;
                  });
                  onOpenBulkEmail(dueContacts, 'followup');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300/80 rounded-xl font-bold shadow-2xs transition cursor-pointer"
                title="Launch Bulk Follow-up Sender for all due contacts"
              >
                <RotateCw className="w-3.5 h-3.5 text-emerald-600" />
                <span>Bulk Follow-up Due ({pipelineCounts.due})</span>
              </button>
            )}

            {/* Density Toggle (Compact vs Comfortable) */}
            <button
              onClick={toggleDensity}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition cursor-pointer shadow-2xs ${
                density === 'compact'
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold'
                  : 'bg-slate-50 hover:bg-white border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
              title="Toggle Table Density (Compact / Comfortable)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="capitalize">{density}</span>
            </button>
          </div>

          {/* View Modes on Right */}
          <div className="inline-flex p-1 bg-slate-100/90 rounded-xl border border-slate-200/70 shrink-0">
            <button
              onClick={() => setViewMode('accordion')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === 'accordion'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Group by Dates (Accordion)"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>By Date</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Classic Table View"
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Grid Card View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. MAIN TABLE VIEW OR CARDS                                           */}
      {/* ===================================================================== */}
      {filteredContacts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No contacts match your criteria</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Try adjusting your search terms or pipeline filters, or add new leads to your CRM.
          </p>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={onAddNewContact}
            className="mt-4"
          >
            Add New Contact
          </Button>
        </div>
      ) : viewMode === 'accordion' ? (
        <div className="space-y-4">
          {/* Top Accordion Info & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>Grouped by Date Added:</span>
              </span>
              <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-bold">
                {dateGroups.length} {dateGroups.length === 1 ? 'Date' : 'Dates'}
              </span>
              <span>•</span>
              <span className="font-medium text-slate-600">{filteredContacts.length} people total</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={expandAllDates}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
              >
                Expand All
              </button>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={collapseAllDates}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
              >
                Collapse All
              </button>
            </div>
          </div>

          {/* Accordion List (Matching Screenshot Style) */}
          <div className="space-y-3.5">
            {dateGroups.map((group) => {
              const isExpanded = expandedDateKeys.has(group.key);
              const allGroupSelected =
                group.contacts.length > 0 && group.contacts.every((c) => selectedIds.has(c.id));

              return (
                <div
                  key={group.key}
                  className={`bg-white border rounded-2xl overflow-hidden transition-all duration-200 ${
                    isExpanded
                      ? 'border-indigo-300 shadow-md ring-2 ring-indigo-500/10'
                      : 'border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-sm'
                  }`}
                >
                  {/* Header Bar */}
                  <div
                    onClick={() => toggleDateGroup(group.key)}
                    className={`px-5 md:px-6 py-4 flex items-center justify-between gap-4 select-none cursor-pointer transition-colors duration-150 ${
                      isExpanded
                        ? 'bg-slate-50/70 border-b border-slate-200/80 hover:bg-slate-100/50'
                        : 'bg-white hover:bg-slate-50/70'
                    }`}
                  >
                    {/* Left: Date Title & Count */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100/80 shrink-0">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-slate-900 text-sm md:text-base tracking-tight">
                        {group.displayLabel}
                      </h3>
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/70 shadow-2xs">
                        {group.count} {group.count === 1 ? 'person added' : 'people added'}
                      </span>
                    </div>

                    {/* Right: Circular (+) / (-) toggle button matching exact uploaded image */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDateGroup(group.key);
                      }}
                      className={`w-9 h-9 md:w-10 md:h-10 rounded-full bg-[#fbbf24] hover:bg-[#f59e0b] border-[1.5px] border-slate-900 flex items-center justify-center text-slate-950 font-bold shrink-0 shadow-xs transition-all duration-200 ease-out active:scale-90 cursor-pointer ${
                        isExpanded ? 'rotate-45' : 'rotate-0'
                      }`}
                      title={isExpanded ? 'Collapse date' : 'Expand to view people added'}
                    >
                      <Plus className="w-5 h-5 stroke-[2.5] text-slate-950 transition-transform duration-200" />
                    </button>
                  </div>

                  {/* Expanded Body: "the people we added" - Animated with CSS Grid */}
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
                      isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="p-3 sm:p-4 space-y-3 bg-slate-50/40">
                        <div className="flex items-center justify-between px-1">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-indigo-600" />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                              People Added On This Date ({group.contacts.length})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                            e.stopPropagation();
                            const next = new Set(selectedIds);
                            if (allGroupSelected) {
                              group.contacts.forEach((c) => next.delete(c.id));
                            } else {
                              group.contacts.forEach((c) => next.add(c.id));
                            }
                            setSelectedIds(next);
                          }}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                        >
                          {allGroupSelected ? 'Deselect All on Date' : 'Select All on Date'}
                        </button>
                      </div>

                      {/* Clean Table of People Added on this Date */}
                      <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs min-w-[840px]">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 select-none">
                              <tr>
                                <th className="p-3 w-10 text-center whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={allGroupSelected}
                                    onChange={(e) => {
                                      const next = new Set(selectedIds);
                                      if (e.target.checked) {
                                        group.contacts.forEach((c) => next.add(c.id));
                                      } else {
                                        group.contacts.forEach((c) => next.delete(c.id));
                                      }
                                      setSelectedIds(next);
                                    }}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                  />
                                </th>
                                <th className="py-2.5 px-3 whitespace-nowrap">Person</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">Company</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">Lifecycle & Due</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">Owner</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {group.contacts.map((contact) => {
                                const isSelected = selectedIds.has(contact.id);
                                const followUp = getFollowUpInfo(contact);
                                const statusConf = STATUS_CONFIG[contact.status] || STATUS_CONFIG.new;
                                const isDropdownOpen = activeStatusDropdownId === contact.id;
                                const companyUrl = getCompanyUrl(contact.company);

                                return (
                                  <tr
                                    key={contact.id}
                                    onClick={() => onSelectContact(contact)}
                                    className={`cursor-pointer transition-colors hover:bg-slate-50/80 ${
                                      isSelected ? 'bg-indigo-50/40' : ''
                                    }`}
                                  >
                                    <td
                                      className="p-3 text-center whitespace-nowrap"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => handleToggleSelect(contact.id, e as any)}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                      />
                                    </td>

                                    {/* Person */}
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center border border-slate-200 shrink-0">
                                          {getInitials(contact.name, 'C')}
                                        </div>
                                        <div>
                                          <div className="font-bold text-slate-900 hover:text-indigo-600 transition">
                                            {contact.name}
                                          </div>
                                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                            {contact.email && (
                                              <a
                                                href={`mailto:${contact.email}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="hover:text-indigo-600 hover:underline truncate"
                                                title="Send email"
                                              >
                                                {contact.email}
                                              </a>
                                            )}
                                            {contact.phone && (
                                              <>
                                                <span>•</span>
                                                <a
                                                  href={`tel:${contact.phone}`}
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="hover:text-indigo-600 hover:underline shrink-0"
                                                  title="Call phone"
                                                >
                                                  {contact.phone}
                                                </a>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </td>

                                    {/* Company */}
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      {contact.company?.name ? (
                                        <div className="flex items-center gap-1.5 font-medium text-slate-800">
                                          <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                          {companyUrl ? (
                                            <a
                                              href={companyUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              onClick={(e) => e.stopPropagation()}
                                              className="text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                                            >
                                              <span>{cleanCompanyName(contact.company.name)}</span>
                                              <ExternalLink className="w-3 h-3 text-indigo-400" />
                                            </a>
                                          ) : (
                                            <span>{cleanCompanyName(contact.company.name)}</span>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-slate-400 italic">—</span>
                                      )}
                                      {contact.title && (
                                        <span className="text-[11px] text-slate-500 block">
                                          {contact.title}
                                        </span>
                                      )}
                                    </td>

                                    {/* Status with Inline Editor */}
                                    <td
                                      className="py-2.5 px-3 relative whitespace-nowrap"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="relative inline-block text-left">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveStatusDropdownId(isDropdownOpen ? null : contact.id);
                                          }}
                                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition cursor-pointer hover:shadow-xs whitespace-nowrap shrink-0 ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}
                                        >
                                          <span className={`w-2 h-2 rounded-full ${statusConf.dot} shrink-0`} />
                                          <span>{statusConf.label}</span>
                                          <ChevronDown className="w-3 h-3 opacity-60 ml-0.5 shrink-0" />
                                        </button>

                                        {isDropdownOpen && (
                                          <>
                                            <div
                                              className="fixed inset-0 z-30"
                                              onClick={() => setActiveStatusDropdownId(null)}
                                            />
                                            <div className="absolute left-0 mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-slate-200 z-40 p-1 animate-in fade-in zoom-in-95 duration-100">
                                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                                                Set Status
                                              </div>
                                              {(Object.keys(STATUS_CONFIG) as ContactStatus[]).map((st) => {
                                                const item = STATUS_CONFIG[st];
                                                const isCurrent = contact.status === st;
                                                return (
                                                  <button
                                                    key={st}
                                                    type="button"
                                                    onClick={(e) => handleInlineStatusUpdate(contact.id, st, e)}
                                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition text-left cursor-pointer ${
                                                      isCurrent
                                                        ? 'bg-slate-100 font-bold text-slate-900'
                                                        : 'hover:bg-slate-50 text-slate-700'
                                                    }`}
                                                  >
                                                    <div className="flex items-center gap-2">
                                                      <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                                                      <span>{item.label}</span>
                                                    </div>
                                                    {isCurrent && (
                                                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                                                    )}
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </td>

                                    {/* Lifecycle */}
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <span
                                        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border whitespace-nowrap shadow-2xs ${followUp.badgeClass}`}
                                      >
                                        {followUp.label}
                                      </span>
                                    </td>

                                    {/* Owner */}
                                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                                      {contact.owner?.name ? (
                                        <div className="flex items-center gap-1.5">
                                          <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center">
                                            {getInitials(contact.owner.name, 'U')[0]}
                                          </div>
                                          <span className="text-xs">{contact.owner.name}</span>
                                        </div>
                                      ) : (
                                        <span className="text-slate-400 italic text-xs">Unassigned</span>
                                      )}
                                    </td>

                                    {/* Actions */}
                                    <td
                                      className="py-2.5 px-3 text-right whitespace-nowrap"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="flex items-center justify-end gap-1.5">
                                        {contact.email && (
                                          <button
                                            type="button"
                                            onClick={() => onOpenEmailComposer(contact)}
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                            title="Send Email"
                                          >
                                            <Mail className="w-4 h-4" />
                                          </button>
                                        )}
                                        {onOpenLinkedIn && (
                                          <button
                                            type="button"
                                            onClick={() => onOpenLinkedIn(contact)}
                                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                            title="LinkedIn Outreach"
                                          >
                                            <Send className="w-4 h-4" />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[960px]">
              <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200 sticky top-0 z-10 select-none">
                <tr>
                  <th className={`${density === 'compact' ? 'p-2 w-8' : 'p-3.5 w-10'} text-center whitespace-nowrap`}>
                    <input
                      type="checkbox"
                      checked={
                        filteredContacts.length > 0 &&
                        selectedIds.size === filteredContacts.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>

                  {/* Sortable: Contact Name */}
                  <th
                    onClick={() => handleSort('name')}
                    className={`${density === 'compact' ? 'py-2 px-3' : 'p-3.5'} cursor-pointer hover:text-slate-900 transition-colors whitespace-nowrap`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Contact</span>
                      {sortBy === 'name' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>

                  {/* Sortable: Company */}
                  <th
                    onClick={() => handleSort('company')}
                    className={`${density === 'compact' ? 'py-2 px-3' : 'p-3.5'} cursor-pointer hover:text-slate-900 transition-colors whitespace-nowrap`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Company</span>
                      {sortBy === 'company' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>

                  {/* Sortable: Status */}
                  <th
                    onClick={() => handleSort('status')}
                    className={`${density === 'compact' ? 'py-2 px-3' : 'p-3.5'} cursor-pointer hover:text-slate-900 transition-colors whitespace-nowrap`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Status / Inline Editor</span>
                      {sortBy === 'status' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>

                  <th className={`${density === 'compact' ? 'py-2 px-3' : 'p-3.5'} whitespace-nowrap`}>Lifecycle & Due Timer</th>
                  <th className={`${density === 'compact' ? 'py-2 px-3' : 'p-3.5'} whitespace-nowrap`}>Owner</th>
                  <th className={`${density === 'compact' ? 'py-2 px-3' : 'p-3.5'} whitespace-nowrap`}>Tags</th>
                  <th className={`${density === 'compact' ? 'py-2 px-3' : 'p-3.5'} text-right whitespace-nowrap`}>Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredContacts.map((contact, index) => {
                  const isSelected = selectedIds.has(contact.id);
                  const isFocused = focusedIndex === index;
                  const followUp = getFollowUpInfo(contact);
                  const statusConf = STATUS_CONFIG[contact.status] || STATUS_CONFIG.new;
                  const isDropdownOpen = activeStatusDropdownId === contact.id;
                  const companyUrl = getCompanyUrl(contact.company);

                  return (
                    <tr
                      key={contact.id}
                      onClick={() => {
                        setFocusedIndex(index);
                        onSelectContact(contact);
                      }}
                      className={`cursor-pointer transition-colors ${isFocused
                          ? 'bg-indigo-50/60 ring-1 ring-indigo-500/40'
                          : isSelected
                            ? 'bg-indigo-50/30'
                            : 'hover:bg-slate-50/80'
                        }`}
                    >
                      {/* Checkbox */}
                      <td
                        className={`${density === 'compact' ? 'py-1.5 px-2' : 'p-3.5'} text-center whitespace-nowrap`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleToggleSelect(contact.id, e as any)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* Contact Info */}
                      <td className={`${density === 'compact' ? 'py-1.5 px-3' : 'p-3.5'} whitespace-nowrap`}>
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`${density === 'compact' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'
                              } rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 border border-slate-200`}
                          >
                            {getInitials(contact.name, 'C')}
                          </div>
                          <div>
                            <span
                              className={`font-bold text-slate-900 block hover:text-indigo-600 transition ${density === 'compact' ? 'text-xs' : 'text-sm'
                                }`}
                            >
                              {contact.name || 'Unnamed Contact'}
                            </span>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              {contact.email && (
                                <a
                                  href={`mailto:${contact.email}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="hover:text-indigo-600 hover:underline truncate"
                                  title="Send email"
                                >
                                  {contact.email}
                                </a>
                              )}
                              {contact.phone && (
                                <>
                                  <span>•</span>
                                  <a
                                    href={`tel:${contact.phone}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="hover:text-indigo-600 hover:underline shrink-0"
                                    title="Call phone"
                                  >
                                    {contact.phone}
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Company (Clickable URL) */}
                      <td className={`${density === 'compact' ? 'py-1.5 px-3' : 'p-3.5'} text-slate-800 whitespace-nowrap`}>
                        {contact.company ? (
                          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                            <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {companyUrl ? (
                              <a
                                href={companyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="hover:text-indigo-600 hover:underline inline-flex items-center gap-1 transition-colors cursor-pointer text-indigo-700"
                                title={`Open ${companyUrl} in new tab`}
                              >
                                <span>{cleanCompanyName(contact.company.name)}</span>
                                <ExternalLink className="w-3 h-3 text-indigo-400 shrink-0" />
                              </a>
                            ) : (
                              <span>{cleanCompanyName(contact.company.name)}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                        {contact.title && (
                          <span className="text-[11px] text-slate-500 block">
                            {contact.title}
                          </span>
                        )}
                      </td>

                      {/* INLINE STATUS EDITOR DROPDOWN */}
                      <td
                        className={`${density === 'compact' ? 'py-1.5 px-3' : 'p-3.5'} relative whitespace-nowrap`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveStatusDropdownId(isDropdownOpen ? null : contact.id);
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition cursor-pointer hover:shadow-xs whitespace-nowrap shrink-0 ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}
                          >
                            <span className={`w-2 h-2 rounded-full ${statusConf.dot} shrink-0`} />
                            <span>{statusConf.label}</span>
                            <ChevronDown className="w-3 h-3 opacity-60 ml-0.5 shrink-0" />
                          </button>

                          {/* Inline Dropdown Menu */}
                          {isDropdownOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-30"
                                onClick={() => setActiveStatusDropdownId(null)}
                              />
                              <div className="absolute left-0 mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-slate-200 z-40 p-1 animate-in fade-in zoom-in-95 duration-100">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                                  Set Status
                                </div>
                                {(Object.keys(STATUS_CONFIG) as ContactStatus[]).map((st) => {
                                  const item = STATUS_CONFIG[st];
                                  const isCurrent = contact.status === st;
                                  return (
                                    <button
                                      key={st}
                                      type="button"
                                      onClick={(e) => handleInlineStatusUpdate(contact.id, st, e)}
                                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition text-left cursor-pointer ${isCurrent
                                          ? 'bg-slate-100 font-bold text-slate-900'
                                          : 'hover:bg-slate-50 text-slate-700'
                                        }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                                        <span>{item.label}</span>
                                      </div>
                                      {isCurrent && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Follow-up / Overdue Badge */}
                      <td className={`${density === 'compact' ? 'py-1.5 px-3' : 'p-3.5'} whitespace-nowrap`}>
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border whitespace-nowrap shadow-2xs ${followUp.badgeClass}`}
                        >
                          {followUp.label}
                        </span>
                      </td>

                      {/* Owner */}
                      <td className={`${density === 'compact' ? 'py-1.5 px-3' : 'p-3.5'} text-slate-600 whitespace-nowrap`}>
                        {contact.owner?.name ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center">
                              {getInitials(contact.owner.name, 'U')[0]}
                            </div>
                            <span className="text-xs">{contact.owner.name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Unassigned</span>
                        )}
                      </td>

                      {/* Tags */}
                      <td className={`${density === 'compact' ? 'py-1.5 px-3' : 'p-3.5'}`}>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {contact.tags && contact.tags.length > 0 ? (
                            contact.tags.slice(0, 2).map((t) => (
                              <Badge key={t} variant="neutral" size="sm">
                                {t}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                          {contact.tags && contact.tags.length > 2 && (
                            <span className="text-[10px] text-slate-400 font-bold">
                              +{contact.tags.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td
                        className={`${density === 'compact' ? 'py-1.5 px-3' : 'p-3.5'} text-right whitespace-nowrap`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          {contact.email && (
                            <button
                              onClick={() => onOpenEmailComposer(contact)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                              title="Send Email"
                            >
                              <Mail className="w-4 h-4" />
                            </button>
                          )}
                          {onOpenLinkedIn && (
                            <button
                              onClick={() => onOpenLinkedIn(contact)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="LinkedIn Outreach"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContacts.map((contact) => {
            const isSelected = selectedIds.has(contact.id);
            const followUp = getFollowUpInfo(contact);
            const statusConf = STATUS_CONFIG[contact.status] || STATUS_CONFIG.new;
            const companyUrl = getCompanyUrl(contact.company);

            return (
              <div
                key={contact.id}
                onClick={() => onSelectContact(contact)}
                className={`bg-white rounded-2xl border p-4 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200'
                  }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm flex items-center justify-center border border-slate-200">
                        {getInitials(contact.name, 'C')}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm hover:text-indigo-600 transition">
                          {contact.name}
                        </h4>
                        <p className="text-xs text-slate-500">{contact.title || 'Lead'}</p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full border ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
                      {statusConf.label}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 mb-3">
                    {contact.company && (
                      <div className="flex items-center gap-1.5 font-medium text-slate-800">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        {companyUrl ? (
                          <a
                            href={companyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-indigo-700 hover:text-indigo-900 hover:underline inline-flex items-center gap-1"
                          >
                            <span>{cleanCompanyName(contact.company.name)}</span>
                            <ExternalLink className="w-3 h-3 text-indigo-400" />
                          </a>
                        ) : (
                          <span>{cleanCompanyName(contact.company.name)}</span>
                        )}
                      </div>
                    )}
                    {contact.email && (
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">{contact.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className={`text-[11px] font-semibold ${followUp.isOverdue ? 'text-rose-600' : 'text-slate-500'}`}>
                    {followUp.label}
                  </span>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {contact.email && (
                      <button
                        onClick={() => onOpenEmailComposer(contact)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                      >
                        <Mail className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. FLOATING ACTION BAR (SLIDES UP ON SELECTION)                        */}
      {/* ===================================================================== */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 inset-x-0 mx-auto max-w-2xl px-4 z-40 animate-in slide-in-from-bottom-5 duration-200">
          <div className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-2xl border border-slate-700/80 flex flex-wrap items-center justify-between gap-3">

            {/* Counter */}
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>{selectedIds.size} Selected</span>
              </span>
            </div>

            {/* Actions Row */}
            <div className="flex items-center gap-2">
              {/* Bulk Status Select */}
              <div className="relative">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBulkStatusChange(e.target.value as ContactStatus);
                      e.target.value = '';
                    }
                  }}
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium cursor-pointer"
                >
                  <option value="" disabled>
                    Set Status to...
                  </option>
                  {(Object.keys(STATUS_CONFIG) as ContactStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {STATUS_CONFIG[st].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Bulk Follow-up Button */}
              <button
                type="button"
                onClick={() => onOpenBulkEmail(selectedContacts, 'followup')}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Send personalized bulk follow-ups to selected contacts"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Bulk Follow-up</span>
              </button>

              {/* Bulk Outreach Campaign */}
              <button
                type="button"
                onClick={() => onOpenBulkEmail(selectedContacts, 'intro')}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Send outreach campaign to selected contacts"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Bulk Outreach</span>
              </button>

              {/* Bulk Delete (Admin Only) */}
              {canBulkDelete && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition cursor-pointer"
                  title="Delete selected contacts (Admin Only)"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <div className="h-4 w-px bg-slate-700 mx-1" />

              {/* Deselect All */}
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-slate-400 hover:text-white transition flex items-center gap-1 cursor-pointer font-medium"
              >
                <X className="w-3.5 h-3.5" />
                <span>Deselect All</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
