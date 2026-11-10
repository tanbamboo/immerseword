/**
 * ImmerseWord content script entry. PR-0 scope: announce readiness on the
 * document element and answer PING handshakes from the side panel / service
 * worker. The tagging engine lands in PR-2 (ADR-0004).
 */
document.documentElement.dataset.iwReady = '1';

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const msg = message as { type?: string };
  if (msg?.type === 'PING') {
    sendResponse({ type: 'PONG' });
  }
  return false; // synchronous response; no async work in this handler
});
