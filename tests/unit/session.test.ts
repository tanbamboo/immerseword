import { beforeEach, describe, expect, it } from 'vitest';
import { createSessionService, type SessionStorageLike } from '../../src/background/session';
import type { IwSession } from '../../src/shared/types';

function fakeSessionStorage(): SessionStorageLike & { dump(): Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    async get(keys) {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (data.has(k)) out[k] = data.get(k);
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
    async remove(keys) {
      for (const k of keys) data.delete(k);
    },
    dump: () => data,
  };
}

describe('session service (ADR-0005)', () => {
  let storage: ReturnType<typeof fakeSessionStorage>;
  let service: ReturnType<typeof createSessionService>;
  beforeEach(() => {
    storage = fakeSessionStorage();
    service = createSessionService(storage);
  });

  it('starts a session in pass 1', async () => {
    const session = await service.start(7, 'https://example.com/a');
    expect(session.pass).toBe(1);
    expect(session.history).toHaveLength(1);
    expect(session.stats.lookups).toBe(0);
    expect(await service.get(7)).toMatchObject({ tabId: 7, pass: 1 });
  });

  it('transitions strictly 1 → 2 → 3 → done and stamps history', async () => {
    await service.start(7, 'https://example.com/a');
    const p2 = await service.transition(7, 'next');
    expect(p2?.pass).toBe(2);
    const p3 = await service.transition(7, 'next');
    expect(p3?.pass).toBe(3);
    const done = await service.transition(7, 'next');
    expect(done?.pass).toBe('done');
    // done is terminal
    const still = await service.transition(7, 'next');
    expect(still?.pass).toBe('done');
    expect(still?.history).toHaveLength(4);
    expect(still?.history[0]?.exitedAt).toBeGreaterThan(0);
    expect(still?.history[3]?.exitedAt).toBeUndefined();
  });

  it('reset clears the session', async () => {
    await service.start(7, 'https://example.com/a');
    expect(await service.transition(7, 'reset')).toBeNull();
    expect(await service.get(7)).toBeNull();
  });

  it('records lookups and classifications only for an active session', async () => {
    await service.recordLookup(7); // no session yet — ignored
    await service.start(7, 'https://example.com/a');
    await service.recordLookup(7);
    await service.recordLookup(7);
    await service.recordClassification(7, 'unknown');
    await service.recordClassification(7, 'known');
    const session = (await service.get(7)) as IwSession;
    expect(session.stats.lookups).toBe(2);
    expect(session.stats.classified.unknown).toBe(1);
    expect(session.stats.classified.known).toBe(1);
  });

  it('summarize computes per-pass durations from history', async () => {
    const session = await service.start(7, 'https://example.com/a');
    const past = Date.now() - 90_000;
    session.startedAt = past;
    session.history[0]!.enteredAt = past;
    await storage.set({ 'iw:session:7': session });
    await service.transition(7, 'next');
    const after = (await service.get(7))!;
    const summary = service.summarize(after);
    expect(summary.perPass).toHaveLength(2);
    expect(summary.perPass[0]!.ms).toBeGreaterThanOrEqual(89_000);
    expect(summary.perPass[0]!.pass).toBe(1);
    expect(summary.totalMs).toBeGreaterThanOrEqual(90_000);
  });

  it('end (tab close) removes the session', async () => {
    await service.start(9, 'https://example.com/b');
    await service.end(9);
    expect(await service.get(9)).toBeNull();
  });
});
