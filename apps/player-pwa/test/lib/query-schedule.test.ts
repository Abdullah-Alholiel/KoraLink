import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  LIST_REFRESH_MS,
  listRefetchInterval,
  deepestPageParam,
} from '@/lib/query-schedule';

describe('listRefetchInterval (list freshness poll)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('polls every 45s on the first page (offset 0 or page 1) while visible', () => {
    expect(LIST_REFRESH_MS).toBe(45_000);
    expect(listRefetchInterval({ isFetching: false, pageParam: 0 })).toBe(45_000);
    expect(listRefetchInterval({ isFetching: false, pageParam: 1 })).toBe(45_000);
  });

  it('pauses while a fetch is in flight', () => {
    expect(listRefetchInterval({ isFetching: true, pageParam: 0 })).toBe(false);
    expect(listRefetchInterval({ isFetching: true, pageParam: 1 })).toBe(false);
  });

  it('disarms once the user paged deeper (F4 fan-out guard)', () => {
    expect(listRefetchInterval({ isFetching: false, pageParam: 2 })).toBe(false);
    expect(listRefetchInterval({ isFetching: false, pageParam: 30 })).toBe(false);
    expect(listRefetchInterval({ isFetching: false, pageParam: 50 })).toBe(false);
  });

  it('pauses while the document is hidden', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    expect(listRefetchInterval({ isFetching: false, pageParam: 0 })).toBe(false);
  });
});

describe('deepestPageParam', () => {
  it('returns 0 before any page has loaded', () => {
    expect(deepestPageParam(undefined)).toBe(0);
    expect(deepestPageParam({ pageParams: [] })).toBe(0);
  });

  it('returns the pageParam of the last loaded page', () => {
    expect(deepestPageParam({ pageParams: [1] })).toBe(1);
    expect(deepestPageParam({ pageParams: [0, 50, 100] })).toBe(100);
  });
});
