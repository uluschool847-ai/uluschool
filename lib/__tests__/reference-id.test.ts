import { describe, expect, it } from "vitest";

type ReferenceIdModule = {
  generateSubmissionReferenceId: (input: {
    prefix: "MS";
    year: number;
    submissionId?: number | string;
  }) => string;
};

async function loadReferenceIdModule() {
  const specifier = "@/lib/reference-id";
  return import(/* @vite-ignore */ specifier) as Promise<ReferenceIdModule>;
}

describe("submission reference ID formatting", () => {
  it("formats a submission reference string using prefix, year, and padded id", async () => {
    const { generateSubmissionReferenceId } = await loadReferenceIdModule();

    expect(
      generateSubmissionReferenceId({
        prefix: "MS",
        year: 2026,
        submissionId: 42,
      }),
    ).toBe("MS-2026-0042");
  });

  it("generates non-placeholder references when no database id is available yet", async () => {
    const { generateSubmissionReferenceId } = await loadReferenceIdModule();

    const referenceId = generateSubmissionReferenceId({
      prefix: "MS",
      year: 2026,
    });

    expect(referenceId).toMatch(/^MS-2026-\d{4,}$/);
    expect(referenceId).not.toBe("MS-2026-0000");
  });
});
