# Ulu School AI Context
- Stack: Next.js 15 (App Router), TypeScript, Tailwind CSS, ShadCN UI.
- Database: PostgreSQL via Prisma ORM.
- Rule 1: NEVER use the old `pages/` directory. Use App Router conventions.
- Rule 2: Data mutations MUST use React Server Actions in `/actions`.
- Rule 3: Database calls must go through the Prisma client instantiated in `lib/prisma.ts`.
- Rule 4: Always write unit tests for critical business logic using Jest/React Testing Library.