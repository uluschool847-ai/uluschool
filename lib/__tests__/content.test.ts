import { describe, expect, it } from "vitest";

// @ts-expect-error Red phase: content helpers are not implemented yet.
import { containsUnsupportedClaim, isPlaceholder } from "@/lib/content";

const supportedFeatures = [
  "live classes",
  "recorded lessons",
  "downloadable materials",
  "progress reporting",
  "cambridge curriculum",
  "continuous assessment",
  "free trial class",
  "parent progress tracking",
];

describe("lib/content placeholder and claims guards", () => {
  describe("isPlaceholder", () => {
    it("returns false for normal operational copy", () => {
      expect(
        isPlaceholder(
          "Students join live classes, submit assignments, and receive structured feedback every week.",
        ),
      ).toBe(false);
    });

    it("returns true for common placeholder patterns", () => {
      expect(isPlaceholder("Lorem ipsum dolor sit amet")).toBe(true);
      expect(isPlaceholder("Sample text for pricing page")).toBe(true);
      expect(isPlaceholder("TODO: add real fees here")).toBe(true);
      expect(isPlaceholder("TBD")).toBe(true);
      expect(isPlaceholder("placeholder copy")).toBe(true);
    });

    it("handles empty and whitespace-only strings defensively", () => {
      expect(isPlaceholder("")).toBe(false);
      expect(isPlaceholder("   ")).toBe(false);
    });

    it("is case-insensitive for placeholder detection", () => {
      expect(isPlaceholder("LoReM IpSuM section")).toBe(true);
    });

    it("treats intentionally scoped coming soon messaging as non-placeholder", () => {
      expect(isPlaceholder("Coming Soon: Advanced Analytics in Q3 2026.")).toBe(false);
    });

    it("returns false for null and undefined inputs", () => {
      expect(isPlaceholder(null)).toBe(false);
      expect(isPlaceholder(undefined)).toBe(false);
    });
  });

  describe("containsUnsupportedClaim", () => {
    it("returns false for supported operational copy", () => {
      expect(
        containsUnsupportedClaim(
          "Our platform includes live classes, recorded lessons, and progress reporting.",
          supportedFeatures,
        ),
      ).toBe(false);
    });

    it("returns true for claims not present in the supported feature list", () => {
      expect(
        containsUnsupportedClaim(
          "The school includes AI-powered tutoring and automatic grading for every assignment.",
          supportedFeatures,
        ),
      ).toBe(true);
    });

    it("returns false for intentionally scoped coming soon claims", () => {
      expect(
        containsUnsupportedClaim("Coming Soon: Advanced Analytics in Q3 2026.", supportedFeatures),
      ).toBe(false);
    });

    it("returns false for empty, whitespace, null, and undefined values", () => {
      expect(containsUnsupportedClaim("", supportedFeatures)).toBe(false);
      expect(containsUnsupportedClaim("   ", supportedFeatures)).toBe(false);
      expect(containsUnsupportedClaim(null, supportedFeatures)).toBe(false);
      expect(containsUnsupportedClaim(undefined, supportedFeatures)).toBe(false);
    });
  });
});
