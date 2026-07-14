import { beforeEach, describe, expect, it, vi } from "vitest";

const hashPasswordMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/password", () => ({
  hashPassword: hashPasswordMock,
  verifyPassword: vi.fn(),
}));

describe("generateBackupCodes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hashPasswordMock.mockImplementation(async (code: string) => `hash:${code}`);
  });

  it("retries collisions and returns exactly eight unique plain codes with matching hashes", async () => {
    const generatedCodes = [
      "CODE-1",
      "CODE-1",
      "CODE-2",
      "CODE-3",
      "CODE-4",
      "CODE-5",
      "CODE-6",
      "CODE-7",
      "CODE-8",
    ];
    const generateCode = vi.fn(() => generatedCodes.shift() ?? "UNEXPECTED");

    const { generateBackupCodes } = await import("@/lib/auth/two-factor");
    const result = await generateBackupCodes(generateCode);

    expect(result.plain).toHaveLength(8);
    expect(new Set(result.plain)).toHaveLength(8);
    expect(result.hashed).toEqual(result.plain.map((code) => `hash:${code}`));
    expect(hashPasswordMock).toHaveBeenCalledTimes(8);
    expect(generateCode).toHaveBeenCalledTimes(9);
  });
});
