import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, Search, X, ZoomIn, ZoomOut, FileSpreadsheet, FileText, Presentation, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { WebView } from 'react-native-webview';

import { useTheme } from '@/hooks/use-theme';
import { getDb } from '@/db/connection';
import { getDocumentById } from '@/db/documents';
import { renderDocx, renderXlsx, renderPptx } from '@/readers/office/office-engine';

export default function OfficeReaderScreen() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [docName, setDocName] = useState('Office Document');
  const [officeType, setOfficeType] = useState<'word' | 'excel' | 'ppt'>('word');
  const [zoom, setZoom] = useState(1);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const db = await getDb();
      const doc = await getDocumentById(db, id);
      if (!doc) { setError('Document not found'); setLoading(false); return; }
      setDocName(doc.name);
      const ext = doc.name.split('.').pop()?.toLowerCase() || '';

      try {
        let rendered: string;
        if (['doc', 'docx'].includes(ext)) {
          setOfficeType('word');
          rendered = await renderDocx(doc.path);
        } else if (['xls', 'xlsx', 'csv'].includes(ext)) {
          setOfficeType('excel');
          rendered = await renderXlsx(doc.path);
        } else if (['ppt', 'pptx'].includes(ext)) {
          setOfficeType('ppt');
          rendered = await renderPptx(doc.path);
        } else {
          setOfficeType('word');
          rendered = await renderDocx(doc.path);
        }
        setHtml(rendered);
      } catch (e: any) {
        setError(e.message || 'Failed to render document');
      }
      setLoading(false);
    })();
  }, [id]);

  const handleFind = useCallback((query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      (webViewRef.current as any)?.findInPage?.(query);
    } else {
      (webViewRef.current as any)?.clearFindInPage?.();
    }
  }, []);

  const findNext = useCallback(() => {
    if (searchQuery.trim()) {
      (webViewRef.current as any)?.findInPage?.(searchQuery, { forward: true, next: true });
    }
  }, [searchQuery]);

  const findPrev = useCallback(() => {
    if (searchQuery.trim()) {
      (webViewRef.current as any)?.findInPage?.(searchQuery, { forward: false, next: true });
    }
  }, [searchQuery]);

  const Icon = officeType === 'word' ? FileText : officeType === 'excel' ? FileSpreadsheet : Presentation;

  const styledHtml = html?.replace('<body', `<body style="transform:scale(${zoom});transform-origin:top left"`);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={{ color: c.textSecondary, marginTop: 12 }}>Rendering document...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <TouchableOpacity onPress={() => router.back()}><ArrowLeft size={24} color={c.text} /></TouchableOpacity>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: c.text, textAlign: 'center' }} numberOfLines={1}>{docName}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ color: c.error, fontSize: 16 }}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <TouchableOpacity onPress={() => router.back()}><ArrowLeft size={24} color={c.text} /></TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: c.text, textAlign: 'center' }} numberOfLines={1}>{docName}</Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity
            style={{ padding: 6 }}
            onPress={() => { setSearchOpen(!searchOpen); if (searchOpen) { setSearchQuery(''); (webViewRef.current as any)?.clearFindInPage?.(); } }}
          >
            {searchOpen ? <X size={20} color={c.primary} /> : <Search size={20} color={c.textSecondary} />}
          </TouchableOpacity>
        </View>
      </View>

      {searchOpen && (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, gap: 8 }}>
          <TextInput
            value={searchQuery}
            onChangeText={handleFind}
            placeholder="Find in document..."
            placeholderTextColor={c.textTertiary}
            style={{ flex: 1, backgroundColor: c.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: c.text }}
            autoFocus
          />
          <TouchableOpacity onPress={findPrev} style={{ padding: 6 }}>
            <ChevronLeft size={20} color={c.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={findNext} style={{ padding: 6 }}>
            <ChevronRight size={20} color={c.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      <WebView
        ref={webViewRef}
        source={{ html: styledHtml || '' }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        javaScriptEnabled={false}
        domStorageEnabled={false}
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={c.primary} />
          </View>
        )}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 24, paddingVertical: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border }}>
        <Icon size={22} color={c.primary} />
        <TouchableOpacity onPress={() => setZoom(Math.max(0.5, zoom - 0.25))}><ZoomOut size={22} color={c.text} /></TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 14 }}>{Math.round(zoom * 100)}%</Text>
        <TouchableOpacity onPress={() => setZoom(Math.min(3, zoom + 0.25))}><ZoomIn size={22} color={c.text} /></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
