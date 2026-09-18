import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { Contact, ContactStatus } from '../../types/crm';
import { db } from '../../lib/supabase';
import { getInitials } from '../../lib/utils';
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
  Keyboard,
  Globe,
} from 'lucide-react';

interface ContactListProps {
  contacts: Contact[];
  searchQuery: string;
  onSelectContact: (contact: Contact) => void;
  onEditContact: (contact: Contact) => void;
  onOpenEmailComposer: (contact: Contact) => void;
  onOpenLinkedIn?: (contact: Contact) => void;
  onOpenBulkEmail: (selectedContacts: Contact[]) => void;
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
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200/80',
      actionText: 'Send 1st Email',
      isOverdue: false,
      stage: 'new',
    };
  }
  if (contact.status === 'qualified') {
    return {
      label: 'Replied & Qualified',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold',
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
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold shadow-xs',
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
    badgeClass: `${conf.bg} ${conf.text} ${conf.border}`,
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

  // Filter States
  const [pipelineTab, setPipelineTab] = useState<'all' | 'uncontacted' | 'due' | 'replied'>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
        {/* Pipeline Segmented Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setPipelineTab('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
              pipelineTab === 'all'
                ? 'bg-indigo-600 text-white shadow-xs font-bold'
                : 'bg-slate-100/80 hover:bg-slate-200/70 text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>All Leads</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                pipelineTab === 'all' ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {pipelineCounts.all}
            </span>
          </button>

          <button
            onClick={() => setPipelineTab('uncontacted')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
              pipelineTab === 'uncontacted'
                ? 'bg-blue-600 text-white shadow-xs font-bold'
                : 'bg-slate-100/80 hover:bg-slate-200/70 text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🆕 Uncontacted</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                pipelineTab === 'uncontacted' ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {pipelineCounts.uncontacted}
            </span>
          </button>

          <button
            onClick={() => setPipelineTab('due')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
              pipelineTab === 'due'
                ? 'bg-rose-600 text-white shadow-xs font-bold'
                : 'bg-slate-100/80 hover:bg-slate-200/70 text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🚨 Due Follow-ups</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                pipelineTab === 'due' ? 'bg-rose-700 text-rose-100' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {pipelineCounts.due}
            </span>
          </button>

          <button
            onClick={() => setPipelineTab('replied')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
              pipelineTab === 'replied'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'bg-slate-100/80 hover:bg-slate-200/70 text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📥 Replied / Active</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                pipelineTab === 'replied' ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {pipelineCounts.replied}
            </span>
          </button>
        </div>

        {/* Toolbar Dropdowns & Density Switcher */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Tag Filter */}
          {allTags.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
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
            className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
          >
            <option value="all">All Owners</option>
            <option value="unassigned">Unassigned</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {/* Density Toggle (Compact vs Comfortable) */}
          <button
            onClick={toggleDensity}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition cursor-pointer ${
              density === 'compact'
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
            title="Toggle Table Density (Compact / Comfortable)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="capitalize">{density}</span>
          </button>

          <div className="h-4 w-px bg-slate-200 mx-0.5" />

          {/* View Mode (Table / Cards) */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition ${
                viewMode === 'table' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg transition ${
                viewMode === 'cards' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500'
              }`}
              title="Grid Card View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Hint Bar */}
      <div className="hidden lg:flex items-center justify-between text-[11px] text-slate-400 px-1">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Keyboard className="w-3.5 h-3.5 text-slate-400" />
            <span>Shortcuts:</span>
          </span>
          <span><kbd className="px-1 py-0.2 bg-slate-100 border border-slate-200 rounded font-mono text-slate-700">J</kbd> / <kbd className="px-1 py-0.2 bg-slate-100 border border-slate-200 rounded font-mono text-slate-700">K</kbd> navigate</span>
          <span><kbd className="px-1 py-0.2 bg-slate-100 border border-slate-200 rounded font-mono text-slate-700">Enter</kbd> open drawer</span>
          <span><kbd className="px-1 py-0.2 bg-slate-100 border border-slate-200 rounded font-mono text-slate-700">E</kbd> compose email</span>
          <span><kbd className="px-1 py-0.2 bg-slate-100 border border-slate-200 rounded font-mono text-slate-700">Esc</kbd> deselect</span>
        </div>
        <span>{filteredContacts.length} leads in view</span>
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
      ) : viewMode === 'table' ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200 sticky top-0 z-10 select-none">
                <tr>
                  <th className={`${density === 'compact' ? 'p-2 w-8' : 'p-3.5 w-10'} text-center`}>
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
                    className={`${density === 'compact' ? 'py-2 px-3' : 'p-3.5'} cursor-pointer hover:text-slate-900 transition-colors`}
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
                    className={`${density === 'compact' ? 'py-2 px-3' : 'p-3.5'} cursor-pointer hover:text-slate-900 transition-colors`}
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
                    className={`${density === 'compact' ? 'py-2 px-3' : 'p-3.5'} cursor-pointer hover:text-slate-900 transition-colors`}
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

                  <th className={`${density === 'compact' ? 'py-2 px-3' : 'p-3.5'}`}>Lifecycle & Due Timer</th>
                  <th className={`${density === 'compact' ? 'py-2 px-3' : 'p-3.5'}`}>Owner</th>
                  <th className={`${density === 'compact' ? 'py-2 px-3' : 'p-3.5'}`}>Tags</th>
                  <th className={`${density === 'compact' ? 'py-2 px-3' : 'p-3.5'} text-right`}>Actions</th>
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
                      className={`cursor-pointer transition-colors ${
                        isFocused
                          ? 'bg-indigo-50/60 ring-1 ring-indigo-500/40'
                          : isSelected
                          ? 'bg-indigo-50/30'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Checkbox */}
                      <td
                        className={`${density === 'compact' ? 'py-1.5 px-2' : 'p-3.5'} text-center`}
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
                      <td className={`${density === 'compact' ? 'py-1.5 px-3' : 'p-3.5'}`}>
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`${
                              density === 'compact' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'
                            } rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 border border-slate-200`}
                          >
                            {getInitials(contact.name, 'C')}
                          </div>
                          <div>
                            <span
                              className={`font-bold text-slate-900 block hover:text-indigo-600 transition ${
                                density === 'compact' ? 'text-xs' : 'text-sm'
                              }`}
                            >
                              {contact.name || 'Unnamed Contact'}
                            </span>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              {contact.email && <span>{contact.email}</span>}
                              {contact.phone && (
                                <>
                                  <span>•</span>
                                  <span>{contact.phone}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Company (Clickable URL) */}
                      <td className={`${density === 'compact' ? 'py-1.5 px-3' : 'p-3.5'} text-slate-800`}>
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
                                <span>{contact.company.name}</span>
                                <ExternalLink className="w-3 h-3 text-indigo-400 shrink-0" />
                              </a>
                            ) : (
                              <span>{contact.company.name}</span>
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
                        className={`${density === 'compact' ? 'py-1.5 px-3' : 'p-3.5'} relative`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveStatusDropdownId(isDropdownOpen ? null : contact.id);
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition cursor-pointer hover:shadow-xs ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}
                          >
                            <span className={`w-2 h-2 rounded-full ${statusConf.dot}`} />
                            <span>{statusConf.label}</span>
                            <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
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
                      <td className={`${density === 'compact' ? 'py-1.5 px-3' : 'p-3.5'}`}>
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${followUp.badgeClass}`}
                        >
                          {followUp.label}
                        </span>
                      </td>

                      {/* Owner */}
                      <td className={`${density === 'compact' ? 'py-1.5 px-3' : 'p-3.5'} text-slate-600`}>
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
                        className={`${density === 'compact' ? 'py-1.5 px-3' : 'p-3.5'} text-right`}
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
                className={`bg-white rounded-2xl border p-4 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200'
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
                            <span>{contact.company.name}</span>
                            <ExternalLink className="w-3 h-3 text-indigo-400" />
                          </a>
                        ) : (
                          <span>{contact.company.name}</span>
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

              {/* Bulk Email / Sequence */}
              <button
                type="button"
                onClick={() => onOpenBulkEmail(selectedContacts)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send 1st Email / Sequence</span>
              </button>

              {/* Bulk Delete */}
              <button
                type="button"
                onClick={handleBulkDelete}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition cursor-pointer"
                title="Delete selected contacts"
              >
                <Trash2 className="w-4 h-4" />
              </button>

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
