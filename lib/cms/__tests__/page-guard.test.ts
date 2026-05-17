import { describe, expect, it } from "vitest";

const RESERVED_SLUGS = [
  "about",
  "blog",
  "admin",
  "contact",
  "enrol",
  "students",
  "teachers",
  "login",
  "results",
  "faq",
] as const;

type PageGuardModule = {
  isReservedSlug: (slug: string) => boolean;
  canCreateCmsPage: (slug: string) => boolean;
  isCmsManaged: (slug: string) => boolean;
};

async function loadPageGuard() {
  const specifier = "@/lib/cms/page-guard";
  return import(/* @vite-ignore */ specifier) as Promise<PageGuardModule>;
}

describe("CMS page ownership guard", () => {
  it("treats hardcoded application routes as reserved slugs", async () => {
    const { isReservedSlug } = await loadPageGuard();

    for (const slug of RESERVED_SLUGS) {
      expect(isReservedSlug(slug)).toBe(true);
    }
  });

  it("blocks CMS page creation for reserved slugs", async () => {
    const { canCreateCmsPage } = await loadPageGuard();

    for (const slug of RESERVED_SLUGS) {
      expect(canCreateCmsPage(slug)).toBe(false);
    }
  });

  it("marks custom slugs as CMS-managed", async () => {
    const { isReservedSlug, isCmsManaged, canCreateCmsPage } = await loadPageGuard();

    expect(isReservedSlug("privacy-policy")).toBe(false);
    expect(isReservedSlug("summer-camp-2026")).toBe(false);
    expect(canCreateCmsPage("privacy-policy")).toBe(true);
    expect(isCmsManaged("privacy-policy")).toBe(true);
    expect(isCmsManaged("summer-camp-2026")).toBe(true);
  });
});
