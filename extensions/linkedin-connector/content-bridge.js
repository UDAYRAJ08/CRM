// Injected only on CRM sites the user linked from the extension popup.
// Relays two requests from the CRM page to the extension service worker and posts
// the answer back to the same page. The service worker re-checks the origin.

// Guard against double injection (registered script + manual injection into an open tab).
if (window.__crmLinkedInBridge) throw new Error('crm-linkedin-bridge already loaded');
window.__crmLinkedInBridge = true;

const PAGE = 'crm-page';
const EXT = 'crm-linkedin-extension';
const ALLOWED = new Set(['PING', 'GET_SESSION', 'SEARCH_PEOPLE', 'SEND_INVITE', 'QUOTA']);

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.source !== PAGE || !ALLOWED.has(data.type)) return;

  chrome.runtime.sendMessage({ type: data.type, payload: data.payload }, (response) => {
    const reply = chrome.runtime.lastError
      ? { ok: false, error: 'EXTENSION_UNAVAILABLE' }
      : response || { ok: false, error: 'NO_RESPONSE' };
    window.postMessage({ source: EXT, requestId: data.requestId, ...reply }, window.location.origin);
  });
});
