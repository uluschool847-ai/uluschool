# Launch Private Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ephemeral Render uploads with private Cloudflare R2 objects, stable application URLs, and role/relationship authorization for every download.

**Architecture:** Storage adapters persist opaque namespaced keys; application URLs encode keys but confer no access. Private and public file routes resolve the key, authorize it against PostgreSQL relations, and only then redirect to a 60-second R2 presigned GET URL. Local development uses the same application URL contract with a local adapter.

**Tech Stack:** Cloudflare R2 S3 API, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, Prisma/PostgreSQL, Next.js route handlers, existing session helpers, Vitest.

## Global Constraints

- The R2 bucket is private; no `r2.dev` public bucket URL is used.
- R2 API credentials are server-only and never use a `NEXT_PUBLIC_` prefix.
- Object keys are generated server-side under fixed namespaces; client filenames cannot select paths.
- Presigned GET URLs expire after 60 seconds and are treated as bearer tokens.
- An administrator can access only keys referenced by school database records, not arbitrary bucket objects.
- Teacher access follows direct material ownership, scheduled-class ownership, class-group ownership, or assigned report/submission ownership.
- Student access follows enrollment and own-record relations; parent access follows the persisted parent-child relation.
- Cross-user denial returns `404` after authentication to avoid confirming another user's object.
- Existing external HTTPS material/submission links remain external and are not copied to R2.
- Local development keeps `STORAGE_DRIVER=local`; staging and production require `STORAGE_DRIVER=r2`.

---

## File Map

- Refine `lib/storage/StorageService.ts`, `LocalStorageService.ts`, and `index.ts` around namespaced upload options and authorized application URLs.
- Create `lib/storage/upload-input.ts`, `storage-key.ts`, `storage-url.ts`, and their tests.
- Create `lib/storage/R2StorageService.ts` and adapter tests.
- Update authenticated upload, teacher photo, report PDF, and material action call sites.
- Create `lib/repositories/file-access-repository.ts` with role/relationship tests.
- Create `app/api/files/[token]/route.ts` and `app/api/public-files/[token]/route.ts` with route tests.
- Replace direct `/uploads/...` construction in material, submission, schedule, and report presentation code.
- Extend `.env.example` with the R2 driver contract.

### Task 1: Define Namespaced Storage Keys and a Shared Upload Contract

**Files:**

- Modify: `lib/storage/StorageService.ts`
- Create: `lib/storage/upload-input.ts`
- Create: `lib/storage/storage-key.ts`
- Create: `lib/storage/storage-url.ts`
- Modify: `lib/storage/LocalStorageService.ts`
- Modify: `lib/storage/index.ts`
- Modify: `lib/storage/__tests__/LocalStorage.test.ts`
- Create: `lib/storage/__tests__/storage-key.test.ts`
- Create: `lib/storage/__tests__/storage-url.test.ts`
- Modify: `app/api/upload/route.ts`
- Modify: `app/api/upload/__tests__/route.test.ts`
- Modify: `app/portal/teacher/actions/material-actions.ts`
- Modify: `tests/portal/teacher-material-actions.test.ts`

**Interfaces:**

- Produces: `UploadOptions`, `buildStorageKey`, `storageUrlForKey`, `decodeStorageToken`, and namespace ownership guards.
- Consumes later: R2 adapter and file routes.

- [ ] **Step 1: Write failing pure helper and local adapter tests**

Test these contracts:

```ts
expect(buildStorageKey("private/teachers/teacher-1/materials", "../lesson plan.pdf")).toMatch(
  /^private\/teachers\/teacher-1\/materials\/[0-9a-f-]+-lesson-plan\.pdf$/,
);
expect(() => buildStorageKey("../../escape", "file.pdf")).toThrow(/namespace/i);
expect(isTeacherMaterialStorageKey("private/teachers/teacher-1/materials/a.pdf", "teacher-1")).toBe(true);
expect(isTeacherMaterialStorageKey("private/teachers/teacher-2/materials/a.pdf", "teacher-1")).toBe(false);

const url = storageUrlForKey("private/teachers/teacher-1/materials/a.pdf");
expect(url).toMatch(/^\/api\/files\//);
expect(decodeStorageToken(url.split("/").at(-1)!)).toBe(
  "private/teachers/teacher-1/materials/a.pdf",
);
```

Update local storage tests to call `upload(file, { filename, namespace })` and expect the key to remain inside the configured upload root.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
npx vitest run lib/storage/__tests__/LocalStorage.test.ts lib/storage/__tests__/storage-key.test.ts lib/storage/__tests__/storage-url.test.ts app/api/upload/__tests__/route.test.ts tests/portal/teacher-material-actions.test.ts
```

Expected: helper modules and upload options do not exist.

- [ ] **Step 3: Replace the storage interface**

Define in `StorageService.ts`:

```ts
export type UploadOptions = {
  filename: string;
  namespace: string;
  contentType?: string;
};

export type StorageService = {
  upload(file: UploadInput, options: UploadOptions): Promise<string>;
  getURL(storageKey: string): string;
  createDownloadURL(storageKey: string, expiresInSeconds?: number): Promise<string>;
  delete(storageKey: string): Promise<void>;
};
```

Move file/buffer normalization, the 5 MB limit, MIME checks, and filename sanitization from `LocalStorageService.ts` into `upload-input.ts` so both adapters enforce identical rules.

- [ ] **Step 4: Implement pure key and URL helpers**

`storage-key.ts` exports fixed namespace helpers:

```ts
export const teacherMaterialNamespace = (teacherId: string) =>
  `private/teachers/${teacherId}/materials`;
export const teacherReportNamespace = (teacherId: string) =>
  `private/teachers/${teacherId}/reports`;
export const publicTeacherPhotoNamespace = (adminId: string) =>
  `public/teachers/${adminId}`;

export function isTeacherMaterialStorageKey(storageKey: string, teacherId: string) {
  return storageKey.startsWith(`${teacherMaterialNamespace(teacherId)}/`);
}
```

`buildStorageKey` accepts only namespace segments matching `/^[A-Za-z0-9_-]+$/`, sanitizes the basename, and appends `randomUUID()`.

`storage-url.ts` uses Base64URL tokens:

```ts
export function encodeStorageKey(storageKey: string) {
  return Buffer.from(storageKey, "utf8").toString("base64url");
}

export function decodeStorageToken(token: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("Invalid storage token");
  }
  const storageKey = Buffer.from(token, "base64url").toString("utf8");
  if (
    !storageKey ||
    encodeStorageKey(storageKey) !== token ||
    storageKey.includes("\\") ||
    storageKey.includes("..")
  ) {
    throw new Error("Invalid storage key");
  }
  return storageKey;
}

export function storageUrlForKey(storageKey: string) {
  const route = storageKey.startsWith("public/") ? "/api/public-files" : "/api/files";
  return `${route}/${encodeStorageKey(storageKey)}`;
}
```

- [ ] **Step 5: Update the local adapter and factory**

`LocalStorageService.upload` calls `normalizeUploadInput`, builds the key, resolves it beneath `uploadRoot`, creates parent directories, and writes bytes. `getURL` returns `storageUrlForKey(storageKey)`. `createDownloadURL` returns `/uploads/${storageKey}` for local development after path validation.

Remove `runtimeRole` and the role-keyed cache from `createStorageService`; cache only by the resolved driver name.

- [ ] **Step 6: Namespace material uploads and reject cross-teacher keys**

In `POST /api/upload`, derive namespace from the authenticated session and purpose:

```ts
const namespace =
  purpose === "teacher-photo"
    ? publicTeacherPhotoNamespace(session.uid)
    : teacherMaterialNamespace(session.uid);
const storageKey = await service.upload(current, {
  filename: current.name || "upload",
  namespace,
  contentType: current.type,
});
```

In each teacher material action, validate all attachment keys before repository mutation:

```ts
for (const attachment of attachments ?? []) {
  if (!isTeacherMaterialStorageKey(attachment.storageKey, session.uid)) {
    return { success: false, error: "Uploaded file is not owned by this teacher." };
  }
}
```

- [ ] **Step 7: Verify namespaced local storage GREEN**

Run the command from Step 2.

Expected: all helper, local adapter, route, and teacher action tests pass, including a teacher attempting to submit another teacher's key.

- [ ] **Step 8: Commit the storage contract**

```powershell
git add -- lib/storage app/api/upload app/portal/teacher/actions/material-actions.ts tests/portal/teacher-material-actions.test.ts
git commit -m "refactor: namespace school storage keys"
```

### Task 2: Implement the Cloudflare R2 Adapter

**Files:**

- Create: `lib/storage/R2StorageService.ts`
- Create: `lib/storage/__tests__/R2StorageService.test.ts`
- Modify: `lib/storage/index.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`

**Interfaces:**

- Consumes: shared `StorageService`, upload normalization, and storage URL helpers.
- Produces: S3 `PutObject`, `GetObject` presigning, and `DeleteObject` behavior for a private R2 bucket.

- [ ] **Step 1: Write mocked R2 adapter tests**

Mock `S3Client.send` and `getSignedUrl`. Test:

```ts
it("uploads bytes to the configured private bucket with content type");
it("returns an application URL rather than an R2 URL");
it("creates a 60-second signed GetObject URL");
it("deletes only the requested key");
it("rejects incomplete R2 configuration without printing values");
```

Assert the upload command receives:

```ts
expect.objectContaining({
  Bucket: "ulu-school-private",
  Key: expect.stringMatching(/^private\/teachers\/teacher-1\/materials\//),
  ContentType: "application/pdf",
  Body: expect.any(Buffer),
})
```

- [ ] **Step 2: Run the adapter tests and verify RED**

```powershell
npx vitest run lib/storage/__tests__/R2StorageService.test.ts
```

Expected: adapter and AWS SDK modules are missing.

- [ ] **Step 3: Install the S3-compatible SDK**

```powershell
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 4: Implement `R2StorageService`**

Construct the client with:

```ts
new S3Client({
  region: "auto",
  endpoint: config.endpoint,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});
```

Implement upload with `PutObjectCommand`, delete with `DeleteObjectCommand`, and download with:

```ts
return getSignedUrl(
  this.client,
  new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
  { expiresIn: expiresInSeconds ?? 60 },
);
```

`getURL` returns `storageUrlForKey(storageKey)` and never returns the endpoint or bucket name.

- [ ] **Step 5: Select the adapter from `STORAGE_DRIVER`**

In `lib/storage/index.ts`:

```ts
const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
if (driver === "r2") {
  return new R2StorageService({
    endpoint: process.env.R2_ENDPOINT ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.R2_BUCKET_NAME ?? "",
  });
}
if (driver === "local") return new LocalStorageService();
throw new Error("Unsupported storage driver");
```

Add to `.env.example`:

```dotenv
STORAGE_DRIVER="local"
R2_ENDPOINT=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME=""
```

- [ ] **Step 6: Verify R2 adapter GREEN**

```powershell
npx vitest run lib/storage
npm run typecheck
```

Expected: all storage tests pass and the TypeScript command exits `0`.

- [ ] **Step 7: Commit the R2 adapter**

```powershell
git add -- lib/storage package.json package-lock.json .env.example
git commit -m "feat: add private R2 storage adapter"
```

### Task 3: Add Database-Scoped File Authorization Routes

**Files:**

- Create: `lib/repositories/file-access-repository.ts`
- Create: `lib/repositories/__tests__/file-access-repository.test.ts`
- Create: `app/api/files/[token]/route.ts`
- Create: `app/api/files/[token]/__tests__/route.test.ts`
- Create: `app/api/public-files/[token]/route.ts`
- Create: `app/api/public-files/[token]/__tests__/route.test.ts`

**Interfaces:**

- Produces: `canAccessPrivateStorageKey(session, storageKey)` and `isPublishedTeacherPhoto(storageKey)`.
- Routes consume: `getSession`, `decodeStorageToken`, and `StorageService.createDownloadURL`.

- [ ] **Step 1: Write IDOR-focused repository tests**

Create cases for:

```ts
it("allows an admin only when the key is referenced by a school record");
it("allows a teacher to read an owned course material attachment");
it("denies a teacher another teacher's material");
it("allows a teacher to read a submission for their assignment");
it("allows an enrolled student to read class material");
it("denies a student material from an unrelated class");
it("allows a student their own report and submission");
it("allows a parent a linked child's material and report");
it("denies a parent an unlinked child's records");
it("recognizes only active teacher photo URLs as public");
```

- [ ] **Step 2: Run repository tests and verify RED**

```powershell
npx vitest run lib/repositories/__tests__/file-access-repository.test.ts
```

Expected: repository does not exist.

- [ ] **Step 3: Implement role-specific relational queries**

First require the key to be referenced by `Attachment`, `ReportSnapshot.pdfStorageKey`, or an active `Teacher.photoUrl`. Then apply role-specific filters.

For course material attachments, use these relations:

```ts
const teacherWhere = {
  storageKey,
  courseMaterial: {
    is: {
      OR: [
        { teacherId: session.uid },
        { scheduledClass: { is: { teacherId: session.uid } } },
        { scheduledClass: { is: { classGroup: { is: { teacherId: session.uid } } } } },
      ],
    },
  },
};
```

Student and parent queries use `scheduledClass.students`, `scheduledClass.classGroup.students`, and nested `parents: { some: { id: session.uid } }`. Submission queries use `submission.studentId`, `submission.student.parents`, and `submission.assignment.teacherId` or its scheduled-class ownership. Report queries use `studentId`, `student.parents`, and `generatedByTeacherId`.

For public teacher photos, compare the stored URL to `storageUrlForKey(storageKey)` and require `isActive: true`.

- [ ] **Step 4: Write route tests**

Private route tests cover malformed token `400`, no session `401`, cross-user or unreferenced key `404`, valid access `302`, `Cache-Control: private, no-store`, and storage signing failure `503`. Public route tests cover active teacher image `302`, inactive/unreferenced image `404`, malformed token `400`, `Cache-Control: no-store`, and no private-key exposure.

- [ ] **Step 5: Implement the private and public routes**

Private route flow:

```ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
const session = await getSession();
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const { token } = await params;
const storageKey = decodeStorageToken(token);
if (!(await canAccessPrivateStorageKey(session, storageKey))) {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

const location = await createStorageService().createDownloadURL(storageKey, 60);
const response = NextResponse.redirect(new URL(location, request.url), 302);
response.headers.set("Cache-Control", "private, no-store");
return response;
}
```

Public route omits session lookup but requires `isPublishedTeacherPhoto(storageKey)` before creating the signed URL. Its redirect also sets `Cache-Control: no-store` so an expired signed URL is never retained by a browser or edge cache.

- [ ] **Step 6: Verify authorization routes GREEN**

```powershell
npx vitest run lib/repositories/__tests__/file-access-repository.test.ts app/api/files app/api/public-files
```

Expected: all role, relationship, malformed-token, and redirect tests pass.

- [ ] **Step 7: Commit authorized file delivery**

```powershell
git add -- lib/repositories/file-access-repository.ts lib/repositories/__tests__/file-access-repository.test.ts app/api/files app/api/public-files
git commit -m "feat: authorize private file delivery"
```

### Task 4: Integrate Materials, Reports, and Teacher Photos

**Files:**

- Modify: `lib/repositories/course-material-repository.ts`
- Create: `lib/repositories/__tests__/course-material-repository.test.ts`
- Modify: `lib/repositories/submission-repository.ts`
- Create: `lib/repositories/__tests__/submission-repository.test.ts`
- Modify: `lib/repositories/student-schedule-repository.ts`
- Modify: `lib/repositories/__tests__/student-schedule-repository.test.ts`
- Modify: `lib/repositories/report-repository.ts`
- Create: `lib/repositories/__tests__/report-repository.test.ts`
- Modify: `app/portal/teacher/components/MaterialList.tsx`
- Modify: `app/portal/student/reports/[snapshotId]/page.tsx`
- Modify: `app/portal/parent/reports/[studentId]/[snapshotId]/page.tsx`
- Modify: `app/portal/teacher/reports/[snapshotId]/page.tsx`
- Modify: `app/(admin)/admin/teachers/actions.ts`
- Modify: `lib/repositories/cms-repository.ts`
- Modify: `app/(admin)/admin/teachers/__tests__/actions.test.ts`
- Modify: `app/portal/student/reports/[snapshotId]/__tests__/page.test.tsx`
- Modify: `app/portal/parent/reports/[studentId]/[snapshotId]/__tests__/page.test.tsx`
- Modify: `app/portal/teacher/reports/[snapshotId]/__tests__/page.test.tsx`
- Modify: `tests/portal/teacher-material-actions.test.ts`

**Interfaces:**

- Consumes: `storageUrlForKey`, fixed namespaces, and the R2-capable storage service.
- Produces: stable authorized application URLs throughout existing portal presentation models.

- [ ] **Step 1: Add failing integration assertions**

Update focused tests to expect encoded `/api/files/` URLs for private keys and `/api/public-files/` for uploaded teacher photos. Preserve existing HTTPS URLs unchanged.

Add report export expectation:

```ts
expect(storageUploadMock).toHaveBeenCalledWith(expect.any(Buffer), {
  filename: "report.pdf",
  namespace: "private/teachers/teacher-1/reports",
  contentType: "application/pdf",
});
```

- [ ] **Step 2: Run the integration slice and verify RED**

```powershell
npx vitest run lib/repositories/__tests__/course-material-repository.test.ts lib/repositories/__tests__/submission-repository.test.ts lib/repositories/__tests__/student-schedule-repository.test.ts lib/repositories/__tests__/report-repository.test.ts 'app/(admin)/admin/teachers/__tests__/actions.test.ts' app/portal/student/reports app/portal/parent/reports app/portal/teacher/reports
```

Expected: direct `/uploads/` builders and old upload signatures fail expectations.

- [ ] **Step 3: Replace direct upload-path construction**

Where a database `storageKey` is converted to an href, use:

```ts
const href = storageUrlForKey(storageKey);
```

Keep existing `safe*Href` validation for external URLs. Do not convert an already absolute HTTPS URL into a storage token.

- [ ] **Step 4: Namespace generated report PDFs**

Update report export:

```ts
const storage = createStorageService();
const storageKey = await storage.upload(Buffer.from(rendered.bytes), {
  filename: rendered.filename,
  namespace: teacherReportNamespace(teacherId),
  contentType: "application/pdf",
});
```

Store only `pdfStorageKey`; return `storage.getURL(storageKey)` for immediate navigation.

- [ ] **Step 5: Namespace and publish teacher profile photos through the app route**

In `resolvePhotoUrl`, pass:

```ts
const storageKey = await storage.upload(photo, {
  filename: photo.name,
  namespace: publicTeacherPhotoNamespace(adminUserId),
  contentType: photo.type,
});
return { photoUrl: storage.getURL(storageKey) };
```

Change `resolvePhotoUrl` to receive the authenticated admin ID. `cms-repository` continues storing `photoUrl`; the public route authorizes it by exact URL match and active teacher state. External photo URLs and existing static `/name.jpg` assets continue working.

- [ ] **Step 6: Verify integrated storage GREEN**

Run the command from Step 2.

Expected: materials, submissions, reports, and teacher photos use authorized URLs for internal keys and preserve safe external links.

- [ ] **Step 7: Commit storage integration**

```powershell
git add -- lib/repositories app/portal 'app/(admin)/admin/teachers' tests/portal
git commit -m "feat: route school files through private storage"
```

### Task 5: Run the Private Storage Gate

**Files:**

- Verify all files changed by Tasks 1-4.

**Interfaces:**

- Produces: the storage milestone consumed by environment validation and Render deployment.

- [ ] **Step 1: Confirm there is no production direct-local path dependency**

```powershell
rg -n "public/uploads|/uploads/|runtimeRole|r2\.dev" app components lib -g '*.ts' -g '*.tsx'
```

Expected: `/uploads/` remains only inside local adapter compatibility code and explicit legacy test fixtures; production presentation code uses `storageUrlForKey`.

- [ ] **Step 2: Run the focused storage and IDOR suite**

```powershell
npx vitest run lib/storage app/api/upload app/api/files app/api/public-files lib/repositories/__tests__/file-access-repository.test.ts lib/repositories/__tests__/course-material-repository.test.ts lib/repositories/__tests__/submission-repository.test.ts lib/repositories/__tests__/student-schedule-repository.test.ts lib/repositories/__tests__/report-repository.test.ts tests/portal/teacher-material-actions.test.ts
```

Expected: all selected files pass and the runner prints the intended file list.

- [ ] **Step 3: Run broad verification**

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: every command exits `0`.

- [ ] **Step 4: Commit only broad-gate corrections**

```powershell
git add -- app components lib tests package.json package-lock.json .env.example
git commit -m "test: complete private storage gate"
```

Skip this commit when no correction was needed.

## Plan Acceptance

This plan is complete when production uploads use a private R2 bucket, internal URLs remain stable across Render redeploys, signed R2 URLs last 60 seconds, public access is limited to active teacher profile images, and teacher/student/parent/admin IDOR tests enforce the repository relationships in the approved design.

## Primary References

- Cloudflare R2 presigned URLs: `https://developers.cloudflare.com/r2/api/s3/presigned-urls/`
- Cloudflare R2 object uploads: `https://developers.cloudflare.com/r2/objects/upload-objects/`
