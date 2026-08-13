/**
 * Types for DOCER's device-wide document discovery system.
 *
 * Every scanner (MediaStore, SAF, filesystem, iCloud, picker) produces a
 * `DiscoveredDocument` reference — never a copy. The URI is kept in the
 * database and readers open the original file. A local copy is only created
 * when a specific reader requires it (e.g. WebView-based engines).
 */

export type DocumentSource =
  | 'import'
  | 'mediastore'
  | 'filesystem'
  | 'folder'
  | 'icloud'
  | 'downloaded';

export type DocumentClassification = 'document' | 'image' | 'scan';

export interface DiscoveredDocument {
  /** Stable id derived from the reference URI. */
  id: string;
  name: string;
  /** Reference to the original file: `content://`, `file://`, or an iCloud path. */
  uri: string;
  mimeType?: string;
  extension: string;
  size?: number;
  modifiedAt?: number;
  source: DocumentSource;
  accessible: boolean;
  classification: DocumentClassification;
}

export interface DiscoveryProgress {
  phase: 'permissions' | 'scanning' | 'indexing';
  source: string;
  filesFound: number;
  filesImported: number;
  currentPath: string | null;
}

export interface DiscoveryResult {
  /** Every candidate document the scanners surfaced. */
  found: DiscoveredDocument[];
  imported: number;
  updated: number;
  skipped: number;
}

export interface ReconcileResult {
  /** Documents whose source file no longer exists, removed from the index. */
  removed: number;
  /** Documents still referenced but whose file could not be verified. */
  unavailable: number;
  /** Documents refreshed with fresh metadata (size / modified date). */
  updated: number;
}

export interface DiscoveryOptions {
  /** Restrict discovery to these sources. Defaults to every platform-supported source. */
  sources?: DocumentSource[];
  /** Include document-like images (default: true on Android, false elsewhere). */
  includeImages?: boolean;
  /** Run magic-byte format validation before indexing (default: true for manual scans, false for launch). */
  validateSignatures?: boolean;
  onProgress?: (progress: DiscoveryProgress) => void;
  signal?: AbortSignal;
}

export const DOCUMENT_SOURCE_LABELS: Record<DocumentSource, string> = {
  import: 'Imported',
  mediastore: 'Device MediaStore',
  filesystem: 'Device storage',
  folder: 'Connected folder',
  icloud: 'iCloud Drive',
  downloaded: 'Downloads',
};
