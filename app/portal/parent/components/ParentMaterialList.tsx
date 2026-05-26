type ParentMaterialAttachment = {
  filename: string;
  href?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

type ParentMaterial = {
  id: string;
  title: string;
  description?: string | null;
  fileUrl?: string | null;
  safeFileUrl?: string | null;
  attachments?: ParentMaterialAttachment[];
  scheduledClass?: { id?: string; title?: string; startAt?: Date | string | null } | null;
  classGroup?: { id?: string; name?: string } | null;
  subject?: { id?: string; name?: string } | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

type ParentMaterialListProps = {
  materials: ParentMaterial[];
  studentId: string;
  emptyMessage?: string;
};

function safeHref(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.startsWith("/uploads/")) return trimmed;

  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

function materialHref(material: ParentMaterial) {
  return safeHref(material.safeFileUrl ?? material.fileUrl);
}

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

function formatSize(value: number | null | undefined) {
  if (!value || value < 1) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentMeta(attachment: ParentMaterialAttachment) {
  return [attachment.mimeType, formatSize(attachment.size)].filter(Boolean).join(", ");
}

export function ParentMaterialList({
  emptyMessage = "No materials available for this student.",
  materials,
}: ParentMaterialListProps) {
  if (materials.length === 0) {
    return <output>{emptyMessage}</output>;
  }

  return (
    <div className="space-y-4">
      {materials.map((material) => {
        const href = materialHref(material);
        const created = formatDate(material.createdAt);
        const updated = formatDate(material.updatedAt);
        const lessonTitle = material.scheduledClass?.title ?? "Unknown class";

        return (
          <article
            aria-label={material.title}
            className="space-y-3 rounded-lg border p-4"
            key={material.id}
          >
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Class: {lessonTitle}</p>
              {material.classGroup?.name ? (
                <p className="text-xs text-muted-foreground">Group: {material.classGroup.name}</p>
              ) : null}
              {material.subject?.name ? (
                <p className="text-xs text-muted-foreground">Subject: {material.subject.name}</p>
              ) : null}
              <p className="text-xl font-semibold">{material.title}</p>
            </div>

            {material.description ? <p className="text-sm">{material.description}</p> : null}

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {created ? <span>Created: {created}</span> : null}
              {updated ? <span>Updated: {updated}</span> : null}
            </div>

            {href ? (
              <a className="inline-flex text-sm font-medium text-primary underline" href={href}>
                Open material
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">File unavailable</p>
            )}

            {material.attachments?.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {material.attachments.map((attachment) => {
                  const attachmentHref = safeHref(attachment.href);
                  const meta = attachmentMeta(attachment);
                  return (
                    <li key={`${material.id}-${attachment.filename}`}>
                      {attachmentHref ? (
                        <a href={attachmentHref}>{attachment.filename}</a>
                      ) : (
                        <span>{attachment.filename}</span>
                      )}
                      {meta ? <span className="text-muted-foreground"> ({meta})</span> : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
