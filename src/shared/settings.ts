/**
 * Settings access (ADR-0001): persisted in chrome.storage.sync; every
 * context reads through this module so defaults are applied uniformly.
 * The storage argument is injectable for unit tests.
 */

import { DEFAULT_SETTINGS, type IwSettings } from './types';

/** Minimal storage surface both chrome.storage.sync and test fakes satisfy. */
export interface SyncStorageLike {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const KEY = 'iw:settings';

export async function getSettings(storage: SyncStorageLike): Promise<IwSettings> {
  const found = await storage.get([KEY]);
  const stored = found[KEY] as Partial<IwSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function setSettings(
  storage: SyncStorageLike,
  patch: Partial<IwSettings>,
): Promise<IwSettings> {
  const current = await getSettings(storage);
  const next = { ...current, ...patch };
  await storage.set({ [KEY]: next });
  return next;
}
