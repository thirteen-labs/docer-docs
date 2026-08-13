import type { DocumentType } from '@/types';
import type { DocumentClassification } from '@/types/discovery';

/**
 * Canonical extension → document type registry.
 * Single source of truth for what DOCER indexes and how files are classified.
 */
export const EXTENSION_TYPE_MAP: Record<string, DocumentType> = {
  pdf: 'pdf',
  epub: 'epub',
  mobi: 'epub',
  doc: 'doc', docx: 'docx',
  xls: 'xls', xlsx: 'xlsx',
  ppt: 'ppt', pptx: 'pptx',
  rtf: 'rtf',
  txt: 'txt', md: 'md', csv: 'csv',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  webp: 'image', bmp: 'image', svg: 'image', heic: 'image', heif: 'image',
  tif: 'image', tiff: 'image',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive',
  gz: 'archive', bz2: 'archive', xz: 'archive',
  cbz: 'archive', cbr: 'archive',
  json: 'code', xml: 'code', html: 'code', htm: 'code', css: 'code',
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code',
  java: 'code', c: 'code', cpp: 'code', h: 'code', py: 'code',
  php: 'code', rb: 'code', go: 'code', rs: 'code', sh: 'code',
  sql: 'code', yaml: 'code', yml: 'code',
};

/** MIME type → extension lookup used to classify files without a reliable extension. */
export const MIME_TYPE_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/rtf': 'rtf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'text/html': 'html',
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/tiff': 'tiff',
  'application/zip': 'zip',
  'application/x-rar-compressed': 'rar',
  'application/x-7z-compressed': '7z',
  'application/x-tar': 'tar',
  'application/gzip': 'gz',
  'application/x-bzip2': 'bz2',
};

export const SUPPORTED_EXTENSIONS: string[] = Object.keys(EXTENSION_TYPE_MAP);

/**
 * System/junk files that must never be indexed even when the extension looks
 * harmless (prevents `.apk`, `.so`, `.db`, `.tmp` flooding the library).
 */
const EXCLUDED_NAME_PATTERNS = [
  /\.apk$/i,
  /\.so$/i,
  /\.dex$/i,
  /\.db$/i,
  /\.sqlite\d*$/i,
  /\.tmp$/i,
  /\.cache$/i,
  /\.bak$/i,
  /\.log$/i,
  /\.pid$/i,
  /\.lock$/i,
  /\.crdownload$/i,
  /\.part$/i,
  /\.swp$/i,
  /^\./,
  /^~|~$/,
];

export function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot < 0 || lastDot === fileName.length - 1) return '';
  return fileName.slice(lastDot + 1).toLowerCase();
}

export function isExcludedFile(fileName: string): boolean {
  if (!fileName) return true;
  return EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(fileName));
}

export function isSupportedExtension(fileName: string): boolean {
  if (isExcludedFile(fileName)) return false;
  const ext = getExtension(fileName);
  return ext !== '' && ext in EXTENSION_TYPE_MAP;
}

export function getDocumentType(fileName: string, mimeType?: string | null): DocumentType {
  const ext = getExtension(fileName);
  if (ext in EXTENSION_TYPE_MAP) return EXTENSION_TYPE_MAP[ext];
  if (mimeType) {
    const mimeKey = mimeType.toLowerCase().split(';')[0].trim();
    const mappedExt = MIME_TYPE_MAP[mimeKey];
    if (mappedExt && mappedExt in EXTENSION_TYPE_MAP) return EXTENSION_TYPE_MAP[mappedExt];
  }
  return 'unknown';
}

export function isImageExtension(fileName: string): boolean {
  return EXTENSION_TYPE_MAP[getExtension(fileName)] === 'image';
}

export function getClassification(fileName: string): DocumentClassification {
  return isImageExtension(fileName) ? 'image' : 'document';
}

export function getMimeType(extension: string): string | null {
  const ext = extension.toLowerCase().replace(/^\./, '');
  if (!ext) return null;
  for (const [mime, mappedExt] of Object.entries(MIME_TYPE_MAP)) {
    if (mappedExt === ext) return mime;
  }
  return null;
}
