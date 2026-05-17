export const RESERVED_SLUGS = [
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
  "api",
  "pages",
  "dashboard",
] as const;

const reservedSlugSet = new Set<string>(RESERVED_SLUGS);

export function normalizeSlug(slug: string) {
  return slug.trim().toLowerCase();
}

export function isReservedSlug(slug: string) {
  return reservedSlugSet.has(normalizeSlug(slug));
}

export function canCreateCmsPage(slug: string) {
  return !isReservedSlug(slug);
}

export function isCmsManaged(slug: string) {
  return canCreateCmsPage(slug);
}
