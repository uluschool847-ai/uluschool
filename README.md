# Ulu School

Next.js 15 web platform for ULU Online School with enquiry capture, admin review workflow, and email notifications.

## Tech Stack
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- ShadCN UI components
- Prisma ORM
- PostgreSQL
- Server Actions
- Nodemailer
- Zod validation

## Setup
1. Install dependencies: `npm install`
2. Configure environment variables from `.env.example`
3. Generate Prisma client: `npm run prisma:generate`
4. Run migrations: `npm run prisma:migrate`
5. Seed baseline content: `npm run prisma:seed`
6. Start dev server: `npm run dev`

## Production Migration
Use deploy-time migrations in production:

```bash
npx prisma migrate deploy
```

## Environment Variables
- `DATABASE_URL`
- `DIRECT_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE`
- `SMTP_FROM`
- `SCHOOL_INBOX_EMAIL`
- `SMTP_MAX_RETRIES`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_ENFORCE`
- `MIN_FORM_FILL_MS`
- `ENROL_FORM_MAX_REQUESTS`
- `ENROL_FORM_WINDOW_MS`
- `CONTACT_FORM_MAX_REQUESTS`
- `CONTACT_FORM_WINDOW_MS`
- `NEXT_PUBLIC_SITE_URL`

## Email Deliverability Checklist
Before going live, configure these DNS records for your sending domain:

1. SPF: authorize your SMTP provider.
2. DKIM: publish provider DKIM public keys.
3. DMARC: start with monitoring policy, then tighten policy after validation.

Without SPF/DKIM/DMARC alignment, delivery can be unreliable even if SMTP credentials are valid.

## Folder Structure
```text
.
|-- app
|   |-- (admin)
|   |   `-- admin
|   |       |-- layout.tsx
|   |       `-- page.tsx
|   |-- about
|   |   `-- page.tsx
|   |-- contact
|   |   `-- page.tsx
|   |-- curriculum
|   |   `-- page.tsx
|   |-- enrol
|   |   |-- actions.ts
|   |   `-- page.tsx
|   |-- pricing
|   |   `-- page.tsx
|   |-- subjects
|   |   `-- page.tsx
|   |-- teachers
|   |   `-- page.tsx
|   |-- globals.css
|   |-- layout.tsx
|   |-- page.tsx
|   |-- robots.ts
|   `-- sitemap.ts
|-- components
|   |-- enrol
|   |   `-- enrol-form.tsx
|   |-- layout
|   |   |-- site-footer.tsx
|   |   |-- site-header.tsx
|   |   `-- theme-toggle.tsx
|   |-- providers
|   |   `-- theme-provider.tsx
|   |-- sections
|   |   |-- curriculum-overview-section.tsx
|   |   |-- faq-section.tsx
|   |   |-- free-trial-cta-section.tsx
|   |   |-- hero-section.tsx
|   |   |-- how-classes-work-section.tsx
|   |   |-- page-hero.tsx
|   |   |-- safeguarding-section.tsx
|   |   |-- subjects-levels-section.tsx
|   |   |-- teachers-preview-section.tsx
|   |   |-- testimonials-section.tsx
|   |   `-- why-choose-section.tsx
|   `-- ui
|       |-- accordion.tsx
|       |-- badge.tsx
|       |-- button.tsx
|       |-- card.tsx
|       |-- input.tsx
|       |-- label.tsx
|       |-- separator.tsx
|       `-- textarea.tsx
|-- lib
|   |-- admin
|   |   `-- pricing.ts
|   |-- cms
|   |   `-- provider.ts
|   |-- repositories
|   |   `-- enquiry-repository.ts
|   |-- services
|   |   `-- email.ts
|   |-- validations
|   |   `-- enrolment.ts
|   |-- content.ts
|   |-- prisma.ts
|   `-- utils.ts
|-- prisma
|   |-- schema.prisma
|   `-- seed.ts
|-- .env.example
|-- .eslintrc.json
|-- .gitignore
|-- components.json
|-- next-env.d.ts
|-- next.config.mjs
|-- package.json
|-- postcss.config.mjs
|-- tailwind.config.ts
`-- tsconfig.json
```

## Notes
- Enrolment and Contact forms use Server Actions + Zod validation + Prisma persistence + Nodemailer delivery.
- Admin dashboard supports status workflow (`new`, `in_review`, `accepted`, `rejected`) and admin notes.
- Basic anti-spam includes honeypot, minimum submit time guard, optional Turnstile captcha, and in-memory rate limiting.
