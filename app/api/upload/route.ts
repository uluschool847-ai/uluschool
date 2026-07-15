import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import {
  consumePendingUploadRequestRateLimit,
  releasePendingUpload,
  reservePendingUpload,
} from "@/lib/repositories/pending-upload-repository";
import {
  createStorageService,
  publicTeacherPhotoNamespace,
  teacherMaterialNamespace,
} from "@/lib/storage";
import { sanitizeStorageFilename } from "@/lib/storage/storage-key";
import { UploadValidationError, validateUploadMetadata } from "@/lib/storage/upload-input";

export const MAX_UPLOAD_FILE_COUNT = 10;
export const MAX_UPLOAD_AGGREGATE_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_REQUEST_BYTES = 21 * 1024 * 1024;

const cancelUploadSchema = z.object({
  storageKey: z.string().trim().min(1).max(1024),
});

function filenameFromStorageKey(storageKey: string) {
  return sanitizeStorageFilename(storageKey.split(/[\\/]+/).at(-1) ?? "file");
}

function responseFilename(file: FileLike, storageKey: string) {
  const filename = sanitizeStorageFilename(file.name || "upload");
  return filename === "blob" ? filenameFromStorageKey(storageKey) : filename;
}

type FileLike = {
  name: string;
  size: number;
  type: string;
};

type UploadedFilePayload = {
  fileId: string;
  url: string;
  name: string;
  filename?: string;
  mimeType?: string;
  publicUrl?: string;
  size?: number;
  storageKey?: string;
};

function isFileLike(value: unknown): value is FileLike & File {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FileLike>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.type === "string"
  );
}

function uploadErrorResponse(error: unknown) {
  if (error instanceof UploadValidationError) {
    return NextResponse.json(
      { success: false, error: error.publicMessage },
      { status: error.status },
    );
  }
  return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
}

function safeBatchError(error: unknown) {
  return error instanceof UploadValidationError ? error.publicMessage : "Upload failed";
}

async function readBoundedFormData(request: Request) {
  const headers = request.headers instanceof Headers ? request.headers : new Headers();
  const declaredLength = headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      throw new UploadValidationError("INVALID_REQUEST_LENGTH", 400, "Malformed multipart payload");
    }
    if (Number(declaredLength) > MAX_UPLOAD_REQUEST_BYTES) {
      throw new UploadValidationError("REQUEST_TOO_LARGE", 413, "Upload request is too large");
    }
  }

  if (!request.body || typeof request.body.getReader !== "function") {
    throw new UploadValidationError("MISSING_REQUEST_BODY", 400, "Malformed multipart payload");
  }

  const requestToParse = request.clone();
  const reader = request.body.getReader();
  let totalBytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    totalBytes += chunk.value.byteLength;
    if (totalBytes > MAX_UPLOAD_REQUEST_BYTES) {
      await Promise.allSettled([reader.cancel(), requestToParse.body?.cancel()]);
      throw new UploadValidationError("REQUEST_TOO_LARGE", 413, "Upload request is too large");
    }
  }
  return requestToParse.formData();
}

function uploadSuccessPayload(input: {
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  publicUrl: string;
}) {
  return {
    success: true,
    fileId: input.storageKey,
    url: input.publicUrl,
    storageKey: input.storageKey,
    publicUrl: input.publicUrl,
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
  };
}

async function reserveCompletedUpload(input: {
  file: FileLike;
  ownerId: string;
  purpose: "course-material" | "teacher-photo";
  service: ReturnType<typeof createStorageService>;
  storageKey: string;
}) {
  const filename = responseFilename(input.file, input.storageKey);

  try {
    await reservePendingUpload({
      ownerId: input.ownerId,
      purpose: input.purpose,
      storage: input.service,
      storageKey: input.storageKey,
      filename,
      mimeType: input.file.type,
      byteSize: input.file.size,
    });
  } catch (error) {
    try {
      await input.service.delete(input.storageKey);
    } catch {
      // No reservation exists, so no durable cleanup retry can be scheduled here.
    }

    throw error;
  }

  return filename;
}

async function releaseUploadAfterResponseFailure(input: {
  ownerId: string;
  service: ReturnType<typeof createStorageService>;
  storageKey: string;
}) {
  try {
    await releasePendingUpload({
      ownerId: input.ownerId,
      storage: input.service,
      storageKey: input.storageKey,
    });
  } catch {
    // The reservation remains available for the expired-upload sweeper.
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== UserRole.ADMIN && session.role !== UserRole.TEACHER) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await readBoundedFormData(request);
  } catch (error) {
    if (error instanceof UploadValidationError) return uploadErrorResponse(error);
    return NextResponse.json(
      { success: false, error: "Malformed multipart payload" },
      { status: 400 },
    );
  }

  const purpose = String(formData.get("purpose") ?? "");
  const allowed =
    (session.role === UserRole.TEACHER && purpose === "course-material") ||
    (session.role === UserRole.ADMIN && ["course-material", "teacher-photo"].includes(purpose));

  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Upload purpose is not allowed" },
      { status: 403 },
    );
  }
  const reservationPurpose =
    purpose === "teacher-photo" ? ("teacher-photo" as const) : ("course-material" as const);

  try {
    consumePendingUploadRequestRateLimit(session.uid);
  } catch {
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 429 });
  }

  const namespace =
    purpose === "teacher-photo"
      ? publicTeacherPhotoNamespace(session.uid)
      : teacherMaterialNamespace(session.uid);

  const fileParts = [...formData.entries()].flatMap(([field, entry]) =>
    isFileLike(entry) ? [{ field, file: entry }] : [],
  );

  if (fileParts.length > MAX_UPLOAD_FILE_COUNT) {
    return NextResponse.json({ success: false, error: "Too many files" }, { status: 400 });
  }

  const aggregateBytes = fileParts.reduce((total, current) => total + current.file.size, 0);
  if (!Number.isSafeInteger(aggregateBytes) || aggregateBytes > MAX_UPLOAD_AGGREGATE_BYTES) {
    return NextResponse.json(
      { success: false, error: "Combined files are too large" },
      { status: 413 },
    );
  }

  if (fileParts.some(({ field }) => field !== "file" && field !== "files")) {
    return NextResponse.json({ success: false, error: "Unexpected file field" }, { status: 400 });
  }

  const effectiveFiles = fileParts.map(({ file }) => file);
  if (effectiveFiles.length === 0) {
    return NextResponse.json({ success: false, error: "File is required" }, { status: 400 });
  }

  let service: ReturnType<typeof createStorageService>;
  try {
    service = createStorageService();
  } catch (error) {
    return uploadErrorResponse(error);
  }

  if (effectiveFiles.length === 1) {
    const current = effectiveFiles[0];
    try {
      validateUploadMetadata({
        filename: current.name || "upload",
        size: current.size,
        contentType: current.type,
      });
    } catch (error) {
      return uploadErrorResponse(error);
    }

    try {
      const fileId = await service.upload(current, {
        filename: current.name || "upload",
        namespace,
        contentType: current.type,
      });
      const filename = await reserveCompletedUpload({
        file: current,
        ownerId: session.uid,
        purpose: reservationPurpose,
        service,
        storageKey: fileId,
      });
      let url: string;
      try {
        url = service.getURL(fileId);
      } catch (error) {
        await releaseUploadAfterResponseFailure({
          ownerId: session.uid,
          service,
          storageKey: fileId,
        });
        throw error;
      }
      return NextResponse.json(
        uploadSuccessPayload({
          storageKey: fileId,
          publicUrl: url,
          filename,
          mimeType: current.type,
          size: current.size,
        }),
        { status: 201 },
      );
    } catch (error) {
      return uploadErrorResponse(error);
    }
  }

  const uploaded: UploadedFilePayload[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const current of effectiveFiles) {
    try {
      validateUploadMetadata({
        filename: current.name || "upload",
        size: current.size,
        contentType: current.type,
      });
    } catch (error) {
      failed.push({
        name: current.name,
        error: safeBatchError(error),
      });
      continue;
    }

    try {
      const fileId = await service.upload(current, {
        filename: current.name || "upload",
        namespace,
        contentType: current.type,
      });
      const filename = await reserveCompletedUpload({
        file: current,
        ownerId: session.uid,
        purpose: reservationPurpose,
        service,
        storageKey: fileId,
      });
      let url: string;
      try {
        url = service.getURL(fileId);
      } catch (error) {
        await releaseUploadAfterResponseFailure({
          ownerId: session.uid,
          service,
          storageKey: fileId,
        });
        throw error;
      }
      uploaded.push({
        fileId,
        storageKey: fileId,
        url,
        publicUrl: url,
        filename,
        mimeType: current.type,
        size: current.size,
        name: filename,
      });
    } catch (error) {
      failed.push({
        name: current.name,
        error: safeBatchError(error),
      });
    }
  }

  if (failed.length > 0) {
    return NextResponse.json(
      {
        success: false,
        uploaded,
        failed,
      },
      { status: 207 },
    );
  }

  return NextResponse.json({ success: true, uploaded }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== UserRole.ADMIN && session.role !== UserRole.TEACHER) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  let input: z.infer<typeof cancelUploadSchema>;
  try {
    input = cancelUploadSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 400 });
  }

  try {
    const service = createStorageService();
    await releasePendingUpload({
      ownerId: session.uid,
      storage: service,
      storageKey: input.storageKey,
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}
