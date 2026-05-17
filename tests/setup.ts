import { expect } from "vitest";

(globalThis as { __MATHSCHOOL_VITEST__?: boolean }).__MATHSCHOOL_VITEST__ = true;

expect.extend({
  toBeInTheDocument(received: Element | null) {
    const pass = received instanceof Element && document.body.contains(received);
    return {
      pass,
      message: () => `expected element ${pass ? "not " : ""}to be in the document`,
    };
  },
  toBeRequired(received: Element | null) {
    const pass =
      received instanceof HTMLInputElement ||
      received instanceof HTMLSelectElement ||
      received instanceof HTMLTextAreaElement
        ? received.required
        : false;
    return {
      pass,
      message: () => `expected element ${pass ? "not " : ""}to be required`,
    };
  },
  toHaveAttribute(received: Element | null, name: string, expected?: string) {
    const actual = received instanceof Element ? received.getAttribute(name) : null;
    const pass =
      expected === undefined ? actual !== null : actual === expected || actual === String(expected);

    return {
      pass,
      message: () =>
        `expected element ${pass ? "not " : ""}to have attribute ${name}${
          expected === undefined ? "" : `="${expected}"`
        }, received ${actual === null ? "null" : `"${actual}"`}`,
    };
  },
});
