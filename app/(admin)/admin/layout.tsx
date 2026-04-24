import { UserRole } from "@prisma/client";

import { requireRole } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole([UserRole.ADMIN]);
  return <section className="container py-8">{children}</section>;
}
