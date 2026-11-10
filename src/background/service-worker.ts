/**
 * ImmerseWord service worker (ADR-0001). Owns:
 *  - side-panel open behavior (action click)
 *  - dictionary lookups via the hybrid service (ADR-0002)
 *  - settings access
 *  - (later PRs: context menu, session state)
 *
 * No session/global mutable state; the lazily cached core dictionary is
 * immutable derived data, reloadable after worker restart.
 */

import { createDictionaryService, type CoreDictionary } from './dictionary';
import { getSettings } from '../shared/settings';
import type { IwMessage } from '../shared/types';

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
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== LOOKUP_MENU_ID || !tab?.id) return;
  const lemma = (info.selectionText ?? '').trim().toLowerCase().split(/\s+/)[0] ?? '';
  if (!lemma) return;
  // The popover that opens in the tab is the user feedback (skill rule 9).
  void chrome.tabs.sendMessage(tab.id, { type: 'IW_SHOW_LOOKUP', lemma } satisfies IwMessage).catch(
    (err: unknown) => console.warn('[ImmerseWord] lookup message failed:', err),
  );
});

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

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
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
    void dictionary
      .lookup(msg.lemma)
      .then((result) =>
        sendResponse({ type: 'DICT_RESULT', lemma: result.lemma, entry: result.entry, source: result.source }),
      );
    return true; // async response
  }

  return false;
});
