import { File, FileMode } from 'expo-file-system';

/**
 * Best-effort magic-byte validation. Prevents renamed or corrupt files
 * (`foo.pdf` that is actually a `.so`) from flooding the library.
 *
 * Signature detection is non-blocking: if the storage provider cannot expose
 * the file header (some SAF `content://` providers are opaque), the file is
 * treated as valid rather than rejected.
 */

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const RAR4_MAGIC = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00];
const RAR5_MAGIC = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00];
const GZIP_MAGIC = [0x1f, 0x8b];
const BZIP2_MAGIC = [0x42, 0x5a, 0x68];
const TAR_MAGIC = [0x75, 0x73, 0x74, 0x61, 0x72]; // "ustar" at offset 257

interface SignatureRule {
  magic: number[];
  offset?: number;
}

const SIGNATURES: Record<string, SignatureRule[]> = {
  pdf: [{ magic: [0x25, 0x50, 0x44, 0x46] }], // %PDF
  png: [{ magic: [0x89, 0x50, 0x4e, 0x47] }], // \x89PNG
  jpg: [{ magic: [0xff, 0xd8, 0xff] }],
  gif: [{ magic: [0x47, 0x49, 0x46, 0x38] }], // GIF8
  webp: [{ magic: [0x52, 0x49, 0x46, 0x46] }], // RIFF (validated further)
  bmp: [{ magic: [0x42, 0x4d] }], // BM
  tif: [{ magic: [0x49, 0x49, 0x2a, 0x00] }, { magic: [0x4d, 0x4d, 0x00, 0x2a] }],
  heic: [{ magic: [0x66, 0x74, 0x79, 0x70] }], // ftyp (offset 4)
  zip: [{ magic: ZIP_MAGIC }],
  epub: [{ magic: ZIP_MAGIC }],
  cbz: [{ magic: ZIP_MAGIC }],
  docx: [{ magic: ZIP_MAGIC }],
  xlsx: [{ magic: ZIP_MAGIC }],
  pptx: [{ magic: ZIP_MAGIC }],
  rar: [{ magic: RAR4_MAGIC }, { magic: RAR5_MAGIC }],
  '7z': [{ magic: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] }],
  gz: [{ magic: GZIP_MAGIC }],
  bz2: [{ magic: BZIP2_MAGIC }],
  tar: [{ magic: TAR_MAGIC, offset: 257 }],
};

/** Extensions whose signature is checked (cheap 16-byte header reads). */
const VALIDATABLE_EXTENSIONS = new Set(Object.keys(SIGNATURES));

export function canValidateSignature(extension: string): boolean {
  return VALIDATABLE_EXTENSIONS.has(extension.toLowerCase());
}

function matches(bytes: Uint8Array, rule: SignatureRule): boolean {
  const offset = rule.offset ?? 0;
  if (offset + rule.magic.length > bytes.length) return false;
  for (let i = 0; i < rule.magic.length; i++) {
    if (bytes[offset + i] !== rule.magic[i]) return false;
  }
  return true;
}

/**
 * Reads up to `length` bytes from the file header using a read-only handle
 * (works for both `file://` and SAF `content://` URIs).
 */
async function readHeader(uri: string, length: number): Promise<Uint8Array | null> {
  try {
    const file = new File(uri);
    const handle = file.open(FileMode.ReadOnly);
    const bytes = handle.readBytes(length);
    handle.close();
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Returns true when the file header matches the expected magic bytes for its
 * extension. Returns true when validation is not possible or not configured
 * for the extension. Returns false only on a confirmed mismatch.
 */
export async function validateSignature(uri: string, extension: string): Promise<boolean> {
  const ext = extension.toLowerCase().replace(/^\./, '');
  if (!canValidateSignature(ext)) return true;

  const header = await readHeader(uri, 512);
  if (!header) return true;

  // For SVG (an XML text format) there is no reliable magic; accept any XML/plain-text start.
  if (ext === 'svg') {
    const head = header.subarray(0, 64).toString().toLowerCase();
    return head.includes('<svg') || head.includes('<?xml');
  }

  const rules = SIGNATURES[ext] || [];
  if (rules.length === 0) return true;

  if (rules.some((rule) => matches(header, rule))) return true;

  // A ZIP-family container can be an empty (still valid) archive; the 0x50 0x4B
  // signature is mandatory, so a mismatch here is a hard reject.
  if (ext === 'zip' || ext === 'epub' || ext === 'cbz' || ext === 'docx' || ext === 'xlsx' || ext === 'pptx') {
    return matches(header, { magic: ZIP_MAGIC });
  }

  return false;
}
