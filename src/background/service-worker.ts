/**
 * ImmerseWord service worker. PR-0 scope: register side-panel behavior and
 * answer PING with PONG. Dictionary service, session state, and context
 * menus arrive in later PRs. No global mutable state (ADR-0001).
 */

void chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err: unknown) => console.error('[ImmerseWord] sidePanel behavior failed:', err));

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const msg = message as { type?: string };
  if (msg?.type === 'PING') {
    sendResponse({ type: 'PONG' });
  }
  // Only this listener responds; no `return true` needed for the sync path.
  return false;
});
