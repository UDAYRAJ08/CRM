// CRM LinkedIn Connector - service worker.
//
// Uses the LinkedIn session (li_at + JSESSIONID) of the user's own logged-in browser
// on behalf of CRM sites the user explicitly linked from the popup. The cookies never leave the extension.
// A site is linked by granting Chrome's host permission for it, then it gets the
// page-bridge content script. Every request is re-checked against the stored list.

const VERSION = chrome.runtime.getManifest().version;
const LINKEDIN = 'https://www.linkedin.com';
const STORAGE_KEY = 'linkedOrigins';
const PENDING_KEY = 'pendingLinkOrigin';

// ---------- linked CRM sites ----------

async function getLinkedOrigins() {
  const { [STORAGE_KEY]: list } = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(list) ? list : [];
}

function scriptId(origin) {
  let h = 0;
  for (const ch of origin) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 'crm-bridge-' + h.toString(16);
}

// Match patterns ignore ports, so use scheme + hostname. The per-request check
// below still compares the full origin (including port).
function matchPattern(origin) {
  const u = new URL(origin);
  return `${u.protocol}//${u.hostname}/*`;
}

async function registerBridge(origin) {
  const id = scriptId(origin);
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  } catch (_) { /* not registered yet */ }
  await chrome.scripting.registerContentScripts([
    {
      id,
      matches: [matchPattern(origin)],
      js: ['content-bridge.js'],
      runAt: 'document_start',
      persistAcrossSessions: true,
    },
  ]);
}

async function linkOrigin(origin) {
  const u = new URL(origin);
  if (!/^https?:$/.test(u.protocol) || /(^|\.)linkedin\.com$/.test(u.hostname)) {
    throw new Error('This site cannot be linked.');
  }
  const granted = await chrome.permissions.contains({ origins: [matchPattern(origin)] });
  if (!granted) throw new Error('Permission for this site was not granted.');
  await registerBridge(origin);
  // Registered scripts only load on the next navigation; also inject into tabs
  // that are already open so the user does not have to reload the CRM.
  try {
    const tabs = await chrome.tabs.query({ url: matchPattern(origin) });
    for (const tab of tabs) {
      if (tab.id !== undefined && tab.url && new URL(tab.url).origin === u.origin) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-bridge.js'] });
      }
    }
  } catch (_) { /* best effort */ }
  const list = await getLinkedOrigins();
  if (!list.includes(u.origin)) await chrome.storage.local.set({ [STORAGE_KEY]: [...list, u.origin] });
}

// Chrome's permission prompt takes focus from the popup, which can close it before the
// popup's own code runs. So the popup records which site it is asking for, and this
// finishes the link as soon as Chrome reports the permission was granted.
async function finishPendingLink(perms) {
  const { [PENDING_KEY]: pending } = await chrome.storage.local.get(PENDING_KEY);
  if (!pending) return;
  let pattern;
  try { pattern = matchPattern(pending); } catch (_) { return; }
  if (!(perms?.origins || []).includes(pattern)) return;
  await chrome.storage.local.remove(PENDING_KEY);
  try { await linkOrigin(pending); } catch (_) { /* the popup shows the real state next time it opens */ }
}
chrome.permissions.onAdded.addListener(finishPendingLink);

async function unlinkOrigin(origin) {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [scriptId(origin)] });
  } catch (_) { /* ignore */ }
  const list = (await getLinkedOrigins()).filter((o) => o !== origin);
  await chrome.storage.local.set({ [STORAGE_KEY]: list });
  try {
    await chrome.permissions.remove({ origins: [matchPattern(origin)] });
  } catch (_) { /* ignore */ }
}

// ---------- LinkedIn session ----------

async function readCookies() {
  // Only cookies Chrome actually sends to www.linkedin.com. A domain-wide getAll() can
  // return a stale JSESSIONID from another subdomain first, which fails the CSRF check.
  const get = (name) => chrome.cookies.get({ url: LINKEDIN, name }).then((c) => c?.value || '');
  const [liAt, jsessionId] = await Promise.all([get('li_at'), get('JSESSIONID')]);
  return {
    liAt,
    jsessionId: jsessionId.replace(/^["']|["']$/g, ''),
  };
}

async function fetchProfile(jsessionId) {
  try {
    const res = await fetch(`${LINKEDIN}/voyager/api/me`, {
      credentials: 'include',
      headers: {
        accept: 'application/vnd.linkedin.normalized+json+2.1',
        'csrf-token': jsessionId,
        'x-restli-protocol-version': '2.0.0',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const mini =
      (data.included || []).find((i) => i && i.publicIdentifier && i.firstName) ||
      data.miniProfile ||
      data.data?.miniProfile ||
      null;
    if (!mini) return null;
    let avatarUrl;
    const pic = mini.picture;
    if (pic?.rootUrl && pic.artifacts?.length) {
      avatarUrl = pic.rootUrl + pic.artifacts[pic.artifacts.length - 1].fileIdentifyingUrlPathSegment;
    }
    return {
      name: `${mini.firstName || ''} ${mini.lastName || ''}`.trim(),
      headline: mini.occupation || '',
      publicIdentifier: mini.publicIdentifier || '',
      avatarUrl,
    };
  } catch (_) {
    return null; // The CRM re-verifies server-side, so the profile is best-effort.
  }
}

async function getSession() {
  let c = await readCookies();
  if (!c.liAt) return { ok: false, error: 'NOT_LOGGED_IN' };
  if (!c.jsessionId) {
    // JSESSIONID is set when any linkedin.com page loads; trigger that once.
    try { await fetch(`${LINKEDIN}/feed/`, { credentials: 'include' }); } catch (_) { /* ignore */ }
    c = await readCookies();
  }
  if (!c.jsessionId) return { ok: false, error: 'NO_CSRF_TOKEN' };
  const profile = await fetchProfile(c.jsessionId);
  // Never hand the cookies to the page: any script on the CRM origin could read them.
  return { ok: true, loggedIn: true, profile };
}

// ---------- LinkedIn actions ----------
// Run from this browser so the session never leaves it: LinkedIn revokes li_at when the
// same session shows up from a server. Only these fixed actions exist, so a linked page
// cannot make arbitrary LinkedIn requests.

const DAILY_INVITE_LIMIT = 15;
const QUOTA_KEY = 'inviteQuota';

async function getQuota() {
  const date = new Date().toISOString().slice(0, 10);
  const { [QUOTA_KEY]: q } = await chrome.storage.local.get(QUOTA_KEY);
  const count = q?.date === date ? q.count : 0;
  return { date, count, maxLimit: DAILY_INVITE_LIMIT, remaining: Math.max(0, DAILY_INVITE_LIMIT - count) };
}

// The GraphQL gateway rejects requests without x-li-track, even though /me tolerates it.
const LI_TRACK = JSON.stringify({
  clientVersion: '1.13.36348',
  mpVersion: '1.13.36348',
  osName: 'web',
  timezoneOffset: -new Date().getTimezoneOffset() / 60,
  deviceFormFactor: 'DESKTOP',
  mpName: 'voyager-web',
  displayDensity: 1,
  displayWidth: 1920,
  displayHeight: 1080,
});

async function voyager(path, jsessionId, init = {}) {
  const res = await fetch(`${LINKEDIN}/voyager/api/${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      accept: 'application/vnd.linkedin.normalized+json+2.1',
      'csrf-token': jsessionId,
      'x-restli-protocol-version': '2.0.0',
      'x-li-lang': 'en_US',
      'x-li-track': LI_TRACK,
      ...(init.headers || {}),
    },
  });
  // Only a 401 or landing on a login/checkpoint page means the session is gone. A 403 is
  // usually a rejected request (bad CSRF, blocked query); calling it "logged out" sent
  // users into re-login loops that create new sessions.
  const loggedOut = res.status === 401 || /^\/(login|authwall|checkpoint|uas)/.test(new URL(res.url).pathname);
  return { res, loggedOut };
}

// Rest.li variables: parens, commas and colons are structure, so only values are
// escaped, and spaces must be %20 (LinkedIn reads "+" literally).
function rlEncode(s) {
  return encodeURIComponent(s).replace(/[()'!*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
}

// Pinned to a LinkedIn web build and rotates. When search starts failing with 400/404,
// copy the current voyagerSearchDashClusters.<hash> from linkedin.com's Network tab.
const SEARCH_QUERY_ID = 'voyagerSearchDashClusters.a7a0567fa66c52d645b5ff2f960b92aa';

async function sessionToken() {
  const c = await readCookies();
  return c.liAt && c.jsessionId ? c.jsessionId : null;
}

async function searchPeople(payload) {
  const keywords = typeof payload?.keywords === 'string' ? payload.keywords.trim() : '';
  if (!keywords || keywords.length > 200) return { ok: false, error: 'FAILED', message: 'Search keywords are required.' };
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'NOT_LOGGED_IN' };

  const variables =
    `(start:0,count:10,origin:GLOBAL_SEARCH_HEADER,query:(keywords:${rlEncode(keywords)},` +
    'flagshipSearchIntent:SEARCH_SRP,queryParameters:List((key:resultType,value:List(PEOPLE)))))';
  const { res, loggedOut } = await voyager(
    `graphql?includeWebMetadata=true&variables=${variables}&queryId=${SEARCH_QUERY_ID}`,
    token
  );
  if (loggedOut) return { ok: false, error: 'NOT_LOGGED_IN' };
  if (res.ok) return { ok: true, data: await res.json() };
  const stale = res.status === 400 || res.status === 404;
  return {
    ok: false,
    error: 'FAILED',
    status: res.status,
    message: stale
      ? `LinkedIn search returned status ${res.status}: the search queryId is out of date and needs refreshing.`
      : `LinkedIn search returned status ${res.status}.`,
  };
}

async function sendInvite(payload) {
  const vanity = typeof payload?.vanity === 'string' ? payload.vanity.trim() : '';
  const note = typeof payload?.note === 'string' ? payload.note.slice(0, 300) : '';
  if (!/^[^\s/?#]{1,100}$/.test(vanity)) return { ok: false, error: 'FAILED', message: 'A valid LinkedIn profile URL is required.' };
  const quota = await getQuota();
  if (quota.remaining <= 0) {
    return { ok: false, error: 'DAILY_LIMIT', message: `Daily safety limit reached (${quota.maxLimit}/${quota.maxLimit}). Please wait until tomorrow.`, quota };
  }
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'NOT_LOGGED_IN' };

  const prof = await resolveProfile(vanity, token);
  if (prof.loggedOut) return { ok: false, error: 'NOT_LOGGED_IN' };
  const { profileId, name } = prof;

  const { res, loggedOut } = await voyager('growth/normInvitations', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: note,
      invitee: { 'com.linkedin.voyager.growth.invitation.InviteeProfile': { profileId } },
    }),
  });
  const text = await res.text().catch(() => '');
  if (res.ok) {
    const count = quota.count + 1;
    await chrome.storage.local.set({ [QUOTA_KEY]: { date: quota.date, count } });
    return { ok: true, name, quota: { ...quota, count, remaining: Math.max(0, quota.maxLimit - count) } };
  }
  if (/INVITATION_ALREADY_SENT|already invited|DUPLICATE/.test(text)) return { ok: true, name, alreadySent: true, quota };
  if (loggedOut) return { ok: false, error: 'NOT_LOGGED_IN' };
  return { ok: false, error: 'FAILED', status: res.status, message: `LinkedIn returned status ${res.status}.`, details: text.slice(0, 300) };
}

// Vanity name -> member id (ACoAA...) and display name. Falls back to the vanity name.
async function resolveProfile(vanity, token) {
  let profileId = vanity;
  let name = vanity;
  const prof = await voyager(`identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(vanity)}`, token);
  if (prof.loggedOut) return { loggedOut: true };
  if (prof.res.ok) {
    const data = await prof.res.json();
    const p = (data.included || []).find((i) => i?.$type?.includes('Profile') && i.entityUrn);
    if (p) {
      profileId = p.entityUrn.split(':').pop();
      if (p.firstName || p.lastName) name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
    }
  }
  return { loggedOut: false, profileId, name, found: profileId !== vanity };
}

function validVanity(payload) {
  const vanity = typeof payload?.vanity === 'string' ? payload.vanity.trim() : '';
  return /^[^\s/?#]{1,100}$/.test(vanity) ? vanity : '';
}

// Campaign "view profile" step: registers a profile view, like opening the profile page.
async function viewProfile(payload) {
  const vanity = validVanity(payload);
  if (!vanity) return { ok: false, error: 'FAILED', message: 'A valid LinkedIn profile URL is required.' };
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'NOT_LOGGED_IN' };
  const { res, loggedOut } = await voyager(`identity/profiles/${encodeURIComponent(vanity)}/profileView`, token);
  if (loggedOut) return { ok: false, error: 'NOT_LOGGED_IN' };
  if (res.ok) return { ok: true };
  return { ok: false, error: 'FAILED', status: res.status, message: `LinkedIn returned status ${res.status}.` };
}

// Campaign "message" step. LinkedIn only delivers this to 1st-degree connections.
async function sendMessage(payload) {
  const vanity = validVanity(payload);
  const text = typeof payload?.text === 'string' ? payload.text.trim().slice(0, 8000) : '';
  if (!vanity || !text) return { ok: false, error: 'FAILED', message: 'A LinkedIn profile URL and message text are required.' };
  const token = await sessionToken();
  if (!token) return { ok: false, error: 'NOT_LOGGED_IN' };

  const prof = await resolveProfile(vanity, token);
  if (prof.loggedOut) return { ok: false, error: 'NOT_LOGGED_IN' };
  if (!prof.found) return { ok: false, error: 'FAILED', message: `Could not find the LinkedIn profile "${vanity}".` };

  // Creating a conversation with an existing 1:1 contact appends to that thread.
  const { res, loggedOut } = await voyager('messaging/conversations?action=create', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      keyVersion: 'LEGACY_INBOX',
      conversationCreate: {
        eventCreate: {
          value: {
            'com.linkedin.voyager.messaging.create.MessageCreate': {
              attributedBody: { text, attributes: [] },
              attachments: [],
            },
          },
        },
        recipients: [prof.profileId],
        subtype: 'MEMBER_TO_MEMBER',
      },
    }),
  });
  if (loggedOut) return { ok: false, error: 'NOT_LOGGED_IN' };
  if (res.ok) return { ok: true, name: prof.name };
  const details = await res.text().catch(() => '');
  return { ok: false, error: 'FAILED', status: res.status, message: `LinkedIn returned status ${res.status}.`, details: details.slice(0, 300) };
}

// ---------- messaging ----------

async function senderIsLinked(sender) {
  if (!sender.tab?.url) return false;
  try {
    return (await getLinkedOrigins()).includes(new URL(sender.tab.url).origin);
  } catch (_) {
    return false;
  }
}

// Popup-only messages must come from one of this extension's own pages. Content scripts
// (and therefore web pages) report the web page's URL as sender.url instead.
function fromExtensionPage(sender) {
  return sender.id === chrome.runtime.id && typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''));
}

async function handle(msg, sender) {
  switch (msg?.type) {
    // From the content bridge on a linked CRM site
    case 'PING': {
      if (!(await senderIsLinked(sender))) return { ok: false, error: 'ORIGIN_NOT_LINKED' };
      const { liAt } = await readCookies();
      return { ok: true, version: VERSION, loggedIn: Boolean(liAt) };
    }
    case 'GET_SESSION': {
      if (!(await senderIsLinked(sender))) return { ok: false, error: 'ORIGIN_NOT_LINKED' };
      return getSession();
    }
    case 'SEARCH_PEOPLE': {
      if (!(await senderIsLinked(sender))) return { ok: false, error: 'ORIGIN_NOT_LINKED' };
      return searchPeople(msg.payload);
    }
    case 'SEND_INVITE': {
      if (!(await senderIsLinked(sender))) return { ok: false, error: 'ORIGIN_NOT_LINKED' };
      return sendInvite(msg.payload);
    }
    case 'VIEW_PROFILE': {
      if (!(await senderIsLinked(sender))) return { ok: false, error: 'ORIGIN_NOT_LINKED' };
      return viewProfile(msg.payload);
    }
    case 'SEND_MESSAGE': {
      if (!(await senderIsLinked(sender))) return { ok: false, error: 'ORIGIN_NOT_LINKED' };
      return sendMessage(msg.payload);
    }
    case 'QUOTA': {
      if (!(await senderIsLinked(sender))) return { ok: false, error: 'ORIGIN_NOT_LINKED' };
      return { ok: true, quota: await getQuota() };
    }
    // From the popup (extension pages only)
    case 'STATUS': {
      if (!fromExtensionPage(sender)) return { ok: false, error: 'FORBIDDEN' };
      const { liAt } = await readCookies();
      return { ok: true, version: VERSION, loggedIn: Boolean(liAt), linked: await getLinkedOrigins() };
    }
    case 'PREPARE_LINK': {
      if (!fromExtensionPage(sender)) return { ok: false, error: 'FORBIDDEN' };
      const u = new URL(msg.origin);
      if (!/^https?:$/.test(u.protocol) || /(^|\.)linkedin\.com$/.test(u.hostname)) {
        return { ok: false, error: 'FAILED', message: 'This site cannot be linked.' };
      }
      await chrome.storage.local.set({ [PENDING_KEY]: u.origin });
      return { ok: true };
    }
    case 'LINK_ORIGIN': {
      if (!fromExtensionPage(sender)) return { ok: false, error: 'FORBIDDEN' };
      await linkOrigin(msg.origin);
      return { ok: true };
    }
    case 'UNLINK_ORIGIN': {
      if (!fromExtensionPage(sender)) return { ok: false, error: 'FORBIDDEN' };
      await unlinkOrigin(msg.origin);
      return { ok: true };
    }
    default:
      return { ok: false, error: 'UNKNOWN_MESSAGE' };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: 'FAILED', message: String(err?.message || err) }));
  return true; // async response
});

// Re-register bridges after install/update so linked sites keep working.
chrome.runtime.onInstalled.addListener(async () => {
  for (const origin of await getLinkedOrigins()) {
    try { await registerBridge(origin); } catch (_) { /* ignore */ }
  }
});
