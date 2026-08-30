import { useEffect, useRef, useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';

import { PdfToolbar } from '@/readers/pdf/pdf-toolbar';
import { PdfBottomBar } from '@/readers/pdf/pdf-bottom-bar';
import { PdfViewer, type PdfViewerActions } from '@/readers/pdf/pdf-viewer';
import { HighlightToolbar } from '@/readers/shared/highlight-toolbar';
import { AddBookmarkModal } from '@/features/annotations/add-bookmark-modal';
import { AddNoteModal } from '@/features/annotations/add-note-modal';
import { useTheme } from '@/hooks/use-theme';
import { useReaderStore } from '@/stores/reader-store';
import { useDocumentStore } from '@/stores/document-store';
import { getDb } from '@/db/connection';
import { getDocumentById } from '@/db/documents';
import { upsertHistory, getHistoryByDocument } from '@/db/history';
import { getBookmarkByPage, deleteBookmarkByPage } from '@/db/bookmarks';
import { insertHighlight } from '@/db/highlights';

export default function PDFReaderScreen() {
  const c = useTheme();
  const { id, preview, name } = useLocalSearchParams<{ id: string; preview?: string; name?: string }>();
  const [docPath, setDocPath] = useState<string | null>(null);
  const [docName, setDocName] = useState('Document');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBookmarkModal, setShowBookmarkModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [showHighlightToolbar, setShowHighlightToolbar] = useState(false);
  const currentPage = useReaderStore((s) => s.currentPage);
  const zoom = useReaderStore((s) => s.zoom);
  const setTotalPages = useReaderStore((s) => s.setTotalPages);
  const setZoom = useReaderStore((s) => s.setZoom);
  const showThumbnails = useReaderStore((s) => s.showThumbnails);
  const resetReader = useReaderStore((s) => s.reset);
  const setCurrentPage = useReaderStore((s) => s.setCurrentPage);
  const openDocument = useDocumentStore((s) => s.openDocument);
  const currentDocument = useDocumentStore((s) => s.currentDocument);

  const actionsRef = useRef<PdfViewerActions | null>(null);
  const initialPageRef = useRef(1);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      if (preview) {
        setDocPath(decodeURIComponent(preview));
        setDocName(name ? decodeURIComponent(name) : 'Document');
        setLoading(false);
        return;
      }
      await openDocument(id);
      const db = await getDb();
      const doc = await getDocumentById(db, id);
      if (doc) {
        setDocPath(doc.path);
        setDocName(doc.name);
        if (doc.pageCount) setTotalPages(doc.pageCount);
        const hist = await getHistoryByDocument(db, id);
        if (hist?.last_page && hist.last_page > 1) {
          initialPageRef.current = hist.last_page;
          setCurrentPage(hist.last_page);
        }
        setLoading(false);
      } else {
        setError('Document not found');
        setLoading(false);
      }
    };
    load();
    return () => resetReader();
  }, [id, preview, name, openDocument, resetReader, setTotalPages, setCurrentPage]);

  useEffect(() => {
    if (!id || preview) return;
    (async () => {
      const db = await getDb();
      const bm = await getBookmarkByPage(db, id, currentPage);
      setIsBookmarked(!!bm);
    })();
  }, [id, currentPage, preview]);

  const recordProgress = useCallback(async () => {
    if (!id || !currentDocument) return;
    const db = await getDb();
    await upsertHistory(db, {
      id: `hist-${id}`,
      documentId: id,
      lastPage: currentPage,
      lastPosition: null,
      progress: currentDocument.pageCount ? currentPage / currentDocument.pageCount : 0,
      startedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
      readCount: 1,
      totalReadingTime: 0,
    });
  }, [id, currentDocument, currentPage]);

  const handleLoad = useCallback((totalPages: number) => {
    setTotalPages(totalPages);
    recordProgress();
    if (initialPageRef.current > 1) {
      const target = initialPageRef.current;
      initialPageRef.current = 1;
      setTimeout(() => actionsRef.current?.goToPage(target), 50);
    }
  }, [setTotalPages, recordProgress]);

  useEffect(() => {
    if (currentPage > 0) recordProgress();
  }, [currentPage, recordProgress]);

  const handleToggleBookmark = useCallback(async () => {
    if (!id || preview) return;
    const db = await getDb();
    if (isBookmarked) {
      await deleteBookmarkByPage(db, id, currentPage);
      setIsBookmarked(false);
    } else {
      setShowBookmarkModal(true);
    }
  }, [id, isBookmarked, currentPage, preview]);

  const handleTextSelection = useCallback((text: string) => {
    if (text.trim().length > 0) {
      setSelectedText(text.trim());
      setShowHighlightToolbar(true);
    }
  }, []);

  const handleShare = useCallback(async () => {
    if (!docPath) return;
    try {
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(docPath);
      }
    } catch {}
  }, [docPath]);

  const handleHighlight = useCallback(async (color: string) => {
    if (!id || !selectedText) return;
    const db = await getDb();
    await insertHighlight(db, {
      id: `hl-${Date.now()}`,
      documentId: id,
      page: currentPage,
      color: color as any,
      text: selectedText,
      position: '',
      createdAt: new Date().toISOString(),
    });
    setSelectedText('');
    setShowHighlightToolbar(false);
    actionsRef.current?.switchToNative();
  }, [id, selectedText, currentPage]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: c.textSecondary }}>Loading document...</Text>
      </SafeAreaView>
    );
  }

  if (error || !docPath) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <PdfToolbar title="Error" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ color: c.error, fontSize: 16, fontWeight: '600' }}>Error loading document</Text>
          <Text style={{ color: c.textSecondary, marginTop: 8, textAlign: 'center' }}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <PdfToolbar
        title={docName}
        isBookmarked={isBookmarked}
        onToggleThumbnails={() => actionsRef.current?.toggleThumbnails()}
        onToggleBookmark={handleToggleBookmark}
        onToggleSearch={() => actionsRef.current?.toggleSearch()}
        onHighlight={() => actionsRef.current?.enableSelection()}
        onNote={() => setShowNoteModal(true)}
        onShare={handleShare}
      />

      <View style={{ flex: 1, flexDirection: 'row' }}>
        {showThumbnails && (
          <PdfThumbnailSidebar
            pageCount={currentDocument?.pageCount ?? 0}
            currentPage={currentPage}
            onPageSelect={(page) => actionsRef.current?.goToPage(page)}
          />
        )}
        <PdfViewer
          path={docPath}
          actionRef={actionsRef}
          onLoad={handleLoad}
          onError={(e) => setError(e)}
          onTextSelection={handleTextSelection}
        />
      </View>

      <PdfBottomBar
        currentPage={currentPage}
        totalPages={currentDocument?.pageCount ?? 0}
        zoom={zoom}
        scrollMode={'continuous'}
        onPrevPage={() => actionsRef.current?.goToPage(Math.max(1, currentPage - 1))}
        onNextPage={() => actionsRef.current?.goToPage(currentPage + 1)}
        onZoomIn={() => { actionsRef.current?.zoomIn(); setZoom(Math.min(5, zoom + 0.25)); }}
        onZoomOut={() => { actionsRef.current?.zoomOut(); setZoom(Math.max(0.5, zoom - 0.25)); }}
        onScrollModeChange={() => {}}
      />

      <HighlightToolbar
        visible={showHighlightToolbar}
        selectedText={selectedText}
        onHighlight={handleHighlight}
        onDismiss={() => { setShowHighlightToolbar(false); setSelectedText(''); actionsRef.current?.switchToNative(); }}
      />

      {id && (
        <>
          <AddBookmarkModal
            visible={showBookmarkModal}
            documentId={id}
            page={currentPage}
            onClose={() => setShowBookmarkModal(false)}
            onSaved={() => setIsBookmarked(true)}
          />
          <AddNoteModal
            visible={showNoteModal}
            documentId={id}
            page={currentPage}
            onClose={() => setShowNoteModal(false)}
            onSaved={() => {}}
          />
        </>
      )}
    </SafeAreaView>
  );
}

function PdfThumbnailSidebar({ pageCount, currentPage, onPageSelect }: { pageCount: number; currentPage: number; onPageSelect: (page: number) => void }) {
  const c = useTheme();
  const totalPages = Math.min(pageCount, 200);

  return (
    <View style={{ width: 80, backgroundColor: c.surface, borderRightWidth: 1, borderRightColor: c.border }}>
      <Text style={{ color: c.textSecondary, fontSize: 11, textAlign: 'center', padding: 8 }}>Pages</Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 4 }} showsVerticalScrollIndicator={false}>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
          const isCurrent = page === currentPage;
          const isNear = Math.abs(page - currentPage) <= 2;
          return (
            <TouchableOpacity
              key={page}
              onPress={() => onPageSelect(page)}
              style={{
                height: 56, marginBottom: 4, borderRadius: 6,
                backgroundColor: isCurrent ? c.primaryContainer : c.surfaceVariant,
                borderWidth: isCurrent ? 2 : 1,
                borderColor: isCurrent ? c.primary : c.border,
                alignItems: 'center', justifyContent: 'center',
                opacity: isCurrent || isNear ? 1 : 0.6,
              }}
              accessibilityLabel={`Page ${page}${isCurrent ? ', current page' : ''}`}
              accessibilityRole="button"
            >
              <Text style={{
                fontSize: 10, fontWeight: isCurrent ? '700' : '400',
                color: isCurrent ? c.primary : c.textSecondary,
              }}>
                {page}
              </Text>
              {isCurrent && (
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.primary, marginTop: 2 }} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
