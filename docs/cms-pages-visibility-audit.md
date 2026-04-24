CMS Page Visibility Audit

Current behavior before fix
- Admin could create/publish PageContent records in the CMS.
- There was no public frontend route wired to PageContent slugs.
- Result: published pages existed in DB but were not accessible on the public site.
- URL expectation was ambiguous (table showed /{slug}, but no matching route existed).

Root cause
- Missing public route resolution for CMS pages.
- Missing renderer path for PageContent JSON blocks.
- Missing UX guidance in admin about the actual public URL pattern and visibility behavior.

What was changed
- Added public CMS routes:
  - /pages -> published CMS page index
  - /pages/[slug] -> published CMS page detail
- Added DB queries for public CMS lookup:
  - listPublishedPages()
  - getPublishedPageBySlug(slug)
- Added CMS JSON renderer component for structured content blocks with safe fallbacks:
  - heading/paragraph/list/quote/cta/divider + graceful fallback output
- Updated admin CMS Pages UI to make behavior explicit:
  - Public URL shown as /pages/{slug}
  - "View Live" action for published pages
  - Helper text: CMS pages are listed on /pages and are not auto-added to main header nav
- Added server-side slug safety for page save:
  - slug normalized to lowercase/trimmed
  - invalid slug format rejected with inline form feedback
  - duplicate slug rejected with inline form feedback
- Added discoverability in public UI:
  - Footer link to /pages (Published Pages)
- Updated sitemap to include:
  - /pages
  - /pages/{slug} for published CMS pages

Final behavior
- Published CMS pages are publicly accessible via:
  - /pages/{slug}
- Unpublished CMS pages are not public (return not found at public route).
- JSON content stored in PageContent is rendered on the frontend.
- CMS pages do not auto-override static routes like /about, /fees, /contact, etc.
  - Static pages remain unchanged.
  - CMS pages are intentionally namespaced under /pages to avoid route conflicts.
- Navigation policy:
  - Not auto-inserted into main header nav.
  - Discoverable via /pages index and footer "Published Pages" link.

Example
- If slug is pricing, the working public URL is:
  - /pages/pricing
