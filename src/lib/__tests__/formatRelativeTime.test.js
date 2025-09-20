import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRelativeTime } from "../formatRelativeTime.js";

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns human readable strings", () => {
    expect(formatRelativeTime("2024-01-01T00:00:00Z")).toBe("Just now");
    expect(formatRelativeTime("2023-12-31T23:59:00Z")).toBe("1 min ago");
    expect(formatRelativeTime("2023-12-31T22:00:00Z")).toBe("2 hours ago");
    expect(formatRelativeTime("2023-12-30T00:00:00Z")).toBe("2 days ago");
  });
});
