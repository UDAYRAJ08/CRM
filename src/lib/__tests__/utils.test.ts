import { describe, it, expect } from 'vitest';
import { getInitials, cleanCompanyName, stripHtml, getCompanyUrl, contactMatchesSearch, googleMapsUrl } from '../utils';
import type { Contact } from '../../types/crm';

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

describe('contactMatchesSearch', () => {
  const c = {
    id: '1', name: 'Sri Sai Automobiles', email: null, phone: '7123456789', status: 'new', tags: [], created_at: '',
    custom_fields: { ADDRESS: 'Shop No 3, Madhapur, Hyderabad', 'PIN CODE': '500081' },
  } as unknown as Contact;

  it('matches name, phone and extra columns like address and pin code', () => {
    expect(contactMatchesSearch(c, 'automobiles')).toBe(true);
    expect(contactMatchesSearch(c, '71234')).toBe(true);
    expect(contactMatchesSearch(c, 'madhapur')).toBe(true);
    expect(contactMatchesSearch(c, '500081')).toBe(true);
  });

  it('needs every word to match, in any field', () => {
    expect(contactMatchesSearch(c, '500081 sai')).toBe(true);
    expect(contactMatchesSearch(c, '500081 kukatpally')).toBe(false);
  });

  it('empty search matches everything', () => {
    expect(contactMatchesSearch(c, '   ')).toBe(true);
  });
});

describe('googleMapsUrl', () => {
  it('searches the address plus pin code', () => {
    expect(googleMapsUrl({ ADDRESS: 'Shop No 3, Madhapur, Hyderabad', 'PIN CODE': '500081' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Shop%20No%203%2C%20Madhapur%2C%20Hyderabad%20500081'
    );
  });

  it('finds address and pin columns by name, any case', () => {
    expect(googleMapsUrl({ 'Full Address': 'Ameerpet', Pincode: '500016' })).toContain('query=Ameerpet%20500016');
  });

  it('returns null when there is no address', () => {
    expect(googleMapsUrl({ 'PIN CODE': '500081' })).toBeNull();
    expect(googleMapsUrl(undefined)).toBeNull();
  });
});
