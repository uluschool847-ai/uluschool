import { strToU8, zipSync } from "fflate";

const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const MAX_FIXTURE_SOURCE_BYTES = 64 * 1024;
const MAX_FIXTURE_ENTRIES = 16;
const ZIP_FIXTURE_MTIME = new Date(2000, 0, 1, 0, 0, 0);
const CONTENT_TYPES_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/content-types";
const RELATIONSHIPS_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_DOCUMENT_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";

export const ooxmlFixtureSpecs = {
  docx: {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    contentTypeNamespace: CONTENT_TYPES_NAMESPACE,
    filename: "lesson.docx",
    mainPart: "word/document.xml",
    mainRoot: "w:document",
    mainRootNamespace: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  pptx: {
    contentType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
    contentTypeNamespace: CONTENT_TYPES_NAMESPACE,
    filename: "slides.pptx",
    mainPart: "ppt/presentation.xml",
    mainRoot: "p:presentation",
    mainRootNamespace: "http://schemas.openxmlformats.org/presentationml/2006/main",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
} as const;

type OoxmlKind = keyof typeof ooxmlFixtureSpecs;
type OoxmlOverrides = {
  contentTypes?: string;
  extraEntries?: Record<string, string>;
  mainDocument?: string;
  relationships?: string;
};

function oleDocument(streamName: string) {
  return Buffer.concat([
    OLE_SIGNATURE,
    Buffer.alloc(64),
    Buffer.from(streamName, "utf16le"),
    Buffer.alloc(64),
  ]);
}

export function zipFixture(entries: Record<string, string>) {
  const sourceEntries = Object.entries(entries);
  if (sourceEntries.length === 0 || sourceEntries.length > MAX_FIXTURE_ENTRIES) {
    throw new Error("ZIP fixture entry count is out of bounds");
  }

  let sourceBytes = 0;
  const encodedEntries = Object.fromEntries(
    sourceEntries.map(([name, content]) => {
      const bytes = strToU8(content, true);
      sourceBytes += bytes.length;
      if (sourceBytes > MAX_FIXTURE_SOURCE_BYTES) {
        throw new Error("ZIP fixture source is too large");
      }
      return [name, bytes];
    }),
  );

  return Buffer.from(zipSync(encodedEntries, { level: 0, mtime: ZIP_FIXTURE_MTIME }));
}

export function zipFixtureWithClaimedSize(entryName: string, claimedSize: number) {
  const bytes = zipFixture({ [entryName]: "x" });
  const localHeader = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const centralHeader = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  if (localHeader < 0 || centralHeader < 0) throw new Error("ZIP fixture headers are missing");
  bytes.writeUInt32LE(claimedSize, localHeader + 22);
  bytes.writeUInt32LE(claimedSize, centralHeader + 24);
  return bytes;
}

export function zipFixtureWithCorruptedCompressedPayload() {
  const bytes = Buffer.from(
    zipSync(
      {
        "payload.txt": strToU8(
          "metadata-only ZIP validation must not inflate this payload".repeat(8),
          true,
        ),
      },
      { level: 6, mtime: ZIP_FIXTURE_MTIME },
    ),
  );
  const localHeader = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (localHeader < 0) throw new Error("ZIP fixture local header is missing");
  const compressedSize = bytes.readUInt32LE(localHeader + 18);
  const nameLength = bytes.readUInt16LE(localHeader + 26);
  const extraLength = bytes.readUInt16LE(localHeader + 28);
  const payloadOffset = localHeader + 30 + nameLength + extraLength;
  if (compressedSize === 0 || payloadOffset + compressedSize > bytes.length) {
    throw new Error("ZIP fixture compressed payload is missing");
  }
  bytes.fill(0xff, payloadOffset, payloadOffset + compressedSize);
  return bytes;
}

export function zipFixtureWithHighCompressionRatio() {
  return Buffer.from(
    zipSync(
      { "bomb.txt": strToU8("A".repeat(32 * 1024), true) },
      { level: 9, mtime: ZIP_FIXTURE_MTIME },
    ),
  );
}

export function zipFixtureWithInvalidLocalHeaderOffset() {
  const bytes = zipFixture({ "notes.txt": "Course notes" });
  const centralHeader = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  if (centralHeader < 0) throw new Error("ZIP fixture central header is missing");
  bytes.writeUInt32LE(bytes.length + 1, centralHeader + 42);
  return bytes;
}

export function zipFixtureWithInvalidLocalHeaderSignature() {
  const bytes = zipFixture({ "notes.txt": "Course notes" });
  const localHeader = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (localHeader < 0) throw new Error("ZIP fixture local header is missing");
  bytes.writeUInt32LE(0, localHeader);
  return bytes;
}

export function zipFixtureWithInvalidPayloadBounds() {
  const bytes = zipFixture({ "notes.txt": "Course notes" });
  const localHeader = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (localHeader < 0) throw new Error("ZIP fixture local header is missing");
  bytes.writeUInt16LE(0xffff, localHeader + 26);
  return bytes;
}

export function ooxmlFixture(kind: OoxmlKind, overrides: OoxmlOverrides = {}) {
  const spec = ooxmlFixtureSpecs[kind];
  const defaults = ooxmlXmlParts(kind);
  return zipFixture({
    "[Content_Types].xml": overrides.contentTypes ?? defaults.contentTypes,
    "_rels/.rels": overrides.relationships ?? defaults.relationships,
    [spec.mainPart]: overrides.mainDocument ?? defaults.mainDocument,
    ...overrides.extraEntries,
  });
}

export function ooxmlXmlParts(kind: OoxmlKind) {
  const spec = ooxmlFixtureSpecs[kind];
  const prefix = spec.mainRoot.split(":")[0];
  return {
    contentTypes: `<Types xmlns="${CONTENT_TYPES_NAMESPACE}"><Override PartName="/${spec.mainPart}" ContentType="${spec.contentType}"/></Types>`,
    relationships: `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"><Relationship Id="rId1" Type="${OFFICE_DOCUMENT_RELATIONSHIP}" Target="${spec.mainPart}"/></Relationships>`,
    mainDocument: `<${spec.mainRoot} xmlns:${prefix}="${spec.mainRootNamespace}"></${spec.mainRoot}>`,
  };
}

export const uploadFixtures = {
  pdf: Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF", "ascii"),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]),
  gif: Buffer.from("GIF89a", "ascii"),
  webp: Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0x04, 0x00, 0x00, 0x00]),
    Buffer.from("WEBPVP8 ", "ascii"),
  ]),
  text: Buffer.from("A bounded UTF-8 course note.\n", "utf8"),
  doc: oleDocument("WordDocument"),
  ppt: oleDocument("PowerPoint Document"),
  zip: zipFixture({ "notes.txt": "Course notes" }),
  docx: ooxmlFixture("docx"),
  pptx: ooxmlFixture("pptx"),
} as const;
