# Teachers, Contacts, and Default Theme Design

## Goal

Publish the approved teaching team on `/teachers`, identify Sir Nickson Onyango in the founder
message, expose two verified contact phone numbers, and make the light theme the initial experience
while retaining manual theme switching.

## Teacher Profiles

The public teaching team contains exactly these three active `Teacher` profiles in this order:

1. **Sir Nickson Onyango**
   - Title: `Founder and Mathematics & Science Teacher`
   - Photo: `/nick.jpg`
   - Bio: `Sir Nickson Onyango is the founder of ULU Online School and a Mathematics and Science educator committed to structured, student-centred learning.`
2. **Sir Alphonse**
   - Title: `English High School Teacher`
   - Photo: `/alphonse.jpg`
   - Bio: `Sir Alphonse holds a Bachelor's Degree in Education (English and Literature). He has extensive experience teaching the Cambridge Curriculum and preparing students for Cambridge Checkpoint and IGCSE examinations.`
3. **Ms. Cholette**
   - Title: `Lower Primary Teacher`
   - Photo: `/cholette.jpg`
   - Bio: `Ms. Cholette holds a Bachelor's Degree in Education, specialising in Psychology. She is committed to fostering student development through a supportive, learner-centred approach and a strong foundation in educational practice.`

The production synchronization is idempotent. It updates matching approved profiles, creates
missing profiles, and removes other `Teacher` profile rows. It does not delete `AppUser` accounts,
classes, lessons, submissions, or other teacher-cabinet data. Each production profile change is
recorded in the existing admin audit log.

The three static image files already under `public/` remain the source for these public photos.

## Founder's Message

The existing About page keeps its founder message text. The founder card adds Sir Nickson
Onyango's photo and name above the `Founder's Message` heading, using the same responsive visual
language as the existing page.

## Contacts

The public contact configuration exposes two verified Kenyan numbers:

- Phone: `+254 701 256 095`, linked as `tel:+254701256095`
- WhatsApp: `+254 706 359 133`, linked as `https://wa.me/254706359133`

The values are supplied through the existing public contact environment variables in production
and have matching non-secret application fallbacks so local and production rendering stay
consistent. The Contact page and site footer both render accessible, clickable links.

## Theme

`next-themes` uses `light` as `defaultTheme`. System-theme initialization is disabled so a new
visitor starts in light mode. The existing theme toggle remains available and a user's explicit
stored choice continues to take precedence on subsequent visits.

## Verification

- Unit/component tests cover contact links, default theme provider settings, founder identity, and
  the approved teacher content contract.
- Repository and production synchronization tests cover idempotent upsert, removal of extra
  `Teacher` profiles, preservation of `AppUser` records, and audit logging.
- Typecheck, lint, focused tests, production build, and relevant Playwright flows must pass.
- After deployment, `/teachers`, `/about`, `/contact`, and the footer are checked in Chromium on
  desktop and mobile. Production data must show exactly three active teacher cards with the correct
  images and text.

## Deployment

Code and the idempotent content synchronization are committed to `main` only after verification.
GitHub CI must pass before manually deploying the existing Render service, whose auto-deploy is
disabled. The production synchronization runs only against the verified production database and
records its actor and results without logging credentials or personal data.
