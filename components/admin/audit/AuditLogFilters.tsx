"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function AuditLogFilters({
  initialActionType = "",
  initialEntityType = "",
  initialAdminUserId = "",
  initialFrom = "",
  initialTo = "",
}: {
  initialActionType?: string;
  initialEntityType?: string;
  initialAdminUserId?: string;
  initialFrom?: string;
  initialTo?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [actionType, setActionType] = useState(initialActionType);
  const [entityType, setEntityType] = useState(initialEntityType);
  const [adminUserId, setAdminUserId] = useState(initialAdminUserId);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("action");
    params.delete("actionType");
    params.delete("entity");
    params.delete("targetType");
    params.delete("page");

    if (actionType) {
      params.set("actionType", actionType);
    }

    if (entityType) {
      params.set("targetType", entityType);
    }

    if (adminUserId) {
      params.set("adminUserId", adminUserId);
    } else {
      params.delete("adminUserId");
    }

    if (from) {
      params.set("from", from);
    } else {
      params.delete("from");
    }

    if (to) {
      params.set("to", to);
    } else {
      params.delete("to");
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-5">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Action type
          <input
            value={actionType}
            onChange={(event) => setActionType(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
            placeholder="CMS_PAGE_UPDATED"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Entity
          <input
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
            placeholder="cms_page"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Admin user
          <input
            value={adminUserId}
            onChange={(event) => setAdminUserId(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
            placeholder="admin-1"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          From
          <input
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            type="date"
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          To
          <input
            value={to}
            onChange={(event) => setTo(event.target.value)}
            type="date"
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={applyFilters}
        className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
      >
        Apply Filters
      </button>
    </section>
  );
}
