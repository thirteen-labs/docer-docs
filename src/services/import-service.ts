import * as DocumentPicker from 'expo-document-picker';
import { File, FileMode, Paths } from 'expo-file-system';
import { getDb } from '@/db/connection';
import { insertDocument, getDocumentByPath, updateDocument } from '@/db/documents';
import { indexDocumentContent } from '@/db/content-index';
import type { Document, DocumentType } from '@/types';
import type { DocumentSource } from '@/types/discovery';
import {
  getDocumentType as getDocumentTypeFromRegistry,
} from '@/services/discovery/registry';
import { validateSignature, canValidateSignature } from '@/services/discovery/signatures';

export { EXTENSION_TYPE_MAP } from '@/services/discovery/registry';

export interface ImportOptions {
  source?: DocumentSource;
  copyLocal?: boolean;
  mimeType?: string | null;
  size?: number;
  modifiedAt?: string;
}

function isContentUri(uri: string): boolean {
  return uri.startsWith('content://');
}

function getLocalStorageName(uri: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  let hash = 0;
  for (let i = 0; i < uri.length; i++) {
    hash = ((hash << 5) - hash) + uri.charCodeAt(i);
    hash = hash & hash;
  }
  return `${Math.abs(hash).toString(36)}_${safeName}`;
}

async function copyContentUriToLocal(uri: string, fileName: string): Promise<string | null> {
  try {
    const source = new File(uri);
    const info = source.info();
    if (!info.exists) return null;

    const localName = getLocalStorageName(uri, fileName);
    const localFile = new File(Paths.document, localName);
    if (localFile.exists) return localFile.uri;
    try {
      const handle = source.open(FileMode.ReadOnly);
      try {
        let bytes: Uint8Array | null = null;
        try { bytes = handle.readBytes(info.size ?? 0); } catch {}
        if (bytes && bytes.length > 0) {
          localFile.write(bytes);
        } else {
          const buf = await source.arrayBuffer();
          localFile.write(new Uint8Array(buf));
        }
      } finally {
        handle.close();
      }
    } catch {
      const buf = await source.arrayBuffer();
      localFile.write(new Uint8Array(buf));
    }
    return localFile.uri;
  } catch {
    return null;
  }
}

export async function pickAndImportDocument(): Promise<Document | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  return importFile(asset.uri, asset.name || 'untitled', asset.mimeType || null);
}

export async function importFile(
  uri: string,
  fileName: string,
  mimeType: string | null,
  options?: ImportOptions,
): Promise<Document | null> {
  try {
    const db = await getDb();

    const existing = await getDocumentByPath(db, uri);
    if (existing) {
      // If a content:// URI was stored locally before, still copy it now for reading
      if (isContentUri(existing.path)) {
        const localPath = await copyContentUriToLocal(existing.path, existing.name);
        if (localPath) {
          await updateDocument(db, existing.id, { path: localPath });
          existing.path = localPath;
        }
      }
      return existing;
    }

    const type = getDocumentTypeFromRegistry(fileName, options?.mimeType ?? mimeType);
    const source = options?.source || 'import';
    const copyLocal = options?.copyLocal !== undefined ? options.copyLocal : true;

    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    let localPath = uri;
    if (copyLocal && isContentUri(uri)) {
      const copied = await copyContentUriToLocal(uri, fileName);
      if (copied) {
        const existingLocal = await getDocumentByPath(db, copied);
        if (existingLocal) return existingLocal;
        localPath = copied;
      }
    }

    let fileSize = options?.size;
    if (fileSize === undefined) {
      try {
        const file = new File(uri);
        const info = file.info();
        fileSize = info.size || 0;
      } catch {
        fileSize = 0;
      }
    }

    let docType: DocumentType = type;
    const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
    if (canValidateSignature(ext)) {
      try {
        const valid = await validateSignature(localPath, ext);
        if (!valid) {
          console.warn(`[importFile] signature mismatch for ${fileName}; importing as unknown`);
          docType = 'unknown';
        }
      } catch {
        // keep extension-based type on validation error
      }
    }

    const doc: Document = {
      id,
      name: fileName,
      path: localPath,
      type: docType,
      mimeType: options?.mimeType ?? mimeType,
      size: fileSize,
      // Left null until the reader reports the real length. A hardcoded 1 made
      // PDF progress read as 100% on a many-page document, since progress is
      // currentPage / pageCount.
      pageCount: null,
      author: null,
      createdAt: options?.modifiedAt || now,
      modifiedAt: options?.modifiedAt || now,
      addedAt: now,
      metadata: null,
      thumbnailPath: null,
      isHidden: false,
      source: source as Document['source'],
    };

    await insertDocument(db, doc);

    indexDocumentContent(db, id, localPath, docType).catch(() => {});

    return doc;
  } catch {
    return null;
  }
}
