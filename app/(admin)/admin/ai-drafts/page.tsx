import { UserRole } from "@prisma/client";

import {
  generateCrmFollowUpDraftFormAction,
  reviewAdminAiDraftFormAction,
} from "@/app/(admin)/admin/actions/ai-draft-actions";
import { requireRole } from "@/lib/auth/session";
import { listAdminAiDrafts } from "@/lib/repositories/ai-draft-repository";

type AdminAiDraftsPageProps = {
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

export default async function AdminAiDraftsPage({
  searchParams = {},
}: AdminAiDraftsPageProps = {}) {
  const resolvedSearchParams = await searchParams;
  const session = await requireRole([UserRole.ADMIN]);
  const drafts = await listAdminAiDrafts(session.uid);

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">AI Draft Assistant</h1>
        <p className="text-sm text-slate-600">
          Local mock AI drafts require admin review before any message is used.
        </p>
      </header>

      {resolvedSearchParams.aiDraftMessage ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {resolvedSearchParams.aiDraftMessage}
        </p>
      ) : null}

      {resolvedSearchParams.aiDraftError ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {resolvedSearchParams.aiDraftError}
        </p>
      ) : null}

      <section className="rounded-lg border p-4" aria-label="Generate CRM follow-up draft">
        <h2 className="text-xl font-semibold">CRM follow-up draft</h2>
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          action={generateCrmFollowUpDraftFormAction}
        >
          <label className="grid gap-1 text-sm">
            Enquiry ID
            <input className="rounded-md border p-2" name="enquiryId" required />
          </label>
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white" type="submit">
            Generate CRM draft
          </button>
        </form>
      </section>

      <section className="space-y-3" aria-label="AI draft list">
        {drafts.length === 0 ? (
          <p>No AI drafts yet.</p>
        ) : (
          drafts.map((draft) => (
            <article className="rounded-lg border p-4" key={draft.id}>
              <p className="text-xs uppercase text-slate-500">{draft.type}</p>
              <p>{draft.outputText}</p>
              <p>Status: {draft.status}</p>
              {draft.status === "DRAFT" ? (
                <div className="mt-3 flex gap-2">
                  <form action={reviewAdminAiDraftFormAction}>
                    <input name="draftId" type="hidden" value={draft.id} />
                    <input name="status" type="hidden" value="APPROVED" />
                    <button className="rounded-md border px-3 py-2 text-sm" type="submit">
                      Approve draft
                    </button>
                  </form>
                  <form action={reviewAdminAiDraftFormAction}>
                    <input name="draftId" type="hidden" value={draft.id} />
                    <input name="status" type="hidden" value="REJECTED" />
                    <button className="rounded-md border px-3 py-2 text-sm" type="submit">
                      Reject draft
                    </button>
                  </form>
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
