// CRM LinkedIn Connector - service worker.
//
// Reads the LinkedIn session (li_at + JSESSIONID) from the user's own logged-in
// browser and hands it ONLY to CRM sites the user explicitly linked from the popup.
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
  const cookies = await chrome.cookies.getAll({ domain: 'linkedin.com' });
  const find = (name) => cookies.find((c) => c.name === name);
  return {
    liAt: find('li_at')?.value || '',
    jsessionId: (find('JSESSIONID')?.value || '').replace(/^["']|["']$/g, ''),
    rawCookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
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
  return { ok: true, liAt: c.liAt, jsessionId: c.jsessionId, rawCookie: c.rawCookie, profile };
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
