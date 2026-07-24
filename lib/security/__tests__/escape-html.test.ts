import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  parseEmailSender,
  parseSingleMailbox,
  sanitizeEmailSubject,
} from "@/lib/security/escape-html";

const DISALLOWED_HEADER_CONTROL_CODE_POINTS = [
  0x00, 0x01, 0x09, 0x0a, 0x0d, 0x1f, 0x7f, 0x80, 0x85, 0x9f,
];

function isDisallowedHeaderControl(character: string) {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f));
}

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

  it("removes subject newlines and caps Unicode by code point", () => {
    const sanitized = sanitizeEmailSubject(`  ${"😀".repeat(205)}\r\nBcc: ignored  `);

    expect(sanitized).not.toMatch(/[\r\n]/);
    expect(Array.from(sanitized)).toHaveLength(200);
    expect(sanitized).toBe("😀".repeat(200));
    expect(sanitizeEmailSubject(null)).toBe("");
  });

  it("normalizes every disallowed C0, C1, and DEL subject control", () => {
    const controls = DISALLOWED_HEADER_CONTROL_CODE_POINTS.map((codePoint) =>
      String.fromCodePoint(codePoint),
    ).join("");

    const sanitized = sanitizeEmailSubject(`Safe${controls}Subject`);

    expect(sanitized).toBe("Safe Subject");
    expect(Array.from(sanitized).some(isDisallowedHeaderControl)).toBe(false);
  });

  it("accepts only an exact single mailbox without repairing or truncating it", () => {
    expect(parseSingleMailbox("student+math@example.com")).toEqual({
      name: "",
      address: "student+math@example.com",
    });
    expect(parseSingleMailbox(`${"a".repeat(64)}@example.com`)).toEqual({
      name: "",
      address: `${"a".repeat(64)}@example.com`,
    });

    const overLengthMailbox = `a@${[
      "a".repeat(63),
      "b".repeat(63),
      "c".repeat(63),
      "d".repeat(61),
    ].join(".")}`;

    for (const invalidMailbox of [
      "",
      "   ",
      " student@example.com ",
      "not-an-email",
      "a..b@example.com",
      "Student <student@example.com>",
      "victim@example.com, attacker@example.com",
      "Students: victim@example.com;",
      "victim@example.com\r\nBcc: attacker@example.com",
      `${"a".repeat(65)}@example.com`,
      overLengthMailbox,
    ]) {
      expect(parseSingleMailbox(invalidMailbox)).toBeNull();
    }
  });

  it("enforces ASCII DNS domain and label boundaries without rejecting punycode form", () => {
    const maxLengthLabelMailbox = `student@${"a".repeat(63)}.example`;
    const punycodeMailbox = "student@example.xn--p1ai";

    expect(parseSingleMailbox(maxLengthLabelMailbox)).toEqual({
      name: "",
      address: maxLengthLabelMailbox,
    });
    expect(parseSingleMailbox(punycodeMailbox)).toEqual({
      name: "",
      address: punycodeMailbox,
    });

    const overLengthDomain = ["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(62)].join(
      ".",
    );
    for (const invalidMailbox of [
      `student@${"a".repeat(64)}.example`,
      "student@example..com",
      "student@-example.com",
      "student@example-.com",
      "student@exam_ple.com",
      "student@bücher.example",
      `a@${overLengthDomain}`,
    ]) {
      expect(parseSingleMailbox(invalidMailbox)).toBeNull();
    }
  });

  it("rejects malformed reserved A-labels and preserves exact canonical A-label input", () => {
    for (const invalidMailbox of [
      "student@xn--a.example",
      "student@xn--0.example",
      "student@example.xn--abc",
      "student@xn---bba.example",
    ]) {
      expect(parseSingleMailbox(invalidMailbox)).toBeNull();
    }

    for (const validMailbox of [
      "student@xn--bcher-kva.example",
      "student@XN--BCHER-KVA.example",
      "student@example.xn--p1ai",
    ]) {
      expect(parseSingleMailbox(validMailbox)).toEqual({
        name: "",
        address: validMailbox,
      });
    }
  });

  it("parses the supported sender forms into a structured address and rejects redirection syntax", () => {
    expect(parseEmailSender("ULU Online School <no-reply@uluglobalacademy.com>")).toEqual({
      name: "ULU Online School",
      address: "no-reply@uluglobalacademy.com",
    });
    expect(parseEmailSender("no-reply@uluglobalacademy.com")).toEqual({
      name: "",
      address: "no-reply@uluglobalacademy.com",
    });
    expect(parseEmailSender('"ULU, School" <no-reply@uluglobalacademy.com>')).toEqual({
      name: "ULU, School",
      address: "no-reply@uluglobalacademy.com",
    });

    for (const invalidSender of [
      "",
      "ULU Online School <no-reply@uluglobalacademy.com>\r\nBcc: attacker@example.com",
      "ULU: attacker@example.com;",
      "no-reply@uluglobalacademy.com, attacker@example.com",
      `${"A".repeat(201)} <no-reply@uluglobalacademy.com>`,
    ]) {
      expect(parseEmailSender(invalidSender)).toBeNull();
    }
  });

  it("rejects disallowed raw sender controls before they can be repaired by the parser", () => {
    for (const codePoint of DISALLOWED_HEADER_CONTROL_CODE_POINTS) {
      const control = String.fromCodePoint(codePoint);
      expect(parseEmailSender(`ULU${control} School <no-reply@uluglobalacademy.com>`)).toBeNull();
    }
  });
});
