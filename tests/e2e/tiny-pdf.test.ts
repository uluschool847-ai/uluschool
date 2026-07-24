import { describe, expect, it } from "vitest";

import { createTinyPdf } from "@/e2e/helpers/tiny-pdf";

describe("tiny PDF fixture", () => {
  it("builds a deterministic PDF with a valid page tree, xref, trailer, and startxref", () => {
    const first = createTinyPdf();
    const second = createTinyPdf();
    const source = first.toString("latin1");

    expect(first.equals(second)).toBe(true);
    expect(first.length).toBeLessThan(1_024);
    expect(source.startsWith("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")).toBe(true);
    expect(source).toContain("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>");
    expect(source).toContain("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    expect(source).toContain(
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>",
    );
    expect(source).toContain("4 0 obj\n<< /Length 0 >>\nstream\n\nendstream");

    const startXrefMatch = /startxref\n(\d+)\n%%EOF\n$/.exec(source);
    expect(startXrefMatch).not.toBeNull();
    const xrefOffset = Number(startXrefMatch?.[1]);
    expect(source.slice(xrefOffset)).toMatch(/^xref\n0 5\n/);
    expect(source.slice(xrefOffset)).toContain("trailer\n<< /Size 5 /Root 1 0 R >>");

    const xrefLines = source.slice(xrefOffset).split("\n").slice(2, 7);
    expect(xrefLines[0]).toBe("0000000000 65535 f ");
    for (let objectNumber = 1; objectNumber <= 4; objectNumber += 1) {
      const entry = xrefLines[objectNumber];
      expect(entry).toMatch(/^\d{10} 00000 n $/);
      const objectOffset = Number(entry.slice(0, 10));
      expect(source.slice(objectOffset)).toMatch(new RegExp(`^${objectNumber} 0 obj\\n`));
    }
  });
});
