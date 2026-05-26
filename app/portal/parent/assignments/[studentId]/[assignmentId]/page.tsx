import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ParentAssignmentDetail } from "@/app/portal/parent/components/ParentAssignmentDetail";
import { requireRole } from "@/lib/auth/session";
import { getAssignmentDetailForParentChild } from "@/lib/repositories/parent-assignment-repository";

export const metadata: Metadata = {
  title: "Assignment Detail - Parent Portal",
};

type PageProps = {
  params:
    | Promise<{ assignmentId: string; studentId: string }>
    | { assignmentId: string; studentId: string };
};

export default async function ParentAssignmentDetailPage({ params }: PageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const { assignmentId, studentId } = await params;
  const assignment = await getAssignmentDetailForParentChild(session.uid, studentId, assignmentId);

  if (!assignment) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <p>
        <Link
          className="text-sm font-medium text-primary"
          href={`/portal/parent/assignments/${encodeURIComponent(studentId)}`}
        >
          Back to assignments
        </Link>
      </p>

      <ParentAssignmentDetail assignment={assignment} />
    </main>
  );
}
