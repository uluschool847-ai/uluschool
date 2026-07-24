import { unzipSync } from "fflate";
import { SaxesParser, type SaxesTagNS } from "saxes";

import type { UploadInput, UploadOptions } from "@/lib/storage/StorageService";
import { sanitizeStorageFilename } from "@/lib/storage/storage-key";

export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 256;
const MAX_ZIP_ENTRY_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_COMPRESSION_RATIO = 100;
const MAX_OOXML_XML_PART_BYTES = 256 * 1024;
const MAX_OOXML_EXTRACTED_BYTES = 3 * MAX_OOXML_XML_PART_BYTES;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 0xffff;
const CONTENT_TYPES_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/content-types";
const RELATIONSHIPS_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_DOCUMENT_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const WORDPROCESSING_MAIN_NAMESPACE =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const PRESENTATION_MAIN_NAMESPACE = "http://schemas.openxmlformats.org/presentationml/2006/main";
const WINDOWS_DEVICE_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;

export type UploadValidationStatus = 400 | 413 | 415;

export class UploadValidationError extends Error {
  readonly name = "UploadValidationError";

  constructor(
    readonly code: string,
    readonly status: UploadValidationStatus,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

type FileLike = {
  name: string;
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

type UploadMetadata = {
  filename: string;
  size: number;
  contentType: string;
};

type ContentKind =
  | "doc"
  | "docx"
  | "gif"
  | "jpeg"
  | "pdf"
  | "png"
  | "ppt"
  | "pptx"
  | "text"
  | "webp"
  | "zip";

const TYPE_RULES: Record<string, { extensions: string[]; kind: ContentKind }> = {
  "application/pdf": { extensions: [".pdf"], kind: "pdf" },
  "application/msword": { extensions: [".doc"], kind: "doc" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    extensions: [".docx"],
    kind: "docx",
  },
  "application/vnd.ms-powerpoint": { extensions: [".ppt"], kind: "ppt" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    extensions: [".pptx"],
    kind: "pptx",
  },
  "application/zip": { extensions: [".zip"], kind: "zip" },
  "application/x-zip-compressed": { extensions: [".zip"], kind: "zip" },
  "image/png": { extensions: [".png"], kind: "png" },
  "image/jpeg": { extensions: [".jpg", ".jpeg"], kind: "jpeg" },
  "image/jpg": { extensions: [".jpg", ".jpeg"], kind: "jpeg" },
  "image/webp": { extensions: [".webp"], kind: "webp" },
  "image/gif": { extensions: [".gif"], kind: "gif" },
  "text/plain": { extensions: [".txt"], kind: "text" },
};

const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function uploadError(code: string, status: UploadValidationStatus, publicMessage: string) {
  return new UploadValidationError(code, status, publicMessage);
}

function contentMismatch(): never {
  throw uploadError("CONTENT_MISMATCH", 415, "File content does not match its type");
}

function isFileLike(value: unknown): value is FileLike {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FileLike>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.type === "string" &&
    typeof candidate.arrayBuffer === "function"
  );
}

function safeFilename(value: string) {
  try {
    return sanitizeStorageFilename(value);
  } catch {
    throw uploadError("INVALID_FILENAME", 400, "Invalid filename");
  }
}

function normalizeContentType(value: string) {
  const contentType = value.trim().toLowerCase();
  if (!contentType || !TYPE_RULES[contentType]) {
    throw uploadError("UNSUPPORTED_TYPE", 415, "Unsupported file type");
  }
  return contentType;
}

function assertExtensionMatches(filename: string, contentType: string) {
  const lowerFilename = filename.toLowerCase();
  if (!TYPE_RULES[contentType].extensions.some((extension) => lowerFilename.endsWith(extension))) {
    contentMismatch();
  }
}

export function validateUploadMetadata(input: UploadMetadata) {
  const filename = safeFilename(input.filename);
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw uploadError("EMPTY_FILE", 400, "File is empty");
  }
  if (input.size > MAX_UPLOAD_SIZE_BYTES) {
    throw uploadError("FILE_TOO_LARGE", 413, "File too large (max 5MB)");
  }
  const contentType = normalizeContentType(input.contentType);
  assertExtensionMatches(filename, contentType);
  return { filename, contentType, size: input.size };
}

function startsWith(bytes: Buffer, signature: Buffer) {
  return bytes.length >= signature.length && bytes.subarray(0, signature.length).equals(signature);
}

function containsOleStream(bytes: Buffer, streamName: string) {
  return bytes.indexOf(Buffer.from(streamName, "utf16le"), OLE_SIGNATURE.length) >= 0;
}

function hasControlCharacters(value: string, allowTextWhitespace = false) {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= 0x7f && codePoint <= 0x9f) return true;
    if (codePoint < 0x20 && (!allowTextWhitespace || ![0x09, 0x0a, 0x0d].includes(codePoint))) {
      return true;
    }
  }
  return false;
}

function assertText(bytes: Buffer) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    contentMismatch();
  }
  if (hasControlCharacters(text, true)) contentMismatch();
}

function assertSafeZipEntryName(name: string) {
  if (
    !name ||
    name.length > 512 ||
    name.includes("\\") ||
    name.startsWith("/") ||
    hasControlCharacters(name)
  ) {
    contentMismatch();
  }
  const segments = name.replace(/\/$/, "").split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.length > 255 ||
        segment.includes(":") ||
        /[. ]$/.test(segment) ||
        WINDOWS_DEVICE_NAME.test(segment),
    )
  ) {
    contentMismatch();
  }
}

function findZipEndOfCentralDirectory(bytes: Buffer) {
  const firstCandidate = Math.max(
    0,
    bytes.length - ZIP_END_OF_CENTRAL_DIRECTORY_BYTES - ZIP_MAX_COMMENT_BYTES,
  );
  for (
    let offset = bytes.length - ZIP_END_OF_CENTRAL_DIRECTORY_BYTES;
    offset >= firstCandidate;
    offset -= 1
  ) {
    if (
      bytes.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE &&
      offset + ZIP_END_OF_CENTRAL_DIRECTORY_BYTES + bytes.readUInt16LE(offset + 20) === bytes.length
    ) {
      return offset;
    }
  }
  contentMismatch();
}

function assertZipContainerBounds(bytes: Buffer) {
  if (bytes.length < ZIP_END_OF_CENTRAL_DIRECTORY_BYTES) contentMismatch();

  const endOffset = findZipEndOfCentralDirectory(bytes);
  const diskNumber = bytes.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = bytes.readUInt16LE(endOffset + 6);
  const diskEntryCount = bytes.readUInt16LE(endOffset + 8);
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const centralDirectoryBytes = bytes.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(endOffset + 16);
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    diskEntryCount !== entryCount ||
    entryCount === 0 ||
    entryCount > MAX_ZIP_ENTRIES ||
    centralDirectoryOffset + centralDirectoryBytes !== endOffset
  ) {
    contentMismatch();
  }

  const localRanges: Array<{ start: number; end: number }> = [];
  let centralOffset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      centralOffset + 46 > endOffset ||
      bytes.readUInt32LE(centralOffset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      contentMismatch();
    }

    const centralFlags = bytes.readUInt16LE(centralOffset + 8);
    const centralCompression = bytes.readUInt16LE(centralOffset + 10);
    const centralCrc = bytes.readUInt32LE(centralOffset + 16);
    const compressedSize = bytes.readUInt32LE(centralOffset + 20);
    const uncompressedSize = bytes.readUInt32LE(centralOffset + 24);
    const filenameBytes = bytes.readUInt16LE(centralOffset + 28);
    const extraBytes = bytes.readUInt16LE(centralOffset + 30);
    const commentBytes = bytes.readUInt16LE(centralOffset + 32);
    const diskStart = bytes.readUInt16LE(centralOffset + 34);
    const localOffset = bytes.readUInt32LE(centralOffset + 42);
    const centralEntryEnd = centralOffset + 46 + filenameBytes + extraBytes + commentBytes;
    if (
      diskStart !== 0 ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff ||
      centralEntryEnd > endOffset ||
      localOffset + 30 > centralDirectoryOffset ||
      bytes.readUInt32LE(localOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE
    ) {
      contentMismatch();
    }

    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localCompression = bytes.readUInt16LE(localOffset + 8);
    const localFilenameBytes = bytes.readUInt16LE(localOffset + 26);
    const localExtraBytes = bytes.readUInt16LE(localOffset + 28);
    const payloadOffset = localOffset + 30 + localFilenameBytes + localExtraBytes;
    const payloadEnd = payloadOffset + compressedSize;
    if (
      localFlags !== centralFlags ||
      localCompression !== centralCompression ||
      payloadOffset > centralDirectoryOffset ||
      payloadEnd > centralDirectoryOffset ||
      localFilenameBytes !== filenameBytes ||
      !bytes
        .subarray(localOffset + 30, localOffset + 30 + localFilenameBytes)
        .equals(bytes.subarray(centralOffset + 46, centralOffset + 46 + filenameBytes))
    ) {
      contentMismatch();
    }

    if (
      (centralFlags & 0x08) === 0 &&
      (bytes.readUInt32LE(localOffset + 14) !== centralCrc ||
        bytes.readUInt32LE(localOffset + 18) !== compressedSize ||
        bytes.readUInt32LE(localOffset + 22) !== uncompressedSize)
    ) {
      contentMismatch();
    }

    localRanges.push({ start: localOffset, end: payloadEnd });
    centralOffset = centralEntryEnd;
  }

  if (centralOffset !== endOffset) contentMismatch();
  localRanges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < localRanges.length; index += 1) {
    if (localRanges[index].start < localRanges[index - 1].end) contentMismatch();
  }
}

function unqualifiedXmlAttribute(tag: SaxesTagNS, name: string) {
  return Object.values(tag.attributes).find(
    (attribute) => attribute.local === name && attribute.prefix === "" && attribute.uri === "",
  )?.value;
}

function assertContentTypesXml(bytes: Uint8Array, mainPart: string, requiredContentType: string) {
  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    contentMismatch();
  }

  let depth = 0;
  let validRoot = false;
  let mainOverrideCount = 0;
  let validOverride = false;
  const parser = new SaxesParser<{ xmlns: true; position: false }>({
    xmlns: true,
    position: false,
  });
  parser.on("doctype", () => contentMismatch());
  parser.on("opentag", (tag) => {
    if (depth === 0) {
      if (tag.local !== "Types" || tag.uri !== CONTENT_TYPES_NAMESPACE) contentMismatch();
      validRoot = true;
    } else if (depth === 1 && tag.local === "Override" && tag.uri === CONTENT_TYPES_NAMESPACE) {
      if (unqualifiedXmlAttribute(tag, "PartName") === `/${mainPart}`) {
        mainOverrideCount += 1;
        validOverride = unqualifiedXmlAttribute(tag, "ContentType") === requiredContentType;
      }
    }
    depth += 1;
  });
  parser.on("closetag", () => {
    depth -= 1;
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof UploadValidationError) throw error;
    contentMismatch();
  }
  if (!validRoot || mainOverrideCount !== 1 || !validOverride) contentMismatch();
}

function assertRelationshipsXml(bytes: Uint8Array, mainPart: string) {
  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    contentMismatch();
  }

  let depth = 0;
  let validRoot = false;
  let officeDocumentRelationshipCount = 0;
  let validRelationship = false;
  const relationshipIds = new Set<string>();
  const parser = new SaxesParser<{ xmlns: true; position: false }>({
    xmlns: true,
    position: false,
  });
  parser.on("doctype", () => contentMismatch());
  parser.on("opentag", (tag) => {
    if (depth === 0) {
      if (tag.local !== "Relationships" || tag.uri !== RELATIONSHIPS_NAMESPACE) {
        contentMismatch();
      }
      validRoot = true;
    } else if (depth === 1 && tag.local === "Relationship" && tag.uri === RELATIONSHIPS_NAMESPACE) {
      const id = unqualifiedXmlAttribute(tag, "Id");
      if (typeof id !== "string" || id.trim() !== id || id === "" || relationshipIds.has(id)) {
        contentMismatch();
      }
      relationshipIds.add(id);
      const type = unqualifiedXmlAttribute(tag, "Type");
      if (type === OFFICE_DOCUMENT_RELATIONSHIP) {
        officeDocumentRelationshipCount += 1;
        validRelationship =
          unqualifiedXmlAttribute(tag, "Target") === mainPart &&
          unqualifiedXmlAttribute(tag, "TargetMode") === undefined;
      }
    }
    depth += 1;
  });
  parser.on("closetag", () => {
    depth -= 1;
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof UploadValidationError) throw error;
    contentMismatch();
  }
  if (!validRoot || officeDocumentRelationshipCount !== 1 || !validRelationship) {
    contentMismatch();
  }
}

function assertMainDocumentXml(bytes: Uint8Array, kind: "docx" | "pptx") {
  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    contentMismatch();
  }

  const expectedRoot = kind === "docx" ? "document" : "presentation";
  const expectedNamespace =
    kind === "docx" ? WORDPROCESSING_MAIN_NAMESPACE : PRESENTATION_MAIN_NAMESPACE;
  let depth = 0;
  let validRoot = false;
  const parser = new SaxesParser<{ xmlns: true; position: false }>({
    xmlns: true,
    position: false,
  });
  parser.on("doctype", () => contentMismatch());
  parser.on("opentag", (tag) => {
    if (depth === 0) {
      if (tag.local !== expectedRoot || tag.uri !== expectedNamespace) contentMismatch();
      validRoot = true;
    }
    depth += 1;
  });
  parser.on("closetag", () => {
    depth -= 1;
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof UploadValidationError) throw error;
    contentMismatch();
  }
  if (!validRoot) contentMismatch();
}

function assertZip(bytes: Buffer, kind: "docx" | "pptx" | "zip") {
  assertZipContainerBounds(bytes);
  const mainPart =
    kind === "docx" ? "word/document.xml" : kind === "pptx" ? "ppt/presentation.xml" : null;
  const entries = new Set<string>();
  let entryCount = 0;
  let fileCount = 0;
  let uncompressedBytes = 0;
  let extractedBytes = 0;

  let metadataOnly: Record<string, Uint8Array>;
  try {
    metadataOnly = unzipSync(bytes, {
      filter(entry) {
        entryCount += 1;
        if (entryCount > MAX_ZIP_ENTRIES) contentMismatch();
        assertSafeZipEntryName(entry.name);
        if (entries.has(entry.name)) contentMismatch();
        entries.add(entry.name);

        if (
          !Number.isSafeInteger(entry.originalSize) ||
          entry.originalSize < 0 ||
          entry.originalSize > MAX_ZIP_ENTRY_BYTES ||
          !Number.isSafeInteger(entry.size) ||
          entry.size < 0 ||
          entry.size > bytes.length ||
          (entry.compression !== 0 && entry.compression !== 8) ||
          (entry.compression === 0 && entry.size !== entry.originalSize) ||
          (entry.originalSize > 0 &&
            (entry.size === 0 || entry.originalSize / entry.size > MAX_ZIP_COMPRESSION_RATIO))
        ) {
          contentMismatch();
        }
        uncompressedBytes += entry.originalSize;
        if (uncompressedBytes > MAX_ZIP_UNCOMPRESSED_BYTES) contentMismatch();

        const isDirectory = entry.name.endsWith("/");
        if (!isDirectory) fileCount += 1;
        if (
          kind !== "zip" &&
          (entry.name === "[Content_Types].xml" ||
            entry.name === "_rels/.rels" ||
            entry.name === mainPart)
        ) {
          if (entry.originalSize <= 0 || entry.originalSize > MAX_OOXML_XML_PART_BYTES) {
            contentMismatch();
          }
          extractedBytes += entry.originalSize;
          if (extractedBytes > MAX_OOXML_EXTRACTED_BYTES) contentMismatch();
        }
        return false;
      },
    });
  } catch (error) {
    if (error instanceof UploadValidationError) throw error;
    contentMismatch();
  }

  if (Object.keys(metadataOnly).length !== 0) contentMismatch();
  if (entryCount === 0 || fileCount === 0) contentMismatch();
  if (kind === "zip") return;

  if (!mainPart) contentMismatch();
  const requiredContentType =
    kind === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
      : "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
  if (
    !entries.has("[Content_Types].xml") ||
    !entries.has("_rels/.rels") ||
    !entries.has(mainPart)
  ) {
    contentMismatch();
  }

  let extracted: Record<string, Uint8Array>;
  try {
    extracted = unzipSync(bytes, {
      filter(entry) {
        return (
          entry.name === "[Content_Types].xml" ||
          entry.name === "_rels/.rels" ||
          entry.name === mainPart
        );
      },
    });
  } catch (error) {
    if (error instanceof UploadValidationError) throw error;
    contentMismatch();
  }

  const contentTypes = extracted["[Content_Types].xml"];
  const relationships = extracted["_rels/.rels"];
  const mainDocument = extracted[mainPart];
  if (!contentTypes || !relationships || !mainDocument) contentMismatch();
  assertContentTypesXml(contentTypes, mainPart, requiredContentType);
  assertRelationshipsXml(relationships, mainPart);
  assertMainDocumentXml(mainDocument, kind);
}

function validateUploadContent(bytes: Buffer, contentType: string) {
  const kind = TYPE_RULES[contentType].kind;
  if (kind === "pdf") {
    if (!startsWith(bytes, Buffer.from("%PDF-", "ascii"))) contentMismatch();
    if (!bytes.subarray(Math.max(0, bytes.length - 1024)).includes(Buffer.from("%%EOF", "ascii"))) {
      contentMismatch();
    }
    return;
  }
  if (kind === "png") {
    if (!startsWith(bytes, PNG_SIGNATURE)) contentMismatch();
    return;
  }
  if (kind === "jpeg") {
    if (
      bytes.length < 5 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[2] !== 0xff ||
      bytes.at(-2) !== 0xff ||
      bytes.at(-1) !== 0xd9
    ) {
      contentMismatch();
    }
    return;
  }
  if (kind === "gif") {
    const header = bytes.subarray(0, 6).toString("ascii");
    if (header !== "GIF87a" && header !== "GIF89a") contentMismatch();
    return;
  }
  if (kind === "webp") {
    if (
      bytes.length < 16 ||
      bytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
      bytes.subarray(8, 12).toString("ascii") !== "WEBP" ||
      !["VP8 ", "VP8L", "VP8X"].includes(bytes.subarray(12, 16).toString("ascii"))
    ) {
      contentMismatch();
    }
    return;
  }
  if (kind === "text") {
    assertText(bytes);
    return;
  }
  if (kind === "doc" || kind === "ppt") {
    const streamName = kind === "doc" ? "WordDocument" : "PowerPoint Document";
    if (!startsWith(bytes, OLE_SIGNATURE) || !containsOleStream(bytes, streamName)) {
      contentMismatch();
    }
    return;
  }
  assertZip(bytes, kind);
}

export async function normalizeUploadInput(file: UploadInput, options: UploadOptions) {
  if (isFileLike(file)) {
    const fileContentType = normalizeContentType(file.type);
    const requestedContentType = options.contentType
      ? normalizeContentType(options.contentType)
      : fileContentType;
    if (requestedContentType !== fileContentType) {
      throw uploadError("TYPE_MISMATCH", 415, "File content does not match its type");
    }

    const fileName = safeFilename(file.name);
    const metadata = validateUploadMetadata({
      filename: options.filename,
      size: file.size,
      contentType: requestedContentType,
    });
    if (fileName !== metadata.filename) {
      throw uploadError("FILENAME_MISMATCH", 400, "Invalid filename");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length !== metadata.size || bytes.length > MAX_UPLOAD_SIZE_BYTES) {
      throw uploadError("SIZE_MISMATCH", 413, "File size does not match upload metadata");
    }
    validateUploadContent(bytes, metadata.contentType);
    return { ...metadata, bytes };
  }

  if (Buffer.isBuffer(file)) {
    const metadata = validateUploadMetadata({
      filename: options.filename,
      size: file.length,
      contentType: options.contentType ?? "",
    });
    validateUploadContent(file, metadata.contentType);
    return { ...metadata, bytes: file };
  }

  throw uploadError("UNSUPPORTED_INPUT", 400, "Unsupported upload input");
}
