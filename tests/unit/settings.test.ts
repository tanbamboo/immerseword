import { describe, expect, it } from 'vitest';
import { getSettings, setSettings, type SyncStorageLike } from '../../src/shared/settings';
import { DEFAULT_SETTINGS } from '../../src/shared/types';

function fakeSync(): SyncStorageLike & { dump(): Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    async get(keys: string[]) {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (data.has(k)) out[k] = data.get(k);
      return out;
    },
    async set(items: Record<string, unknown>) {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
    dump: () => data,
  };
}

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings(fakeSync())).toEqual(DEFAULT_SETTINGS);
  });

  it('merges stored partial settings over defaults', async () => {
    const storage = fakeSync();
    await storage.set({ 'iw:settings': { level: '10k', popoverWidth: 640 } });
    const settings = await getSettings(storage);
    expect(settings.level).toBe('10k');
    expect(settings.popoverWidth).toBe(640);
    expect(settings.taggingEnabled).toBe(DEFAULT_SETTINGS.taggingEnabled);
  });

  it('patches and persists settings', async () => {
    const storage = fakeSync();
    const next = await setSettings(storage, { onlineFallback: false });
    expect(next.onlineFallback).toBe(false);
    const again = await getSettings(storage);
    expect(again.onlineFallback).toBe(false);
    expect(again.level).toBe('5k');
  });
});
