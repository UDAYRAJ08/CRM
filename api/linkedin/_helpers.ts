// Vercel Serverless Function Helper for LinkedIn Automation
// Handles proxy tunneling, cookie formatting, and Voyager headers

let cachedDispatcher: any = null;
let proxyAttempted = false;

async function getProxyDispatcher() {
  const proxyUrl = process.env.LINKEDIN_PROXY_URL;
  if (!proxyUrl) return undefined;
  if (proxyAttempted) return cachedDispatcher;
  proxyAttempted = true;
  try {
    // Dynamic import to support both ESM and bundled environments
    const undici = await import('undici');
    if (undici && undici.ProxyAgent) {
      cachedDispatcher = new undici.ProxyAgent(proxyUrl);
    }
  } catch (e) {
    console.warn('Failed to load undici ProxyAgent for LINKEDIN_PROXY_URL:', e);
  }
  return cachedDispatcher;
}

export function getLinkedInCredentials(body: any = {}) {
  const env = process.env;
  let rawCookie = (body.cookieOverride?.rawCookie || '').trim();
  let liAt = (body.cookieOverride?.liAt || env.LINKEDIN_LI_AT || env.VITE_LINKEDIN_LI_AT || '').trim();
  let rawCsrf = (
    body.cookieOverride?.jsessionId ||
    env.LINKEDIN_JSESSIONID ||
    env.VITE_LINKEDIN_JSESSIONID ||
    ''
  ).trim();

  // 1. Support JSON cookie array (Cookie-Editor format)
  const candidateJson = body.cookies || body.cookieOverride?.cookies || rawCookie || liAt;
  if (Array.isArray(candidateJson)) {
    let header = '';
    for (const c of candidateJson) {
      if (!c?.name || c?.value === undefined) continue;
      header += `${c.name}=${c.value}; `;
      if (c.name === 'li_at') liAt = c.value;
      if (c.name === 'JSESSIONID') rawCsrf = String(c.value).replace(/^["']|["']$/g, '');
    }
    rawCookie = header.trim();
  } else if (typeof candidateJson === 'string' && candidateJson.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(candidateJson.trim());
      if (Array.isArray(arr)) {
        let header = '';
        for (const c of arr) {
          if (!c?.name || c?.value === undefined) continue;
          header += `${c.name}=${c.value}; `;
          if (c.name === 'li_at') liAt = c.value;
          if (c.name === 'JSESSIONID') rawCsrf = String(c.value).replace(/^["']|["']$/g, '');
        }
        rawCookie = header.trim();
      }
    } catch {}
  }

  // 2. If user pasted a full cookie string containing semicolons
  if (liAt.includes(';') || liAt.includes('bcookie=') || liAt.includes('lidc=')) {
    rawCookie = liAt;
    const liAtMatch = rawCookie.match(/(?:^|;\s*)li_at=([^;]+)/);
    const csrfMatch = rawCookie.match(/(?:^|;\s*)JSESSIONID="?([^;"]+)"?/);
    if (liAtMatch) liAt = liAtMatch[1];
    if (csrfMatch) rawCsrf = csrfMatch[1];
  }

  const csrfToken = rawCsrf.replace(/^["']|["']$/g, '');

  return { liAt, csrfToken, rawCookie };
}

export function buildLinkedInHeaders(liAt: string, csrfToken: string, rawCookie?: string): Record<string, string> {
  const cookieHeader = rawCookie && rawCookie.includes('li_at=')
    ? rawCookie
    : `li_at=${liAt}; JSESSIONID="${csrfToken}"`;

  return {
    cookie: cookieHeader,
    'csrf-token': csrfToken,
    'x-restli-protocol-version': '2.0.0',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    accept: 'application/vnd.linkedin.normalized+json+2.1',
    'accept-language': 'en-US,en;q=0.9',
    'x-li-lang': 'en_US',
    'x-li-track': JSON.stringify({
      clientVersion: '1.13.5765',
      mpVersion: '1.13.5765',
      osName: 'web',
      timezoneOffset: 5.5,
      timezone: 'Asia/Kolkata',
      deviceFormFactor: 'DESKTOP',
      mpName: 'voyager-web',
      displayDensity: 2,
      displayWidth: 1440,
      displayHeight: 900,
    }),
    'x-requested-with': 'XMLHttpRequest',
    origin: 'https://www.linkedin.com',
    referer: 'https://www.linkedin.com/',
  };
}

export async function fetchLinkedInVoyager(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const dispatcher = await getProxyDispatcher();

  const fetchOptions: any = {
    ...options,
    redirect: 'manual', // Prevent infinite redirect loops on 302 login
  };

  if (dispatcher) {
    fetchOptions.dispatcher = dispatcher;
  }

  return fetch(url, fetchOptions);
}

// Memory-cached daily quota for the serverless instance
let dailyQuotaState = {
  date: new Date().toISOString().slice(0, 10),
  count: 0,
};

const MAX_DAILY_LIMIT = 15;

export function getDailyQuota() {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyQuotaState.date !== today) {
    dailyQuotaState = { date: today, count: 0 };
  }
  return {
    date: dailyQuotaState.date,
    count: dailyQuotaState.count,
    maxLimit: MAX_DAILY_LIMIT,
    remaining: Math.max(0, MAX_DAILY_LIMIT - dailyQuotaState.count),
  };
}

export function incrementDailyQuota(): number {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyQuotaState.date !== today) {
    dailyQuotaState = { date: today, count: 0 };
  }
  dailyQuotaState.count += 1;
  return dailyQuotaState.count;
}
