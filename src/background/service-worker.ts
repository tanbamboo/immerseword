/**
 * ImmerseWord service worker (ADR-0001). Owns:
 *  - side-panel open behavior (action click)
 *  - dictionary lookups via the hybrid service (ADR-0002)
 *  - settings access
 *  - 3-pass session state machine (ADR-0005) — single writer, broadcast hub
 *
 * No ad-hoc global state; the lazily cached core dictionary is immutable
 * derived data, reloadable after worker restart.
 */

import { createDictionaryService, type CoreDictionary } from './dictionary';
import { createSessionService } from './session';
import { getSettings } from '../shared/settings';
import type { IwMessage, IwSession } from '../shared/types';

void chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err: unknown) => console.error('[ImmerseWord] sidePanel behavior failed:', err));

/* Context menu: "Look up '<selection>'" on any selected text (PRD F2/U8). */
const LOOKUP_MENU_ID = 'iw-lookup-selection';

chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus.removeAll().then(() => {
    void chrome.contextMenus.create({
      id: LOOKUP_MENU_ID,
      title: 'Look up "%s" with ImmerseWord',
      contexts: ['selection'],
    });
    void chrome.contextMenus.create({
      id: 'iw-reader-open',
      title: 'Immerse this page (reader mode)',
      contexts: ['page'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  // Both actions show immediate in-page feedback (popover / reader overlay).
  if (info.menuItemId === LOOKUP_MENU_ID) {
    const lemma = (info.selectionText ?? '').trim().toLowerCase().split(/\s+/)[0] ?? '';
    if (!lemma) return;
    void chrome.tabs
      .sendMessage(tab.id, { type: 'IW_SHOW_LOOKUP', lemma } satisfies IwMessage)
      .catch((err: unknown) => console.warn('[ImmerseWord] lookup message failed:', err));
  } else if (info.menuItemId === 'iw-reader-open') {
    void chrome.tabs
      .sendMessage(tab.id, { type: 'READER_TOGGLE' } satisfies IwMessage)
      .catch((err: unknown) => console.warn('[ImmerseWord] reader message failed:', err));
  }
});

/* ── services ──────────────────────────────────────────────────────────── */

const dictionary = createDictionaryService({
  fetchImpl: (url, init) => fetch(url, init),
  storage: chrome.storage.local,
  loadCore: async (): Promise<CoreDictionary | null> => {
    const res = await fetch(chrome.runtime.getURL('data/dict-core.json'));
    if (!res.ok) return null;
    return (await res.json()) as CoreDictionary;
  },
  getSettings: () => getSettings(chrome.storage.sync),
});

const sessions = createSessionService(chrome.storage.session);

async function broadcastSession(tabId: number, session: IwSession | null): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SESSION_UPDATED', session } satisfies IwMessage);
  } catch {
    // Content script not present (panel started a session for a fresh tab) —
    // the side panel still sees the change via storage.onChanged.
  }
}

/* Sessions die with their tab (ADR-0005). */
chrome.tabs.onRemoved.addListener((tabId) => {
  void sessions.end(tabId);
});

/* ── message router ────────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const msg = message as IwMessage;

  if (msg?.type === 'PING') {
    sendResponse({ type: 'PONG' });
    return false;
  }

  if (msg?.type === 'GET_SETTINGS') {
    void getSettings(chrome.storage.sync).then((settings) => sendResponse(settings));
    return true; // async response
  }

  if (msg?.type === 'DICT_LOOKUP') {
    const tabId = sender.tab?.id;
    void dictionary.lookup(msg.lemma).then((result) => {
      // Lookups count toward an active session's study stats.
      if (tabId !== undefined) void sessions.recordLookup(tabId);
      sendResponse({
        type: 'DICT_RESULT',
        lemma: result.lemma,
        entry: result.entry,
        source: result.source,
      });
    });
    return true; // async response
  }

  /* Session messages arrive from the content script (sender.tab set), or
     from the side panel, which names its target tab explicitly (an SW-side
     "currentWindow" guess is unreliable). */
  if (msg?.type === 'SESSION_START' || msg?.type === 'SESSION_TRANSITION' || msg?.type === 'SESSION_GET') {
    (async () => {
      const tabId = msg.tabId ?? sender.tab?.id ?? (await activeTabId());
      if (tabId === null || tabId === undefined) {
        sendResponse(null);
        return;
      }
      if (msg.type === 'SESSION_START') {
        sendResponse(await sessions.start(tabId, msg.url));
        await broadcastSession(tabId, await sessions.get(tabId));
      } else if (msg.type === 'SESSION_TRANSITION') {
        const session = await sessions.transition(tabId, msg.action);
        sendResponse(session);
        await broadcastSession(tabId, session);
      } else {
        sendResponse(await sessions.get(tabId));
      }
    })();
    return true; // async response
  }

  if (msg?.type === 'SESSION_WORD_CLASSIFIED') {
    if (sender.tab?.id !== undefined) {
      void sessions.recordClassification(sender.tab.id, msg.status);
    }
    return false;
  }

  return false;
});

async function activeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id ?? null;
}
