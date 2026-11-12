/**
 * Options page: full settings, reader defaults, and data import/export.
 * Writes go straight to chrome.storage — the content script and side panel
 * react through their storage.onChanged listeners.
 */

import { getSettings, setSettings, type SyncStorageLike } from '../shared/settings';
import { createVocabStore, type VocabEntry } from '../shared/vocab';
import { buildExportPayload, parseImportPayload, type ReaderPrefsShape } from '../shared/dataio';
import { DEFAULT_SETTINGS, type LevelBand, type PopoverWidth, type TagStyle, type IwSettings } from '../shared/types';
import type { ReaderPrefs } from '../content/reader';

const sync = chrome.storage.sync as SyncStorageLike;
const vocab = createVocabStore(chrome.storage.local);

const READER_PREFS_KEY = 'iw:readerPrefs';
const DEFAULT_READER: ReaderPrefs = { theme: 'sepia', fontFamily: 'serif', fontSize: 19, width: 'medium' };

function el<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`missing element ${selector}`);
  return found;
}

function status(message: string, isError = false): void {
  const node = el('#opt-status');
  node.textContent = message;
  node.classList.toggle('err', isError);
}

async function loadReaderPrefs(): Promise<ReaderPrefs> {
  const found = await chrome.storage.sync.get([READER_PREFS_KEY]);
  return { ...DEFAULT_READER, ...(found[READER_PREFS_KEY] as Partial<ReaderPrefs> | undefined ?? {}) };
}

async function saveReaderPrefs(prefs: ReaderPrefs): Promise<void> {
  await chrome.storage.sync.set({ [READER_PREFS_KEY]: prefs });
}

async function refresh(): Promise<void> {
  const settings = await getSettings(sync);
  (el('#opt-level') as HTMLSelectElement).value = settings.level;
  (el('#opt-tagging') as HTMLInputElement).checked = settings.taggingEnabled;
  (el('#opt-pass1-marks') as HTMLInputElement).checked = settings.pass1ShowMarks;
  (el('#opt-online') as HTMLInputElement).checked = settings.onlineFallback;
  (el('#opt-tag-style') as HTMLSelectElement).value = settings.tagStyle;
  (el('#opt-popover-width') as HTMLSelectElement).value = String(settings.popoverWidth);

  const prefs = await loadReaderPrefs();
  (el('#opt-theme') as HTMLSelectElement).value = prefs.theme;
  (el('#opt-font') as HTMLSelectElement).value = prefs.fontFamily;
  (el('#opt-size') as HTMLInputElement).value = String(prefs.fontSize);
  (el('#opt-width') as HTMLSelectElement).value = prefs.width;
}

function bindSettings(): void {
  el('#opt-level').addEventListener('change', async (event) => {
    await setSettings(sync, { level: (event.target as HTMLSelectElement).value as LevelBand });
    status('Level saved — open pages retag automatically.');
  });
  el('#opt-tag-style').addEventListener('change', async (event) => {
    await setSettings(sync, { tagStyle: (event.target as HTMLSelectElement).value as TagStyle });
    status('Tag style saved — open pages restyle instantly.');
  });
  el('#opt-popover-width').addEventListener('change', async (event) => {
    await setSettings(sync, {
      popoverWidth: Number((event.target as HTMLSelectElement).value) as PopoverWidth,
    });
    status('Popover width saved — applies to the next popover.');
  });
  for (const [id, key] of [
    ['#opt-tagging', 'taggingEnabled'],
    ['#opt-pass1-marks', 'pass1ShowMarks'],
    ['#opt-online', 'onlineFallback'],
  ] as const) {
    el(id).addEventListener('change', async (event) => {
      await setSettings(sync, { [key]: (event.target as HTMLInputElement).checked } as Partial<IwSettings>);
      status('Settings saved.');
    });
  }

  const readerChange = async (patch: Partial<ReaderPrefs>) => {
    const prefs = { ...(await loadReaderPrefs()), ...patch };
    await saveReaderPrefs(prefs);
    status('Reader defaults saved.');
  };
  el('#opt-theme').addEventListener('change', (e) =>
    void readerChange({ theme: (e.target as HTMLSelectElement).value as ReaderPrefs['theme'] }),
  );
  el('#opt-font').addEventListener('change', (e) =>
    void readerChange({ fontFamily: (e.target as HTMLSelectElement).value as ReaderPrefs['fontFamily'] }),
  );
  el('#opt-size').addEventListener('input', (e) =>
    void readerChange({ fontSize: Number((e.target as HTMLInputElement).value) }),
  );
  el('#opt-width').addEventListener('change', (e) =>
    void readerChange({ width: (e.target as HTMLSelectElement).value as ReaderPrefs['width'] }),
  );
}

function bindData(): void {
  el('#opt-export').addEventListener('click', async () => {
    const payload = buildExportPayload({
      settings: await getSettings(sync),
      readerPrefs: (await loadReaderPrefs()) as ReaderPrefsShape,
      vocabulary: await vocab.all(),
    });
    (el('#opt-io') as HTMLTextAreaElement).value = JSON.stringify(payload, null, 2);
    status(`Exported ${Object.keys(payload.vocabulary).length} words. Copy this text somewhere safe.`);
  });

  el('#opt-import').addEventListener('click', async () => {
    const raw = (el('#opt-io') as HTMLTextAreaElement).value;
    const result = parseImportPayload(raw);
    if (!result.ok) {
      status(result.error, true);
      return;
    }
    const existing = await vocab.all();
    const merged: Record<string, VocabEntry> = { ...existing, ...result.vocabulary };
    await chrome.storage.local.set({ 'iw:vocab': merged });
    if (result.settings && Object.keys(result.settings).length > 0) {
      await setSettings(sync, result.settings);
    }
    await refresh();
    status(`Imported ${result.imported} words.`);
  });

  el('#opt-clear-cache').addEventListener('click', async () => {
    await chrome.storage.local.remove(['iw:dictCache']);
    status('Dictionary cache cleared — lookups will re-fetch as needed.');
  });

  el('#opt-reset-vocab').addEventListener('click', async () => {
    if (!window.confirm('Delete your entire vocabulary? This cannot be undone.')) return;
    await chrome.storage.local.remove(['iw:vocab']);
    status('Vocabulary reset.');
  });
}

async function init(): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  el('#opt-version').textContent = `v${manifest.version} — your words stay on this device`;
  el('#opt-about').textContent =
    'ImmerseWord bundles an offline monolingual dictionary derived from WordNet 3.1 ' +
    '(Princeton University WordNet License) and a corpus frequency list (MIT). ' +
    'See public/data/ATTRIBUTION.md in the source repository for full license texts. ' +
    'The only network request the extension can make is to api.dictionaryapi.dev for ' +
    'words missing from the offline dictionary — disable it under Reading settings.';

  bindSettings();
  bindData();
  await refresh();
}

void init();
