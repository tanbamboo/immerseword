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
