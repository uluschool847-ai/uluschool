import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { getStudentProfile } from "@/lib/repositories/student-profile-repository";

export const metadata: Metadata = {
  title: "Profile - Student Portal",
};

function formatDate(date?: Date | string | null) {
  if (!date) return null;
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).formatToParts(value);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  return `${day} ${month} ${year}`;
}

function label(value: unknown) {
  if (typeof value !== "string" || !value) return "Not set";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function StudentProfilePage() {
  const session = await requireRole([UserRole.STUDENT]);
  const profile = await getStudentProfile(session.uid);

  if (!profile) {
    return (
      <main className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p>Student profile is not available.</p>
        <Link className="font-medium text-primary" href="/portal/student">
          Back to dashboard
        </Link>
      </main>
    );
  }

  const hasMembership = profile.classGroups.length > 0 || profile.directClasses.length > 0;

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">
          Review your account identity and current school membership.
        </p>
      </header>

      <section aria-labelledby="account-heading" className="rounded-lg border p-4">
        <h2 className="font-heading text-xl font-semibold" id="account-heading">
          Account
        </h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">Name</dt>
            <dd>{profile.fullName}</dd>
          </div>
          <div>
            <dt className="font-medium">Email</dt>
            <dd>{profile.email}</dd>
          </div>
          <div>
            <dt className="font-medium">Role</dt>
            <dd>{label(profile.role)}</dd>
          </div>
          <div>
            <dt className="font-medium">Status</dt>
            <dd>{profile.isActive ? label(profile.learningStatus ?? "ACTIVE") : "Inactive"}</dd>
          </div>
          {formatDate(profile.createdAt) ? (
            <div>
              <dt className="font-medium">Account created</dt>
              <dd>{formatDate(profile.createdAt)}</dd>
            </div>
          ) : null}
          {formatDate(profile.updatedAt) ? (
            <div>
              <dt className="font-medium">Last updated</dt>
              <dd>{formatDate(profile.updatedAt)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="membership-heading" className="rounded-lg border p-4">
        <h2 className="font-heading text-xl font-semibold" id="membership-heading">
          Class membership
        </h2>
        {hasMembership ? (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {profile.classGroups.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-medium">Groups</h3>
                <ul className="space-y-2">
                  {profile.classGroups.map((group) => (
                    <li className="rounded-md border p-3" key={group.id}>
                      <p className="font-medium">{group.name}</p>
                      {group.teacher?.fullName ? <p>Teacher: {group.teacher.fullName}</p> : null}
                      <p>Status: {label(group.status)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {profile.directClasses.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-medium">Direct classes</h3>
                <ul className="space-y-2">
                  {profile.directClasses.map((lesson) => (
                    <li className="rounded-md border p-3" key={lesson.id}>
                      <p className="font-medium">{lesson.title}</p>
                      {lesson.teacher?.fullName ? <p>Teacher: {lesson.teacher.fullName}</p> : null}
                      {formatDate(lesson.startAt) ? (
                        <p>Lesson date: {formatDate(lesson.startAt)}</p>
                      ) : null}
                      <p>Status: {label(lesson.status)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <output aria-label="Class membership" className="mt-3 block text-muted-foreground">
            No class or group membership yet. No classes assigned yet.
          </output>
        )}
      </section>

      <Link className="font-medium text-primary" href="/portal/student">
        Back to dashboard
      </Link>
    </main>
  );
}
