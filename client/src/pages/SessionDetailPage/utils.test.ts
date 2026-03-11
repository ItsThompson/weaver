import { formatRelativeTime } from "./utils";

describe("formatRelativeTime", () => {
  it.each([
    [0, "just now"],
    [30 * 60 * 1000, "30m ago"],
    [5 * 60 * 60 * 1000, "5h ago"],
    [3 * 24 * 60 * 60 * 1000, "3d ago"],
  ])('formats %i ms ago as "%s"', (ms, expected) => {
    expect(formatRelativeTime(new Date(Date.now() - ms))).toBe(expected);
  });
});
