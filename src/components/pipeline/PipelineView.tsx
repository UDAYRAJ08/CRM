import React, { useState, useEffect, useMemo } from 'react';
import { Deal, DealStage, Contact } from '../../types/crm';
import { db } from '../../lib/supabase';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { DealModal } from './DealModal';
import {
  Filter,
  ArrowUpDown,
  List,
  Columns3,
  LayoutGrid,
  PieChart,
  CalendarDays,
  RefreshCw,
  Plus,
  ChevronDown,
  MoreHorizontal,
  Settings,
  Calendar,
  CheckSquare,
  Sparkles,
  Clock,
  Users,
  FolderKanban,
  CheckCircle2,
  Trash2,
  Edit2,
  DollarSign,
  ArrowRight,
  ArrowLeft,
  Search,
} from 'lucide-react';
import { format, isToday, isPast, addMonths, isSameMonth } from 'date-fns';

interface PipelineViewProps {
  onOpenContact?: (contact: Contact) => void;
}

type TabType =
  | 'all'
  | 'premium'
  | 'new'
  | 'recent'
  | 'shared'
  | 'closing_next_month';

type ViewMode = 'table' | 'kanban';

type SortField = 'name' | 'amount' | 'stage' | 'date';
type SortOrder = 'asc' | 'desc';

export const PipelineView: React.FC<PipelineViewProps> = ({ onOpenContact }) => {
  const { activeMember } = useTeam();
  const { success, error } = useToast();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);

  // View state
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedDeals, setSelectedDeals] = useState<string[]>([]);

  // Filter & Sort state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Modals state
  const [isDealModalOpen, setIsDealModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);

  const loadDeals = async (showToast = false) => {
    setIsFetching(true);
    try {
      const data = await db.getDeals();
      setDeals(data);
      if (showToast) {
        success('Records Refreshed', `Loaded ${data.length} deals.`);
      }
    } catch (e: any) {
      console.error(e);
      error('Failed to load deals', e.message);
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  };

  useEffect(() => {
    loadDeals();
  }, []);

  // Filter and sort deals
  const filteredDeals = useMemo(() => {
    return deals
      .filter((d) => {
        // Tab filtering
        if (activeTab === 'premium') {
          if (Number(d.value || 0) < 10000) return false;
        } else if (activeTab === 'new') {
          if (d.stage !== 'discovery') return false;
        } else if (activeTab === 'recent') {
          if (!d.created_at) return false;
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          if (new Date(d.created_at) < sevenDaysAgo) return false;
        } else if (activeTab === 'shared') {
          if (activeMember && d.owner_id !== activeMember.id) return false;
        } else if (activeTab === 'closing_next_month') {
          if (!d.expected_close_date) return false;
          const nextMonth = addMonths(new Date(), 1);
          if (!isSameMonth(new Date(d.expected_close_date), nextMonth)) return false;
        }

        // Custom Stage filter
        if (selectedStageFilter !== 'all') {
          if (d.stage !== selectedStageFilter) return false;
        }

        // Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = d.title.toLowerCase().includes(q);
          const matchCompany = d.company_name?.toLowerCase().includes(q);
          const matchContact = d.contact_name?.toLowerCase().includes(q);
          if (!matchTitle && !matchCompany && !matchContact) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortField === 'name') {
          const res = a.title.localeCompare(b.title);
          return sortOrder === 'asc' ? res : -res;
        }
        if (sortField === 'amount') {
          const diff = Number(a.value || 0) - Number(b.value || 0);
          return sortOrder === 'asc' ? diff : -diff;
        }
        if (sortField === 'stage') {
          const res = a.stage.localeCompare(b.stage);
          return sortOrder === 'asc' ? res : -res;
        }
        // date
        const dateA = a.expected_close_date ? new Date(a.expected_close_date).getTime() : 0;
        const dateB = b.expected_close_date ? new Date(b.expected_close_date).getTime() : 0;
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      });
  }, [deals, activeTab, selectedStageFilter, searchQuery, sortField, sortOrder, activeMember]);

  // Bulk selection handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedDeals(filteredDeals.map((d) => d.id));
    } else {
      setSelectedDeals([]);
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedDeals((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteDeal = async (deal: Deal) => {
    if (!confirm(`Are you sure you want to delete "${deal.title}"?`)) return;
    try {
      await db.deleteDeal(deal.id);
      setDeals((prev) => prev.filter((d) => d.id !== deal.id));
      setSelectedDeals((prev) => prev.filter((item) => item !== deal.id));
      success('Deal Deleted', `Removed "${deal.title}".`);
    } catch (err: any) {
      error('Failed to delete deal', err.message);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedDeals.length} selected deals?`)) return;
    try {
      await Promise.all(selectedDeals.map((id) => db.deleteDeal(id)));
      setDeals((prev) => prev.filter((d) => !selectedDeals.includes(d.id)));
      setSelectedDeals([]);
      success('Deals Deleted', 'Selected deals have been deleted.');
    } catch (err: any) {
      error('Failed to delete deals', err.message);
    }
  };

  // Helper for stage formatting and badge colors matching the screenshot
  const getStageBadge = (stage: DealStage) => {
    switch (stage) {
      case 'discovery':
        return {
          label: 'Needs Analysis',
          className: 'bg-[#e86a5a] text-white',
        };
      case 'qualified':
        return {
          label: 'Qualification',
          className: 'bg-[#1a88f8] text-white',
        };
      case 'proposal':
        return {
          label: 'Proposal Sent',
          className: 'bg-[#f59e0b] text-white',
        };
      case 'negotiation':
        return {
          label: 'Negotiation/Review',
          className: 'bg-[#5850ec] text-white',
        };
      case 'won':
        return {
          label: 'Closed Won',
          className: 'bg-[#0e9f6e] text-white',
        };
      case 'lost':
        return {
          label: 'Closed Lost',
          className: 'bg-[#94a3b8] text-white',
        };
      default:
        return {
          label: stage,
          className: 'bg-slate-500 text-white',
        };
    }
  };

  // Helper for ribbon bookmark tag matching screenshot
  const renderRibbon = (deal: Deal) => {
    if (!deal.expected_close_date) return null;

    const closeDate = new Date(deal.expected_close_date);
    const isDueToday = isToday(closeDate);
    const isPastDue = isPast(closeDate) && !isDueToday;

    // Green ribbon for Closed Won or Today
    if (deal.stage === 'won') {
      return (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-emerald-50 border border-emerald-300 text-emerald-700 text-[10px] font-bold tracking-tight shadow-2xs relative">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span>WON</span>
        </div>
      );
    }

    if (isDueToday) {
      return (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-rose-50 border border-rose-300 text-rose-600 text-[10px] font-bold tracking-tight shadow-2xs relative">
          <CheckSquare className="w-3 h-3 text-rose-500" />
          <span>TODAY</span>
        </div>
      );
    }

    if (isPastDue) {
      return (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold tracking-tight shadow-2xs relative">
          <Calendar className="w-3 h-3 text-rose-500" />
          <span>{format(closeDate, 'MMM d, yyyy').toUpperCase()}</span>
        </div>
      );
    }

    // Upcoming ribbon (green outline tag as seen in screenshot)
    return (
      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-emerald-50/70 border border-emerald-300/80 text-emerald-700 text-[10px] font-semibold tracking-tight shadow-2xs relative">
        <CheckSquare className="w-3 h-3 text-emerald-600" />
        <span>{format(closeDate, 'MMM d, yyyy').toUpperCase()}</span>
      </div>
    );
  };

  // Format currency amounts like `$ 60,000,000` or `$ 589.99`
  const formatAmount = (value: number) => {
    return `$ ${Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: value % 1 !== 0 ? 2 : 0,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1700px] mx-auto min-h-[calc(100vh-65px)] flex flex-col font-sans">
      {/* ========================================================================= */}
      {/* 1. TOP SEGMENTED FILTER TABS                                              */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 text-xs select-none">
        {/* Active All Deals Tab */}
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
            activeTab === 'all'
              ? 'bg-[#eeeafd] text-[#5b3ee8] border border-[#d8d0fc] shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FolderKanban className="w-4 h-4 text-[#5b3ee8]" />
          <span>All Deals</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('premium')}
          className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
            activeTab === 'premium'
              ? 'bg-[#eeeafd] text-[#5b3ee8] border border-[#d8d0fc] font-bold shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Premium Deals</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('new')}
          className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
            activeTab === 'new'
              ? 'bg-[#eeeafd] text-[#5b3ee8] border border-[#d8d0fc] font-bold shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <List className="w-3.5 h-3.5 text-blue-500" />
          <span>New Deals</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('recent')}
          className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
            activeTab === 'recent'
              ? 'bg-[#eeeafd] text-[#5b3ee8] border border-[#d8d0fc] font-bold shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-indigo-500" />
          <span>Recently Created Deals</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('shared')}
          className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
            activeTab === 'shared'
              ? 'bg-[#eeeafd] text-[#5b3ee8] border border-[#d8d0fc] font-bold shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-emerald-500" />
          <span>Shared with Me</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('closing_next_month')}
          className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
            activeTab === 'closing_next_month'
              ? 'bg-[#eeeafd] text-[#5b3ee8] border border-[#d8d0fc] font-bold shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-rose-500" />
          <span>Closing Next Month</span>
        </button>

        <button
          type="button"
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition shrink-0 cursor-pointer"
          title="Filter stages"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 2. ACTION & VIEW SWITCHER BAR                                             */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Left: Filter, Sort, View Switcher Group */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Filter Button */}
          <div className="relative">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-200/90 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span>Filter</span>
              {selectedStageFilter !== 'all' && (
                <span className="w-2 h-2 rounded-full bg-blue-600" />
              )}
            </button>

            {isFilterOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setIsFilterOpen(false)}
                />
                <div className="absolute left-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-40 p-3 space-y-2 animate-in fade-in duration-150">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Filter by Stage
                  </div>
                  <select
                    value={selectedStageFilter}
                    onChange={(e) => setSelectedStageFilter(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none"
                  >
                    <option value="all">All Stages</option>
                    <option value="discovery">Needs Analysis</option>
                    <option value="qualified">Qualification</option>
                    <option value="proposal">Proposal Sent</option>
                    <option value="negotiation">Negotiation/Review</option>
                    <option value="won">Closed Won</option>
                    <option value="lost">Closed Lost</option>
                  </select>

                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() => {
                        setSelectedStageFilter('all');
                        setIsFilterOpen(false);
                      }}
                      className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                    >
                      Reset Filter
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sort Button */}
          <button
            onClick={() => {
              if (sortField === 'amount') {
                setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
              } else {
                setSortField('amount');
                setSortOrder('desc');
              }
            }}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200/90 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            <span>Sort {sortField === 'amount' ? `(${sortOrder.toUpperCase()})` : ''}</span>
          </button>

          {/* Segmented View Mode Switcher */}
          <div className="flex items-center bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/80 gap-0.5">
            {/* Table / List View */}
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-blue-600 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>

            {/* Kanban Board View */}
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-white text-blue-600 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Kanban Board View"
            >
              <Columns3 className="w-4 h-4" />
            </button>

            {/* Grid Icon */}
            <button
              onClick={() => setViewMode('kanban')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 transition cursor-pointer"
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>

            {/* Chart / Kanban Toggle */}
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'table' ? 'kanban' : 'table')}
              className={`p-1.5 rounded-lg transition cursor-pointer hidden sm:block ${
                viewMode === 'table' ? 'bg-white text-indigo-600 shadow-2xs font-bold' : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Toggle Table / Kanban View"
            >
              <PieChart className="w-4 h-4" />
            </button>

            {/* Calendar Deals Closing Filter Toggle */}
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'closing_next_month' ? 'all' : 'closing_next_month')}
              className={`p-1.5 rounded-lg transition cursor-pointer hidden sm:block ${
                activeTab === 'closing_next_month' ? 'bg-white text-rose-600 shadow-2xs font-bold' : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Filter Deals Closing Soon"
            >
              <CalendarDays className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: Fetch Records & Create Deal Split Button */}
        <div className="flex items-center gap-2">
          {/* Fetch Records Button */}
          <button
            onClick={() => loadDeals(true)}
            disabled={isFetching}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/90 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Fetch Records</span>
          </button>

          {/* Create Deal Split Button */}
          <div className="flex items-center shadow-xs">
            <button
              onClick={() => {
                setEditingDeal(null);
                setIsDealModalOpen(true);
              }}
              className="px-4 py-2 rounded-l-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center gap-1.5"
            >
              <span>Create Deal</span>
            </button>
            <button
              onClick={() => {
                setEditingDeal(null);
                setIsDealModalOpen(true);
              }}
              className="px-2 py-2 rounded-r-xl bg-blue-700 hover:bg-blue-800 text-white border-l border-blue-500 transition cursor-pointer flex items-center justify-center"
              title="More deal actions"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Batch delete button if items are selected */}
          {selectedDeals.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
              title={`Delete ${selectedDeals.length} selected`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <button
            className="p-2 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-500 transition cursor-pointer"
            title="Options"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. TABLE VIEW (MATCHING REFERENCE SCREENSHOT)                            */}
      {/* ========================================================================= */}
      {viewMode === 'table' ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              {/* Header Row */}
              <thead>
                <tr className="border-b border-slate-200/80 bg-white text-slate-600 text-xs font-semibold select-none">
                  {/* Select All Checkbox */}
                  <th className="w-12 px-4 py-3.5 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredDeals.length > 0 &&
                        selectedDeals.length === filteredDeals.length
                      }
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>

                  {/* Ribbon Flag Column Header */}
                  <th className="w-32 px-3 py-3.5"></th>

                  {/* Deal Name Column Header */}
                  <th className="px-4 py-3.5 font-bold text-slate-700 border-r border-slate-100">
                    Deal Name
                  </th>

                  {/* Amount Column Header */}
                  <th className="px-6 py-3.5 font-bold text-slate-700 text-right">
                    Amount
                  </th>

                  {/* Stage Column Header */}
                  <th className="px-6 py-3.5 font-bold text-slate-700 text-center">
                    Stage
                  </th>

                  {/* Closing Date Column Header */}
                  <th className="px-6 py-3.5 font-bold text-slate-700">
                    Closing Date
                  </th>

                  {/* Column Settings Gear Header */}
                  <th className="w-12 px-4 py-3.5 text-center text-slate-400">
                    <Settings className="w-4 h-4 inline-block hover:text-slate-700 cursor-pointer" />
                  </th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400 text-xs">
                      Loading deals...
                    </td>
                  </tr>
                ) : filteredDeals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400">
                      <div className="max-w-xs mx-auto space-y-2">
                        <FolderKanban className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="font-semibold text-slate-600 text-xs">No deals found in this view</p>
                        <button
                          onClick={() => {
                            setEditingDeal(null);
                            setIsDealModalOpen(true);
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
                        >
                          + Create Deal
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDeals.map((deal) => {
                    const stageBadge = getStageBadge(deal.stage);
                    const isSelected = selectedDeals.includes(deal.id);

                    return (
                      <tr
                        key={deal.id}
                        className={`hover:bg-slate-50/80 transition duration-100 group ${
                          isSelected ? 'bg-blue-50/30' : ''
                        }`}
                      >
                        {/* Row Checkbox */}
                        <td className="w-12 px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectRow(deal.id)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>

                        {/* Ribbon Bookmark Flag Tag */}
                        <td className="w-32 px-3 py-3">
                          {renderRibbon(deal)}
                        </td>

                        {/* Deal Name */}
                        <td className="px-4 py-3 border-r border-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDeal(deal);
                              setIsDealModalOpen(true);
                            }}
                            className="font-medium text-slate-900 hover:text-blue-600 text-left transition cursor-pointer"
                          >
                            {deal.title}
                          </button>
                          {deal.company_name && (
                            <span className="block text-[11px] text-slate-400 truncate">
                              {deal.company_name}
                            </span>
                          )}
                        </td>

                        {/* Amount */}
                        <td className="px-6 py-3 text-right font-medium text-slate-900 tracking-tight whitespace-nowrap">
                          {formatAmount(deal.value)}
                        </td>

                        {/* Stage Pill */}
                        <td className="px-6 py-3 text-center">
                          <span
                            className={`inline-block px-3.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap shadow-2xs ${stageBadge.className}`}
                          >
                            {stageBadge.label}
                          </span>
                        </td>

                        {/* Closing Date */}
                        <td className="px-6 py-3 text-slate-600 whitespace-nowrap text-xs">
                          {deal.expected_close_date
                            ? format(new Date(deal.expected_close_date), 'MMM d, yyyy')
                            : '—'}
                        </td>

                        {/* Row Actions on Hover */}
                        <td className="w-12 px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => {
                                setEditingDeal(deal);
                                setIsDealModalOpen(true);
                              }}
                              className="p-1 text-slate-400 hover:text-blue-600 transition"
                              title="Edit deal"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteDeal(deal)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition"
                              title="Delete deal"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* 4. KANBAN BOARD VIEW (TOGGLEABLE VIA TOOLBAR ICON)                         */
        /* ========================================================================= */
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3.5 items-start overflow-x-auto pb-6">
          {[
            { id: 'discovery' as DealStage, label: 'Needs Analysis', color: 'border-t-[#e86a5a]', badge: 'bg-[#e86a5a] text-white' },
            { id: 'qualified' as DealStage, label: 'Qualification', color: 'border-t-[#1a88f8]', badge: 'bg-[#1a88f8] text-white' },
            { id: 'proposal' as DealStage, label: 'Proposal Sent', color: 'border-t-[#f59e0b]', badge: 'bg-[#f59e0b] text-white' },
            { id: 'negotiation' as DealStage, label: 'Negotiation/Review', color: 'border-t-[#5850ec]', badge: 'bg-[#5850ec] text-white' },
            { id: 'won' as DealStage, label: 'Closed Won', color: 'border-t-[#0e9f6e]', badge: 'bg-[#0e9f6e] text-white' },
            { id: 'lost' as DealStage, label: 'Closed Lost', color: 'border-t-[#94a3b8]', badge: 'bg-[#94a3b8] text-white' },
          ].map((col) => {
            const colDeals = filteredDeals.filter((d) => d.stage === col.id);
            const colValue = colDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);

            return (
              <div
                key={col.id}
                className="bg-slate-100/70 border border-slate-200/80 rounded-2xl p-3 flex flex-col min-h-[480px]"
              >
                <div className={`p-2.5 rounded-xl border border-slate-200/60 bg-white mb-3 border-t-4 ${col.color}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{col.label}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${col.badge}`}>
                      {colDeals.length}
                    </span>
                  </div>
                  <div className="text-xs font-extrabold text-slate-700 mt-1">
                    {formatAmount(colValue)}
                  </div>
                </div>

                <div className="space-y-2.5 flex-1">
                  {colDeals.map((deal) => (
                    <div
                      key={deal.id}
                      onClick={() => {
                        setEditingDeal(deal);
                        setIsDealModalOpen(true);
                      }}
                      className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs hover:shadow-xs transition cursor-pointer"
                    >
                      <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
                        {deal.title}
                      </h4>
                      <div className="text-xs font-black text-slate-900 mt-2">
                        {formatAmount(deal.value)}
                      </div>
                      {deal.expected_close_date && (
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{format(new Date(deal.expected_close_date), 'MMM d, yyyy')}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. FOOTER SUMMARY                                                         */}
      {/* ========================================================================= */}
      <div className="pt-2 text-xs font-semibold text-slate-500">
        <span>Total Record: {filteredDeals.length}</span>
      </div>

      {/* Deal Add/Edit Modal */}
      <DealModal
        isOpen={isDealModalOpen}
        onClose={() => {
          setIsDealModalOpen(false);
          setEditingDeal(null);
        }}
        dealToEdit={editingDeal}
        onSuccess={loadDeals}
      />
    </div>
  );
};
