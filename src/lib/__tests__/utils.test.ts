import { describe, it, expect } from 'vitest';
import { getInitials, cleanCompanyName, stripHtml, getCompanyUrl } from '../utils';

describe('getInitials', () => {
  it('uses first and second word', () => {
    expect(getInitials('Uday Sharma')).toBe('US');
  });
  it('handles single names and extra whitespace', () => {
    expect(getInitials('  madonna ')).toBe('M');
  });
  it('falls back for empty or missing names', () => {
    expect(getInitials('')).toBe('U');
    expect(getInitials(null, '?')).toBe('?');
  });
});

describe('cleanCompanyName', () => {
  const cases: Array<[string, string]> = [
    ['radikal.io', 'Radikal'],
    ['karel@radikal.io', 'Radikal'],
    ['https://www.radikal.io/about', 'Radikal'],
    ['radikal-digital.com', 'Radikal Digital'],
    ['acme.co.uk', 'Acme'],
    ['Convertibles.dev', 'Convertibles'],
    ['Ingversions Digital', 'Ingversions Digital'],
    ['Radikal, Inc.', 'Radikal'],
  ];
  it.each(cases)('cleans %s -> %s', (raw, expected) => {
    expect(cleanCompanyName(raw)).toBe(expected);
  });
  it('returns empty string for empty input', () => {
    expect(cleanCompanyName('')).toBe('');
    expect(cleanCompanyName(null)).toBe('');
  });
});

describe('stripHtml', () => {
  it('removes tags', () => {
    const out = stripHtml('<p>Hello <b>world</b></p>');
    expect(out).toContain('Hello');
    expect(out).not.toContain('<');
  });
  it('handles empty input', () => {
    expect(stripHtml(null)).toBe('');
  });

  it('drops style/script blocks and leaves no tags', () => {
    const out = stripHtml('<style>p{color:red}</style><p>Hi</p><script>alert(1)</script><img src=x onerror=alert(1)>');
    expect(out).toBe('Hi');
  });
});

describe('getCompanyUrl', () => {
  it('returns a string for missing company', () => {
    expect(typeof getCompanyUrl(null)).toBe('string');
  });
});
