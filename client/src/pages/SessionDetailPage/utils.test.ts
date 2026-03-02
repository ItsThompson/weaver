import { formatRelativeTime } from './utils';

describe('formatRelativeTime', () => {
  it('returns "just now" for recent dates', () => {
    const now = new Date();
    expect(formatRelativeTime(now)).toBe('just now');
  });

  it('returns minutes ago for dates within an hour', () => {
    const date = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    expect(formatRelativeTime(date)).toBe('30m ago');
  });

  it('returns hours ago for dates within a day', () => {
    const date = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago
    expect(formatRelativeTime(date)).toBe('5h ago');
  });

  it('returns days ago for older dates', () => {
    const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    expect(formatRelativeTime(date)).toBe('3d ago');
  });
});