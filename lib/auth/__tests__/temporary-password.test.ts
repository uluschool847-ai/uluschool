import { describe, expect, it } from "vitest";

import { generateTemporaryPassword } from "@/lib/auth/temporary-password";

describe("generateTemporaryPassword", () => {
  it("returns a 20-character URL-safe password", () => {
    expect(generateTemporaryPassword()).toMatch(/^[A-Za-z0-9_-]{20}$/);
  });

  it("does not reuse one shared value", () => {
    const values = new Set(Array.from({ length: 32 }, generateTemporaryPassword));

    expect(values.size).toBe(32);
  });
});
