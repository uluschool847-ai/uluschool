import { strToU8, zipSync } from "fflate";

const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const MAX_FIXTURE_SOURCE_BYTES = 64 * 1024;
const MAX_FIXTURE_ENTRIES = 16;

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

  return Buffer.from(zipSync(encodedEntries, { level: 0 }));
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
  docx: zipFixture({
    "[Content_Types].xml":
      '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels": "<Relationships />",
    "word/document.xml": "<w:document />",
  }),
  pptx: zipFixture({
    "[Content_Types].xml":
      '<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
    "_rels/.rels": "<Relationships />",
    "ppt/presentation.xml": "<p:presentation />",
  }),
} as const;
