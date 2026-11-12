import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/types';

describe('toolchain sanity (PR-0)', () => {
  it('defaults compile and carry the product defaults', () => {
    expect(DEFAULT_SETTINGS.level).toBe('5k');
    expect(DEFAULT_SETTINGS.taggingEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.onlineFallback).toBe(true);
    expect(DEFAULT_SETTINGS.popoverWidth).toBe(480);
  });
});
