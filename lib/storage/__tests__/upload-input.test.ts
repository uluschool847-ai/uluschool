import { describe, expect, it, vi } from "vitest";

import {
  MAX_UPLOAD_SIZE_BYTES,
  UploadValidationError,
  normalizeUploadInput,
} from "@/lib/storage/upload-input";
import { uploadFixtures, zipFixtureWithClaimedSize } from "@/tests/helpers/upload-fixtures";

const namespace = "private/teachers/teacher-1/materials";

describe("shared upload content validation", () => {
  it("keeps ZIP parser fixtures compact", () => {
    expect(uploadFixtures.zip.length).toBeLessThan(2 * 1024);
    expect(uploadFixtures.docx.length).toBeLessThan(2 * 1024);
    expect(uploadFixtures.pptx.length).toBeLessThan(2 * 1024);
  });

  it.each([
    ["PDF", "lesson.pdf", "application/pdf", uploadFixtures.pdf],
    ["PNG", "diagram.png", "image/png", uploadFixtures.png],
    ["JPEG", "photo.jpeg", "image/jpeg", uploadFixtures.jpeg],
    ["JPG alias", "photo.jpg", "image/jpg", uploadFixtures.jpeg],
    ["GIF", "animation.gif", "image/gif", uploadFixtures.gif],
    ["WebP", "photo.webp", "image/webp", uploadFixtures.webp],
    ["text", "notes.txt", "text/plain", uploadFixtures.text],
    ["OLE Word", "lesson.doc", "application/msword", uploadFixtures.doc],
    ["OLE PowerPoint", "slides.ppt", "application/vnd.ms-powerpoint", uploadFixtures.ppt],
    ["ZIP", "bundle.zip", "application/zip", uploadFixtures.zip],
    ["ZIP alias", "bundle.zip", "application/x-zip-compressed", uploadFixtures.zip],
    [
      "DOCX",
      "lesson.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      uploadFixtures.docx,
    ],
    [
      "PPTX",
      "slides.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      uploadFixtures.pptx,
    ],
  ])(
    "accepts %s only when bytes, extension, and MIME agree",
    async (_label, filename, contentType, bytes) => {
      await expect(
        normalizeUploadInput(Buffer.from(bytes), { filename, namespace, contentType }),
      ).resolves.toEqual(
        expect.objectContaining({ filename, contentType, bytes: Buffer.from(bytes) }),
      );
    },
  );

  it.each([
    ["spoofed PDF", "lesson.pdf", "application/pdf", uploadFixtures.png],
    ["wrong image extension", "photo.png", "image/png", uploadFixtures.jpeg],
    ["filename extension mismatch", "photo.jpg", "image/png", uploadFixtures.png],
    ["wrong OLE document", "lesson.doc", "application/msword", uploadFixtures.ppt],
    [
      "arbitrary PK bytes",
      "lesson.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      Buffer.from("PKnot-a-zip"),
    ],
    [
      "generic ZIP as DOCX",
      "lesson.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      uploadFixtures.zip,
    ],
    [
      "DOCX entries with PPTX content",
      "lesson.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      uploadFixtures.pptx,
    ],
    ["binary text", "notes.txt", "text/plain", Buffer.from([0x61, 0x00, 0x62])],
    ["invalid UTF-8 text", "notes.txt", "text/plain", Buffer.from([0xc3, 0x28])],
  ])("rejects %s", async (_label, filename, contentType, bytes) => {
    await expect(
      normalizeUploadInput(Buffer.from(bytes), { filename, namespace, contentType }),
    ).rejects.toMatchObject({
      name: "UploadValidationError",
      status: 415,
      publicMessage: "File content does not match its type",
    });
  });

  it("rejects an unsafe or oversized ZIP package before inflating its entries", async () => {
    const oversizedPackage = zipFixtureWithClaimedSize("word/document.xml", 21 * 1024 * 1024);

    await expect(
      normalizeUploadInput(oversizedPackage, {
        filename: "lesson.docx",
        namespace,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).rejects.toBeInstanceOf(UploadValidationError);
  });

  it("checks File metadata before reading bytes and validates content after the bounded read", async () => {
    const oversizedArrayBuffer = vi.fn(async () => new ArrayBuffer(1));
    const oversized = {
      name: "large.pdf",
      size: MAX_UPLOAD_SIZE_BYTES + 1,
      type: "application/pdf",
      arrayBuffer: oversizedArrayBuffer,
    } as unknown as File;

    await expect(
      normalizeUploadInput(oversized, {
        filename: oversized.name,
        namespace,
        contentType: oversized.type,
      }),
    ).rejects.toMatchObject({ status: 413 });
    expect(oversizedArrayBuffer).not.toHaveBeenCalled();

    const extensionArrayBuffer = vi.fn(async () => new ArrayBuffer(uploadFixtures.png.length));
    const wrongExtension = {
      name: "photo.jpg",
      size: uploadFixtures.png.length,
      type: "image/png",
      arrayBuffer: extensionArrayBuffer,
    } as unknown as File;
    await expect(
      normalizeUploadInput(wrongExtension, {
        filename: wrongExtension.name,
        namespace,
        contentType: wrongExtension.type,
      }),
    ).rejects.toMatchObject({ status: 415 });
    expect(extensionArrayBuffer).not.toHaveBeenCalled();

    const spoofedArrayBuffer = vi.fn(async () =>
      uploadFixtures.png.buffer.slice(
        uploadFixtures.png.byteOffset,
        uploadFixtures.png.byteOffset + uploadFixtures.png.byteLength,
      ),
    );
    const spoofed = {
      name: "lesson.pdf",
      size: uploadFixtures.png.length,
      type: "application/pdf",
      arrayBuffer: spoofedArrayBuffer,
    } as unknown as File;

    await expect(
      normalizeUploadInput(spoofed, {
        filename: spoofed.name,
        namespace,
        contentType: spoofed.type,
      }),
    ).rejects.toMatchObject({ status: 415 });
    expect(spoofedArrayBuffer).toHaveBeenCalledOnce();
  });
});
