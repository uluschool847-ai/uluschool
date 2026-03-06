# Ulu School

Production-ready Next.js 15 web platform for Cambridge online tutoring.

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

## Environment Variables
- `DATABASE_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE`
- `SMTP_FROM`
- `NEXT_PUBLIC_SITE_URL`

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
- Pricing is intentionally non-hardcoded and surfaced as enquiry-based messaging.
- Enrolment form uses Server Actions + Zod validation + Prisma persistence + Nodemailer email delivery.
- Admin route and CMS adapter are prepared for future expansion.
