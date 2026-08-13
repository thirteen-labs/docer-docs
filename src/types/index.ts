export type DocumentType = 'pdf' | 'epub' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'ppt' | 'pptx' | 'txt' | 'md' | 'rtf' | 'csv' | 'image' | 'archive' | 'code' | 'unknown';

export interface Document {
  id: string;
  name: string;
  path: string;
  type: DocumentType;
  mimeType: string | null;
  size: number;
  pageCount: number | null;
  author: string | null;
  createdAt: string;
  modifiedAt: string;
  addedAt: string;
  metadata: Record<string, unknown> | null;
  thumbnailPath: string | null;
  isHidden: boolean;
  source: 'import' | 'mediastore' | 'filesystem' | 'folder' | 'icloud' | 'downloaded';
}

export interface ReadingHistory {
  id: string;
  documentId: string;
  lastPage: number;
  lastPosition: string | null;
  progress: number;
  startedAt: string;
  lastReadAt: string;
  readCount: number;
  totalReadingTime: number;
}

export interface Bookmark {
  id: string;
  documentId: string;
  page: number | null;
  chapter: string | null;
  position: string | null;
  label: string;
  folderId?: string;
  createdAt: string;
}

export interface Highlight {
  id: string;
  documentId: string;
  page: number;
  color: 'yellow' | 'blue' | 'green' | 'pink' | 'orange';
  text: string;
  position: string;
  createdAt: string;
}

export interface Note {
  id: string;
  documentId: string;
  page: number | null;
  paragraphIndex: number | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  isEncrypted: boolean;
}

export interface Collection {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  pinnedToHome: boolean;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface ReadingGoal {
  id: string;
  type: 'daily_pages' | 'daily_time' | 'weekly' | 'monthly';
  targetValue: number;
  currentValue: number;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface ReadingStats {
  id: string;
  date: string;
  pagesRead: number;
  readingTime: number;
  documentsOpened: number;
}

export type Theme = 'light' | 'dark' | 'amoled' | 'sepia' | 'paper' | 'midnight' | 'forest' | 'ocean' | 'glass';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceVariant: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  primaryContainer: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  readerBackground: string;
  readerText: string;
  readerAccent: string;
  border: string;
  separator: string;
  overlay: string;
  highlight: string;
}

export type ScrollMode = 'continuous' | 'single' | 'double';

export type ViewMode = 'grid' | 'list';

export type SortBy = 'name' | 'date' | 'type' | 'size';

export type SortOrder = 'asc' | 'desc';
