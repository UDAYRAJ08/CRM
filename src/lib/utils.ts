export function getInitials(name?: string | null, fallback = 'U'): string {
  if (!name || typeof name !== 'string') return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  const first = parts[0]?.[0] || '';
  const second = parts.length > 1 ? parts[1]?.[0] || '' : '';
  return (first + second).toUpperCase() || fallback;
}

export function formatDate(dateString?: string | null): string {
  if (!dateString) return 'N/A';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 45) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return 'yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

export function getStatusColor(status?: string): string {
  switch (status?.toLowerCase()) {
    case 'new':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'contacted':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'qualified':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
    case 'proposal':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'won':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'lost':
      return 'bg-rose-100 text-rose-700 border-rose-200';
    case 'inactive':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

/**
 * Intelligently cleans and normalizes raw company or domain names into a proper display name:
 * E.g.
 * - "radikal.io" -> "Radikal"
 * - "company.co" -> "Company"
 * - "karel@radikal.io" -> "Radikal"
 * - "https://www.radikal.io/about" -> "Radikal"
 * - "radikal-digital.com" -> "Radikal Digital"
 * - "acme.co.uk" -> "Acme"
 * - "Convertibles.dev" -> "Convertibles"
 * - "Ingversions Digital" -> "Ingversions Digital"
 * - "Radikal, Inc." -> "Radikal"
 */
export function cleanCompanyName(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  let name = raw.trim();
  if (!name) return '';

  // 1. If an email address was passed, take the domain portion
  if (name.includes('@') && !name.includes(' ')) {
    name = name.split('@')[1] || name;
  }

  // 2. Strip protocols: http://, https://, ftp://, //
  name = name.replace(/^(?:https?:\/\/|\/\/)/i, '');

  // 3. Strip URL paths, query parameters, anchors, or trailing slashes (e.g. "radikal.io/services?id=1" -> "radikal.io")
  if (name.includes('/') || name.includes('?') || name.includes('#')) {
    name = name.split(/[/?#]/)[0].trim();
  }

  // 4. Strip leading "www."
  name = name.replace(/^www\./i, '');

  // 5. Handle domain extensions (e.g. company.co, radikal.io, acme.co.uk)
  // Multi-part ccTLDs (.co.uk, .com.au, .co.in, etc.)
  const multiPartTldRegex = /\.(co|com|org|net|edu|gov|ac)\.[a-z]{2,3}$/i;
  // Common single TLDs
  const singleTldRegex = /\.(com|co|io|ai|org|net|dev|app|tech|store|agency|design|xyz|biz|info|online|cloud|us|uk|ca|de|eu|fr|nl|se|ch|es|it|me|cc|tv|in|gg|so|vc|ly|fm|to|pro|space|studio|work|solutions|digital|systems|group|media|site|shop|global|world|live)$/i;
  // Generic fallback if there is a dot without spaces, like brand.fashion or startup.xyz
  const genericTldRegex = /\.[a-z]{2,8}$/i;

  if (multiPartTldRegex.test(name)) {
    name = name.replace(multiPartTldRegex, '');
  } else if (singleTldRegex.test(name)) {
    name = name.replace(singleTldRegex, '');
  } else if (!name.includes(' ') && genericTldRegex.test(name)) {
    name = name.replace(genericTldRegex, '');
  }

  // 6. Strip subdomains like app.company, mail.company, portal.company if present
  if (name.includes('.') && !name.includes(' ')) {
    const parts = name.split('.');
    const prefix = parts[0].toLowerCase();
    if (['app', 'portal', 'mail', 'email', 'crm', 'cloud', 'support', 'contact', 'hello', 'api', 'dev', 'staging', 'web'].includes(prefix) && parts.length > 1) {
      name = parts.slice(1).join(' ');
    } else {
      name = parts[parts.length - 1];
    }
  }

  // 7. If the name is hyphenated or underscored like "radikal-digital" or "my_company", turn into spaces
  if ((name.includes('-') || name.includes('_')) && !name.includes(' ')) {
    name = name.replace(/[-_]+/g, ' ');
  }

  // 8. Clean legal entity suffixes (e.g. ", Inc.", " LLC", " Ltd.")
  name = name
    .replace(/,\s*(?:inc|llc|ltd|corp|corporation|gmbh|co)\.?$/i, '')
    .replace(/\s+(?:inc|llc|ltd|corp|corporation|gmbh)\.?$/i, '')
    .trim();

  if (!name) return '';

  // 9. Capitalization formatting
  const isAllLower = name === name.toLowerCase();
  const isAllUpper = name === name.toUpperCase() && name.length > 4;

  if (isAllLower || isAllUpper) {
    name = name
      .split(/\s+/)
      .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
      .join(' ');
  } else {
    // Preserve intentional CamelCase / internal caps (e.g. "Shopify", "TechCorp", "OpenAI"),
    // but ensure each space-separated segment has its first letter capitalized
    name = name
      .split(/\s+/)
      .map((w) => {
        if (!w) return '';
        if (w === w.toLowerCase()) {
          return w.charAt(0).toUpperCase() + w.slice(1);
        }
        return w;
      })
      .join(' ');
  }

  return name.trim();
}

/**
 * Resolves a full, clickable website URL for a company
 */
export function getCompanyUrl(company?: { name?: string; website?: string } | null): string {
  if (!company) return '';
  const candidate =
    company.website?.trim() ||
    (company.name?.trim().includes('.') ? company.name?.trim() : '') ||
    '';
  if (!candidate) return '';
  if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
    return candidate;
  }
  return `https://${candidate}`;
}

/**
 * Strips HTML tags and entities, converting <br> and </p> into clean readable newlines for previews/timelines
 */
export function stripHtml(html?: string | null): string {
  if (!html) return '';
  return html
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}


