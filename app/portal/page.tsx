import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Portal",
  description: "Student, parent, teacher, and admin portal overview.",
};

/**
 * Note: Primary redirection logic has been moved to middleware.ts
 * to avoid double-redirects. This page remains as a secondary
 * fallback and safety guard.
 */
export default async function PortalPage() {
  const session = await requireRole([
    UserRole.ADMIN,
    UserRole.TEACHER,
    UserRole.PARENT,
    UserRole.STUDENT,
  ]);

  if (session.role === UserRole.TEACHER) {
    redirect("/portal/teacher");
  } else if (session.role === UserRole.STUDENT) {
    redirect("/portal/student");
  } else if (session.role === UserRole.PARENT) {
    redirect("/portal/parent");
  } else if (session.role === UserRole.ADMIN) {
    redirect("/admin");
  }

  // Fallback
  redirect("/student-portal");
}
