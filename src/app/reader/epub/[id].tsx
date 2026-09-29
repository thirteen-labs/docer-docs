import { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { EpubViewer } from '@/readers/epub/epub-viewer';
import { EpubToolbar } from '@/readers/epub/epub-toolbar';
import { EpubSettings } from '@/readers/epub/epub-settings';
import { parseEpub, getEpubHtml, type EpubData } from '@/readers/epub/epub-engine';
import { AddBookmarkModal } from '@/features/annotations/add-bookmark-modal';
import { AddNoteModal } from '@/features/annotations/add-note-modal';
import { HighlightToolbar } from '@/readers/shared/highlight-toolbar';
import { useTheme } from '@/hooks/use-theme';
import { useThemeStore } from '@/stores/theme-store';
import { useDocumentStore } from '@/stores/document-store';
import { getDb } from '@/db/connection';
import { getDocumentById } from '@/db/documents';
import { getBookmarksByDocument, deleteBookmarkByPage } from '@/db/bookmarks';
import { insertHighlight } from '@/db/highlights';
import { useReadingProgress } from '@/hooks/use-reading-progress';

export default function EpubReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Keying on the document id makes React remount when a different book is
  // opened, so no state from the previous one leaks into this screen.
  return <EpubReader key={id ?? ''} id={id} />;
}

function EpubReader({ id }: { id: string }) {
  const c = useTheme();
  const [epubData, setEpubData] = useState<EpubData | null>(null);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [docName, setDocName] = useState('eBook');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBookmarkModal, setShowBookmarkModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [showHighlightToolbar, setShowHighlightToolbar] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const fontSize = useThemeStore((s) => s.fontSize);
  const lineSpacing = useThemeStore((s) => s.lineSpacing);
  const openDocument = useDocumentStore((s) => s.openDocument);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      await openDocument(id);
      const db = await getDb();
      const doc = await getDocumentById(db, id);
      if (cancelled) return;
      if (!doc) { setError('Document not found'); setLoading(false); return; }
      setDocName(doc.name);
      try {
        const data = await parseEpub(doc.path);
        if (cancelled) return;
        setEpubData(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to parse EPUB');
      }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [id, openDocument]);

  useEffect(() => {
    if (!id || !epubData) return;
    (async () => {
      const db = await getDb();
      const bookmarks = await getBookmarksByDocument(db, id);
      const chapterTitle = epubData.chapters[currentChapter]?.title;
      const matched = bookmarks.some((b) => b.chapter === chapterTitle);
      setIsBookmarked(matched);
    })();
  }, [id, currentChapter, epubData]);

  // Chapter indices are 0-based; record 1-based so the last chapter reaches 100%.
  useReadingProgress({
    documentId: id,
    page: currentChapter + 1,
    total: epubData?.chapters.length ?? 0,
    enabled: !loading && !error && !!epubData,
  });

  const handleToggleBookmark = useCallback(async () => {
    if (!id || !epubData) return;
    const db = await getDb();
    if (isBookmarked) {
      const chapterTitle = epubData.chapters[currentChapter]?.title;
      const bookmarks = await getBookmarksByDocument(db, id);
      const existing = bookmarks.find((b) => b.chapter === chapterTitle);
      if (existing) await deleteBookmarkByPage(db, id, existing.page ?? 0);
      setIsBookmarked(false);
    } else {
      setShowBookmarkModal(true);
    }
  }, [id, isBookmarked, currentChapter, epubData]);

  const handleTextSelection = useCallback((text: string) => {
    if (text.trim().length > 0) {
      setSelectedText(text.trim());
      setShowHighlightToolbar(true);
    }
  }, []);

  const handleHighlight = useCallback(async (color: string) => {
    if (!id || !selectedText) return;
    const db = await getDb();
    await insertHighlight(db, {
      id: `hl-${Date.now()}`,
      documentId: id,
      page: currentChapter,
      color: color as any,
      text: selectedText,
      position: '',
      createdAt: new Date().toISOString(),
    });
    setSelectedText('');
    setShowHighlightToolbar(false);
  }, [id, selectedText, currentChapter]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: c.textSecondary }}>Loading EPUB...</Text>
      </SafeAreaView>
    );
  }

  if (error || !epubData) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <EpubToolbar title="Error" chapterTitle="" currentChapter={0} totalChapters={0} chapters={[]}
          onPrevChapter={()=>{}} onNextChapter={()=>{}} onChapterSelect={()=>{}}
          onToggleBookmark={()=>{}} onToggleSearch={()=>{}} onToggleSettings={()=>{}} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ color: c.error, fontSize: 16, fontWeight: '600' }}>Error loading EPUB</Text>
          <Text style={{ color: c.textSecondary, marginTop: 8, textAlign: 'center' }}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const chapter = epubData.chapters[currentChapter];
  const html = getEpubHtml(chapter.content, { bg: c.readerBackground, text: c.readerText }, fontSize, lineSpacing);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <EpubToolbar
        title={docName}
        chapterTitle={chapter.title}
        currentChapter={currentChapter}
        totalChapters={epubData.chapters.length}
        chapters={epubData.chapters.map((ch) => ch.title)}
        isBookmarked={isBookmarked}
        onPrevChapter={() => setCurrentChapter(Math.max(0, currentChapter - 1))}
        onNextChapter={() => setCurrentChapter(Math.min(epubData.chapters.length - 1, currentChapter + 1))}
        onChapterSelect={setCurrentChapter}
        onToggleBookmark={handleToggleBookmark}
        onToggleSearch={() => setShowSearch(!showSearch)}
        onToggleSettings={() => setShowSettings(!showSettings)}
        onHighlight={() => setShowHighlightToolbar(true)}
        onNote={() => setShowNoteModal(true)}
      />
      <View style={{ flex: 1 }}>
        <EpubViewer html={html} onTextSelection={handleTextSelection} />
      </View>
      {showSettings && <EpubSettings onClose={() => setShowSettings(false)} />}

      <HighlightToolbar
        visible={showHighlightToolbar}
        selectedText={selectedText}
        onHighlight={handleHighlight}
        onDismiss={() => { setShowHighlightToolbar(false); setSelectedText(''); }}
      />

      {id && (
        <>
          <AddBookmarkModal
            visible={showBookmarkModal}
            documentId={id}
            page={currentChapter}
            onClose={() => setShowBookmarkModal(false)}
            onSaved={() => setIsBookmarked(true)}
          />
          <AddNoteModal
            visible={showNoteModal}
            documentId={id}
            page={currentChapter}
            onClose={() => setShowNoteModal(false)}
            onSaved={() => {}}
          />
        </>
      )}
    </SafeAreaView>
  );
}
