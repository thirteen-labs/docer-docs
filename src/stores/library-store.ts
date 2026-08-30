import { create } from 'zustand';
import type { Document, ViewMode, SortBy, SortOrder } from '@/types';
import { getDb } from '@/db/connection';
import { getAllDocuments, getCategoryCounts } from '@/db/documents';

interface CategoryCount {
  type: string;
  count: number;
}

const PAGE_SIZE = 60;

interface LibraryState {
  documents: Document[];
  categories: CategoryCount[];
  selectedCategory: string | null;
  sortBy: SortBy;
  sortOrder: SortOrder;
  viewMode: ViewMode;
  isLoading: boolean;
  hasMore: boolean;
  setSelectedCategory: (category: string | null) => void;
  setSortBy: (sort: SortBy) => void;
  setSortOrder: (order: SortOrder) => void;
  setViewMode: (mode: ViewMode) => void;
  fetchDocuments: () => Promise<void>;
  loadMore: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  documents: [],
  categories: [],
  selectedCategory: null,
  sortBy: 'date',
  sortOrder: 'desc',
  viewMode: 'grid',
  isLoading: false,
  hasMore: false,

  setSelectedCategory: (selectedCategory) => { set({ selectedCategory }); get().fetchDocuments(); },
  setSortBy: (sortBy) => { set({ sortBy }); get().fetchDocuments(); },
  setSortOrder: (sortOrder) => { set({ sortOrder }); get().fetchDocuments(); },
  setViewMode: (viewMode) => set({ viewMode }),

  fetchDocuments: async () => {
    set({ isLoading: true });
    try {
      const db = await getDb();
      const { selectedCategory, sortBy, sortOrder } = get();
      const category = selectedCategory && selectedCategory !== 'all' ? selectedCategory : null;
      const docs = await getAllDocuments(db, { category, sortBy, sortOrder, limit: PAGE_SIZE, offset: 0 });
      set({ documents: docs, isLoading: false, hasMore: docs.length === PAGE_SIZE });
    } catch {
      set({ isLoading: false });
    }
  },

  loadMore: async () => {
    const { hasMore, isLoading, documents, selectedCategory, sortBy, sortOrder } = get();
    if (!hasMore || isLoading) return;
    set({ isLoading: true });
    try {
      const db = await getDb();
      const category = selectedCategory && selectedCategory !== 'all' ? selectedCategory : null;
      const docs = await getAllDocuments(db, { category, sortBy, sortOrder, limit: PAGE_SIZE, offset: documents.length });
      if (docs.length === 0) {
        set({ hasMore: false, isLoading: false });
      } else {
        set({ documents: [...documents, ...docs], isLoading: false, hasMore: docs.length === PAGE_SIZE });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  fetchCategories: async () => {
    const db = await getDb();
    const cats = await getCategoryCounts(db);
    set({ categories: cats });
  },

  refreshLibrary: async () => {
    await get().fetchDocuments();
    await get().fetchCategories();
  },
}));
