import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Play, Pause, Trash2, Eye, MoreHorizontal,
  Users, Calendar, ChevronRight, RefreshCw, Target
} from 'lucide-react';
import { useTeam } from '../../context/TeamContext';
import { useToast } from '../../context/ToastContext';
import {
  getLinkedInCampaigns,
  deleteCampaign,
  launchCampaign,
  pauseCampaign,
  resumeCampaign,
} from '../../lib/linkedinService';
import { LinkedInCampaign, CAMPAIGN_STATUS_COLORS, ACTION_TYPE_ICONS } from '../../types/linkedin';
import { Contact } from '../../types/crm';
import { CampaignBuilderModal } from './CampaignBuilderModal';

interface LinkedInCampaignsViewProps {
  contacts: Contact[];
  onRefresh?: () => void;
}

export const LinkedInCampaignsView: React.FC<LinkedInCampaignsViewProps> = ({ contacts, onRefresh }) => {
  const { activeMember } = useTeam();
  const { success, error: showError } = useToast();

  const [campaigns, setCampaigns] = useState<LinkedInCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<LinkedInCampaign | null>(null);

  const loadCampaigns = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getLinkedInCampaigns();
      setCampaigns(data);
    } catch (e: any) {
      showError('Load failed', e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const handleLaunch = async (campaign: LinkedInCampaign) => {
    if (!confirm(`Launch "${campaign.name}"? This will schedule all outreach actions.`)) return;
    try {
      await launchCampaign(campaign.id);
      success('Campaign Launched! 🚀', `"${campaign.name}" is now running.`);
      await loadCampaigns();
    } catch (e: any) {
      showError('Launch failed', e.message);
    }
  };

  const handlePause = async (campaign: LinkedInCampaign) => {
    try {
      await pauseCampaign(campaign.id);
      success('Campaign Paused', `"${campaign.name}" has been paused.`);
      await loadCampaigns();
    } catch (e: any) {
      showError('Failed to pause', e.message);
    }
  };

  const handleResume = async (campaign: LinkedInCampaign) => {
    try {
      await resumeCampaign(campaign.id);
      success('Campaign Resumed ▶️', `"${campaign.name}" is running again.`);
      await loadCampaigns();
    } catch (e: any) {
      showError('Failed to resume', e.message);
    }
  };

  const handleDelete = async (campaign: LinkedInCampaign) => {
    if (!confirm(`Delete "${campaign.name}"? This cannot be undone.`)) return;
    try {
      await deleteCampaign(campaign.id);
      success('Deleted', `"${campaign.name}" has been removed.`);
      await loadCampaigns();
    } catch (e: any) {
      showError('Delete failed', e.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading campaigns...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
          {campaigns.filter((c) => c.status === 'active').length > 0 && (
            <span className="ml-2 text-emerald-600 font-semibold">
              • {campaigns.filter((c) => c.status === 'active').length} active
            </span>
          )}
        </p>
        <button
          onClick={() => { setEditingCampaign(null); setShowBuilder(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          New Campaign
        </button>
      </div>

      {/* Campaign Cards */}
      {campaigns.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <Target className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600">No campaigns yet</p>
          <p className="text-xs text-slate-400 mt-1">Create your first LinkedIn outreach campaign</p>
          <button
            onClick={() => setShowBuilder(true)}
            className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
          >
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onLaunch={() => handleLaunch(campaign)}
              onPause={() => handlePause(campaign)}
              onResume={() => handleResume(campaign)}
              onDelete={() => handleDelete(campaign)}
              onEdit={() => { setEditingCampaign(campaign); setShowBuilder(true); }}
            />
          ))}
        </div>
      )}

      {/* Campaign Builder Modal */}
      {showBuilder && (
        <CampaignBuilderModal
          isOpen={showBuilder}
          onClose={() => { setShowBuilder(false); setEditingCampaign(null); }}
          contacts={contacts}
          editingCampaign={editingCampaign}
          onSaved={loadCampaigns}
        />
      )}
    </div>
  );
};

// Campaign Card
interface CampaignCardProps {
  campaign: LinkedInCampaign;
  onLaunch: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

const CampaignCard: React.FC<CampaignCardProps> = ({
  campaign, onLaunch, onPause, onResume, onDelete, onEdit
}) => {
  const statusColor = CAMPAIGN_STATUS_COLORS[campaign.status];
  const completionPct = campaign.total_contacts > 0
    ? Math.round((campaign.actions_completed / (campaign.total_contacts * (campaign.steps?.length || 1))) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4-sm transition">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{campaign.name}</h3>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
              {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
            </span>
          </div>

          {campaign.description && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{campaign.description}</p>
          )}

          {/* Sequence Steps Preview */}
          {campaign.steps && campaign.steps.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {campaign.steps.map((step, idx) => (
                <React.Fragment key={step.id}>
                  <span className="flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                    <span>{ACTION_TYPE_ICONS[step.action_type]}</span>
                    <span>{step.action_type === 'view_profile' ? 'View' : step.action_type === 'send_connection' ? 'Connect' : 'Message'}</span>
                  </span>
                  {idx < campaign.steps!.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-slate-300" />
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Stats Row */}
          <div className="flex items-center gap-3.5 mt-3 text-xs text-slate-500 flex-wrap">
            {campaign.linkedin_account && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                {campaign.linkedin_account.linkedin_avatar_url ? (
                  <img
                    src={campaign.linkedin_account.linkedin_avatar_url}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-4 h-4 rounded-full object-cover"
                  />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center">
                    {campaign.linkedin_account.linkedin_name?.charAt(0) || 'L'}
                  </span>
                )}
                <span className="truncate max-w-[130px]">{campaign.linkedin_account.linkedin_name || 'Account'}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {campaign.total_contacts} contacts
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(campaign.start_date).toLocaleDateString()} – {new Date(campaign.end_date).toLocaleDateString()}
            </span>
            {campaign.status === 'active' && (
              <span className="text-emerald-600 font-semibold">
                {campaign.actions_completed} actions done
              </span>
            )}
          </div>

          {/* Progress bar for active campaigns */}
          {(campaign.status === 'active' || campaign.status === 'completed') && campaign.total_contacts > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>Progress</span>
                <span>{completionPct}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {campaign.status === 'draft' && (
            <button
              onClick={onLaunch}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
            >
              <Play className="w-3 h-3" />
              Launch
            </button>
          )}
          {campaign.status === 'active' && (
            <button
              onClick={onPause}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-50 transition"
            >
              <Pause className="w-3 h-3" />
              Pause
            </button>
          )}
          {campaign.status === 'paused' && (
            <button
              onClick={onResume}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-50 transition"
            >
              <Play className="w-3 h-3" />
              Resume
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
