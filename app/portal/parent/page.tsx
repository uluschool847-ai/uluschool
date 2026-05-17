import { UserRole } from "@prisma/client";

import { requireRole } from "@/lib/auth/session";
import { getParentDashboardData } from "@/lib/repositories/portal-repository";

export default async function ParentPortalPage() {
  const session = await requireRole([UserRole.PARENT]);

  const childrenData = await getParentDashboardData(session.uid);

  if (!childrenData || childrenData.length === 0) {
    return (
      <main className="p-8 text-center">
        <h1 className="text-2xl font-bold">Parent Dashboard</h1>
        <output>
          <p className="text-gray-500 mt-2">
            No linked students found. Please contact administration.
          </p>
        </output>
      </main>
    );
  }

  return (
    <main className="p-8 max-w-5xl mx-auto space-y-16">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Parent Dashboard</h1>
        <p className="mt-2 text-gray-500">
          Track your child&apos;s classes, homework, grades, and overall progress.
        </p>
      </header>

      {childrenData.map((child) => (
        <section
          key={child.id}
          aria-label={`Dashboard for ${child.childName}`}
          className="space-y-10 border-b border-gray-100 pb-16 last:border-0"
        >
          <header>
            <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight">
              {child.childName}
            </h2>
            <p className="text-blue-600 font-semibold mt-1">Student Performance Dashboard</p>
          </header>

          <section aria-label={`Upcoming classes for ${child.childName}`}>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Upcoming Classes</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {child.upcomingClasses.map((scheduledClass) => (
                <div
                  key={scheduledClass.id}
                  className="p-5 bg-white border border-gray-200 rounded-2xl shadow-sm"
                >
                  <h3 className="font-bold text-gray-900">{scheduledClass.title}</h3>
                  <p className="text-gray-500 text-sm">
                    Subject: {scheduledClass.subject?.name ?? "General"}
                  </p>
                  {scheduledClass.classGroup ? (
                    <p className="text-gray-500 text-sm">Group: {scheduledClass.classGroup.name}</p>
                  ) : null}
                  <p className="text-gray-500 text-sm">{scheduledClass.teacher}</p>
                  <p className="text-blue-600 font-bold mt-3 text-xs uppercase">
                    {scheduledClass.time}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section aria-label={`Homework status for ${child.childName}`}>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Homework Status</h2>
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-2 bg-gray-50 p-4 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase">
                <div>Assignment</div>
                <div>Status</div>
              </div>
              {child.homeworkStatus.map((homework) => (
                <div
                  key={homework.id}
                  className="grid grid-cols-2 p-4 border-b border-gray-100 last:border-0 items-center"
                >
                  <div className="font-medium text-gray-800">{homework.title}</div>
                  <div>
                    <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold">
                      {homework.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-label={`Recent grades for ${child.childName}`}>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Recent Grades</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {child.recentGrades.map((grade) => (
                <div
                  key={grade.id}
                  className="p-6 bg-slate-50 border border-slate-200 rounded-2xl flex gap-6"
                >
                  <div className="text-3xl font-black text-blue-600">{grade.grade}</div>
                  <div>
                    <h3 className="font-bold text-gray-900">{grade.subject}</h3>
                    <p className="text-sm text-gray-600 mt-1 italic">"{grade.feedback}"</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-label={`Overall progress for ${child.childName}`}>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Overall Progress</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-8 bg-gray-900 text-white rounded-3xl text-center">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  Attendance
                </p>
                <p className="text-4xl font-black mt-2">{child.structuredProgress.attendance}</p>
              </div>
              <div className="p-8 bg-blue-600 text-white rounded-3xl text-center">
                <p className="text-xs font-bold text-blue-200 uppercase tracking-widest">
                  Completed Tasks
                </p>
                <p className="text-4xl font-black mt-2">
                  {child.structuredProgress.completedAssignments}
                </p>
              </div>
            </div>
          </section>
        </section>
      ))}
    </main>
  );
}
