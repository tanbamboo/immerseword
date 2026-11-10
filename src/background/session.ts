/**
 * 3-pass session state machine (ADR-0005). One session per tab, owned and
 * written exclusively by the service worker, persisted in
 * chrome.storage.session (survives worker restarts, cleared when the
 * browser closes — exactly session semantics). Transitions are strictly
 * linear: 1 → 2 → 3 → done, plus reset from anywhere.
 */

import type { IwPass, IwSession, WordStatus } from '../shared/types';

export interface SessionStorageLike {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

const keyFor = (tabId: number): string => `iw:session:${tabId}`;

function emptyStats(): IwSession['stats'] {
  return { lookups: 0, classified: { known: 0, learning: 0, unknown: 0, ignored: 0 } };
}

export function createSessionService(storage: SessionStorageLike) {
  async function read(tabId: number): Promise<IwSession | null> {
    const found = await storage.get([keyFor(tabId)]);
    return (found[keyFor(tabId)] as IwSession | undefined) ?? null;
  }

  async function write(session: IwSession): Promise<void> {
    await storage.set({ [keyFor(session.tabId)]: session });
  }

  return {
    async start(tabId: number, url: string): Promise<IwSession> {
      const now = Date.now();
      const session: IwSession = {
        tabId,
        url,
        startedAt: now,
        pass: 1,
        history: [{ pass: 1, enteredAt: now }],
        stats: emptyStats(),
      };
      await write(session);
      return session;
    },

    get: (tabId: number) => read(tabId),

    /** Linear advance (next) or teardown (reset). Returns null when gone. */
    async transition(tabId: number, action: 'next' | 'reset'): Promise<IwSession | null> {
      if (action === 'reset') {
        await storage.remove([keyFor(tabId)]);
        return null;
      }
      const session = await read(tabId);
      if (!session) return null;

      const order: IwPass[] = [1, 2, 3, 'done'];
      const idx = order.indexOf(session.pass);
      if (idx < 0 || idx === order.length - 1) return session; // already done — no-op

      const now = Date.now();
      const current = session.history[session.history.length - 1];
      if (current && current.exitedAt === undefined) current.exitedAt = now;

      session.pass = order[idx + 1]!;
      session.history.push({ pass: session.pass, enteredAt: now });
      await write(session);
      return session;
    },

    async recordLookup(tabId: number): Promise<void> {
      const session = await read(tabId);
      if (!session) return;
      session.stats.lookups += 1;
      await write(session);
    },

    async recordClassification(tabId: number, status: WordStatus): Promise<void> {
      const session = await read(tabId);
      if (!session) return;
      session.stats.classified[status] += 1;
      await write(session);
    },

    async end(tabId: number): Promise<void> {
      await storage.remove([keyFor(tabId)]);
    },

    /** Session summary for the UI; durations per pass from history. */
    summarize(session: IwSession): {
      totalMs: number;
      perPass: Array<{ pass: IwPass; ms: number }>;
      stats: IwSession['stats'];
    } {
      const now = Date.now();
      const perPass = session.history.map((interval, i) => {
        const end = interval.exitedAt ?? (i === session.history.length - 1 ? now : interval.enteredAt);
        return { pass: interval.pass, ms: Math.max(0, end - interval.enteredAt) };
      });
      return { totalMs: now - session.startedAt, perPass, stats: session.stats };
    },
  };
}
