import React, { useState, useEffect, useMemo } from 'react';
import { Deal, DealStage, Contact } from '../../types/crm';
import { db } from '../../lib/supabase';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import { DealModal } from './DealModal';
import {
  DollarSign,
  TrendingUp,
  Target,
  Trophy,
  Plus,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Building2,
  User,
  Search,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Trash2,
  Edit,
  Sparkles,
} from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';

interface PipelineViewProps {
  onOpenContact?: (contact: Contact) => void;
}

const STAGES: {
  id: DealStage;
  label: string;
  color: string;
  headerBg: string;
  badgeColor: string;
}[] = [
  {
    id: 'discovery',
    label: 'Discovery',
    color: 'border-t-slate-400',
    headerBg: 'bg-slate-50',
    badgeColor: 'bg-slate-100 text-slate-700',
  },
  {
    id: 'qualified',
    label: 'Qualified',
    color: 'border-t-blue-500',
    headerBg: 'bg-blue-50/60',
    badgeColor: 'bg-blue-100 text-blue-800',
  },
  {
    id: 'proposal',
    label: 'Proposal Sent',
    color: 'border-t-indigo-500',
    headerBg: 'bg-indigo-50/60',
    badgeColor: 'bg-indigo-100 text-indigo-800',
  },
  {
    id: 'negotiation',
    label: 'Negotiation',
    color: 'border-t-amber-500',
    headerBg: 'bg-amber-50/60',
    badgeColor: 'bg-amber-100 text-amber-800',
  },
  {
    id: 'won',
    label: 'Closed Won',
    color: 'border-t-emerald-500',
    headerBg: 'bg-emerald-50/60',
    badgeColor: 'bg-emerald-100 text-emerald-800 font-bold',
  },
  {
    id: 'lost',
    label: 'Closed Lost',
    color: 'border-t-rose-400',
    headerBg: 'bg-rose-50/60',
    badgeColor: 'bg-rose-100 text-rose-700',
  },
];

const STAGE_ORDER: DealStage[] = [
  'discovery',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
];

export const PipelineView: React.FC<PipelineViewProps> = ({ onOpenContact }) => {
  const { activeMember } = useTeam();
  const { success, error } = useToast();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterOwner, setFilterOwner] = useState<'all' | 'mine'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isDealModalOpen, setIsDealModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);

  const loadDeals = async () => {
    try {
      const fetched = await db.getDeals();
      setDeals(fetched);
    } catch (err) {
      console.error('Failed to load deals', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDeals();
  }, []);

  // Filtered deals
  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      // Owner filter
      if (filterOwner === 'mine' && activeMember) {
        if (d.owner_id !== activeMember.id) return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = d.title.toLowerCase().includes(q);
        const matchesContact = d.contact_name?.toLowerCase().includes(q);
        const matchesCompany = d.company_name?.toLowerCase().includes(q);
        const matchesOwner = d.owner_name?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesContact && !matchesCompany && !matchesOwner) {
          return false;
        }
      }
      return true;
    });
  }, [deals, filterOwner, activeMember, searchQuery]);

  // High-level pipeline metrics
  const stats = useMemo(() => {
    const activeDeals = deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
    const totalPipelineValue = activeDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const weightedForecast = activeDeals.reduce(
      (sum, d) => sum + (Number(d.value || 0) * (d.probability || 0)) / 100,
      0
    );
    const wonDeals = deals.filter((d) => d.stage === 'won');
    const totalWonRevenue = wonDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);

    const lostDeals = deals.filter((d) => d.stage === 'lost');
    const totalClosed = wonDeals.length + lostDeals.length;
    const winRate = totalClosed > 0 ? Math.round((wonDeals.length / totalClosed) * 100) : 0;

    return {
      activeCount: activeDeals.length,
      totalPipelineValue,
      weightedForecast,
      totalWonRevenue,
      wonCount: wonDeals.length,
      winRate,
    };
  }, [deals]);

  // Stage shifting helpers
  const handleShiftStage = async (deal: Deal, direction: 'prev' | 'next') => {
    const currentIndex = STAGE_ORDER.indexOf(deal.stage);
    if (currentIndex === -1) return;

    let targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (targetIndex < 0 || targetIndex >= STAGE_ORDER.length) return;

    const targetStage = STAGE_ORDER[targetIndex];
    let newProb = deal.probability;
    if (targetStage === 'discovery') newProb = 10;
    else if (targetStage === 'qualified') newProb = 25;
    else if (targetStage === 'proposal') newProb = 50;
    else if (targetStage === 'negotiation') newProb = 75;
    else if (targetStage === 'won') newProb = 100;
    else if (targetStage === 'lost') newProb = 0;

    try {
      await db.updateDeal(deal.id, {
        stage: targetStage,
        probability: newProb,
        actual_close_date:
          targetStage === 'won' || targetStage === 'lost'
            ? new Date().toISOString().split('T')[0]
            : deal.actual_close_date,
      });

      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id ? { ...d, stage: targetStage, probability: newProb } : d
        )
      );

      if (targetStage === 'won') {
        success('Deal Won! 🎉', `"${deal.title}" marked as Closed Won!`);
      } else {
        success('Stage Updated', `Moved to ${targetStage.toUpperCase()}`);
      }
    } catch (err: any) {
      error('Failed to move stage', err.message);
    }
  };

  const handleDeleteDeal = async (deal: Deal) => {
    if (!confirm(`Are you sure you want to delete deal "${deal.title}"?`)) return;
    try {
      await db.deleteDeal(deal.id);
      setDeals((prev) => prev.filter((d) => d.id !== deal.id));
      success('Deal Deleted', `Removed "${deal.title}".`);
    } catch (err: any) {
      error('Failed to delete deal', err.message);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1700px] mx-auto min-h-[calc(100vh-65px)] flex flex-col">
      {/* Top Header & Metrics Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Sales Pipeline</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {stats.activeCount} active
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Track opportunities, stage velocity, and revenue forecasts in real time.
          </p>
        </div>

        {/* Action button & Owner Filter */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-200/70 p-0.5 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setFilterOwner('all')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterOwner === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Pipeline
            </button>
            <button
              onClick={() => setFilterOwner('mine')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterOwner === 'mine'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              My Deals
            </button>
          </div>

          <button
            onClick={() => {
              setEditingDeal(null);
              setIsDealModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Opportunity</span>
          </button>
        </div>
      </div>

      {/* 4 Stat Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Active Pipeline</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900">
            ${stats.totalPipelineValue.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Across {stats.activeCount} open deals</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Weighted Forecast</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-indigo-700">
            ${Math.round(stats.weightedForecast).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Probability-adjusted revenue</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Won Revenue</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600">
            ${stats.totalWonRevenue.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{stats.wonCount} deals closed won</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Win Rate</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900">{stats.winRate}%</div>
          <div className="text-[11px] text-slate-400 mt-1">Won vs lost ratio</div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search deals by title, company, lead, rep..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs sm:text-sm bg-white border border-slate-200 focus:border-emerald-500 rounded-xl pl-9 pr-3.5 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </div>

      {/* Kanban Stage Columns */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3.5 items-start overflow-x-auto pb-6">
        {STAGES.map((col) => {
          const stageDeals = filteredDeals.filter((d) => d.stage === col.id);
          const stageValue = stageDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);

          return (
            <div
              key={col.id}
              className="bg-slate-100/70 border border-slate-200/80 rounded-2xl p-3 flex flex-col min-h-[480px] w-full"
            >
              {/* Column Header */}
              <div
                className={`p-2.5 rounded-xl border border-slate-200/60 ${col.headerBg} mb-3 border-t-4 ${col.color}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{col.label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${col.badgeColor}`}>
                    {stageDeals.length}
                  </span>
                </div>
                <div className="text-xs font-extrabold text-slate-700 mt-1">
                  ${stageValue.toLocaleString()}
                </div>
              </div>

              {/* Cards List */}
              <div className="space-y-2.5 flex-1">
                {stageDeals.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 font-medium border border-dashed border-slate-200 rounded-xl bg-white/40">
                    No deals
                  </div>
                ) : (
                  stageDeals.map((deal) => {
                    const isOverdue =
                      deal.expected_close_date &&
                      deal.stage !== 'won' &&
                      deal.stage !== 'lost' &&
                      isPast(new Date(deal.expected_close_date)) &&
                      !isToday(new Date(deal.expected_close_date));

                    return (
                      <div
                        key={deal.id}
                        className="group bg-white border border-slate-200/80 hover:border-slate-300 rounded-xl p-3 shadow-2xs hover:shadow-xs transition duration-150 relative cursor-pointer"
                        onClick={() => {
                          setEditingDeal(deal);
                          setIsDealModalOpen(true);
                        }}
                      >
                        {/* Title & Actions */}
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug line-clamp-2 hover:text-emerald-700">
                            {deal.title}
                          </h4>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDeal(deal);
                            }}
                            title="Delete deal"
                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-0.5 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Value & Probability */}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm font-black text-slate-900">
                            ${deal.value.toLocaleString()}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {deal.probability}%
                          </span>
                        </div>

                        {/* Probability Progress Bar */}
                        <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-1.5">
                          <div
                            className={`h-full ${
                              deal.stage === 'won'
                                ? 'bg-emerald-500'
                                : deal.stage === 'lost'
                                ? 'bg-rose-400'
                                : 'bg-indigo-500'
                            }`}
                            style={{ width: `${deal.probability}%` }}
                          />
                        </div>

                        {/* Company & Contact Link */}
                        {(deal.company_name || deal.contact_name) && (
                          <div className="mt-2 text-[11px] text-slate-600 space-y-0.5">
                            {deal.company_name && (
                              <div className="flex items-center gap-1 font-medium text-slate-700 truncate">
                                <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{deal.company_name}</span>
                              </div>
                            )}
                            {deal.contact_name && (
                              <div className="flex items-center gap-1 text-slate-500 truncate">
                                <User className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{deal.contact_name}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Expected Close Date */}
                        {deal.expected_close_date && (
                          <div className="mt-2 flex items-center justify-between text-[10px]">
                            <span
                              className={`flex items-center gap-1 font-medium ${
                                isOverdue ? 'text-rose-600 font-bold' : 'text-slate-400'
                              }`}
                            >
                              <Calendar className="w-3 h-3" />
                              <span>
                                {format(new Date(deal.expected_close_date), 'MMM d, yyyy')}
                                {isOverdue ? ' (Overdue)' : ''}
                              </span>
                            </span>

                            {deal.owner_name && (
                              <span
                                title={`Owner: ${deal.owner_name}`}
                                className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[9px] flex items-center justify-center shrink-0"
                              >
                                {deal.owner_name.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Quick 1-Click Stage Shift Arrows */}
                        <div
                          className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            disabled={deal.stage === 'discovery'}
                            onClick={() => handleShiftStage(deal, 'prev')}
                            title="Move to previous stage"
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                          </button>

                          <span className="text-[10px] text-slate-400 font-medium capitalize">
                            {deal.stage}
                          </span>

                          <button
                            disabled={deal.stage === 'lost'}
                            onClick={() => handleShiftStage(deal, 'next')}
                            title="Advance to next stage"
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
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
