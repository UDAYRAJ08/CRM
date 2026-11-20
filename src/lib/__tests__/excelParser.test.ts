import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelOrCsv } from '../excelParser';
import type { Contact } from '../../types/crm';

function workbook(rows: string[][]): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }));
}

const existing = [
  { id: '1', name: 'Existing Person', email: 'old@acme.com', phone: '+1 (555) 123-4567' },
] as unknown as Contact[];

describe('parseExcelOrCsv', () => {
  it('maps flexible column headers', () => {
    const data = workbook([
      ['Full Name', 'Work Email', 'Mobile', 'Organization', 'Job Title', 'Stage'],
      ['Jane Doe', 'JANE@Example.com', '555-000-1111', 'Example', 'CEO', 'Qualified'],
    ]);
    const result = parseExcelOrCsv(data, 'x.xlsx', []);
    expect(result.totalRows).toBe(1);
    expect(result.validRows).toHaveLength(1);
    const row = result.validRows[0];
    expect(row.name).toBe('Jane Doe');
    expect(row.email).toBe('jane@example.com');
    expect(row.company_name).toBe('Example');
    expect(row.title).toBe('CEO');
    expect(row.status).toBe('qualified');
  });

  it('reads Indian business lists: PHONE NO as phone, address and pin kept', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['NAME', 'ADDRESS', 'PIN CODE', 'PHONE NO'],
      ['Sri Sai Automobiles', 'Shop No 3, Hyderabad', 500001, 7123456789], // Excel stores phones as numbers
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
    const data = new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }));
    const [row] = parseExcelOrCsv(data, 'x.xlsx', []).validRows;
    expect(row.name).toBe('Sri Sai Automobiles');
    expect(row.phone).toBe('7123456789');
    expect(row.custom_fields).toEqual({ ADDRESS: 'Shop No 3, Hyderabad', 'PIN CODE': '500001' });
  });

  it.each(['Phone No.', 'Mobile No', 'Mobile Number', 'Contact No', 'WhatsApp Number'])('maps "%s" to phone', (header) => {
    const [row] = parseExcelOrCsv(workbook([['Name', header], ['A', '9876543210']]), 'x.xlsx', []).validRows;
    expect(row.phone).toBe('9876543210');
  });

  it('flags rows with no name as invalid', () => {
    const data = workbook([['Name', 'Email'], ['', 'a@b.com']]);
    const result = parseExcelOrCsv(data, 'x.xlsx', []);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.validRows).toHaveLength(0);
  });

  it('detects duplicates against existing contacts by email and phone', () => {
    const data = workbook([
      ['Name', 'Email', 'Phone'],
      ['Dup Email', 'OLD@acme.com', ''],
      ['Dup Phone', 'new@acme.com', '15551234567'],
      ['Fresh', 'fresh@acme.com', '999 888 7777'],
    ]);
    const result = parseExcelOrCsv(data, 'x.xlsx', existing);
    expect(result.duplicateRows.map((r) => r.name)).toEqual(['Dup Email', 'Dup Phone']);
    expect(result.validRows.map((r) => r.name)).toEqual(['Fresh']);
    expect(result.duplicateRows.every((r) => r.selected === false)).toBe(true);
  });

  it('detects duplicates within the same file', () => {
    const data = workbook([
      ['Name', 'Email'],
      ['First', 'same@acme.com'],
      ['Second', 'same@acme.com'],
    ]);
    const result = parseExcelOrCsv(data, 'x.xlsx', []);
    expect(result.validRows).toHaveLength(1);
    expect(result.duplicateRows).toHaveLength(1);
    expect(result.duplicateRows[0].duplicateReason).toMatch(/within this same file/);
  });

  it('keeps unknown columns as custom fields and defaults tags', () => {
    const data = workbook([['Name', 'Favourite Colour'], ['Pat', 'Blue']]);
    const row = parseExcelOrCsv(data, 'x.xlsx', []).validRows[0];
    expect(row.custom_fields).toMatchObject({ 'Favourite Colour': 'Blue' });
    expect(row.tags).toEqual(['Imported']);
  });
});
