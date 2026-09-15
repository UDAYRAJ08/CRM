import * as XLSX from 'xlsx';
import { Contact, ContactStatus, ParsedContactRow, ImportSummary } from '../types/crm';

// Flexible column headers dictionary
const COLUMN_ALIASES = {
  name: ['name', 'full name', 'contact name', 'contact', 'customer name', 'lead name', 'person', 'first name', 'last name'],
  email: ['email', 'e-mail', 'email address', 'contact email', 'work email', 'mail'],
  phone: ['phone', 'phone number', 'telephone', 'mobile', 'cell', 'cell phone', 'work phone', 'contact number'],
  company: ['company', 'company name', 'organization', 'org', 'account', 'business', 'employer'],
  title: ['title', 'job title', 'position', 'role', 'designation', 'occupation'],
  status: ['status', 'stage', 'lead status', 'pipeline stage', 'state'],
  tags: ['tags', 'labels', 'keywords', 'categories', 'segments'],
  notes: ['notes', 'note', 'comment', 'description', 'remarks', 'interaction'],
};

function matchColumn(header: string): keyof typeof COLUMN_ALIASES | null {
  const normalized = header.toLowerCase().replace(/[_\W]+/g, ' ').trim();
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(normalized)) {
      return canonical as keyof typeof COLUMN_ALIASES;
    }
  }
  return null;
}

export function parseExcelOrCsv(
  fileData: ArrayBuffer | Uint8Array,
  fileName: string,
  existingContacts: Contact[]
): ImportSummary {
  const workbook = XLSX.read(fileData, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON with raw headers
  const rawRows: Array<Record<string, any>> = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  // Index existing contacts for fast deduplication
  const existingEmails = new Map<string, Contact>();
  const existingPhones = new Map<string, Contact>();

  existingContacts.forEach((c) => {
    if (c.email) {
      existingEmails.set(c.email.trim().toLowerCase(), c);
    }
    if (c.phone) {
      const cleanPhone = c.phone.replace(/\D/g, '');
      if (cleanPhone.length >= 7) {
        existingPhones.set(cleanPhone, c);
      }
    }
  });

  const validRows: ParsedContactRow[] = [];
  const duplicateRows: ParsedContactRow[] = [];
  const invalidRows: ParsedContactRow[] = [];

  // Track duplicates within the uploaded file itself too
  const seenInFileEmails = new Set<string>();
  const seenInFilePhones = new Set<string>();

  rawRows.forEach((row, idx) => {
    const rowKeys = Object.keys(row);
    let resolvedName = '';
    let resolvedEmail = '';
    let resolvedPhone = '';
    let resolvedCompany = '';
    let resolvedTitle = '';
    let resolvedStatus: ContactStatus = 'new';
    let resolvedTags: string[] = [];
    const customFields: Record<string, any> = {};

    rowKeys.forEach((key) => {
      const canonical = matchColumn(key);
      const val = String(row[key] ?? '').trim();

      if (!canonical) {
        if (val && !key.startsWith('__EMPTY')) {
          customFields[key] = val;
        }
        return;
      }

      switch (canonical) {
        case 'name':
          resolvedName = resolvedName ? `${resolvedName} ${val}`.trim() : val;
          break;
        case 'email':
          resolvedEmail = val.toLowerCase();
          break;
        case 'phone':
          resolvedPhone = val;
          break;
        case 'company':
          resolvedCompany = val;
          break;
        case 'title':
          resolvedTitle = val;
          break;
        case 'status': {
          const s = val.toLowerCase();
          if (['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'inactive'].includes(s)) {
            resolvedStatus = s as ContactStatus;
          }
          break;
        }
        case 'tags':
          resolvedTags = val
            .split(/[,;|]/)
            .map((t) => t.trim())
            .filter(Boolean);
          break;
        case 'notes':
          if (val) customFields['Import Notes'] = val;
          break;
      }
    });

    // Validation
    if (!resolvedName) {
      invalidRows.push({
        name: 'Missing Name',
        email: resolvedEmail,
        phone: resolvedPhone,
        company_name: resolvedCompany,
        isInvalid: true,
        invalidReason: 'Missing or empty contact name',
        originalRowIndex: idx + 2, // 1-based + 1 for header
        selected: false,
      });
      return;
    }

    // Deduplication check
    const cleanPhone = resolvedPhone.replace(/\D/g, '');
    let isDuplicate = false;
    let duplicateReason = '';

    if (resolvedEmail && existingEmails.has(resolvedEmail)) {
      const match = existingEmails.get(resolvedEmail)!;
      isDuplicate = true;
      duplicateReason = `Email matches existing contact: "${match.name}" (${match.email})`;
    } else if (cleanPhone && cleanPhone.length >= 7 && existingPhones.has(cleanPhone)) {
      const match = existingPhones.get(cleanPhone)!;
      isDuplicate = true;
      duplicateReason = `Phone matches existing contact: "${match.name}" (${match.phone})`;
    } else if (resolvedEmail && seenInFileEmails.has(resolvedEmail)) {
      isDuplicate = true;
      duplicateReason = `Duplicate email within this same file (${resolvedEmail})`;
    } else if (cleanPhone && cleanPhone.length >= 7 && seenInFilePhones.has(cleanPhone)) {
      isDuplicate = true;
      duplicateReason = `Duplicate phone within this same file (${resolvedPhone})`;
    }

    if (resolvedEmail) seenInFileEmails.add(resolvedEmail);
    if (cleanPhone && cleanPhone.length >= 7) seenInFilePhones.add(cleanPhone);

    const parsed: ParsedContactRow = {
      name: resolvedName,
      email: resolvedEmail || undefined,
      phone: resolvedPhone || undefined,
      title: resolvedTitle || undefined,
      company_name: resolvedCompany || undefined,
      status: resolvedStatus,
      tags: resolvedTags.length > 0 ? resolvedTags : ['Imported'],
      custom_fields: customFields,
      isDuplicate,
      duplicateReason,
      originalRowIndex: idx + 2,
      selected: !isDuplicate, // valid selected by default, duplicate unselected by default
    };

    if (isDuplicate) {
      duplicateRows.push(parsed);
    } else {
      validRows.push(parsed);
    }
  });

  return {
    fileName,
    totalRows: rawRows.length,
    validRows,
    duplicateRows,
    invalidRows,
  };
}

export function generateSampleExcelTemplate(): void {
  const sampleData = [
    {
      'Full Name': 'David Kim',
      'Email Address': 'david.kim@example.com',
      'Phone Number': '+1 (555) 789-0123',
      'Company Name': 'Apex Robotics',
      'Job Title': 'Director of Engineering',
      'Status': 'qualified',
      'Tags': 'Engineering, High Priority',
      'Budget': '$75,000',
    },
    {
      'Full Name': 'Elena Rostova',
      'Email Address': 'elena@acme.example.com',
      'Phone Number': '+1 (555) 234-5678',
      'Company Name': 'Acme Corp',
      'Job Title': 'VP of Operations',
      'Status': 'new',
      'Tags': 'Duplicate Demo',
      'Budget': '$45,000',
    },
    {
      'Full Name': 'Rachel Green',
      'Email Address': 'rachel@greenretail.com',
      'Phone Number': '+1 (555) 456-7890',
      'Company Name': 'Green Retail Group',
      'Job Title': 'Head of Merchandising',
      'Status': 'new',
      'Tags': 'Retail, Midwest',
      'Notes': 'Met at Midwest Expo',
    },
    {
      'Full Name': '',
      'Email Address': 'orphan@example.com',
      'Phone Number': '+1 (555) 000-0000',
      'Company Name': 'Unknown Inc',
      'Job Title': 'Analyst',
      'Status': 'new',
      'Tags': 'Invalid Demo',
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
  XLSX.writeFile(wb, 'crm_contacts_template.xlsx');
}
