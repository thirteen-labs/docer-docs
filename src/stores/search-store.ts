import { create } from 'zustand';
import { getDb } from '@/db/connection';
import { searchAll, searchNotes, searchBookmarks } from '@/db/search';
import { appStorage } from '@/storage';

interface SearchFilters {
  fileTypes: string[];
  inNotes: boolean;
  inBookmarks: boolean;
  inContent: boolean;
}

interface SearchResult {
  documentId: string;
  documentName: string;
  documentType: string;
  snippet: string;
  rank: number;
  matchType?: 'name' | 'content';
}

interface SearchState {
  query: string;
  results: SearchResult[];
  recentSearches: string[];
  filters: SearchFilters;
  isSearching: boolean;
  setQuery: (query: string) => void;
  setFilters: (filters: Partial<SearchFilters>) => void;
  search: () => Promise<void>;
  clearSearch: () => void;
  loadRecentSearches: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  results: [],
  recentSearches: [],
  filters: { fileTypes: [], inNotes: false, inBookmarks: false, inContent: true },
  isSearching: false,

  loadRecentSearches: () => {
    set({ recentSearches: appStorage.getSearchHistory() });
  },

  setQuery: (query) => set({ query }),

  setFilters: (filters) => {
    set((s) => ({ filters: { ...s.filters, ...filters } }));
  },

  search: async () => {
    const { query, filters } = get();
    if (!query.trim()) {
      set({ results: [] });
      return;
    }
    set({ isSearching: true });
    try {
      appStorage.addSearchHistory(query);
      const db = await getDb();
      let combined: SearchResult[] = [];

      if (filters.inContent) {
        combined = combined.concat(await searchAll(db, query));
      }

      if (filters.inNotes) {
        const notes = await searchNotes(db, query);
        combined = combined.concat(
          (notes as Array<{ document_id: string; documentName: string; documentType: string; content: string }>).map((n) => ({
            documentId: n.document_id,
            documentName: n.documentName,
            documentType: n.documentType,
            snippet: (n.content ?? '').slice(0, 200),
            rank: 0,
            matchType: 'name' as const,
          })),
        );
      }

      if (filters.inBookmarks) {
        const bms = await searchBookmarks(db, query);
        combined = combined.concat(
          (bms as Array<{ document_id: string; documentName: string; label: string }>).map((b) => ({
            documentId: b.document_id,
            documentName: b.documentName,
            documentType: b.label ? 'bookmark' : 'bookmark',
            snippet: b.label ?? '',
            rank: 0,
            matchType: 'name' as const,
          })),
        );
      }

      if (filters.fileTypes.length > 0) {
        const allowed = new Set(filters.fileTypes);
        combined = combined.filter((r) => allowed.has(r.documentType));
      }

      const byDoc = new Map<string, SearchResult>();
      for (const r of combined) {
        const prev = byDoc.get(r.documentId);
        if (!prev || r.rank > prev.rank) byDoc.set(r.documentId, r);
      }

      set({ results: Array.from(byDoc.values()), isSearching: false, recentSearches: appStorage.getSearchHistory() });
    } catch {
      set({ isSearching: false });
    }
  },

  clearSearch: () => {
    set({ query: '', results: [] });
  },
}));
