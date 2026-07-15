import { describe, expect, it } from "vitest";

import { escapeHtml, sanitizeEmailHeader } from "@/lib/security/escape-html";

describe("email content escaping", () => {
  it("escapes HTML text and attribute metacharacters exactly once", () => {
    expect(escapeHtml(`<img src="x" data-owner='Guardian'> & family`)).toBe(
      "&lt;img src=&quot;x&quot; data-owner=&#39;Guardian&#39;&gt; &amp; family",
    );
  });

  it("normalizes nullish and non-string values without throwing", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(0)).toBe("0");
    expect(escapeHtml(false)).toBe("false");
  });

  it("removes header newlines, trims whitespace, and caps the complete value", () => {
    const sanitized = sanitizeEmailHeader(
      `  Student\r\nBcc: attacker@example.com\n${"x".repeat(300)}  `,
    );

    expect(sanitized).not.toMatch(/[\r\n]/);
    expect(sanitized).toMatch(/^Student Bcc: attacker@example\.com /);
    expect(sanitized).toHaveLength(200);
    expect(sanitizeEmailHeader(null)).toBe("");
  });
});
