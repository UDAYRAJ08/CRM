import { describe, it, expect, vi } from 'vitest';
import { fetchAllPages } from '../supabase';

const rows = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({ id: offset + i }));

describe('fetchAllPages', () => {
  it('returns a single short page without extra requests', async () => {
    const page = vi.fn().mockResolvedValue({ data: rows(10), error: null });
    const { data, error } = await fetchAllPages(page);
    expect(error).toBeNull();
    expect(data).toHaveLength(10);
    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith(0, 999);
  });

  it('keeps fetching until a short page, so lists over 1000 rows are not truncated', async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: rows(1000, 0), error: null })
      .mockResolvedValueOnce({ data: rows(1000, 1000), error: null })
      .mockResolvedValueOnce({ data: rows(250, 2000), error: null });
    const { data } = await fetchAllPages(page);
    expect(data).toHaveLength(2250);
    expect(page.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('stops on an empty page after an exact multiple of the page size', async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: rows(1000), error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const { data } = await fetchAllPages(page);
    expect(data).toHaveLength(1000);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it('returns the error and no partial data if any page fails', async () => {
    const boom = new Error('boom');
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: rows(1000), error: null })
      .mockResolvedValueOnce({ data: null, error: boom });
    const result = await fetchAllPages(page);
    expect(result.data).toBeNull();
    expect(result.error).toBe(boom);
  });
});
