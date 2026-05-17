import { UserRole } from "@prisma/client";

import { UserCreateForm } from "@/components/admin/users/UserCreateForm";
import { UserRoleEditor } from "@/components/admin/users/UserRoleEditor";
import { findAllUsers } from "@/lib/repositories/portal-repository";

type SearchParams = Record<string, string | undefined>;

type UsersPageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

const PAGE_SIZE = 20;

function parseRole(role?: string) {
  if (!role) return undefined;
  return Object.values(UserRole).includes(role as UserRole) ? (role as UserRole) : undefined;
}

function parsePage(page?: string) {
  const parsed = Number(page);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function AdminUsersPage({ searchParams = {} }: UsersPageProps) {
  const resolvedSearchParams = await searchParams;
  const page = parsePage(resolvedSearchParams.page);
  const role = parseRole(resolvedSearchParams.role);
  const searchQuery = resolvedSearchParams.q?.trim() || undefined;
  const result = await findAllUsers({
    page,
    limit: PAGE_SIZE,
    role,
    searchQuery,
  });
  const users = result.items ?? result.data ?? [];

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-950">User Management</h1>
        <p className="text-sm text-slate-600">Create local accounts and manage portal roles.</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <form className="grid gap-4 md:grid-cols-[1fr_220px_auto]" action="/admin/users">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Search users
            <input
              name="q"
              defaultValue={searchQuery ?? ""}
              type="search"
              className="rounded-md border border-slate-300 px-3 py-2"
              placeholder="Name or email"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Role
            <select
              name="role"
              defaultValue={role ?? ""}
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="">All roles</option>
              {Object.values(UserRole).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="self-end rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
          >
            Filter
          </button>
        </form>
      </section>

      <UserCreateForm />

      {users.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-600">
          No users found.
        </div>
      ) : (
        <section className="grid gap-4" aria-label="User accounts">
          {users.map((user) => (
            <UserRoleEditor
              key={user.id}
              user={{
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                isActive: user.isActive,
              }}
            />
          ))}
        </section>
      )}
    </main>
  );
}
