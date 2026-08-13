import * as DocumentPicker from 'expo-document-picker';
import { File, FileMode, Paths } from 'expo-file-system';
import { getDb } from '@/db/connection';
import { insertDocument, getDocumentByPath, updateDocument } from '@/db/documents';
import { indexDocumentContent } from '@/db/content-index';
import type { Document, DocumentType } from '@/types';
import type { DocumentSource } from '@/types/discovery';
import {
  EXTENSION_TYPE_MAP,
  getDocumentType as getDocumentTypeFromRegistry,
  getClassification as getClassificationFromRegistry,
} from '@/services/discovery/registry';

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
    const handle = source.open(FileMode.ReadOnly);
    try {
      const bytes = handle.readBytes(info.size ?? 0);
      localFile.write(new Uint8Array(bytes));
    } finally {
      handle.close();
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

    const type = getDocumentTypeFromRegistry(fileName);
    const classification = getClassificationFromRegistry(fileName);
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

    const doc: Document = {
      id,
      name: fileName,
      path: localPath,
      type,
      mimeType: options?.mimeType ?? mimeType,
      size: fileSize,
      pageCount: type === 'pdf' ? 1 : null,
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

    indexDocumentContent(db, id, localPath, type).catch(() => {});

    return doc;
  } catch {
    return null;
  }
}
