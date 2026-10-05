import { createClient } from '@supabase/supabase-js';
import {
  TeamMember,
  Company,
  Contact,
  Interaction,
  EmailRecord,
  Reminder,
  ImportLog,
  DashboardStats,
  DashboardActivityItem,
  DashboardDayBreakdown,
  DayEmailRecord,
  Deal,
} from '../types/crm';

// Draft email attachment descriptor
export interface DraftAttachment {
  name: string;
  size: number;
  type: string;
  dataUrl: string; // base64 data URL stored locally
}

// Auto-saved email draft
export interface EmailDraft {
  id: string;
  contact_id?: string | null;
  recipient_email: string;
  subject: string;
  body: string; // may contain HTML from rich-text editor
  ai_generated?: boolean;
  sender_email?: string | null;
  attachments?: DraftAttachment[];
  saved_at: string;
  created_at: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-project-ref')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// ==============================================================================
// LOCAL STORAGE REPOSITORY
// Clean state for real data entry and import
// ==============================================================================

const INITIAL_TEAM: TeamMember[] = [];
const INITIAL_COMPANIES: Company[] = [];
const INITIAL_CONTACTS: Contact[] = [];
const INITIAL_INTERACTIONS: Interaction[] = [];
const INITIAL_REMINDERS: Reminder[] = [];
const INITIAL_DEALS: Deal[] = [];

// Helper to load/save JSON from localStorage
function getLocal<T>(key: string, defaultVal: T): T {
  try {
    const item = localStorage.getItem(`crm_${key}`);
    return item ? JSON.parse(item) : defaultVal;
  } catch {
    return defaultVal;
  }
}

function setLocal<T>(key: string, val: T): void {
  try {
    localStorage.setItem(`crm_${key}`, JSON.stringify(val));
  } catch (e) {
    console.error('LocalStorage error', e);
  }
}

export function notifyCRMEvent(event: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(event));
  }
}

// Unified Database Access Layer
export const db = {
  async getTeamMembers(): Promise<TeamMember[]> {
    if (supabase) {
      const { data, error } = await supabase.from('team_members').select('*').order('name');
      if (!error && data) return data;
    }
    return getLocal('team_members', INITIAL_TEAM);
  },

  async getTeamMemberByAuthId(authUserId: string): Promise<TeamMember | null> {
    if (supabase) {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      if (!error && data) return data;
    }
    const members = getLocal('team_members', INITIAL_TEAM);
    return members.find((m) => m.auth_user_id === authUserId) || null;
  },

  async linkTeamMemberAuth(memberId: string, authUserId: string): Promise<void> {
    if (supabase) {
      await supabase
        .from('team_members')
        .update({ auth_user_id: authUserId })
        .eq('id', memberId);
    }
    const members = getLocal('team_members', INITIAL_TEAM);
    const updated = members.map((m) =>
      m.id === memberId ? { ...m, auth_user_id: authUserId } : m
    );
    setLocal('team_members', updated);
  },

  async updateTeamMember(memberId: string, updates: Partial<TeamMember>): Promise<TeamMember | null> {
    if (supabase) {
      const { data, error } = await supabase.from('team_members').update(updates).eq('id', memberId).select().single();
      if (!error && data) return data;
    }
    const members = getLocal('team_members', INITIAL_TEAM);
    const updated = members.map((m) => (m.id === memberId ? { ...m, ...updates } : m));
    setLocal('team_members', updated);
    return updated.find((m) => m.id === memberId) || null;
  },

  async addTeamMember(member: Partial<TeamMember>): Promise<TeamMember> {
    const newMember: TeamMember = {
      id: member.id || crypto.randomUUID(),
      name: member.name || 'New Member',
      email: member.email || '',
      role: member.role || 'Member',
      auth_user_id: member.auth_user_id,
      created_at: new Date().toISOString(),
    };

    if (supabase) {
      const { data, error } = await supabase.from('team_members').insert(newMember).select().single();
      if (!error && data) return data;
    }

    const members = getLocal('team_members', INITIAL_TEAM);
    const updated = [...members, newMember];
    setLocal('team_members', updated);
    return newMember;
  },

  async getCompanies(): Promise<Company[]> {
    if (supabase) {
      const { data, error } = await supabase.from('companies').select('*').order('name');
      if (!error && data) return data;
    }
    return getLocal('companies', INITIAL_COMPANIES);
  },

  async addCompany(company: Partial<Company>): Promise<Company> {
    const newCompany: Company = {
      id: company.id || crypto.randomUUID(),
      name: company.name || 'New Company',
      industry: company.industry || '',
      website: company.website || '',
      created_at: new Date().toISOString(),
    };

    if (supabase) {
      const { data, error } = await supabase.from('companies').insert(newCompany).select().single();
      if (!error && data) return data;
    }

    const list = getLocal('companies', INITIAL_COMPANIES);
    const updated = [...list, newCompany];
    setLocal('companies', updated);
    return newCompany;
  },

  async getContacts(): Promise<Contact[]> {
    if (supabase) {
      const { data, error } = await supabase
        .from('contacts')
        .select('*, company:companies(*), owner:team_members(*)')
        .order('created_at', { ascending: false });
      if (!error && data) return data;
    }

    const contacts = getLocal<Contact[]>('contacts', INITIAL_CONTACTS);
    const companies = getLocal<Company[]>('companies', INITIAL_COMPANIES);
    const team = getLocal<TeamMember[]>('team_members', INITIAL_TEAM);

    return contacts.map((c) => ({
      ...c,
      company: companies.find((comp) => comp.id === c.company_id) || null,
      owner: team.find((t) => t.id === c.owner_id) || null,
    }));
  },

  async saveContact(contact: Partial<Contact>): Promise<Contact> {
    const id = contact.id || crypto.randomUUID();

    if (supabase) {
      if (contact.id) {
        // Safe partial update for existing contacts
        const updatePayload: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };
        if (contact.name !== undefined) updatePayload.name = contact.name;
        if (contact.email !== undefined) updatePayload.email = contact.email;
        if (contact.phone !== undefined) updatePayload.phone = contact.phone;
        if (contact.title !== undefined) updatePayload.title = contact.title;
        if (contact.company_id !== undefined) updatePayload.company_id = contact.company_id;
        if (contact.owner_id !== undefined) updatePayload.owner_id = contact.owner_id;
        if (contact.status !== undefined) updatePayload.status = contact.status;
        if (contact.tags !== undefined) updatePayload.tags = contact.tags;
        if (contact.custom_fields !== undefined) updatePayload.custom_fields = contact.custom_fields;

        const { data, error } = await supabase
          .from('contacts')
          .update(updatePayload)
          .eq('id', contact.id)
          .select('*, company:companies(*), owner:team_members(*)')
          .single();

        if (!error && data) return data;
      } else {
        // Insert new contact
        const insertPayload = {
          id,
          name: contact.name || '',
          email: contact.email || null,
          phone: contact.phone || null,
          title: contact.title || null,
          company_id: contact.company_id || null,
          owner_id: contact.owner_id || null,
          status: contact.status || 'new',
          tags: contact.tags || [],
          custom_fields: contact.custom_fields || {},
          created_at: contact.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('contacts')
          .insert(insertPayload)
          .select('*, company:companies(*), owner:team_members(*)')
          .single();

        if (!error && data) {
          notifyCRMEvent('crm_contacts_updated');
          return data;
        }
      }
    }

    const contacts = getLocal<Contact[]>('contacts', INITIAL_CONTACTS);
    const idx = contacts.findIndex((c) => c.id === id);
    let updatedList: Contact[];
    let updatedContact: Contact;

    if (idx >= 0) {
      updatedList = [...contacts];
      updatedContact = { ...updatedList[idx], ...contact, updated_at: new Date().toISOString() };
      updatedList[idx] = updatedContact;
    } else {
      updatedContact = {
        id,
        name: contact.name || '',
        email: contact.email || null,
        phone: contact.phone || null,
        title: contact.title || null,
        company_id: contact.company_id || null,
        owner_id: contact.owner_id || null,
        status: contact.status || 'new',
        tags: contact.tags || [],
        custom_fields: contact.custom_fields || {},
        created_at: contact.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...contact,
      } as Contact;
      updatedList = [updatedContact, ...contacts];
    }
    setLocal('contacts', updatedList);
    notifyCRMEvent('crm_contacts_updated');

    const companies = getLocal<Company[]>('companies', INITIAL_COMPANIES);
    const team = getLocal<TeamMember[]>('team_members', INITIAL_TEAM);

    return {
      ...updatedContact,
      company: companies.find((comp) => comp.id === updatedContact.company_id) || null,
      owner: team.find((t) => t.id === updatedContact.owner_id) || null,
    } as Contact;
  },

  async batchInsertContacts(contactsToInsert: Partial<Contact>[], uploadLogInfo?: { fileName: string; uploadedBy?: string; flaggedCount: number }): Promise<number> {
    const prepared = contactsToInsert.map((c) => ({
      id: c.id || crypto.randomUUID(),
      name: c.name || 'Unnamed Contact',
      email: c.email || null,
      phone: c.phone || null,
      title: c.title || null,
      company_id: c.company_id || null,
      owner_id: c.owner_id || null,
      status: c.status || 'new',
      tags: c.tags || ['Imported'],
      custom_fields: c.custom_fields || {},
      created_at: new Date().toISOString(),
    }));

    if (supabase) {
      const { data, error } = await supabase.from('contacts').insert(prepared).select();
      if (!error && data) {
        if (uploadLogInfo) {
          await supabase.from('import_logs').insert({
            file_name: uploadLogInfo.fileName,
            uploaded_by: uploadLogInfo.uploadedBy || null,
            rows_imported: data.length,
            rows_flagged: uploadLogInfo.flaggedCount,
          });
        }
        return data.length;
      }
    }

    const existing = getLocal<Contact[]>('contacts', INITIAL_CONTACTS);
    setLocal('contacts', [...prepared, ...existing]);

    if (uploadLogInfo) {
      const logs = getLocal<ImportLog[]>('import_logs', []);
      const newLog: ImportLog = {
        id: crypto.randomUUID(),
        file_name: uploadLogInfo.fileName,
        uploaded_by: uploadLogInfo.uploadedBy || null,
        rows_imported: prepared.length,
        rows_flagged: uploadLogInfo.flaggedCount,
        created_at: new Date().toISOString(),
      };
      setLocal('import_logs', [newLog, ...logs]);
    }

    return prepared.length;
  },

  async deleteContact(id: string): Promise<void> {
    if (supabase) {
      await supabase.from('contacts').delete().eq('id', id);
    } else {
      const contacts = getLocal<Contact[]>('contacts', INITIAL_CONTACTS);
      setLocal('contacts', contacts.filter((c) => c.id !== id));
    }
    notifyCRMEvent('crm_contacts_updated');
  },

  async getInteractions(contactId: string): Promise<Interaction[]> {
    if (supabase) {
      const { data, error } = await supabase
        .from('interactions')
        .select('*, creator:team_members(*)')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      if (!error && data) return data;
    }

    const all = getLocal<Interaction[]>('interactions', INITIAL_INTERACTIONS);
    const team = getLocal<TeamMember[]>('team_members', INITIAL_TEAM);

    return all
      .filter((i) => i.contact_id === contactId)
      .map((i) => ({
        ...i,
        creator: team.find((t) => t.id === i.created_by) || null,
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async addInteraction(interaction: Partial<Interaction>): Promise<Interaction> {
    const payload = {
      id: interaction.id || crypto.randomUUID(),
      contact_id: interaction.contact_id!,
      type: interaction.type || 'note',
      content: interaction.content || '',
      created_by: interaction.created_by || null,
      created_at: interaction.created_at || new Date().toISOString(),
    };

    if (supabase) {
      const { data, error } = await supabase
        .from('interactions')
        .insert(payload)
        .select('*, creator:team_members(*)')
        .single();
      if (!error && data) return data;
    }

    const list = getLocal<Interaction[]>('interactions', INITIAL_INTERACTIONS);
    setLocal('interactions', [payload as Interaction, ...list]);

    const team = getLocal<TeamMember[]>('team_members', INITIAL_TEAM);
    return {
      ...payload,
      creator: team.find((t) => t.id === payload.created_by) || null,
    } as Interaction;
  },

  async getReminders(): Promise<Reminder[]> {
    if (supabase) {
      const { data, error } = await supabase
        .from('reminders')
        .select('*, contact:contacts(*), assignee:team_members(*)')
        .order('due_date', { ascending: true });
      if (!error && data) return data;
    }

    const reminders = getLocal<Reminder[]>('reminders', INITIAL_REMINDERS);
    const contacts = getLocal<Contact[]>('contacts', INITIAL_CONTACTS);
    const team = getLocal<TeamMember[]>('team_members', INITIAL_TEAM);

    return reminders.map((r) => ({
      ...r,
      contact: contacts.find((c) => c.id === r.contact_id) || null,
      assignee: team.find((t) => t.id === r.assigned_to) || null,
    }));
  },

  async saveReminder(reminder: Partial<Reminder>): Promise<Reminder> {
    const payload = {
      id: reminder.id || crypto.randomUUID(),
      contact_id: reminder.contact_id!,
      assigned_to: reminder.assigned_to || null,
      due_date: reminder.due_date || new Date().toISOString(),
      note: reminder.note || '',
      done: reminder.done || false,
      completed_at: reminder.completed_at || null,
      created_at: reminder.created_at || new Date().toISOString(),
    };

    if (supabase) {
      const { data, error } = await supabase
        .from('reminders')
        .upsert(payload)
        .select('*, contact:contacts(*), assignee:team_members(*)')
        .single();
      if (!error && data) {
        notifyCRMEvent('crm_reminders_updated');
        return data;
      }
    }

    const list = getLocal<Reminder[]>('reminders', INITIAL_REMINDERS);
    const idx = list.findIndex((r) => r.id === payload.id);
    let updated: Reminder[];
    if (idx >= 0) {
      updated = [...list];
      updated[idx] = { ...updated[idx], ...payload };
    } else {
      updated = [payload as Reminder, ...list];
    }
    setLocal('reminders', updated);
    notifyCRMEvent('crm_reminders_updated');

    const contacts = getLocal<Contact[]>('contacts', INITIAL_CONTACTS);
    const team = getLocal<TeamMember[]>('team_members', INITIAL_TEAM);

    return {
      ...payload,
      contact: contacts.find((c) => c.id === payload.contact_id) || null,
      assignee: team.find((t) => t.id === payload.assigned_to) || null,
    } as Reminder;
  },

  async toggleReminder(id: string, done: boolean): Promise<void> {
    const completed_at = done ? new Date().toISOString() : null;
    if (supabase) {
      await supabase.from('reminders').update({ done, completed_at }).eq('id', id);
    } else {
      const list = getLocal<Reminder[]>('reminders', INITIAL_REMINDERS);
      setLocal(
        'reminders',
        list.map((r) => (r.id === id ? { ...r, done, completed_at } : r))
      );
    }
    notifyCRMEvent('crm_reminders_updated');
  },

  async bulkToggleReminders(ids: string[], done: boolean): Promise<void> {
    if (!ids || ids.length === 0) return;
    const completed_at = done ? new Date().toISOString() : null;
    if (supabase) {
      await supabase.from('reminders').update({ done, completed_at }).in('id', ids);
    } else {
      const idSet = new Set(ids);
      const list = getLocal<Reminder[]>('reminders', INITIAL_REMINDERS);
      setLocal(
        'reminders',
        list.map((r) => (idSet.has(r.id) ? { ...r, done, completed_at } : r))
      );
    }
    notifyCRMEvent('crm_reminders_updated');
  },

  async deleteReminder(id: string): Promise<void> {
    if (supabase) {
      await supabase.from('reminders').delete().eq('id', id);
    } else {
      const list = getLocal<Reminder[]>('reminders', INITIAL_REMINDERS);
      setLocal('reminders', list.filter((r) => r.id !== id));
    }
    notifyCRMEvent('crm_reminders_updated');
  },

  async bulkDeleteReminders(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    if (supabase) {
      await supabase.from('reminders').delete().in('id', ids);
    } else {
      const idSet = new Set(ids);
      const list = getLocal<Reminder[]>('reminders', INITIAL_REMINDERS);
      setLocal('reminders', list.filter((r) => !idSet.has(r.id)));
    }
    notifyCRMEvent('crm_reminders_updated');
  },

  async getEmails(contactId?: string): Promise<EmailRecord[]> {
    if (supabase) {
      try {
        let query = supabase.from('emails').select('*').order('created_at', { ascending: false });
        if (contactId) {
          query = query.eq('contact_id', contactId);
        }
        const { data, error } = await query;
        if (!error && data) {
          const team = getLocal<TeamMember[]>('team_members', INITIAL_TEAM);
          return data.map((e: any) => ({
            ...e,
            sender: team.find((t) => t.id === e.sent_by) || null,
          }));
        }
      } catch (err) {
        console.warn('Supabase getEmails fallback to local:', err);
      }
    }

    const emails = getLocal<EmailRecord[]>('emails', []);
    const team = getLocal<TeamMember[]>('team_members', INITIAL_TEAM);
    const filtered = contactId ? emails.filter((e) => e.contact_id === contactId) : emails;
    return filtered.map((e) => ({
      ...e,
      sender: team.find((t) => t.id === e.sent_by) || null,
    }));
  },

  async saveEmail(email: Partial<EmailRecord>): Promise<EmailRecord> {
    const validStatus =
      email.status === 'received' ? 'sent' : email.status || 'sent';

    const payload = {
      id: email.id || crypto.randomUUID(),
      contact_id: email.contact_id || null,
      recipient_email: email.recipient_email || '',
      sender_email: email.sender_email || null,
      subject: email.subject || '',
      body: email.body || '',
      ai_generated: email.ai_generated || false,
      sent_by: email.sent_by || null,
      sent_at: email.sent_at || new Date().toISOString(),
      status: validStatus,
      error_message: email.error_message || null,
      created_at: email.created_at || new Date().toISOString(),
    };

    if (supabase) {
      const dbPayload = {
        id: payload.id,
        contact_id: payload.contact_id,
        recipient_email: payload.recipient_email,
        subject: payload.subject,
        body: payload.body,
        ai_generated: payload.ai_generated,
        sent_by: payload.sent_by,
        sent_at: payload.sent_at,
        status: payload.status,
        error_message: payload.error_message,
        created_at: payload.created_at,
      };

      try {
        const { data, error } = await supabase
          .from('emails')
          .insert(dbPayload)
          .select('*')
          .single();
        if (!error && data) {
          const team = getLocal<TeamMember[]>('team_members', INITIAL_TEAM);
          return {
            ...data,
            sender: team.find((t) => t.id === data.sent_by) || null,
            is_inbound: email.is_inbound,
            sender_email: email.sender_email,
          };
        }
      } catch (err) {
        console.warn('Supabase saveEmail fallback to local:', err);
      }
    }

    const list = getLocal<EmailRecord[]>('emails', []);
    setLocal('emails', [payload as EmailRecord, ...list]);
    const team = getLocal<TeamMember[]>('team_members', INITIAL_TEAM);
    return {
      ...payload,
      sender: team.find((t) => t.id === payload.sent_by) || null,
      is_inbound: email.is_inbound,
      sender_email: email.sender_email,
    } as EmailRecord;
  },

  async getAllInboundInteractions(): Promise<Array<Interaction & { contact?: Contact | null }>> {
    if (supabase) {
      const { data, error } = await supabase
        .from('interactions')
        .select('*, contact:contacts(*, company:companies(*)), creator:team_members(*)')
        .order('created_at', { ascending: false });
      if (!error && data) {
        return data.filter(
          (i) =>
            i.content.includes('📥 Inbound Email Reply Received') ||
            i.content.includes('Inbound Email') ||
            i.content.toLowerCase().includes('reply received')
        );
      }
    }

    const all = getLocal<Interaction[]>('interactions', INITIAL_INTERACTIONS);
    const contacts = getLocal<Contact[]>('contacts', INITIAL_CONTACTS);
    const companies = getLocal<Company[]>('companies', INITIAL_COMPANIES);

    return all
      .filter(
        (i) =>
          i.content.includes('📥 Inbound Email Reply Received') ||
          i.content.includes('Inbound Email') ||
          i.content.toLowerCase().includes('reply received')
      )
      .map((i) => {
        const c = contacts.find((ct) => ct.id === i.contact_id);
        const comp = c?.company_id ? companies.find((cp) => cp.id === c.company_id) : null;
        return {
          ...i,
          contact: c ? { ...c, company: comp } : null,
        };
      });
  },

  async getImportLogs(): Promise<ImportLog[]> {
    if (supabase) {
      const { data, error } = await supabase
        .from('import_logs')
        .select('*, uploader:team_members(*)')
        .order('created_at', { ascending: false });
      if (!error && data) return data;
    }

    const logs = getLocal<ImportLog[]>('import_logs', []);
    const team = getLocal<TeamMember[]>('team_members', INITIAL_TEAM);
    return logs.map((l) => ({
      ...l,
      uploader: team.find((t) => t.id === l.uploaded_by) || null,
    }));
  },

  async getDashboardStats(): Promise<DashboardStats> {
    // ── Date boundary helpers (user local timezone → UTC ISO strings) ──────────
    const now = new Date();

    // Today: midnight local time
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000); // +1 day

    // This week: Monday 00:00 local time → now
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
    const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon=0, Tue=1...
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
    const weekEnd = new Date(todayEnd);

    // Last week: Mon–Sun prior to this week
    const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
    const lastWeekEnd = new Date(weekStart);

    // Last 7 days for breakdown chart
    const sevenDaysAgo = new Date(todayStart.getTime() - 6 * 86400000);

    const todayStartISO = todayStart.toISOString();
    const todayEndISO = todayEnd.toISOString();
    const weekStartISO = weekStart.toISOString();
    const weekEndISO = weekEnd.toISOString();
    const lastWeekStartISO = lastWeekStart.toISOString();
    const lastWeekEndISO = lastWeekEnd.toISOString();
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    // ── Format date label ─────────────────────────────────────────────────────
    const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Build 7-day date slots
    const dateSlots: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo.getTime() + i * 86400000);
      dateSlots.push(fmtDate(d));
    }

    // ── Empty fallback ────────────────────────────────────────────────────────
    const emptyStats: DashboardStats = {
      emailsSentToday: 0,
      contactsAddedToday: 0,
      emailsThisWeek: 0,
      emailsLastWeek: 0,
      repliesReceivedToday: 0,
      repliesReceivedThisWeek: 0,
      replyRateToday: 0,
      replyRateThisWeek: 0,
      dailyBreakdown: dateSlots.map((date) => ({ date, sent: 0, replies: 0 })),
      recentActivity: [],
    };

    if (supabase) {
      try {
        // ── Parallel queries ────────────────────────────────────────────────
        const [sentEmailsRes, inboundRepliesRes, contactsRes, interactionsRes, teamMembersRes] =
          await Promise.all([
            // All sent emails in the last 7+ days (for breakdown + weekly metrics)
            supabase
              .from('emails')
              .select('id, contact_id, sent_at, replied_at, reply_count, sent_by, status, subject')
              .eq('status', 'sent')
              .gte('sent_at', sevenDaysAgoISO)
              .order('sent_at', { ascending: false }),

            // Inbound reply emails in the last 7 days
            supabase
              .from('emails')
              .select('id, contact_id, sent_at, sent_by, subject, status')
              .eq('status', 'received')
              .gte('sent_at', sevenDaysAgoISO)
              .order('sent_at', { ascending: false }),

            // All contacts created in last 7 days
            supabase
              .from('contacts')
              .select('id, name, created_at, owner_id')
              .gte('created_at', sevenDaysAgoISO)
              .order('created_at', { ascending: false }),

            // Recent interactions for activity feed
            supabase
              .from('interactions')
              .select('id, contact_id, type, content, created_by, created_at')
              .gte('created_at', sevenDaysAgoISO)
              .order('created_at', { ascending: false })
              .limit(30),

            // Team members for name resolution
            supabase.from('team_members').select('id, name'),
          ]);

        const sentEmails: any[] = sentEmailsRes.data || [];
        const inboundReplies: any[] = inboundRepliesRes.data || [];
        const contacts: any[] = contactsRes.data || [];
        const interactions: any[] = interactionsRes.data || [];
        const teamMembers: any[] = teamMembersRes.data || [];

        const memberMap = new Map<string, string>(teamMembers.map((m) => [m.id, m.name]));

        // ── Core metrics ───────────────────────────────────────────────────
        const emailsSentToday = sentEmails.filter(
          (e) => e.sent_at >= todayStartISO && e.sent_at < todayEndISO
        ).length;

        const emailsThisWeek = sentEmails.filter(
          (e) => e.sent_at >= weekStartISO && e.sent_at < weekEndISO
        ).length;

        const emailsLastWeek = sentEmails.filter(
          (e) => e.sent_at >= lastWeekStartISO && e.sent_at < lastWeekEndISO
        ).length;

        const contactsAddedToday = contacts.filter(
          (c) => c.created_at >= todayStartISO && c.created_at < todayEndISO
        ).length;

        // Replies: count inbound received emails + outbound with replied_at set
        const repliesReceivedToday =
          inboundReplies.filter(
            (e) => e.sent_at >= todayStartISO && e.sent_at < todayEndISO
          ).length +
          sentEmails.filter(
            (e) =>
              e.replied_at &&
              e.replied_at >= todayStartISO &&
              e.replied_at < todayEndISO
          ).length;

        const repliesReceivedThisWeek =
          inboundReplies.filter(
            (e) => e.sent_at >= weekStartISO && e.sent_at < weekEndISO
          ).length +
          sentEmails.filter(
            (e) =>
              e.replied_at &&
              e.replied_at >= weekStartISO &&
              e.replied_at < weekEndISO
          ).length;

        const replyRateToday =
          emailsSentToday > 0
            ? Math.round((repliesReceivedToday / emailsSentToday) * 100)
            : 0;
        const replyRateThisWeek =
          emailsThisWeek > 0
            ? Math.round((repliesReceivedThisWeek / emailsThisWeek) * 100)
            : 0;

        // ── Daily breakdown (7 days) ───────────────────────────────────────
        const dailyBreakdown: DashboardDayBreakdown[] = dateSlots.map((date) => {
          const dayStart = new Date(date + 'T00:00:00').toISOString();
          const dayEnd = new Date(new Date(date + 'T00:00:00').getTime() + 86400000).toISOString();

          const sent = sentEmails.filter(
            (e) => e.sent_at >= dayStart && e.sent_at < dayEnd
          ).length;

          const replies =
            inboundReplies.filter((e) => e.sent_at >= dayStart && e.sent_at < dayEnd).length +
            sentEmails.filter(
              (e) => e.replied_at && e.replied_at >= dayStart && e.replied_at < dayEnd
            ).length;

          return { date, sent, replies };
        });

        // ── Recent activity feed ───────────────────────────────────────────
        const activityItems: DashboardActivityItem[] = [];

        // Email sent events
        sentEmails.slice(0, 20).forEach((e) => {
          activityItems.push({
            type: 'email_sent',
            label: `Email sent: ${e.subject || '(no subject)'}`,
            memberName: e.sent_by ? memberMap.get(e.sent_by) : undefined,
            timestamp: e.sent_at,
          });
        });

        // Reply received events
        inboundReplies.slice(0, 10).forEach((e) => {
          activityItems.push({
            type: 'reply_received',
            label: `Reply received: ${e.subject || '(no subject)'}`,
            memberName: undefined,
            timestamp: e.sent_at,
          });
        });

        // Contact added events
        contacts.slice(0, 10).forEach((c) => {
          activityItems.push({
            type: 'contact_added',
            label: `New contact added: ${c.name}`,
            memberName: c.owner_id ? memberMap.get(c.owner_id) : undefined,
            timestamp: c.created_at,
          });
        });

        // Interaction events (exclude inbound content, it's covered by reply_received)
        interactions
          .filter(
            (i) =>
              !i.content.includes('📥 Inbound Email Reply Received') &&
              !i.content.includes('Inbound Email')
          )
          .slice(0, 10)
          .forEach((i) => {
            const typeLabel =
              i.type === 'call'
                ? 'Call logged'
                : i.type === 'meeting'
                ? 'Meeting logged'
                : i.type === 'note'
                ? 'Note added'
                : 'Activity logged';
            activityItems.push({
              type: 'interaction',
              label: `${typeLabel}: ${i.content.slice(0, 60)}${i.content.length > 60 ? '…' : ''}`,
              memberName: i.created_by ? memberMap.get(i.created_by) : undefined,
              timestamp: i.created_at,
            });
          });

        // Sort all activity by timestamp descending, take top 10
        const recentActivity = activityItems
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 10);

        return {
          emailsSentToday,
          contactsAddedToday,
          emailsThisWeek,
          emailsLastWeek,
          repliesReceivedToday,
          repliesReceivedThisWeek,
          replyRateToday,
          replyRateThisWeek,
          dailyBreakdown,
          recentActivity,
        };
      } catch (err) {
        console.error('getDashboardStats error', err);
        return emptyStats;
      }
    }

    // ── LocalStorage fallback ─────────────────────────────────────────────────
    const allEmails = getLocal<EmailRecord[]>('emails', []);
    const allContacts = getLocal<Contact[]>('contacts', INITIAL_CONTACTS);
    const allInteractions = getLocal<Interaction[]>('interactions', INITIAL_INTERACTIONS);
    const allTeam = getLocal<TeamMember[]>('team_members', INITIAL_TEAM);
    const memberMap = new Map<string, string>(allTeam.map((m) => [m.id, m.name]));

    const sentEmails = allEmails.filter((e) => e.status === 'sent');
    const inboundReplies = allEmails.filter((e) => e.status === 'received');

    const emailsSentToday = sentEmails.filter(
      (e) => (e.sent_at || '') >= todayStartISO && (e.sent_at || '') < todayEndISO
    ).length;
    const emailsThisWeek = sentEmails.filter(
      (e) => (e.sent_at || '') >= weekStartISO && (e.sent_at || '') < weekEndISO
    ).length;
    const emailsLastWeek = sentEmails.filter(
      (e) => (e.sent_at || '') >= lastWeekStartISO && (e.sent_at || '') < lastWeekEndISO
    ).length;
    const contactsAddedToday = allContacts.filter(
      (c) => c.created_at >= todayStartISO && c.created_at < todayEndISO
    ).length;
    const repliesReceivedToday = inboundReplies.filter(
      (e) => (e.sent_at || '') >= todayStartISO && (e.sent_at || '') < todayEndISO
    ).length;
    const repliesReceivedThisWeek = inboundReplies.filter(
      (e) => (e.sent_at || '') >= weekStartISO && (e.sent_at || '') < weekEndISO
    ).length;

    const replyRateToday =
      emailsSentToday > 0 ? Math.round((repliesReceivedToday / emailsSentToday) * 100) : 0;
    const replyRateThisWeek =
      emailsThisWeek > 0 ? Math.round((repliesReceivedThisWeek / emailsThisWeek) * 100) : 0;

    const dailyBreakdown: DashboardDayBreakdown[] = dateSlots.map((date) => {
      const dayStart = new Date(date + 'T00:00:00').toISOString();
      const dayEnd = new Date(new Date(date + 'T00:00:00').getTime() + 86400000).toISOString();
      return {
        date,
        sent: sentEmails.filter((e) => (e.sent_at || '') >= dayStart && (e.sent_at || '') < dayEnd).length,
        replies: inboundReplies.filter((e) => (e.sent_at || '') >= dayStart && (e.sent_at || '') < dayEnd).length,
      };
    });

    const activityItems: DashboardActivityItem[] = [
      ...sentEmails.slice(0, 10).map((e) => ({
        type: 'email_sent' as const,
        label: `Email sent: ${e.subject || '(no subject)'}`,
        memberName: e.sent_by ? memberMap.get(e.sent_by) : undefined,
        timestamp: e.sent_at || e.created_at || '',
      })),
      ...inboundReplies.slice(0, 5).map((e) => ({
        type: 'reply_received' as const,
        label: `Reply received: ${e.subject || '(no subject)'}`,
        timestamp: e.sent_at || e.created_at || '',
      })),
      ...allContacts.slice(0, 5).map((c) => ({
        type: 'contact_added' as const,
        label: `New contact added: ${c.name}`,
        memberName: c.owner_id ? memberMap.get(c.owner_id) : undefined,
        timestamp: c.created_at,
      })),
    ];

    return {
      emailsSentToday,
      contactsAddedToday,
      emailsThisWeek,
      emailsLastWeek,
      repliesReceivedToday,
      repliesReceivedThisWeek,
      replyRateToday,
      replyRateThisWeek,
      dailyBreakdown,
      recentActivity: activityItems
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10),
    };
  },

  async getEmailsForDay(date: string): Promise<DayEmailRecord[]> {
    // date is 'YYYY-MM-DD' in local time
    const dayStart = new Date(date + 'T00:00:00').toISOString();
    const dayEnd   = new Date(new Date(date + 'T00:00:00').getTime() + 86400000).toISOString();

    if (supabase) {
      const { data, error } = await supabase
        .from('emails')
        .select('id, recipient_email, subject, sent_at, replied_at, reply_count, contact:contacts(id, name), sender:team_members(id, name)')
        .eq('status', 'sent')
        .gte('sent_at', dayStart)
        .lt('sent_at', dayEnd)
        .order('sent_at', { ascending: false });

      if (!error && data) {
        return data.map((e: any) => ({
          id: e.id,
          recipient_email: e.recipient_email,
          subject: e.subject,
          sent_at: e.sent_at,
          replied_at: e.replied_at ?? null,
          reply_count: e.reply_count ?? 0,
          contact_name: e.contact?.name ?? null,
          contact_id: e.contact?.id ?? null,
          sender_name: e.sender?.name ?? null,
        }));
      }
    }

    // localStorage fallback
    const allEmails = getLocal<EmailRecord[]>('emails', []);
    const allContacts = getLocal<Contact[]>('contacts', INITIAL_CONTACTS);
    const allTeam = getLocal<TeamMember[]>('team_members', INITIAL_TEAM);

    return allEmails
      .filter(
        (e) =>
          e.status === 'sent' &&
          (e.sent_at || '') >= dayStart &&
          (e.sent_at || '') < dayEnd
      )
      .map((e) => {
        const contact = allContacts.find((c) => c.id === e.contact_id);
        const sender  = allTeam.find((t) => t.id === e.sent_by);
        return {
          id: e.id,
          recipient_email: e.recipient_email,
          subject: e.subject,
          sent_at: e.sent_at ?? '',
          replied_at: e.replied_at ?? null,
          reply_count: e.reply_count ?? 0,
          contact_name: contact?.name ?? null,
          contact_id: contact?.id ?? null,
          sender_name: sender?.name ?? null,
        };
      });
  },

  async getDeals(contactId?: string, companyId?: string): Promise<Deal[]> {
    if (supabase) {
      let query = supabase
        .from('deals')
        .select(`
          *,
          contact:contacts(id, name),
          company:companies(id, name),
          owner:team_members(id, name)
        `)
        .order('created_at', { ascending: false });

      if (contactId) {
        query = query.eq('contact_id', contactId);
      }
      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (!error && data) {
        return data.map((d: any) => ({
          ...d,
          contact_name: d.contact?.name,
          company_name: d.company?.name,
          owner_name: d.owner?.name,
        }));
      }
    }

    // localStorage fallback
    let list = getLocal<Deal[]>('deals', INITIAL_DEALS);
    if (contactId) {
      list = list.filter((d) => d.contact_id === contactId);
    }
    if (companyId) {
      list = list.filter((d) => d.company_id === companyId);
    }
    const contacts = getLocal<Contact[]>('contacts', INITIAL_CONTACTS);
    const companies = getLocal<Company[]>('companies', INITIAL_COMPANIES);
    const team = getLocal<TeamMember[]>('team_members', INITIAL_TEAM);
    return list.map((d) => ({
      ...d,
      contact_name: contacts.find((c) => c.id === d.contact_id)?.name,
      company_name: companies.find((c) => c.id === d.company_id)?.name,
      owner_name: team.find((t) => t.id === d.owner_id)?.name,
    }));
  },

  async addDeal(deal: Partial<Deal>): Promise<Deal> {
    const newDeal: Deal = {
      id: deal.id || crypto.randomUUID(),
      title: deal.title || 'New Deal',
      contact_id: deal.contact_id || null,
      company_id: deal.company_id || null,
      owner_id: deal.owner_id || null,
      value: Number(deal.value) || 0,
      currency: deal.currency || 'USD',
      stage: deal.stage || 'discovery',
      probability: deal.probability !== undefined ? deal.probability : 10,
      expected_close_date: deal.expected_close_date || null,
      actual_close_date: deal.actual_close_date || null,
      notes: deal.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (supabase) {
      const { contact_name, company_name, owner_name, ...payload } = newDeal;
      const { data, error } = await supabase
        .from('deals')
        .insert(payload)
        .select(`
          *,
          contact:contacts(id, name),
          company:companies(id, name),
          owner:team_members(id, name)
        `)
        .single();
      if (!error && data) {
        notifyCRMEvent('crm_deals_updated');
        return {
          ...data,
          contact_name: data.contact?.name,
          company_name: data.company?.name,
          owner_name: data.owner?.name,
        };
      }
    }

    const list = getLocal<Deal[]>('deals', INITIAL_DEALS);
    const updated = [newDeal, ...list];
    setLocal('deals', updated);
    notifyCRMEvent('crm_deals_updated');
    return newDeal;
  },

  async updateDeal(id: string, updates: Partial<Deal>): Promise<Deal> {
    const patch = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (supabase) {
      const { contact_name, company_name, owner_name, ...payload } = patch;
      const { data, error } = await supabase
        .from('deals')
        .update(payload)
        .eq('id', id)
        .select(`
          *,
          contact:contacts(id, name),
          company:companies(id, name),
          owner:team_members(id, name)
        `)
        .single();
      if (!error && data) {
        notifyCRMEvent('crm_deals_updated');
        return {
          ...data,
          contact_name: data.contact?.name,
          company_name: data.company?.name,
          owner_name: data.owner?.name,
        };
      }
    }

    const list = getLocal<Deal[]>('deals', INITIAL_DEALS);
    let updatedDeal: Deal = list.find((d) => d.id === id) || ({} as Deal);
    const updated = list.map((d) => {
      if (d.id === id) {
        updatedDeal = { ...d, ...patch };
        return updatedDeal;
      }
      return d;
    });
    setLocal('deals', updated);
    notifyCRMEvent('crm_deals_updated');
    return updatedDeal;
  },

  async deleteDeal(id: string): Promise<void> {
    if (supabase) {
      await supabase.from('deals').delete().eq('id', id);
    }
    const list = getLocal<Deal[]>('deals', INITIAL_DEALS);
    setLocal('deals', list.filter((d) => d.id !== id));
    notifyCRMEvent('crm_deals_updated');
  },

  // ===========================================================================
  // DRAFT MANAGEMENT
  // ===========================================================================

  async getDrafts(): Promise<EmailDraft[]> {
    // Drafts are stored only in localStorage (attachments can be large)
    const drafts = getLocal<EmailDraft[]>('email_drafts', []);
    return drafts.sort(
      (a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime()
    );
  },

  async saveDraft(draft: Omit<EmailDraft, 'id' | 'created_at' | 'saved_at'> & { id?: string }): Promise<EmailDraft> {
    const drafts = getLocal<EmailDraft[]>('email_drafts', []);
    const now = new Date().toISOString();
    const existingIdx = draft.id ? drafts.findIndex((d) => d.id === draft.id) : -1;

    let saved: EmailDraft;
    if (existingIdx >= 0) {
      saved = { ...drafts[existingIdx], ...draft, saved_at: now } as EmailDraft;
      const updated = [...drafts];
      updated[existingIdx] = saved;
      setLocal('email_drafts', updated);
    } else {
      saved = {
        id: draft.id || crypto.randomUUID(),
        contact_id: draft.contact_id || null,
        recipient_email: draft.recipient_email || '',
        subject: draft.subject || '',
        body: draft.body || '',
        ai_generated: draft.ai_generated || false,
        sender_email: draft.sender_email || null,
        attachments: draft.attachments || [],
        saved_at: now,
        created_at: now,
      };
      setLocal('email_drafts', [saved, ...drafts]);
    }
    notifyCRMEvent('crm_drafts_updated');
    return saved;
  },

  async deleteDraft(id: string): Promise<void> {
    const drafts = getLocal<EmailDraft[]>('email_drafts', []);
    setLocal('email_drafts', drafts.filter((d) => d.id !== id));
    notifyCRMEvent('crm_drafts_updated');
  },

  getDraftCount(): number {
    try {
      const drafts = getLocal<EmailDraft[]>('email_drafts', []);
      return drafts.length;
    } catch {
      return 0;
    }
  },

  clearAllLocalData(): void {
    localStorage.removeItem('crm_contacts');
    localStorage.removeItem('crm_companies');
    localStorage.removeItem('crm_interactions');
    localStorage.removeItem('crm_reminders');
    localStorage.removeItem('crm_emails');
    localStorage.removeItem('crm_deals');
    localStorage.removeItem('crm_import_logs');
    localStorage.removeItem('crm_team_members');
    localStorage.removeItem('crm_active_member_id');
    localStorage.removeItem('crm_email_drafts');
  },
};

