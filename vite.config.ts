import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import fs from 'fs'
import path from 'path'

// Helper for local daily quota tracking
const QUOTA_FILE = path.resolve(process.cwd(), 'scratch', 'linkedin_quota.json');
const MAX_DAILY_LIMIT = 20;

function getDailyQuotaRecord(): { date: string; count: number } {
  try {
    if (fs.existsSync(QUOTA_FILE)) {
      const data = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf-8'));
      const today = new Date().toISOString().slice(0, 10);
      if (data.date === today) {
        return data;
      }
    }
  } catch {}
  return { date: new Date().toISOString().slice(0, 10), count: 0 };
}

function incrementDailyQuota(): number {
  const current = getDailyQuotaRecord();
  const updated = { date: new Date().toISOString().slice(0, 10), count: current.count + 1 };
  try {
    const dir = path.dirname(QUOTA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not write quota file', err);
  }
  return updated.count;
}

function parseLinkedInCookies(body: any, fallbackLiAt: string, fallbackCsrf: string) {
  let rawCookie = (body.cookieOverride?.rawCookie || '').trim();
  let activeLiAt = (body.cookieOverride?.liAt || body.liAt || fallbackLiAt || '').trim();
  let activeCsrf = (body.cookieOverride?.jsessionId || body.jsessionId || fallbackCsrf || '').trim();

  // 1. Support JSON cookie array (Cookie-Editor / EditThisCookie export format)
  const candidateJson = body.cookies || body.cookieOverride?.cookies || rawCookie || activeLiAt;
  if (Array.isArray(candidateJson)) {
    let header = '';
    for (const c of candidateJson) {
      if (!c?.name || c?.value === undefined) continue;
      header += `${c.name}=${c.value}; `;
      if (c.name === 'li_at') activeLiAt = c.value;
      if (c.name === 'JSESSIONID') activeCsrf = String(c.value).replace(/^["']|["']$/g, '');
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
          if (c.name === 'li_at') activeLiAt = c.value;
          if (c.name === 'JSESSIONID') activeCsrf = String(c.value).replace(/^["']|["']$/g, '');
        }
        rawCookie = header.trim();
      }
    } catch {}
  }

  if (activeLiAt.includes(';') || activeLiAt.includes('bcookie=') || activeLiAt.includes('lidc=')) {
    rawCookie = activeLiAt;
    const liAtMatch = rawCookie.match(/(?:^|;\s*)li_at=([^;]+)/);
    const csrfMatch = rawCookie.match(/(?:^|;\s*)JSESSIONID="?([^;"]+)"?/);
    if (liAtMatch) activeLiAt = liAtMatch[1];
    if (csrfMatch) activeCsrf = csrfMatch[1];
  }

  const cleanCsrf = activeCsrf.replace(/^["']|["']$/g, '');
  const cookieHeader = rawCookie && rawCookie.includes('li_at=')
    ? rawCookie
    : `li_at=${activeLiAt}; JSESSIONID="${cleanCsrf}"`;

  return { activeLiAt, activeCsrf: cleanCsrf, cookieHeader, rawCookie };
}

function linkedinAutomationPlugin(): Plugin {
  return {
    name: 'linkedin-automation-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/linkedin')) {
          return next();
        }

        const env = loadEnv('development', process.cwd(), '');
        const liAt = env.LINKEDIN_LI_AT || env.VITE_LINKEDIN_LI_AT || '';
        const rawCsrf = env.LINKEDIN_JSESSIONID || env.VITE_LINKEDIN_JSESSIONID || '';
        const csrfToken = rawCsrf.replace(/^["']|["']$/g, '');

        res.setHeader('Content-Type', 'application/json');

        // 1. Quota Check Endpoint
        if (req.url === '/api/linkedin/quota' && req.method === 'GET') {
          const quota = getDailyQuotaRecord();
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              success: true,
              date: quota.date,
              sentToday: quota.count,
              maxDailyLimit: MAX_DAILY_LIMIT,
              remaining: Math.max(0, MAX_DAILY_LIMIT - quota.count),
              hasSessionCookie: Boolean(liAt),
            })
          );
        }

        // 2. Send Connection Invitation Endpoint
        if (req.url === '/api/linkedin/invite' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk) => (bodyStr += chunk));
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const { activeLiAt, activeCsrf, cookieHeader } = parseLinkedInCookies(body, liAt, csrfToken);

              if (!activeLiAt) {
                res.statusCode = 400;
                return res.end(
                  JSON.stringify({
                    success: false,
                    error: 'LinkedIn session cookie (li_at) is required. Please provide a session cookie or link your account.',
                  })
                );
              }

              const quota = getDailyQuotaRecord();
              if (quota.count >= MAX_DAILY_LIMIT) {
                res.statusCode = 429;
                return res.end(
                  JSON.stringify({
                    success: false,
                    error: `Daily safety limit reached (${MAX_DAILY_LIMIT}/${MAX_DAILY_LIMIT}). Please wait until tomorrow to prevent LinkedIn flags.`,
                  })
                );
              }

              const { profileUrl, note, contactName } = body;
              if (!profileUrl && !contactName) {
                res.statusCode = 400;
                return res.end(
                  JSON.stringify({ success: false, error: 'profileUrl or contactName is required' })
                );
              }

              // Extract vanity name or public identifier from profile URL
              let vanity = '';
              if (profileUrl) {
                const match = profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
                if (match) vanity = decodeURIComponent(match[1]).replace(/\/$/, '');
              }
              if (!vanity && contactName) {
                vanity = contactName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
              }

              const commonHeaders: Record<string, string> = {
                cookie: cookieHeader,
                'csrf-token': activeCsrf,
                'x-restli-protocol-version': '2.0.0',
                'user-agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                accept: 'application/vnd.linkedin.normalized+json+2.1',
              };

              // Step A: Resolve Profile and Member ID
              let targetProfileId: string | null = null;
              let targetPublicName = contactName || vanity;

              if (vanity) {
                const queryUrl = `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(
                  vanity
                )}`;
                const profileRes = await fetch(queryUrl, { headers: commonHeaders });
                if (profileRes.ok) {
                  const profileData = (await profileRes.json()) as any;
                  for (const inc of profileData.included || []) {
                    if (inc.$type?.includes('Profile') && inc.entityUrn) {
                      const parts = inc.entityUrn.split(':');
                      targetProfileId = parts[parts.length - 1];
                      if (inc.firstName || inc.lastName) {
                        targetPublicName = `${inc.firstName || ''} ${inc.lastName || ''}`.trim();
                      }
                      break;
                    }
                  }
                }
              }

              // Step B: Send Connection Invitation via Voyager
              const invitePayload: any = {
                message: (note || '').slice(0, 300),
              };

              if (targetProfileId) {
                invitePayload.invitee = {
                  'com.linkedin.voyager.growth.invitation.InviteeProfile': {
                    profileId: targetProfileId,
                  },
                };
              } else {
                invitePayload.invitee = {
                  'com.linkedin.voyager.growth.invitation.InviteeProfile': {
                    profileId: vanity,
                  },
                };
              }

              const inviteRes = await fetch(
                'https://www.linkedin.com/voyager/api/growth/normInvitations',
                {
                  method: 'POST',
                  headers: {
                    ...commonHeaders,
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify(invitePayload),
                }
              );

              const inviteStatus = inviteRes.status;
              const resText = await inviteRes.text();

              if (inviteStatus === 200 || inviteStatus === 201 || inviteStatus === 204) {
                const newCount = incrementDailyQuota();
                res.statusCode = 200;
                return res.end(
                  JSON.stringify({
                    success: true,
                    message: `Connection request sent to ${targetPublicName}!`,
                    sentToday: newCount,
                    remaining: Math.max(0, MAX_DAILY_LIMIT - newCount),
                  })
                );
              }

              // Handle already invited or connection pending
              if (
                resText.includes('INVITATION_ALREADY_SENT') ||
                resText.includes('already invited') ||
                resText.includes('DUPLICATE')
              ) {
                res.statusCode = 200;
                return res.end(
                  JSON.stringify({
                    success: true,
                    message: `Connection request is already pending for ${targetPublicName}.`,
                    alreadySent: true,
                    sentToday: quota.count,
                    remaining: Math.max(0, MAX_DAILY_LIMIT - quota.count),
                  })
                );
              }

              // Other Voyager response handling
              console.warn('LinkedIn invite response error:', inviteStatus, resText);
              res.statusCode = inviteStatus >= 400 && inviteStatus < 500 ? inviteStatus : 400;
              return res.end(
                JSON.stringify({
                  success: false,
                  error: `LinkedIn returned status ${inviteStatus}. Check that the profile URL is valid.`,
                  details: resText,
                })
              );
            } catch (err: any) {
              console.error('LinkedIn automation error:', err);
              res.statusCode = 500;
              return res.end(
                JSON.stringify({
                  success: false,
                  error: err.message || 'Internal error dispatching LinkedIn invite',
                })
              );
            }
          });
          return;
        }

        // 3. Prospect Discovery & Search Endpoint
        if (req.url === '/api/linkedin/search' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk) => (bodyStr += chunk));
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const { activeLiAt, activeCsrf, cookieHeader } = parseLinkedInCookies(body, liAt, csrfToken);

              if (!activeLiAt) {
                res.statusCode = 400;
                return res.end(
                  JSON.stringify({
                    success: false,
                    error: 'LinkedIn session cookie (li_at) is required. Please link your account or set LINKEDIN_LI_AT in .env.',
                  })
                );
              }

              let searchKeywords = (body.keywords || '').trim();
              const searchUrl = (body.searchUrl || '').trim();

              // If a LinkedIn search URL was provided, extract query params
              if (searchUrl) {
                try {
                  const parsed = new URL(searchUrl);
                  const urlKeywords = parsed.searchParams.get('keywords');
                  if (urlKeywords) searchKeywords = urlKeywords;
                } catch {
                  const match = searchUrl.match(/keywords=([^&]+)/);
                  if (match) searchKeywords = decodeURIComponent(match[1]);
                }
              }

              if (!searchKeywords) {
                res.statusCode = 400;
                return res.end(
                  JSON.stringify({
                    success: false,
                    error: 'Search keywords or a valid LinkedIn search URL are required.',
                  })
                );
              }

              const commonHeaders: Record<string, string> = {
                cookie: cookieHeader,
                'csrf-token': activeCsrf,
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

              // Query Voyager People Search with manual redirect to prevent redirect count exceeded loop
              const encodedKeywords = encodeURIComponent(searchKeywords);
              const blendedUrl = `https://www.linkedin.com/voyager/api/search/blended?keywords=${encodedKeywords}&origin=GLOBAL_SEARCH_HEADER&q=all&filters=List(resultType->PEOPLE)`;
              const clusterUrl = `https://www.linkedin.com/voyager/api/search/dash/clusters?decorationId=com.linkedin.voyager.dash.deco.search.SearchClusterCollection-174&origin=GLOBAL_SEARCH_HEADER&q=all&query=(keywords:${encodedKeywords},flagshipSearchIntent:SEARCH_SRP,queryParameters:List((key:resultType,value:List(PEOPLE))))`;

              let searchRes: any = null;
              try {
                searchRes = await fetch(clusterUrl, { headers: commonHeaders, redirect: 'manual' });
              } catch (e) {
                console.warn('Cluster search failed, trying blended search:', e);
              }

              // Check if redirect occurs (302/301 -> login redirect -> expired cookie)
              if (searchRes && (searchRes.status === 301 || searchRes.status === 302 || searchRes.status === 401 || searchRes.status === 403)) {
                res.statusCode = 401;
                return res.end(
                  JSON.stringify({
                    success: false,
                    error: 'LinkedIn session cookie (li_at) has expired or was challenged. Please update it with a fresh cookie.',
                    expiredCookie: true,
                  })
                );
              }

              if (!searchRes || !searchRes.ok) {
                try {
                  searchRes = await fetch(blendedUrl, { headers: commonHeaders, redirect: 'manual' });
                } catch (e) {
                  console.warn('Blended search failed:', e);
                }
              }

              if (searchRes && (searchRes.status === 301 || searchRes.status === 302 || searchRes.status === 401 || searchRes.status === 403)) {
                res.statusCode = 401;
                return res.end(
                  JSON.stringify({
                    success: false,
                    error: 'LinkedIn session cookie (li_at) has expired or was challenged. Please update it with a fresh cookie.',
                    expiredCookie: true,
                  })
                );
              }

              if (!searchRes || !searchRes.ok) {
                const status = searchRes?.status || 400;
                const errText = searchRes ? await searchRes.text().catch(() => '') : '';
                res.statusCode = status >= 400 && status < 500 ? status : 400;
                return res.end(
                  JSON.stringify({
                    success: false,
                    error: `LinkedIn search returned status ${status}. Your cookie may be expired or challenged.`,
                    details: errText.slice(0, 300),
                    expiredCookie: status === 401 || status === 403 || status === 302,
                  })
                );
              }

              const rawData = (await searchRes.json()) as any;
              const prospects: any[] = [];
              const targetTitles: string[] = (body.filters?.targetTitles || []).map((t: string) => t.trim().toLowerCase()).filter(Boolean);
              const negativeKeywords: string[] = (body.filters?.negativeKeywords || []).map((n: string) => n.trim().toLowerCase()).filter(Boolean);
              const targetLocations: string[] = (body.filters?.locations || []).map((l: string) => l.trim().toLowerCase()).filter(Boolean);

              const parseAvatar = (item: any): string | undefined => {
                const vector = item?.image?.attributes?.[0]?.detailData?.['com.linkedin.common.VectorImage'] ||
                               item?.picture?.['com.linkedin.common.VectorImage'] ||
                               item?.picture;
                if (vector?.rootUrl && Array.isArray(vector?.artifacts) && vector.artifacts.length > 0) {
                  return `${vector.rootUrl}${vector.artifacts[0].fileIdentifyingUrlPath}`;
                }
                return undefined;
              };

              const items = [
                ...(rawData.included || []),
                ...(rawData.elements || []),
              ];

              const seenUrls = new Set<string>();

              for (const item of items) {
                let name = item.title?.text || item.title || '';
                let headline = item.primarySubtitle?.text || item.headline || '';
                let location = item.secondarySubtitle?.text || item.subline || '';
                let navUrl = item.navigationUrl || '';
                let distance = item.badgeText?.text || item.distance || '2nd';

                if (!navUrl && item.publicIdentifier) {
                  navUrl = `https://www.linkedin.com/in/${item.publicIdentifier}`;
                }

                if (!name || !headline) continue;
                if (!navUrl.includes('/in/') && !item.publicIdentifier) continue;

                let vanity = '';
                const vanityMatch = navUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
                if (vanityMatch) {
                  vanity = decodeURIComponent(vanityMatch[1]);
                } else if (item.publicIdentifier) {
                  vanity = item.publicIdentifier;
                }

                if (!vanity || seenUrls.has(vanity.toLowerCase())) continue;
                seenUrls.add(vanity.toLowerCase());

                const profileUrl = `https://www.linkedin.com/in/${vanity}`;
                const avatarUrl = parseAvatar(item);

                // --- APPLY HARD FILTERS ---
                let isQualified = true;
                let qualificationReason = 'Matches all criteria';

                const headlineLower = headline.toLowerCase();
                const nameLower = name.toLowerCase();

                // 1. Negative keywords check
                if (negativeKeywords.length > 0) {
                  const matchedNegative = negativeKeywords.find((neg: string) => headlineLower.includes(neg) || nameLower.includes(neg));
                  if (matchedNegative) {
                    isQualified = false;
                    qualificationReason = `Excluded by keyword: "${matchedNegative}"`;
                  }
                }

                // 2. Target titles check
                if (isQualified && targetTitles.length > 0) {
                  const matchesTitle = targetTitles.some((title: string) => headlineLower.includes(title));
                  if (!matchesTitle) {
                    isQualified = false;
                    qualificationReason = `Does not match target title keywords`;
                  }
                }

                // 3. Location check
                if (isQualified && targetLocations.length > 0) {
                  const locationLower = location.toLowerCase();
                  const matchesLoc = targetLocations.some((loc: string) => locationLower.includes(loc));
                  if (!matchesLoc) {
                    isQualified = false;
                    qualificationReason = `Does not match target location`;
                  }
                }

                prospects.push({
                  fullName: name,
                  headline,
                  location,
                  vanity,
                  profileUrl,
                  avatarUrl,
                  networkDistance: distance.replace(/[^0-9a-zA-Z]/g, ''),
                  isQualified,
                  qualificationReason,
                });
              }

              res.statusCode = 200;
              return res.end(
                JSON.stringify({
                  success: true,
                  totalFound: prospects.length,
                  qualifiedCount: prospects.filter((p) => p.isQualified).length,
                  prospects,
                })
              );
            } catch (err: any) {
              console.error('LinkedIn search error:', err);
              res.statusCode = 500;
              return res.end(
                JSON.stringify({
                  success: false,
                  error: err.message || 'Internal error during LinkedIn prospect search',
                })
              );
            }
          });
          return;
        }

        // 4. Verify LinkedIn Session Cookie Endpoint
        if (req.url === '/api/linkedin/verify' && (req.method === 'POST' || req.method === 'GET')) {
          let bodyStr = '';
          req.on('data', (chunk) => (bodyStr += chunk));
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const { activeLiAt, activeCsrf, cookieHeader } = parseLinkedInCookies(body, liAt, csrfToken);

              if (!activeLiAt) {
                res.statusCode = 400;
                return res.end(
                  JSON.stringify({
                    success: false,
                    valid: false,
                    error: 'LinkedIn session cookie (li_at) is required.',
                    expiredCookie: true,
                  })
                );
              }

              const commonHeaders: Record<string, string> = {
                cookie: cookieHeader,
                'csrf-token': activeCsrf,
                'x-restli-protocol-version': '2.0.0',
                'user-agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                accept: 'application/vnd.linkedin.normalized+json+2.1',
              };

              const meRes = await fetch('https://www.linkedin.com/voyager/api/me', {
                headers: commonHeaders,
                redirect: 'manual',
              });

              if (meRes.status === 301 || meRes.status === 302 || meRes.status === 401 || meRes.status === 403) {
                res.statusCode = 200;
                return res.end(
                  JSON.stringify({
                    success: true,
                    valid: false,
                    error: 'LinkedIn session cookie (li_at) has expired or was challenged.',
                    expiredCookie: true,
                  })
                );
              }

              if (!meRes.ok) {
                const errText = await meRes.text().catch(() => '');
                res.statusCode = 200;
                return res.end(
                  JSON.stringify({
                    success: true,
                    valid: false,
                    error: `LinkedIn verification returned status ${meRes.status}`,
                    details: errText.slice(0, 200),
                  })
                );
              }

              const meData = (await meRes.json()) as any;
              const mini = meData.miniProfile || meData;
              const firstName = mini.firstName || meData.firstName || '';
              const lastName = mini.lastName || meData.lastName || '';
              const fullName = `${firstName} ${lastName}`.trim();
              const headline = mini.occupation || meData.headline || meData.occupation || '';
              const publicIdentifier = mini.publicIdentifier || meData.publicIdentifier || '';
              const profileUrl = publicIdentifier ? `https://www.linkedin.com/in/${publicIdentifier}` : undefined;

              let avatarUrl: string | undefined = undefined;
              const vector =
                mini.picture?.['com.linkedin.common.VectorImage'] ||
                meData.picture?.['com.linkedin.common.VectorImage'] ||
                mini.picture;

              if (vector?.rootUrl && Array.isArray(vector?.artifacts) && vector.artifacts.length > 0) {
                avatarUrl = `${vector.rootUrl}${vector.artifacts[0].fileIdentifyingUrlPath}`;
              }

              res.statusCode = 200;
              return res.end(
                JSON.stringify({
                  success: true,
                  valid: true,
                  profile: {
                    name: fullName || 'LinkedIn User',
                    headline,
                    publicIdentifier,
                    profileUrl,
                    avatarUrl,
                  },
                })
              );
            } catch (err: any) {
              console.error('LinkedIn verify error:', err);
              res.statusCode = 500;
              return res.end(
                JSON.stringify({
                  success: false,
                  valid: false,
                  error: err.message || 'Internal error verifying LinkedIn cookie',
                })
              );
            }
          });
          return;
        }

        // 5. 1-Click Visible Browser LinkedIn Connect (Automatic Session Capture)
        if (req.url === '/api/linkedin/launch-browser-login' && req.method === 'POST') {
          try {
            const puppeteer = (await import('puppeteer-core')).default;
            const sessionDir = path.resolve(process.cwd(), 'scratch', 'chrome_linkedin_session');
            if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

            const browser = await puppeteer.launch({
              executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
              headless: false,
              userDataDir: sessionDir,
              defaultViewport: null,
              args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1024,800',
              ],
            });

            const page = (await browser.pages())[0] || (await browser.newPage());
            await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });

            const startTime = Date.now();
            const timeout = 180000;

            const checkAuth = async (): Promise<any> => {
              while (Date.now() - startTime < timeout) {
                await new Promise((r) => setTimeout(r, 1500));
                try {
                  const url = page.url();
                  if (
                    url.includes('/feed') ||
                    url.includes('/mynetwork') ||
                    url.includes('/in/') ||
                    url.includes('/messaging')
                  ) {
                    const cookies = await page.cookies();
                    let rawCookie = '';
                    let activeLiAt = '';
                    let activeCsrf = '';

                    for (const c of cookies) {
                      rawCookie += `${c.name}=${c.value}; `;
                      if (c.name === 'li_at') activeLiAt = c.value;
                      if (c.name === 'JSESSIONID') activeCsrf = c.value.replace(/^["']|["']$/g, '');
                    }

                    let profile: any = null;
                    try {
                      profile = await page.evaluate(async (csrf) => {
                        const headers: Record<string, string> = {
                          accept: 'application/vnd.linkedin.normalized+json+2.1',
                        };
                        if (csrf) headers['csrf-token'] = csrf;
                        const r = await fetch('/voyager/api/me', { headers });
                        if (r.ok) {
                          const d = (await r.json()) as any;
                          const m = d.miniProfile || d;
                          return {
                            name: `${m.firstName || ''} ${m.lastName || ''}`.trim(),
                            headline: m.occupation || '',
                            publicIdentifier: m.publicIdentifier || '',
                          };
                        }
                        return null;
                      }, activeCsrf);
                    } catch {}

                    try {
                      await browser.close();
                    } catch {}

                    return {
                      success: true,
                      liAt: activeLiAt,
                      csrfToken: activeCsrf,
                      rawCookie: rawCookie.trim(),
                      profile: profile || { name: 'LinkedIn User' },
                    };
                  }
                } catch {
                  // User closed browser window
                  break;
                }
              }
              try {
                await browser.close();
              } catch {}
              return { success: false, error: 'Login timed out or window was closed.' };
            };

            const result = await checkAuth();
            res.statusCode = result.success ? 200 : 400;
            return res.end(JSON.stringify(result));
          } catch (err: any) {
            console.error('Launch browser error:', err);
            res.statusCode = 500;
            return res.end(JSON.stringify({ success: false, error: err.message || 'Failed to launch browser' }));
          }
        }

        // Catch-all
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), linkedinAutomationPlugin()],
  server: {
    proxy: {
      '/api/resend': {
        target: 'https://api.resend.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/resend/, ''),
      },
      // Dev stand-in for api/composio.ts: adds the server-only COMPOSIO_API_KEY from .env (no login check locally).
      '/api/composio': {
        target: 'https://connect.composio.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/composio/, '/mcp'),
        configure: (proxy) => {
          const key = loadEnv('development', process.cwd(), '').COMPOSIO_API_KEY;
          if (key) proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('x-consumer-api-key', key));
        },
      },
    },
  },
})
