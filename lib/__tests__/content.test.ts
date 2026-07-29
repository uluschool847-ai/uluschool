import { afterEach, describe, expect, it, vi } from "vitest";

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

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const originalAppEnv = process.env.APP_ENV;

afterEach(() => {
  vi.unstubAllEnvs();
  if (originalSiteUrl === undefined) {
    Reflect.deleteProperty(process.env, "NEXT_PUBLIC_SITE_URL");
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
  if (originalAppEnv === undefined) {
    Reflect.deleteProperty(process.env, "APP_ENV");
  } else {
    process.env.APP_ENV = originalAppEnv;
  }
  vi.resetModules();
});

describe("site contact content", () => {
  it("keeps the local email default and leaves missing optional contacts unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "");
    vi.stubEnv("NEXT_PUBLIC_CONTACT_PHONE", "");
    vi.stubEnv("NEXT_PUBLIC_CONTACT_WHATSAPP", "   ");
    vi.resetModules();

    const { siteConfig } = await import("@/lib/content");

    expect(siteConfig.contact).toEqual({
      email: "info@uluglobalacademy.com",
      phone: null,
      whatsapp: null,
    });
  });
});

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

describe("canonical SEO content", () => {
  it("uses ULU Online School and NEXT_PUBLIC_SITE_URL in organization structured data", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://ulu-school.example";
    vi.resetModules();
    const { generateStructuredData } = await import("@/lib/seo");

    const structuredData = generateStructuredData("Organization", {});
    const serialized = JSON.stringify(structuredData);

    expect(structuredData).toEqual({
      "@context": "https://schema.org",
      "@type": "EducationalOrganization",
      name: "ULU Online School",
      description:
        "ULU Online School delivers structured, interactive, and exam-focused Cambridge education to students anywhere in the world.",
      url: "https://ulu-school.example",
      logo: "https://ulu-school.example/logo.png",
    });
    expect(serialized).not.toMatch(/mathSchool|mathschool\.example\.com/i);
  });

  it.each([
    ["staging", false, false],
    [undefined, false, false],
    ["production", false, true],
    ["production", true, false],
  ] as const)(
    "sets crawler metadata for APP_ENV=%s and noIndex=%s",
    async (appEnv, noIndex, indexable) => {
      if (appEnv === undefined) {
        Reflect.deleteProperty(process.env, "APP_ENV");
      } else {
        process.env.APP_ENV = appEnv;
      }
      vi.resetModules();
      const { constructMetadata } = await import("@/lib/seo");

      const metadata = constructMetadata({ noIndex });

      expect(metadata.robots).toEqual({
        index: indexable,
        follow: indexable,
      });
    },
  );

  it("keeps the /curriculum metadata non-indexable in staging", async () => {
    process.env.APP_ENV = "staging";
    vi.resetModules();
    const { constructMetadata } = await import("@/lib/seo");

    const curriculumMetadata = constructMetadata({
      title: "Curriculum",
      description:
        "Explore ULU's Cambridge curriculum pathways across Primary, Lower Secondary, and IGCSE.",
    });

    expect(curriculumMetadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
