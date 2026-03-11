import { formatDuration } from "./utils";

describe("formatDuration", () => {
  it("returns pending when no end time", () => {
    expect(formatDuration("2026-01-01T00:00:00.000Z")).toBe("pending");
  });

  it("formats milliseconds for durations under 1 second", () => {
    expect(
      formatDuration("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.500Z"),
    ).toBe("500ms");
  });

  it("formats seconds for durations over 1 second", () => {
    expect(
      formatDuration("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:01.500Z"),
    ).toBe("1.5s");
  });

  it("handles zero duration", () => {
    expect(
      formatDuration("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
    ).toBe("0ms");
  });

  it("rounds seconds to one decimal place", () => {
    expect(
      formatDuration("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:02.333Z"),
    ).toBe("2.3s");
  });
});
