# mathSchool Architecture Overview

This document describes the high-level architecture designed to scale mathSchool to support more students, larger teams, and international operations.

## 1. System Components

The system is a Next.js (App Router) full-stack application backed by a PostgreSQL database managed via Prisma ORM. It has been structured into several core domains:

### A. Custom Prisma-Based CMS (Content Management)
To enable non-developers to edit website content quickly, a custom built-in CMS runs directly on top of the PostgreSQL database. This ensures the tech stack remains unified without requiring third-party subscriptions like Sanity or Strapi.

- **Capabilities:**
  - Editing marketing pages (Pricing, Programs, About Us).
  - Managing the FAQ database.
  - Full Blog engine (Markdown/HTML support) for SEO and marketing updates.
- **Access:** Only users with `UserRole.ADMIN` have access to the CMS admin panel located at `/admin/cms`.

### B. Educational Dashboards (Portals)
Dedicated portals are built for different personas to streamline educational operations.

- **Teacher Portal (`/portal/teacher`):**
  - Manage scheduled classes and upload course materials.
  - Assign homework and review/grade student submissions.
  - Log internal student progress notes.
- **Student Portal (`/portal/student`):**
  - View upcoming schedule and access live lesson links.
  - Download materials and submit homework files.
  - View grades and feedback.
- **Parent Portal (`/portal/parent`):**
  - High-level overview of child's attendance and academic progress.
  - Read-only access to teacher feedback and assessment scores.

### C. Process Automation Engine
To eliminate manual "firefighting", background processes handle routine tasks.
Since Next.js doesn't natively support long-running daemons, we use securely authenticated API routes (`/api/cron/...`) triggered by an external cron service (e.g., Vercel Cron or GitHub Actions).

- **Automated Reminders:** Trigger WhatsApp/Email reminders for upcoming classes or pending homework deadlines.
- **Task Generation:** Automatically create actionable tasks (`ManagerTask`) for the admin team when an `Enquiry` becomes stale or requires follow-up.

### D. Business Intelligence (BI) & Analytics
Data-driven decision making is facilitated by an internal analytics dashboard built with Recharts/Tremor.

- **Metrics Tracked:**
  - **LTV (Lifetime Value) & Payment Rates:** Aggregated from the `PaymentTransaction` models.
  - **Retention & Churn:** Tracked via `StudentSubscription` lifecycle.
  - **Channel Effectiveness:** Lead generation performance calculated using UTM parameters stored on the `Enquiry` model.

## 2. SEO & Performance Strategy
- **Dynamic Metadata:** All pages utilize Next.js `generateMetadata` API to ensure dynamic, up-to-date `<title>` and `<meta>` tags.
- **Structured Data:** JSON-LD schema is injected into educational programs and blog posts to enhance Google search results.
- **A/B Testing:** Next.js Edge Middleware routes traffic between different page variants based on cookies, allowing marketing to test variations seamlessly.

## 3. Technology Stack Summary
- **Frontend/Backend:** Next.js 15 (App Router, React 18)
- **Database:** PostgreSQL (Neon Serverless Postgres recommended)
- **ORM:** Prisma Client
- **Styling:** Tailwind CSS + Radix UI components
- **Monitoring:** Sentry
- **Authentication:** Custom sessions/JWT with 2FA support
