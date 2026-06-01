import type { Prisma, ReminderChannel, ReminderDeliveryStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type SubmissionDatabase = typeof prisma | Prisma.TransactionClient;

export type StudentSubmissionInput = {
  studentId: string;
  assignmentId: string;
  contentUrl: string;
};

export type TeacherSubmissionFilters = {
  assignmentId?: string | null;
  classGroupId?: string | null;
  scheduledClassId?: string | null;
  search?: string | null;
  sort?: "submittedAtDesc" | "submittedAtAsc" | "studentName" | "assignmentTitle" | "status" | null;
  status?: "pending" | "graded" | "all" | string | null;
  studentId?: string | null;
  subjectId?: string | null;
};

export type GradeSubmissionInput = {
  grade?: unknown;
  feedback?: string | null;
};

export type StudentAssignmentStatus =
  | "active"
  | "submitted"
  | "graded"
  | "missing"
  | "archived"
  | "all";

export type StudentAssignmentSort = "dueDateAsc" | "dueDateDesc" | "title" | "status";

export type StudentAssignmentFilters = {
  classGroupId?: string | null;
  dueFrom?: string | null;
  dueTo?: string | null;
  scheduledClassId?: string | null;
  search?: string | null;
  sort?: StudentAssignmentSort | string | null;
  status?: StudentAssignmentStatus | string | null;
  subjectId?: string | null;
};

type StudentAssignmentRecord = {
  id: string;
  title: string;
  description: string;
  dueDate: Date;
  archivedAt: Date | null;
  scheduledClass: {
    id: string;
    title: string;
    startAt?: Date | null;
    subject?: { id: string; name: string; slug?: string | null } | null;
    teacher?: { id: string; fullName: string; email: string } | null;
    classGroup?: { id: string; name: string } | null;
    courseMaterials?: {
      id: string;
      title: string;
      description: string | null;
      fileUrl: string;
      attachments?: { id: string; filename: string; storageKey: string }[];
    }[];
  };
  submissions: {
    id: string;
    studentId: string;
    assignmentId: string;
    contentUrl: string;
    grade: number | null;
    feedback: string | null;
    submittedAt: Date;
    updatedAt: Date;
    attachments?: { id: string; filename: string; storageKey: string }[];
  }[];
};

type AssignmentReminderRecord = {
  id: string;
  title: string;
  description: string;
  dueDate: Date;
  scheduledClass: {
    id: string;
    title: string;
    subject?: { id: string; name: string; slug?: string | null } | null;
    teacher?: { id: string; fullName: string; email: string } | null;
    classGroup?: {
      id: string;
      name: string;
      students?: { id: string; parents?: { id: string }[] }[];
    } | null;
    students?: { id: string; parents?: { id: string }[] }[];
  };
  submissions: { studentId: string }[];
  assignmentReminders?: {
    recipientUserId: string;
    channel: ReminderChannel;
    status: ReminderDeliveryStatus;
    reminderWindowStart?: Date | null;
    reminderWindowEnd?: Date | null;
  }[];
};

const MAX_SUBMISSION_FEEDBACK_LENGTH = 2000;

const submissionInclude = {
  student: { select: { id: true, fullName: true, email: true } },
  attachments: {
    select: { id: true, filename: true, storageKey: true },
    orderBy: { createdAt: "desc" as const },
  },
  assignment: {
    include: {
      scheduledClass: {
        select: {
          id: true,
          title: true,
          teacherId: true,
          subjectId: true,
          classGroupId: true,
          subject: { select: { id: true, name: true, slug: true } },
          classGroup: { select: { id: true, name: true, teacherId: true } },
        },
      },
    },
  },
} satisfies Prisma.SubmissionInclude;

function studentAssignmentEnrollmentScope(studentId: string): Prisma.AssignmentWhereInput[] {
  return [
    { scheduledClass: { students: { some: { id: studentId } } } },
    { scheduledClass: { classGroup: { students: { some: { id: studentId } } } } },
  ];
}

function teacherSubmissionScope(teacherId: string): Prisma.SubmissionWhereInput[] {
  return [
    { assignment: { scheduledClass: { teacherId } } },
    { assignment: { scheduledClass: { classGroup: { teacherId } } } },
  ];
}

function gradeWhere(filters: TeacherSubmissionFilters = {}) {
  if (filters.status === "pending") return { grade: null };
  if (filters.status === "graded") return { grade: { not: null } };
  return {};
}

function orderByForTeacherSubmissions(
  sort: TeacherSubmissionFilters["sort"],
): Prisma.SubmissionOrderByWithRelationInput[] {
  switch (sort) {
    case "submittedAtAsc":
      return [{ submittedAt: "asc" }];
    case "studentName":
      return [{ student: { fullName: "asc" } }, { submittedAt: "desc" }];
    case "assignmentTitle":
      return [{ assignment: { title: "asc" } }, { submittedAt: "desc" }];
    case "status":
      return [{ grade: "asc" }, { submittedAt: "desc" }];
    case "submittedAtDesc":
      return [{ submittedAt: "desc" }];
    default:
      return [{ submittedAt: "desc" }];
  }
}

function listFiltersWhere(filters: TeacherSubmissionFilters = {}) {
  const andFilters: Prisma.SubmissionWhereInput[] = [];

  if (filters.assignmentId?.trim()) {
    andFilters.push({ assignmentId: filters.assignmentId.trim() });
  }
  if (filters.studentId?.trim()) {
    andFilters.push({ studentId: filters.studentId.trim() });
  }
  if (filters.scheduledClassId?.trim()) {
    andFilters.push({ assignment: { scheduledClassId: filters.scheduledClassId.trim() } });
  }
  if (filters.classGroupId?.trim()) {
    andFilters.push({
      assignment: {
        scheduledClass: {
          classGroupId: filters.classGroupId.trim(),
        },
      },
    });
  }
  if (filters.subjectId?.trim()) {
    andFilters.push({
      assignment: {
        scheduledClass: {
          subjectId: filters.subjectId.trim(),
        },
      },
    });
  }
  if (filters.search?.trim()) {
    const search = filters.search.trim();
    andFilters.push({
      OR: [
        { student: { fullName: { contains: search, mode: "insensitive" } } },
        { student: { email: { contains: search, mode: "insensitive" } } },
        { assignment: { title: { contains: search, mode: "insensitive" } } },
      ],
    });
  }

  return andFilters;
}

function feedbackPreview(feedback: string | null) {
  if (!feedback) return null;
  const trimmed = feedback.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function descriptionPreview(description: string) {
  const trimmed = description.trim();
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}

function normalizeStatus(status: StudentAssignmentFilters["status"]): StudentAssignmentStatus {
  switch (status) {
    case "submitted":
    case "graded":
    case "missing":
    case "archived":
    case "all":
      return status;
    default:
      return "active";
  }
}

function normalizeSort(sort: StudentAssignmentFilters["sort"]): StudentAssignmentSort {
  switch (sort) {
    case "dueDateAsc":
    case "dueDateDesc":
    case "title":
    case "status":
      return sort;
    default:
      return "dueDateAsc";
  }
}

function parseDateFilter(value: string | null | undefined, endOfDay = false) {
  if (!value?.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function studentAssignmentInclude(studentId: string) {
  return {
    scheduledClass: {
      include: {
        subject: { select: { id: true, name: true, slug: true } },
        teacher: { select: { id: true, fullName: true, email: true } },
        classGroup: { select: { id: true, name: true } },
        students: { select: { id: true } },
        courseMaterials: {
          select: {
            id: true,
            title: true,
            description: true,
            fileUrl: true,
            attachments: {
              select: { id: true, filename: true, storageKey: true },
              orderBy: { createdAt: "desc" as const },
            },
          },
          orderBy: { createdAt: "desc" as const },
        },
      },
    },
    submissions: {
      where: { studentId },
      include: {
        attachments: {
          select: { id: true, filename: true, storageKey: true },
          orderBy: { createdAt: "desc" as const },
        },
      },
      orderBy: { submittedAt: "desc" as const },
    },
  } satisfies Prisma.AssignmentInclude;
}

function dailyReminderWindow(now: Date) {
  const reminderWindowStart = new Date(now);
  reminderWindowStart.setUTCHours(0, 0, 0, 0);
  const reminderWindowEnd = new Date(now);
  reminderWindowEnd.setUTCHours(23, 59, 59, 999);
  return { reminderWindowStart, reminderWindowEnd };
}

function uniqueStudentRecipients(assignment: AssignmentReminderRecord) {
  const submittedStudentIds = new Set(
    assignment.submissions.map((submission) => submission.studentId),
  );
  const enrolledStudentIds = new Set<string>();
  const parentIdsByStudent = new Map<string, Set<string>>();

  for (const student of assignment.scheduledClass.students ?? []) {
    enrolledStudentIds.add(student.id);
    const parentIds = parentIdsByStudent.get(student.id) ?? new Set<string>();
    for (const parent of student.parents ?? []) {
      parentIds.add(parent.id);
    }
    parentIdsByStudent.set(student.id, parentIds);
  }
  for (const student of assignment.scheduledClass.classGroup?.students ?? []) {
    enrolledStudentIds.add(student.id);
    const parentIds = parentIdsByStudent.get(student.id) ?? new Set<string>();
    for (const parent of student.parents ?? []) {
      parentIds.add(parent.id);
    }
    parentIdsByStudent.set(student.id, parentIds);
  }

  const missingStudentIds = [...enrolledStudentIds]
    .filter((studentId) => !submittedStudentIds.has(studentId))
    .sort();
  const parentIds = new Set<string>();
  for (const studentId of missingStudentIds) {
    for (const parentId of parentIdsByStudent.get(studentId) ?? []) {
      parentIds.add(parentId);
    }
  }
  const missingStudents = missingStudentIds.map((id) => ({ id }));

  if (missingStudents.length === 0) return [];

  return [...missingStudents, ...[...parentIds].sort().map((id) => ({ id }))];
}

function studentAssignmentWhere(studentId: string, filters: StudentAssignmentFilters = {}) {
  const status = normalizeStatus(filters.status);
  const where: Prisma.AssignmentWhereInput = {
    OR: studentAssignmentEnrollmentScope(studentId),
  };
  const andFilters: Prisma.AssignmentWhereInput[] = [];

  if (status === "archived") {
    where.archivedAt = { not: null };
  } else if (status !== "all") {
    where.archivedAt = null;
  }

  if (status === "submitted") {
    where.submissions = { some: { studentId } };
  }
  if (status === "graded") {
    where.submissions = { some: { studentId, grade: { not: null } } };
  }
  if (status === "missing") {
    where.dueDate = { lt: new Date() };
    where.submissions = { none: { studentId } };
  }

  if (filters.subjectId?.trim()) {
    andFilters.push({
      scheduledClass: { subjectId: filters.subjectId.trim() },
    });
  }
  if (filters.classGroupId?.trim()) {
    andFilters.push({
      scheduledClass: { classGroupId: filters.classGroupId.trim() },
    });
  }
  if (filters.scheduledClassId?.trim()) {
    andFilters.push({ scheduledClassId: filters.scheduledClassId.trim() });
  }

  const dueFrom = parseDateFilter(filters.dueFrom);
  const dueTo = parseDateFilter(filters.dueTo, true);
  if (dueFrom || dueTo) {
    where.dueDate = {
      ...(typeof where.dueDate === "object" && where.dueDate !== null ? where.dueDate : {}),
      ...(dueFrom ? { gte: dueFrom } : {}),
      ...(dueTo ? { lte: dueTo } : {}),
    };
  }

  if (filters.search?.trim()) {
    const search = filters.search.trim();
    andFilters.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { scheduledClass: { title: { contains: search, mode: "insensitive" } } },
        { scheduledClass: { subject: { name: { contains: search, mode: "insensitive" } } } },
        { scheduledClass: { classGroup: { name: { contains: search, mode: "insensitive" } } } },
      ],
    });
  }

  if (andFilters.length > 0) {
    where.AND = andFilters;
  }

  return where;
}

function orderByForStudentAssignments(
  sort: StudentAssignmentFilters["sort"],
): Prisma.AssignmentOrderByWithRelationInput[] {
  switch (normalizeSort(sort)) {
    case "dueDateDesc":
      return [{ dueDate: "desc" }];
    case "title":
      return [{ title: "asc" }];
    case "status":
      return [{ archivedAt: "asc" }, { dueDate: "asc" }];
    default:
      return [{ dueDate: "asc" }];
  }
}

function normalizeFeedback(feedback: string | null | undefined) {
  const trimmed = feedback?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > MAX_SUBMISSION_FEEDBACK_LENGTH) {
    throw new Error("Feedback must be 2000 characters or fewer.");
  }
  return trimmed;
}

function mapSubmissionRow(
  submission: Prisma.SubmissionGetPayload<{ include: typeof submissionInclude }>,
) {
  const scheduledClass = submission.assignment.scheduledClass;
  const assignmentSubject = (
    submission.assignment as typeof submission.assignment & {
      subject?: { id: string; name: string; slug?: string } | null;
    }
  ).subject;
  const classGroup = scheduledClass.classGroup
    ? { id: scheduledClass.classGroup.id, name: scheduledClass.classGroup.name }
    : null;
  const firstAttachment = submission.attachments?.[0] ?? null;
  const contentUrl = firstAttachment
    ? `/uploads/${firstAttachment.storageKey}`
    : submission.contentUrl;

  return {
    id: submission.id,
    submissionId: submission.id,
    student: {
      id: submission.student.id,
      fullName: submission.student.fullName,
      email: submission.student.email,
    },
    studentName: submission.student.fullName,
    studentEmail: submission.student.email,
    assignment: {
      id: submission.assignment.id,
      title: submission.assignment.title,
    },
    assignmentTitle: submission.assignment.title,
    scheduledClass: {
      id: scheduledClass.id,
      title: scheduledClass.title,
    },
    classGroup,
    subject: scheduledClass.subject
      ? {
          id: scheduledClass.subject.id,
          name: scheduledClass.subject.name,
          slug: scheduledClass.subject.slug,
        }
      : assignmentSubject
        ? {
            id: assignmentSubject.id,
            name: assignmentSubject.name,
            slug: assignmentSubject.slug ?? "",
          }
        : null,
    submittedAt: submission.submittedAt,
    status: submission.grade === null ? "Pending" : "Graded",
    grade: submission.grade,
    feedback: submission.feedback,
    feedbackPreview: feedbackPreview(submission.feedback),
    contentUrl,
    attachmentLink: firstAttachment
      ? {
          filename: firstAttachment.filename,
          href: contentUrl,
        }
      : null,
    reviewHref: `/portal/teacher/submissions/${submission.id}`,
    reviewDisabled: false,
  };
}

function safeSubmissionHref(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("/uploads/")) return url;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function attachmentHref(storageKey: string) {
  return storageKey.startsWith("/uploads/") ? storageKey : `/uploads/${storageKey}`;
}

function safeUploadHref(url: string | null | undefined) {
  return safeSubmissionHref(url);
}

function submissionStatus(
  assignment: Pick<StudentAssignmentRecord, "archivedAt" | "dueDate" | "submissions">,
) {
  if (assignment.archivedAt) return "Archived";
  const currentSubmission = assignment.submissions[0] ?? null;
  if (currentSubmission?.grade !== null && currentSubmission?.grade !== undefined) return "Graded";
  if (currentSubmission) return "Submitted";
  if (assignment.dueDate.getTime() < Date.now()) return "Missing";
  return "Not submitted";
}

function mapStudentSubmission(submission: StudentAssignmentRecord["submissions"][number]) {
  const submittedWorkHref = safeSubmissionHref(submission.contentUrl);
  return {
    id: submission.id,
    studentId: submission.studentId,
    assignmentId: submission.assignmentId,
    contentUrl: submission.contentUrl,
    submittedWorkHref,
    submittedAt: submission.submittedAt,
    updatedAt: submission.updatedAt,
    grade: submission.grade,
    feedback: submission.feedback,
    status: submission.grade === null ? "Pending" : "Graded",
    attachments: (submission.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      href: safeUploadHref(attachmentHref(attachment.storageKey)),
    })),
  };
}

function mapMaterial(
  material: NonNullable<StudentAssignmentRecord["scheduledClass"]["courseMaterials"]>[number],
) {
  const attachment = material.attachments?.[0] ?? null;
  const href = safeUploadHref(
    attachment ? attachmentHref(attachment.storageKey) : material.fileUrl,
  );
  return {
    id: material.id,
    title: material.title,
    description: material.description,
    href,
    fileUrl: material.fileUrl,
  };
}

function mapStudentAssignmentRow(assignment: StudentAssignmentRecord) {
  const currentSubmission = assignment.submissions[0] ?? null;
  const status = submissionStatus(assignment);
  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description,
    descriptionPreview: descriptionPreview(assignment.description),
    dueDate: assignment.dueDate,
    archivedAt: assignment.archivedAt,
    status,
    grade: currentSubmission?.grade ?? null,
    feedback: currentSubmission?.feedback ?? null,
    feedbackPreview: feedbackPreview(currentSubmission?.feedback ?? null),
    subject: assignment.scheduledClass.subject
      ? {
          id: assignment.scheduledClass.subject.id,
          name: assignment.scheduledClass.subject.name,
          slug: assignment.scheduledClass.subject.slug ?? "",
        }
      : null,
    scheduledClass: {
      id: assignment.scheduledClass.id,
      title: assignment.scheduledClass.title,
    },
    classGroup: assignment.scheduledClass.classGroup
      ? {
          id: assignment.scheduledClass.classGroup.id,
          name: assignment.scheduledClass.classGroup.name,
        }
      : null,
    currentSubmission: currentSubmission ? mapStudentSubmission(currentSubmission) : null,
    detailHref: `/portal/student/assignments/${assignment.id}`,
  };
}

function mapStudentAssignmentDetail(assignment: StudentAssignmentRecord) {
  const currentSubmission = assignment.submissions[0] ?? null;
  const submissionHistory = assignment.submissions.map(mapStudentSubmission);
  const isArchived = assignment.archivedAt !== null;

  return {
    ...mapStudentAssignmentRow(assignment),
    teacher: assignment.scheduledClass.teacher
      ? {
          id: assignment.scheduledClass.teacher.id,
          fullName: assignment.scheduledClass.teacher.fullName,
          email: assignment.scheduledClass.teacher.email,
        }
      : null,
    materials: (assignment.scheduledClass.courseMaterials ?? []).map(mapMaterial),
    lessonHref: `/portal/student/schedule/${assignment.scheduledClass.id}`,
    submissionHistory,
    currentSubmission: currentSubmission ? mapStudentSubmission(currentSubmission) : null,
    grade: currentSubmission?.grade ?? null,
    feedback: currentSubmission?.feedback ?? null,
    canSubmit: !isArchived,
    canResubmit: !isArchived && Boolean(currentSubmission),
    readOnlyReason: isArchived ? "This assignment is archived." : null,
  };
}

function mapSubmissionDetail(
  submission: Prisma.SubmissionGetPayload<{ include: typeof submissionInclude }>,
) {
  const scheduledClass = submission.assignment.scheduledClass;
  const student = submission.student ?? {
    id: submission.studentId,
    fullName: "Student",
    email: "",
  };
  const classGroup = scheduledClass.classGroup
    ? {
        id: scheduledClass.classGroup.id,
        name: scheduledClass.classGroup.name,
        href: `/portal/teacher/classes/${scheduledClass.classGroup.id}`,
      }
    : null;
  const attachments = (submission.attachments ?? []).map((attachment) => ({
    id: attachment.id,
    filename: attachment.filename,
    href: attachmentHref(attachment.storageKey),
  }));

  return {
    id: submission.id,
    submissionId: submission.id,
    studentId: submission.studentId,
    assignmentId: submission.assignmentId,
    student: {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
    },
    assignment: {
      id: submission.assignment.id,
      title: submission.assignment.title,
      description: submission.assignment.description,
      dueDate: submission.assignment.dueDate,
    },
    scheduledClass: {
      id: scheduledClass.id,
      title: scheduledClass.title,
    },
    classGroup,
    subject: scheduledClass.subject
      ? {
          id: scheduledClass.subject.id,
          name: scheduledClass.subject.name,
          slug: scheduledClass.subject.slug,
        }
      : null,
    contentUrl: submission.contentUrl,
    submittedWorkHref: safeSubmissionHref(submission.contentUrl),
    attachments,
    submittedAt: submission.submittedAt,
    updatedAt: submission.updatedAt,
    grade: submission.grade,
    feedback: submission.feedback,
    status: submission.grade === null ? "Pending" : "Graded",
  };
}

function validateGrade(input: GradeSubmissionInput) {
  if (input.grade === undefined || input.grade === null || input.grade === "") {
    throw new Error("Grade is required.");
  }
  const grade = typeof input.grade === "number" ? input.grade : Number(input.grade);
  if (!Number.isFinite(grade)) throw new Error("Grade must be a number.");
  if (grade < 0) throw new Error("Grade must be at least 0.");
  if (grade > 100) throw new Error("Grade must be at most 100.");
  return grade;
}

async function getStudentAssignmentInScope(
  studentId: string,
  assignmentId: string,
  database: SubmissionDatabase,
) {
  const assignment = await database.assignment.findFirst({
    where: {
      id: assignmentId,
      archivedAt: null,
      OR: studentAssignmentEnrollmentScope(studentId),
    },
    include: {
      scheduledClass: {
        select: {
          id: true,
          title: true,
          students: { select: { id: true } },
          classGroup: {
            select: {
              id: true,
              students: { select: { id: true } },
            },
          },
        },
      },
      submissions: {
        where: { studentId },
        orderBy: { submittedAt: "desc" },
      },
    },
  });

  if (!assignment) {
    throw new Error("Unauthorized: Student not enrolled in this assignment's class");
  }

  return assignment;
}

export async function getStudentAssignmentWithSubmission(
  studentId: string,
  assignmentId: string,
  database: SubmissionDatabase = prisma,
) {
  return getStudentAssignmentInScope(studentId, assignmentId, database);
}

export async function listAssignmentsForStudent(
  studentId: string,
  filters: StudentAssignmentFilters = {},
  database: SubmissionDatabase = prisma,
) {
  const assignments = await database.assignment.findMany({
    where: studentAssignmentWhere(studentId, filters),
    include: studentAssignmentInclude(studentId),
    orderBy: orderByForStudentAssignments(filters.sort),
  });

  const rows = assignments.map((assignment) =>
    mapStudentAssignmentRow(assignment as StudentAssignmentRecord),
  );

  if (normalizeStatus(filters.status) === "active") {
    return rows.filter((assignment) => assignment.status !== "Archived");
  }

  return rows;
}

export async function listMissingAssignmentsForReminders(
  now = new Date(),
  database: SubmissionDatabase = prisma,
) {
  const { reminderWindowStart, reminderWindowEnd } = dailyReminderWindow(now);
  const assignments = await database.assignment.findMany({
    where: {
      archivedAt: null,
      dueDate: { lt: now },
    },
    include: {
      scheduledClass: {
        include: {
          subject: { select: { id: true, name: true, slug: true } },
          teacher: { select: { id: true, fullName: true, email: true } },
          classGroup: {
            select: {
              id: true,
              name: true,
              students: { select: { id: true, parents: { select: { id: true } } } },
            },
          },
          students: { select: { id: true, parents: { select: { id: true } } } },
          courseMaterials: false,
        },
      },
      submissions: { select: { studentId: true } },
      assignmentReminders: {
        where: {
          status: "SENT",
          reminderWindowStart,
          reminderWindowEnd,
        },
        select: {
          recipientUserId: true,
          channel: true,
          status: true,
          reminderWindowStart: true,
          reminderWindowEnd: true,
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { title: "asc" }],
  });

  return (assignments as unknown as AssignmentReminderRecord[])
    .map((assignment) => ({
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      dueDate: assignment.dueDate,
      scheduledClass: {
        id: assignment.scheduledClass.id,
        title: assignment.scheduledClass.title,
      },
      subject: assignment.scheduledClass.subject
        ? {
            id: assignment.scheduledClass.subject.id,
            name: assignment.scheduledClass.subject.name,
            slug: assignment.scheduledClass.subject.slug ?? "",
          }
        : null,
      classGroup: assignment.scheduledClass.classGroup
        ? {
            id: assignment.scheduledClass.classGroup.id,
            name: assignment.scheduledClass.classGroup.name,
          }
        : null,
      recipients: uniqueStudentRecipients(assignment),
      reminders: assignment.assignmentReminders ?? [],
    }))
    .filter((assignment) => assignment.recipients.length > 0);
}

export async function createAssignmentReminderLog(
  input: {
    assignmentId: string;
    recipientUserId: string;
    recipientEmail: string;
    channel: ReminderChannel;
    status: ReminderDeliveryStatus;
    details?: string | null;
    reminderWindowStart?: Date;
    reminderWindowEnd?: Date;
  },
  database: SubmissionDatabase = prisma,
) {
  return database.assignmentReminderLog.create({
    data: {
      assignmentId: input.assignmentId,
      recipientUserId: input.recipientUserId,
      recipientEmail: input.recipientEmail,
      channel: input.channel,
      status: input.status,
      details: input.details,
      reminderWindowStart: input.reminderWindowStart,
      reminderWindowEnd: input.reminderWindowEnd,
    },
  });
}

export async function getAssignmentDetailForStudent(
  studentId: string,
  assignmentId: string,
  database: SubmissionDatabase = prisma,
) {
  const assignment = await database.assignment.findFirst({
    where: {
      id: assignmentId,
      OR: studentAssignmentEnrollmentScope(studentId),
    },
    include: studentAssignmentInclude(studentId),
  });

  return assignment ? mapStudentAssignmentDetail(assignment as StudentAssignmentRecord) : null;
}

export async function submitOrResubmitStudentWork(
  input: StudentSubmissionInput,
  database: SubmissionDatabase = prisma,
) {
  if (!input.assignmentId?.trim()) throw new Error("Assignment ID is required.");
  if (!input.contentUrl?.trim()) throw new Error("Submission URL is required.");

  await getStudentAssignmentInScope(input.studentId, input.assignmentId, database);

  const existing = await database.submission.findFirst({
    where: {
      studentId: input.studentId,
      assignmentId: input.assignmentId,
    },
    orderBy: { submittedAt: "desc" },
  });

  if (existing) {
    return database.submission.update({
      where: { id: existing.id },
      data: {
        contentUrl: input.contentUrl,
        submittedAt: new Date(),
        grade: null,
        feedback: null,
      },
      include: submissionInclude,
    });
  }

  return database.submission.create({
    data: {
      studentId: input.studentId,
      assignmentId: input.assignmentId,
      contentUrl: input.contentUrl,
    },
    include: submissionInclude,
  });
}

export async function listSubmissionsForAssignmentByTeacher(
  teacherId: string,
  assignmentId: string,
  filters: TeacherSubmissionFilters = {},
  database: SubmissionDatabase = prisma,
) {
  return database.submission.findMany({
    where: {
      assignmentId,
      ...gradeWhere(filters),
      OR: teacherSubmissionScope(teacherId),
    },
    include: submissionInclude,
    orderBy: { submittedAt: "desc" },
  });
}

export async function listSubmissionsForTeacher(
  teacherId: string,
  filters: TeacherSubmissionFilters = {},
  database: SubmissionDatabase = prisma,
) {
  const andFilters = listFiltersWhere(filters);
  const submissions = await database.submission.findMany({
    where: {
      ...gradeWhere(filters),
      OR: teacherSubmissionScope(teacherId),
      ...(andFilters.length > 0 ? { AND: andFilters } : {}),
    },
    include: submissionInclude,
    orderBy: orderByForTeacherSubmissions(filters.sort),
  });

  return submissions.map(mapSubmissionRow);
}

export async function getSubmissionForTeacher(
  teacherId: string,
  submissionId: string,
  database: SubmissionDatabase = prisma,
) {
  const submission = await database.submission.findFirst({
    where: {
      id: submissionId,
      OR: teacherSubmissionScope(teacherId),
    },
    include: submissionInclude,
  });

  return submission ? mapSubmissionDetail(submission) : null;
}

export async function gradeSubmissionForTeacher(
  teacherId: string,
  submissionId: string,
  input: GradeSubmissionInput,
  database: SubmissionDatabase = prisma,
) {
  const grade = validateGrade(input);
  const feedback = normalizeFeedback(input.feedback);
  const before = await getSubmissionForTeacher(teacherId, submissionId, database);
  if (!before) {
    throw new Error("Submission not found or not owned by teacher.");
  }
  const previousGrade = before.grade ?? null;

  const after = await database.submission.update({
    where: { id: submissionId },
    data: {
      grade,
      feedback,
    },
    include: submissionInclude,
  });

  return {
    ...mapSubmissionDetail(after),
    before,
    after: mapSubmissionDetail(after),
    previousGrade,
  };
}
