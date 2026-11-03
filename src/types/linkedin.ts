// LinkedIn Outreach Types
// Extensible: auth_type field supports 'cookie' now, 'oauth'/'hybrid' later

export type LinkedInAuthType = 'cookie' | 'oauth' | 'hybrid';

export type LinkedInAccountStatus = 'active' | 'expired' | 'error' | 'disconnected';

export type LinkedInCampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';

export type LinkedInActionType = 'view_profile' | 'send_connection' | 'send_message';

export type LinkedInActionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

export interface LinkedInAccount {
  id: string;
  team_member_id: string;
  auth_type: LinkedInAuthType;

  // Profile info
  linkedin_profile_id?: string | null;
  linkedin_name?: string | null;
  linkedin_headline?: string | null;
  linkedin_profile_url?: string | null;
  linkedin_avatar_url?: string | null;

  // Status
  status: LinkedInAccountStatus;
  last_verified_at?: string | null;
  cookie_expires_at?: string | null;
  error_message?: string | null;

  // Daily usage
  connections_sent_today: number;
  messages_sent_today: number;
  profile_views_today: number;
  last_action_at?: string | null;

  // Limits
  daily_connection_limit: number;
  daily_message_limit: number;
  daily_view_limit: number;

  created_at: string;
  updated_at?: string;

  // Joined
  team_member?: { name: string; email?: string; avatar_url?: string };
}

export interface LinkedInCampaign {
  id: string;
  created_by?: string | null;
  linkedin_account_id: string;

  name: string;
  description?: string | null;

  audience_filters: {
    tags?: string[];
    company_ids?: string[];
    pipeline_stages?: string[];
    contact_ids?: string[];
  };

  contact_ids: string[];

  start_date: string;
  end_date: string;
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[]; // 0=Sun ... 6=Sat

  status: LinkedInCampaignStatus;

  // Stats
  total_contacts: number;
  actions_completed: number;
  actions_failed: number;
  connections_accepted: number;
  replies_received: number;

  launched_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at?: string;

  // Joined
  steps?: LinkedInCampaignStep[];
  linkedin_account?: LinkedInAccount;
  creator?: { name: string };
}

export interface LinkedInCampaignStep {
  id: string;
  campaign_id: string;
  step_order: number;
  action_type: LinkedInActionType;

  connection_note?: string | null;
  connection_note_ai_generated: boolean;

  message_body?: string | null;
  message_ai_generated: boolean;

  delay_after_hours: number;
  delay_jitter_hours: number;

  created_at: string;
}

export interface LinkedInActionQueueItem {
  id: string;
  campaign_id: string;
  campaign_step_id: string;
  linkedin_account_id: string;
  contact_id: string;

  action_type: LinkedInActionType;
  message_content?: string | null;
  scheduled_at: string;
  status: LinkedInActionStatus;
  executed_at?: string | null;
  error_message?: string | null;
  retry_count: number;
  linkedin_response?: Record<string, unknown> | null;

  created_at: string;
  updated_at?: string;

  // Joined
  contact?: { name: string; linkedin_url?: string | null };
}

// Campaign Builder Form State
export interface CampaignBuilderStep {
  id: string; // temp client ID
  step_order: number;
  action_type: LinkedInActionType;
  connection_note: string;
  connection_note_ai_generated: boolean;
  message_body: string;
  message_ai_generated: boolean;
  delay_after_hours: number;
  delay_jitter_hours: number;
}

export interface CampaignBuilderForm {
  name: string;
  description: string;
  linkedin_account_id: string;
  steps: CampaignBuilderStep[];
  audience_filters: {
    tags: string[];
    company_ids: string[];
    pipeline_stages: string[];
  };
  start_date: string;
  end_date: string;
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[];
}

export const DEFAULT_CAMPAIGN_FORM: CampaignBuilderForm = {
  name: '',
  description: '',
  linkedin_account_id: '',
  steps: [],
  audience_filters: { tags: [], company_ids: [], pipeline_stages: [] },
  start_date: '',
  end_date: '',
  working_hours_start: '09:00',
  working_hours_end: '18:00',
  working_days: [1, 2, 3, 4, 5],
};

export const ACTION_TYPE_LABELS: Record<LinkedInActionType, string> = {
  view_profile: 'View Profile',
  send_connection: 'Send Connection Request',
  send_message: 'Send Message',
};

export const ACTION_TYPE_ICONS: Record<LinkedInActionType, string> = {
  view_profile: '👁️',
  send_connection: '🤝',
  send_message: '💬',
};

export const CAMPAIGN_STATUS_COLORS: Record<LinkedInCampaignStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  completed: 'bg-indigo-100 text-indigo-700',
  cancelled: 'bg-red-100 text-red-600',
};

// A LinkedIn connection request sent by an AI agent (Claude) and recorded through the MCP connector.
export interface LinkedInInvite {
  id: string;
  contact_id: string | null;
  linkedin_url: string;
  name: string;
  headline: string | null;
  company: string | null;
  note: string | null;
  status: 'pending' | 'accepted';
  source: string;
  sent_by: string | null;
  sent_at: string;
  accepted_at: string | null;
  sender?: { name: string } | null;
}
