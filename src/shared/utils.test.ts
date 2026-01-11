// ============================================================================
// UTILITY FUNCTION TESTS
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatNumber,
  formatCost,
  formatDuration,
  formatRelativeTime,
  truncate,
  debounce,
  throttle,
  generateId,
  clamp,
  groupBy,
  sortBy,
  decodeProjectName,
} from './utils';

describe('formatNumber', () => {
  it('formats small numbers without abbreviation', () => {
    expect(formatNumber(123)).toBe('123');
    expect(formatNumber(999)).toBe('999');
  });

  it('formats thousands with comma separator', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1500)).toBe('1,500');
    expect(formatNumber(12345)).toBe('12,345');
    expect(formatNumber(999999)).toBe('999,999');
  });

  it('formats millions with M suffix', () => {
    expect(formatNumber(1000000)).toBe('1.00M');
    expect(formatNumber(2500000)).toBe('2.50M');
  });

  it('formats billions with B suffix', () => {
    expect(formatNumber(1000000000)).toBe('1.00B');
    expect(formatNumber(1500000000)).toBe('1.50B');
  });

  it('formats trillions with T suffix', () => {
    expect(formatNumber(1000000000000)).toBe('1.00T');
    expect(formatNumber(2500000000000)).toBe('2.50T');
  });

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('handles null and undefined', () => {
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(undefined)).toBe('0');
  });
});

describe('formatCost', () => {
  it('formats cost with dollar sign and 2 decimal places', () => {
    expect(formatCost(1.2345)).toBe('$1.23');
    expect(formatCost(0.0001)).toBe('$0.00');
    expect(formatCost(100)).toBe('$100.00');
    expect(formatCost(3.567)).toBe('$3.57');
  });

  it('formats large costs with thousands separators', () => {
    expect(formatCost(1234.56)).toBe('$1,234.56');
    expect(formatCost(1234567.89)).toBe('$1,234,567.89');
    expect(formatCost(12345)).toBe('$12,345.00');
  });

  it('handles zero cost', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('handles null and undefined', () => {
    expect(formatCost(null)).toBe('$0.00');
    expect(formatCost(undefined)).toBe('$0.00');
  });
});

describe('formatDuration', () => {
  it('formats seconds under a minute', () => {
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(5)).toBe('5s');
    expect(formatDuration(59)).toBe('59s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0s');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats recent times as "just now"', () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe('just now');
  });

  it('formats minutes ago', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinutesAgo)).toBe('5 minutes ago');
  });

  it('formats hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toBe('2 hours ago');
  });

  it('formats days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeDaysAgo)).toBe('3 days ago');
  });
});

describe('truncate', () => {
  it('truncates strings longer than max length', () => {
    // truncate(str, maxLength) cuts at maxLength-3 and adds '...'
    expect(truncate('Hello World', 8)).toBe('Hello...');
    expect(truncate('This is a long string', 13)).toBe('This is a ...');
  });

  it('does not truncate strings shorter than max length', () => {
    expect(truncate('Hello', 10)).toBe('Hello');
    expect(truncate('Hi', 5)).toBe('Hi');
  });

  it('handles edge cases', () => {
    expect(truncate('', 5)).toBe('');
    expect(truncate('Hello', 5)).toBe('Hello');
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays function execution', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets delay on subsequent calls', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes immediately on first call', () => {
    const fn = vi.fn();
    const throttledFn = throttle(fn, 100);

    throttledFn();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throttles subsequent calls', () => {
    const fn = vi.fn();
    const throttledFn = throttle(fn, 100);

    throttledFn();
    throttledFn();
    throttledFn();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    throttledFn();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('generateId', () => {
  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('generates string IDs', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('clamp', () => {
  it('clamps values within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('handles edge values', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe('groupBy', () => {
  it('groups items by key', () => {
    const items = [
      { type: 'a', value: 1 },
      { type: 'b', value: 2 },
      { type: 'a', value: 3 },
    ];
    const grouped = groupBy(items, 'type');

    expect(grouped).toEqual({
      a: [{ type: 'a', value: 1 }, { type: 'a', value: 3 }],
      b: [{ type: 'b', value: 2 }],
    });
  });

  it('handles empty arrays', () => {
    const result = groupBy([] as { type: string }[], 'type');
    expect(result).toEqual({});
  });
});

describe('sortBy', () => {
  it('sorts items by key', () => {
    const items = [{ name: 'c' }, { name: 'a' }, { name: 'b' }];
    const sorted = sortBy(items, 'name');

    expect(sorted).toEqual([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
  });

  it('sorts by multiple keys', () => {
    const items = [
      { category: 'a', value: 2 },
      { category: 'b', value: 1 },
      { category: 'a', value: 1 },
    ];
    const sorted = sortBy(items, 'category', 'value');

    expect(sorted).toEqual([
      { category: 'a', value: 1 },
      { category: 'a', value: 2 },
      { category: 'b', value: 1 },
    ]);
  });
});

describe('decodeProjectName', () => {
  it('decodes encoded project paths', () => {
    // Windows path encoded style
    const result = decodeProjectName('C--Users-dev-projects-myapp');
    expect(result).toBe('myapp');
  });

  it('handles simple strings', () => {
    expect(decodeProjectName('myproject')).toBe('myproject');
    expect(decodeProjectName('test')).toBe('test');
  });

  it('handles null/undefined', () => {
    expect(decodeProjectName(null)).toBe('Unknown');
    expect(decodeProjectName(undefined)).toBe('Unknown');
  });

  it('decodes with projectsRoot parameter', () => {
    const result = decodeProjectName(
      'C--Users-buzzkill-Documents-work-api',
      'C:\\Users\\buzzkill\\Documents'
    );
    expect(result).toBe('work/api');
  });
});
