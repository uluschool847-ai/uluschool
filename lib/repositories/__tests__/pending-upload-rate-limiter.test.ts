import { describe, expect, it } from "vitest";

import {
  PendingUploadError,
  createPendingUploadRequestRateLimiter,
} from "@/lib/repositories/pending-upload-repository";

describe("pending upload request rate limiter", () => {
  it("uses a deterministic clock and resettable rolling window", () => {
    const limiter = createPendingUploadRequestRateLimiter({
      maxOwners: 4,
      maxRequests: 2,
      windowMs: 1_000,
    });
    const start = new Date("2026-07-16T12:00:00.000Z");

    limiter.consume("teacher-1", start);
    limiter.consume("teacher-1", start);
    expect(() => limiter.consume("teacher-1", start)).toThrow(PendingUploadError);

    limiter.reset();
    expect(() => limiter.consume("teacher-1", start)).not.toThrow();
    expect(() => limiter.consume("teacher-1", new Date(start.getTime() + 1_001))).not.toThrow();
  });

  it("evicts dormant owners by time and bounds the owner map with LRU eviction", () => {
    const limiter = createPendingUploadRequestRateLimiter({
      maxOwners: 2,
      maxRequests: 1,
      windowMs: 1_000,
    });
    const start = new Date("2026-07-16T12:00:00.000Z");

    limiter.consume("teacher-a", start);
    limiter.consume("teacher-b", new Date(start.getTime() + 1));
    expect(() => limiter.consume("teacher-a", new Date(start.getTime() + 2))).toThrow(
      PendingUploadError,
    );
    limiter.consume("teacher-c", new Date(start.getTime() + 3));
    expect(() => limiter.consume("teacher-b", new Date(start.getTime() + 4))).not.toThrow();

    expect(() => limiter.consume("teacher-b", new Date(start.getTime() + 1_005))).not.toThrow();
  });
});
