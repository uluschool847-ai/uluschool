import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  type StudentAssignmentFilters,
  getAssignmentDetailForStudent,
  listAssignmentsForStudent,
} from "@/lib/repositories/submission-repository";

export type ParentAssignmentFilters = StudentAssignmentFilters;

type StudentAssignmentRow = Awaited<ReturnType<typeof listAssignmentsForStudent>>[number];
type StudentAssignmentDetail = NonNullable<
  Awaited<ReturnType<typeof getAssignmentDetailForStudent>>
>;

async function isLinkedParentChild(parentId: string, studentId: string) {
  const parent = await prisma.appUser.findFirst({
    where: {
      id: parentId,
      role: UserRole.PARENT,
      children: { some: { id: studentId } },
    },
    select: { id: true },
  });

  return Boolean(parent);
}

function parentAssignmentHref(studentId: string, assignmentId: string) {
  return `/portal/parent/assignments/${encodeURIComponent(studentId)}/${encodeURIComponent(
    assignmentId,
  )}`;
}

function parentListHref(studentId: string) {
  return `/portal/parent/assignments/${encodeURIComponent(studentId)}`;
}

function mapParentAssignmentRow(studentId: string, assignment: StudentAssignmentRow) {
  const currentSubmission = assignment.currentSubmission ?? null;
  const assignmentWithSummary = assignment as StudentAssignmentRow & {
    submissionSummary?: unknown;
  };
  const fallbackSubmissionSummary =
    assignmentWithSummary.submissionSummary ??
    (assignment.grade !== null || assignment.feedbackPreview
      ? {
          feedbackPreview: assignment.feedbackPreview,
          grade: assignment.grade,
        }
      : null);

  return {
    ...assignment,
    detailHref: parentAssignmentHref(studentId, assignment.id),
    submissionSummary: currentSubmission
      ? {
          feedbackPreview: assignment.feedbackPreview,
          grade: currentSubmission.grade,
          status: currentSubmission.status,
          submittedAt: currentSubmission.submittedAt,
        }
      : fallbackSubmissionSummary,
  };
}

function mapParentAssignmentDetail(studentId: string, assignment: StudentAssignmentDetail) {
  return {
    ...assignment,
    backHref: parentListHref(studentId),
    canResubmit: false,
    canSubmit: false,
    detailHref: parentAssignmentHref(studentId, assignment.id),
    readOnlyReason: assignment.archivedAt
      ? (assignment.readOnlyReason ?? "This assignment is archived.")
      : "Parents can view assignment progress but cannot submit work.",
  };
}

export async function listAssignmentsForParentChild(
  parentId: string,
  studentId: string,
  filters: ParentAssignmentFilters = {},
) {
  if (!(await isLinkedParentChild(parentId, studentId))) {
    return [];
  }

  const assignments = await listAssignmentsForStudent(studentId, filters);
  return assignments.map((assignment) => mapParentAssignmentRow(studentId, assignment));
}

export async function getAssignmentDetailForParentChild(
  parentId: string,
  studentId: string,
  assignmentId: string,
) {
  if (!(await isLinkedParentChild(parentId, studentId))) {
    return null;
  }

  const assignment = await getAssignmentDetailForStudent(studentId, assignmentId);
  return assignment ? mapParentAssignmentDetail(studentId, assignment) : null;
}
