/**
 * Side panel bootstrap. PR-0 scope: show the extension version, verify the
 * service worker is alive (the PING also wakes the lazy MV3 worker), and
 * detect whether the content script is running in the active tab —
 * re-checking whenever the user switches tabs. Stats, vocabulary, and pass
 * controls arrive in PR-4/PR-5.
 */

interface Pingable {
  type?: string;
}

async function pingServiceWorker(): Promise<boolean> {
  try {
    const response = (await chrome.runtime.sendMessage({ type: 'PING' })) as Pingable | null;
    return response?.type === 'PONG';
  } catch {
    return false;
  }
}

async function detectContentScript(tabId: number): Promise<boolean> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, { type: 'PING' })) as Pingable | null;
    return response?.type === 'PONG';
  } catch {
    return false;
  }
}

async function refresh(): Promise<void> {
  const statusEl = document.querySelector('#iw-status')!;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || tab.url?.startsWith('chrome')) {
    statusEl.textContent = 'Open an English web page to start reading.';
    return;
  }
  const alive = await detectContentScript(tab.id);
  statusEl.textContent = alive
    ? 'This page is ready — tagging engine arrives in the next update.'
    : 'This page has no content script (extension may not run here).';
}

async function init(): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  document.querySelector('#iw-version')!.textContent = `v${manifest.version}`;

  await pingServiceWorker(); // wakes the MV3 service worker if it idled out
  await refresh();

  chrome.tabs.onActivated.addListener(() => void refresh());
  // Exposed for E2E tests: explicit, deterministic re-detection.
  (window as unknown as { __iwRefresh: () => Promise<void> }).__iwRefresh = refresh;
}

void init();
