import { prisma } from "@/lib/prisma";

// --- Materials ---

export async function listSubjectMaterials(subjectId: string) {
  return prisma.courseMaterial.findMany({
    where: { subjectId },
    orderBy: { createdAt: "desc" },
  });
}

// --- Homework ---

export async function listStudentHomework(studentId: string) {
  // Find all scheduled classes the student participated in, and get their homework
  return prisma.homework.findMany({
    where: {
      scheduledClass: {
        participantUserIds: {
          has: studentId,
        },
      },
    },
    include: {
      scheduledClass: { select: { title: true } },
      submissions: {
        where: { studentId },
      },
    },
    orderBy: { dueDate: "asc" },
  });
}

export async function listTeacherHomework(teacherId: string) {
  return prisma.homework.findMany({
    where: {
      scheduledClass: {
        teacherId,
      },
    },
    include: {
      scheduledClass: { select: { title: true } },
      _count: { select: { submissions: true } },
    },
    orderBy: { dueDate: "desc" },
  });
}

export type TeacherDashboardData = {
  metrics: {
    myClasses: number;
    activeAssignments: number;
    pendingSubmissions: number;
    upcomingLessons: number;
  };
  classes: Array<{
    id: string;
    title: string;
    description: string | null;
    startAt: Date;
    endAt: Date;
    liveLessonUrl: string;
    studentCount: number;
  }>;
  activeAssignments: Array<{
    id: string;
    title: string;
    description: string;
    dueDate: Date;
    scheduledClassId: string;
    scheduledClassTitle: string;
    submissionCount: number;
    pendingSubmissionCount: number;
  }>;
  recentPendingSubmissions: Array<{
    id: string;
    contentUrl: string;
    submittedAt: Date;
    studentName: string;
    studentEmail: string;
    assignmentTitle: string;
    classTitle: string;
  }>;
  upcomingLessons: Array<{
    id: string;
    title: string;
    description: string | null;
    startAt: Date;
    endAt: Date;
    liveLessonUrl: string;
    studentCount: number;
  }>;
};

export async function getTeacherDashboardData(teacherId: string): Promise<TeacherDashboardData> {
  const now = new Date();

  const [
    myClasses,
    upcomingLessonsCount,
    activeAssignmentsCount,
    pendingSubmissionsCount,
    classes,
    activeAssignments,
    recentPendingSubmissions,
    upcomingLessons,
  ] = await Promise.all([
    prisma.scheduledClass.count({
      where: { teacherId },
    }),
    prisma.scheduledClass.count({
      where: {
        teacherId,
        startAt: { gte: now },
      },
    }),
    prisma.homework.count({
      where: {
        scheduledClass: { teacherId },
        dueDate: { gte: now },
      },
    }),
    prisma.homeworkSubmission.count({
      where: {
        grade: null,
        homework: {
          scheduledClass: { teacherId },
        },
      },
    }),
    prisma.scheduledClass.findMany({
      where: { teacherId },
      select: {
        id: true,
        title: true,
        description: true,
        startAt: true,
        endAt: true,
        liveLessonUrl: true,
        participantUserIds: true,
      },
      orderBy: { startAt: "asc" },
      take: 8,
    }),
    prisma.homework.findMany({
      where: {
        scheduledClass: { teacherId },
        dueDate: { gte: now },
      },
      select: {
        id: true,
        title: true,
        description: true,
        dueDate: true,
        scheduledClassId: true,
        scheduledClass: { select: { title: true } },
        submissions: {
          select: {
            id: true,
            grade: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    prisma.homeworkSubmission.findMany({
      where: {
        grade: null,
        homework: {
          scheduledClass: { teacherId },
        },
      },
      select: {
        id: true,
        contentUrl: true,
        submittedAt: true,
        student: {
          select: {
            fullName: true,
            email: true,
          },
        },
        homework: {
          select: {
            title: true,
            scheduledClass: {
              select: { title: true },
            },
          },
        },
      },
      orderBy: { submittedAt: "desc" },
      take: 8,
    }),
    prisma.scheduledClass.findMany({
      where: {
        teacherId,
        startAt: { gte: now },
      },
      select: {
        id: true,
        title: true,
        description: true,
        startAt: true,
        endAt: true,
        liveLessonUrl: true,
        participantUserIds: true,
      },
      orderBy: { startAt: "asc" },
      take: 6,
    }),
  ]);

  return {
    metrics: {
      myClasses,
      activeAssignments: activeAssignmentsCount,
      pendingSubmissions: pendingSubmissionsCount,
      upcomingLessons: upcomingLessonsCount,
    },
    classes: classes.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      startAt: item.startAt,
      endAt: item.endAt,
      liveLessonUrl: item.liveLessonUrl,
      studentCount: item.participantUserIds.length,
    })),
    activeAssignments: activeAssignments.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      dueDate: item.dueDate,
      scheduledClassId: item.scheduledClassId,
      scheduledClassTitle: item.scheduledClass.title,
      submissionCount: item.submissions.length,
      pendingSubmissionCount: item.submissions.filter((submission) => !submission.grade).length,
    })),
    recentPendingSubmissions: recentPendingSubmissions.map((submission) => ({
      id: submission.id,
      contentUrl: submission.contentUrl,
      submittedAt: submission.submittedAt,
      studentName: submission.student.fullName,
      studentEmail: submission.student.email,
      assignmentTitle: submission.homework.title,
      classTitle: submission.homework.scheduledClass.title,
    })),
    upcomingLessons: upcomingLessons.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      startAt: item.startAt,
      endAt: item.endAt,
      liveLessonUrl: item.liveLessonUrl,
      studentCount: item.participantUserIds.length,
    })),
  };
}

export async function submitHomework(studentId: string, homeworkId: string, contentUrl: string) {
  return prisma.homeworkSubmission.upsert({
    where: {
      studentId_homeworkId: {
        studentId,
        homeworkId,
      },
    },
    update: {
      contentUrl,
    },
    create: {
      studentId,
      homeworkId,
      contentUrl,
    },
  });
}

export async function gradeHomework(submissionId: string, grade: string, feedback: string) {
  return prisma.homeworkSubmission.update({
    where: { id: submissionId },
    data: { grade, feedback },
  });
}

// --- Student Progress ---

export async function getStudentProgress(studentId: string) {
  return prisma.studentProgress.findMany({
    where: { studentId },
    include: { subject: { select: { name: true } } },
    orderBy: { recordedAt: "desc" },
  });
}

export async function recordStudentProgress(data: {
  studentId: string;
  subjectId: string;
  gradeLevel: string;
  teacherNotes: string;
}) {
  return prisma.studentProgress.create({
    data,
  });
}
