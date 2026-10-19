// Injected only on CRM sites the user linked from the extension popup.
// Relays the CRM page's requests to the extension service worker and posts
// the answer back to the same page. The service worker re-checks the origin.

// Wrapped in a block so a second injection does not hit "already declared" errors.
{
  const PAGE = 'crm-page';
  const EXT = 'crm-linkedin-extension';
  const ALLOWED = new Set(['PING', 'GET_SESSION', 'SEARCH_PEOPLE', 'SEND_INVITE', 'QUOTA', 'VIEW_PROFILE', 'SEND_MESSAGE']);

  // A copy left from before an extension reload or update can no longer reach the
  // extension ("Extension context invalidated"). Stop it so this copy answers instead.
  // This also covers double injection (registered script + manual injection into an open tab).
  window.__crmLinkedInBridgeStop?.();

  const onMessage = (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== PAGE || !ALLOWED.has(data.type)) return;

    try {
      chrome.runtime.sendMessage({ type: data.type, payload: data.payload }, (response) => {
        const reply = chrome.runtime.lastError
          ? { ok: false, error: 'EXTENSION_UNAVAILABLE' }
          : response || { ok: false, error: 'NO_RESPONSE' };
        window.postMessage({ source: EXT, requestId: data.requestId, ...reply }, window.location.origin);
      });
    } catch (_) {
      // The extension was reloaded: this copy is orphaned and must stay silent.
      window.removeEventListener('message', onMessage);
    }
  };

  window.addEventListener('message', onMessage);
  window.__crmLinkedInBridgeStop = () => window.removeEventListener('message', onMessage);
}
