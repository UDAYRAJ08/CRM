import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary.reloadOnce', () => {
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockReset();
    Object.defineProperty(window, 'location', { value: { reload }, configurable: true });
  });

  it('reloads the first time and refuses the second (no reload loop)', () => {
    expect(ErrorBoundary.reloadOnce()).toBe(true);
    expect(ErrorBoundary.reloadOnce()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads on a chunk-load error caught by the boundary', () => {
    const boundary = new ErrorBoundary({ children: null });
    boundary.componentDidCatch(new Error('Failed to fetch dynamically imported module: /assets/x.js'), { componentStack: '' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload on ordinary errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boundary = new ErrorBoundary({ children: null });
    boundary.componentDidCatch(new Error('boom'), { componentStack: '' });
    expect(reload).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
