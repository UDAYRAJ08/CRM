import { createClient } from '@supabase/supabase-js';
import {
  TeamMember,
  Company,
  Contact,
  Interaction,
  EmailRecord,
  Reminder,
  ImportLog,
} from '../types/crm';

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

// Unified Database Access Layer
export const db = {
  async getTeamMembers(): Promise<TeamMember[]> {
    if (supabase) {
      const { data, error } = await supabase.from('team_members').select('*').order('name');
      if (!error && data) return data;
    }
    return getLocal('team_members', INITIAL_TEAM);
  },

  async addTeamMember(member: Partial<TeamMember>): Promise<TeamMember> {
    const newMember: TeamMember = {
      id: member.id || crypto.randomUUID(),
      name: member.name || 'New Member',
      email: member.email || '',
      role: member.role || 'Member',
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

        if (!error && data) return data;
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
      return;
    }
    const contacts = getLocal<Contact[]>('contacts', INITIAL_CONTACTS);
    setLocal('contacts', contacts.filter((c) => c.id !== id));
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
      if (!error && data) return data;
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
      return;
    }

    const list = getLocal<Reminder[]>('reminders', INITIAL_REMINDERS);
    setLocal(
      'reminders',
      list.map((r) => (r.id === id ? { ...r, done, completed_at } : r))
    );
  },

  async getEmails(contactId?: string): Promise<EmailRecord[]> {
    if (supabase) {
      let query = supabase.from('emails').select('*, sender:team_members(*)').order('created_at', { ascending: false });
      if (contactId) {
        query = query.eq('contact_id', contactId);
      }
      const { data, error } = await query;
      if (!error && data) return data;
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
      const { data, error } = await supabase
        .from('emails')
        .insert(payload)
        .select('*, sender:team_members(*)')
        .single();
      if (!error && data) {
        return {
          ...data,
          is_inbound: email.is_inbound,
          sender_email: email.sender_email,
        };
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

  clearAllLocalData(): void {
    localStorage.removeItem('crm_contacts');
    localStorage.removeItem('crm_companies');
    localStorage.removeItem('crm_interactions');
    localStorage.removeItem('crm_reminders');
    localStorage.removeItem('crm_emails');
    localStorage.removeItem('crm_import_logs');
    localStorage.removeItem('crm_team_members');
    localStorage.removeItem('crm_active_member_id');
  },
};

