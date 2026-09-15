export type ContactStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal'
  | 'won'
  | 'lost'
  | 'inactive';

export type InteractionType = 'call' | 'email' | 'meeting' | 'note' | 'linkedin';

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  role?: string;
  avatar_url?: string;
  created_at?: string;
}

export interface Company {
  id: string;
  name: string;
  parent_company_id?: string | null;
  industry?: string;
  website?: string;
  created_at?: string;
}

export interface Contact {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  company_id?: string | null;
  company?: Company | null;
  owner_id?: string | null;
  owner?: TeamMember | null;
  status: ContactStatus;
  tags: string[];
  custom_fields: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export interface Interaction {
  id: string;
  contact_id: string;
  type: InteractionType;
  content: string;
  created_by?: string | null;
  creator?: TeamMember | null;
  created_at: string;
}

export interface EmailRecord {
  id: string;
  contact_id?: string | null;
  recipient_email: string;
  sender_email?: string | null;
  is_inbound?: boolean;
  subject: string;
  body: string;
  ai_generated?: boolean;
  sent_by?: string | null;
  sender?: TeamMember | null;
  sent_at?: string;
  status: 'draft' | 'queued' | 'sent' | 'failed' | 'received';
  error_message?: string | null;
  created_at?: string;
}

export interface Reminder {
  id: string;
  contact_id: string;
  contact?: Contact | null;
  assigned_to?: string | null;
  assignee?: TeamMember | null;
  due_date: string;
  note: string;
  done: boolean;
  completed_at?: string | null;
  created_at: string;
}

export interface ImportLog {
  id: string;
  file_name: string;
  uploaded_by?: string | null;
  uploader?: TeamMember | null;
  rows_imported: number;
  rows_flagged: number;
  details?: Record<string, any>;
  created_at: string;
}

export interface ParsedContactRow {
  name: string;
  email?: string;
  phone?: string;
  title?: string;
  company_name?: string;
  status?: ContactStatus;
  tags?: string[];
  custom_fields?: Record<string, any>;
  isDuplicate?: boolean;
  duplicateReason?: string;
  isInvalid?: boolean;
  invalidReason?: string;
  selected?: boolean;
  originalRowIndex?: number;
}

export interface ImportSummary {
  fileName: string;
  totalRows: number;
  validRows: ParsedContactRow[];
  duplicateRows: ParsedContactRow[];
  invalidRows: ParsedContactRow[];
}
