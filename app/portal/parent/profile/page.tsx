import { UserRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { getParentProfile } from "@/lib/repositories/parent-profile-repository";

type ProfileChild = NonNullable<Awaited<ReturnType<typeof getParentProfile>>>["children"][number];

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function ChildCard({ child }: { child: ProfileChild }) {
  const classGroups = child.classGroups ?? [];
  const classes = child.classes ?? [];

  return (
    <article aria-label={child.name} className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="text-lg font-semibold">{child.name}</p>
        <p className="text-sm text-muted-foreground">{child.email}</p>
      </div>

      {classGroups.length > 0 ? (
        <div className="space-y-2">
          <p className="font-medium">Class groups</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {classGroups.map((group) => (
              <li key={group.id}>
                {group.name}
                {group.subject?.name ? ` - ${group.subject.name}` : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No class group memberships yet.</p>
      )}

      {classes.length > 0 ? (
        <div className="space-y-2">
          <p className="font-medium">Classes</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {classes.map((scheduledClass) => (
              <li key={scheduledClass.id}>
                {scheduledClass.title}
                {scheduledClass.subject?.name ? (
                  <span> - {scheduledClass.subject.name}</span>
                ) : null}
                {scheduledClass.classGroup?.name ? (
                  <span> ({scheduledClass.classGroup.name})</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export default async function ParentProfilePage() {
  const session = await requireRole([UserRole.PARENT]);
  const profile = await getParentProfile(session.uid);

  if (!profile) notFound();

  const created = formatDate(profile.createdAt);
  const updated = formatDate(profile.updatedAt);

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <header className="space-y-3">
        <Link
          aria-label="Back to parent dashboard"
          className="text-sm font-medium text-primary underline"
          href="/portal/parent"
        >
          Back to dashboard
        </Link>
        <div className="space-y-1">
          <h1 aria-label="Parent Profile" className="text-3xl font-bold tracking-tight">
            Profile
          </h1>
          <p className="text-muted-foreground">Read-only account and linked children overview.</p>
        </div>
      </header>

      <section aria-label="Parent identity" className="space-y-3 rounded-lg border p-5">
        <div>
          <p className="text-xl font-semibold">{profile.name}</p>
          <p className="text-sm text-muted-foreground">{profile.email}</p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">Role</dt>
            <dd>Guardian</dd>
          </div>
          <div>
            <dt className="font-medium">Status</dt>
            <dd>{profile.status}</dd>
          </div>
          {created ? (
            <div>
              <dt className="font-medium">Created</dt>
              <dd>{created}</dd>
            </div>
          ) : null}
          {updated ? (
            <div>
              <dt className="font-medium">Updated</dt>
              <dd>{updated}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section aria-label="Linked children" className="space-y-4">
        <h2 className="text-2xl font-semibold">Linked children</h2>
        {profile.children.length === 0 ? (
          <output className="block rounded-lg border p-5 text-muted-foreground">
            No linked children found.
          </output>
        ) : (
          <div className="grid gap-4">
            {profile.children.map((child) => (
              <ChildCard child={child} key={child.id} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
