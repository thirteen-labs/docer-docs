import { useEffect, useState, useCallback, useRef, startTransition } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, Bookmark, WrapText, ListOrdered } from 'lucide-react-native';
import { WebView } from 'react-native-webview';

import { useTheme } from '@/hooks/use-theme';
import { useThemeStore } from '@/stores/theme-store';
import { File, FileMode } from 'expo-file-system';
import { loadDocument } from '@/services/reader-loader';
import { ensureLocalUri } from '@/services/uri-resolver';
import { getHighlightedHtml, getPlainTextHtml, getMarkdownHtml, getLanguageFromExtension } from '@/readers/text/text-engine';
import { AddBookmarkModal } from '@/features/annotations/add-bookmark-modal';
import { AddNoteModal } from '@/features/annotations/add-note-modal';
import { getDb } from '@/db/connection';
import { getBookmarkByPage, deleteBookmarkByPage } from '@/db/bookmarks';

type TextRenderMode = 'plain' | 'highlighted' | 'markdown';

function getHtmlSourceUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

function getHtmlBaseUrl(path: string): string {
  return getHtmlSourceUri(path).replace(/[^/]+$/, '');
}

export default function TextReaderScreen() {
  const c = useTheme();
  const { id, preview, name } = useLocalSearchParams<{ id: string; preview?: string; name?: string }>();
  const [content, setContent] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  const [renderMode, setRenderMode] = useState<TextRenderMode>('plain');
  const [fileName, setFileName] = useState('Document');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBookmarkModal, setShowBookmarkModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const [htmlFilePath, setHtmlFilePath] = useState<string | null>(null);
  const isDark = useThemeStore((s) => s.theme !== 'light');
  const webViewRef = useRef<WebView>(null);

  const regenContent = useCallback(() => {
    if (!rawText) return;
    const opts = { wordWrap, showLineNumbers };
    if (renderMode === 'markdown') setContent(getMarkdownHtml(rawText, isDark, opts));
    else if (renderMode === 'highlighted') setContent(getHighlightedHtml(rawText, 'text', isDark, opts));
    else setContent(getPlainTextHtml(rawText, isDark, opts));
  }, [rawText, renderMode, isDark, wordWrap, showLineNumbers]);

  useEffect(() => { startTransition(() => regenContent()); }, [regenContent]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      if (preview) {
        const previewPath = decodeURIComponent(preview);
        const entryName = name ? decodeURIComponent(name) : 'Document';
        setFileName(entryName);
        const resolved = await ensureLocalUri(previewPath, entryName);
        const ext = entryName.split('.').pop()?.toLowerCase() || '';
        if (['html', 'htm'].includes(ext)) {
          setHtmlFilePath(resolved);
          setLoading(false);
          return;
        }
        let text = '';
        try {
          const file = new File(resolved);
          const info = file.info();
          const MAX = 2 * 1024 * 1024;
          text = (info.size ?? 0) > MAX
            ? (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8').decode(file.open(FileMode.ReadOnly).readBytes(MAX)) : '')
            : await file.text();
        } catch {}
        if (['md', 'mdx'].includes(ext)) {
          setRawText(text);
          setRenderMode('markdown');
        } else {
          const lang = getLanguageFromExtension(ext);
          setRawText(text);
          setRenderMode(lang ? 'highlighted' : 'plain');
        }
        setLoading(false);
        return;
      }

      const { doc, content: fileContent, resolvedUri } = await loadDocument(id);
      if (!doc) { setError('Document not found'); setLoading(false); return; }
      setFileName(doc.name);
      const text = fileContent || '';

      if (fileContent === null && doc.type === 'code') {
        setRawText('// Unable to load file content');
        setRenderMode('highlighted');
        setLoading(false);
        return;
      }

      const ext = doc.name.split('.').pop()?.toLowerCase() || '';
      if (['html', 'htm'].includes(ext)) {
        setHtmlFilePath(resolvedUri || doc.path);
        setLoading(false);
        return;
      }
      if (['md', 'mdx'].includes(ext)) {
        setRawText(text);
        setRenderMode('markdown');
      } else {
        const lang = getLanguageFromExtension(ext);
        setRawText(text);
        setRenderMode(lang ? 'highlighted' : 'plain');
      }
      setLoading(false);
    })();
  }, [id, preview, name]);

  useEffect(() => {
    if (!id || preview) return;
    (async () => {
      const db = await getDb();
      const bm = await getBookmarkByPage(db, id, 1);
      setIsBookmarked(!!bm);
    })();
  }, [id, preview]);

  const handleToggleBookmark = useCallback(async () => {
    if (!id) return;
    const db = await getDb();
    if (isBookmarked) {
      await deleteBookmarkByPage(db, id, 1);
      setIsBookmarked(false);
    } else {
      setShowBookmarkModal(true);
    }
  }, [id, isBookmarked]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={c.primary} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: c.surface }}>
          <TouchableOpacity onPress={() => router.back()}><ArrowLeft size={24} color={c.text} /></TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.error, fontSize: 16 }}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()}><ArrowLeft size={24} color={c.text} /></TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: c.text, textAlign: 'center' }} numberOfLines={1}>{fileName}</Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity onPress={() => { setWordWrap(!wordWrap); }} style={{ padding: 6, opacity: wordWrap ? 1 : 0.4 }}>
            <WrapText size={20} color={c.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setShowLineNumbers(!showLineNumbers); }} style={{ padding: 6, opacity: showLineNumbers ? 1 : 0.4 }}>
            <ListOrdered size={20} color={c.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleToggleBookmark} style={{ padding: 6 }}>
            <Bookmark size={20} color={isBookmarked ? c.primary : c.textSecondary} fill={isBookmarked ? c.primary : 'transparent'} />
          </TouchableOpacity>
        </View>
      </View>
      {htmlFilePath ? (
        <WebView
          ref={webViewRef}
          source={{ uri: getHtmlSourceUri(htmlFilePath), baseUrl: getHtmlBaseUrl(htmlFilePath) }}
          style={{ flex: 1, backgroundColor: 'transparent' }}
          javaScriptEnabled={false}
          domStorageEnabled={false}
          allowFileAccess={false}
          startInLoadingState
          renderLoading={() => (
            <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color={c.primary} />
            </View>
          )}
        />
      ) : (
        <WebView ref={webViewRef} source={{ html: content || '' }} style={{ flex: 1, backgroundColor: 'transparent' }} javaScriptEnabled={false} />
      )}

      {id && !preview && (
        <>
          <AddBookmarkModal
            visible={showBookmarkModal}
            documentId={id}
            page={1}
            onClose={() => setShowBookmarkModal(false)}
            onSaved={() => setIsBookmarked(true)}
          />
          <AddNoteModal
            visible={showNoteModal}
            documentId={id}
            page={1}
            onClose={() => setShowNoteModal(false)}
            onSaved={() => {}}
          />
        </>
      )}
    </SafeAreaView>
  );
}
