import { describe, it, expect } from 'vitest';
import { buildEmailHtml } from '../emailService';

describe('buildEmailHtml', () => {
  it('wraps HTML bodies in the base font even when they contain <p>', () => {
    const html = buildEmailHtml('<p>Hi</p><ul><li>One</li></ul>');
    expect(html.startsWith('<div style="font-family')).toBe(true);
    expect(html).toContain('font-size: 14px');
  });

  it('zeroes paragraph margins but keeps explicit ones', () => {
    const html = buildEmailHtml('<p>A</p><p><br></p><p style="margin: 8px">B</p>');
    expect(html).toContain('<p style="margin: 0px;">A</p>');
    expect(html).toContain('<p style="margin: 8px">B</p>');
  });

  it('converts plain-text newlines to <br>', () => {
    expect(buildEmailHtml('Hi\nthere')).toContain('Hi<br>there');
  });
});
