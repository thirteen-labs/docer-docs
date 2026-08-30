import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, Folder, FileArchive, Search, Download, ChevronLeft, X } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { getDb } from '@/db/connection';
import { getDocumentById } from '@/db/documents';
import { listArchiveEntries, extractEntry, type ArchiveEntry } from '@/readers/archive/archive-engine';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const PREVIEWABLE_EXTS = new Set(['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts', 'py', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'pdf']);

export default function ArchiveExplorerScreen() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [docName, setDocName] = useState('Archive');
  const [docPath, setDocPath] = useState('');
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const db = await getDb();
      const doc = await getDocumentById(db, id);
      if (!doc) { setError('Document not found'); setLoading(false); return; }
      setDocName(doc.name);
      setDocPath(doc.path);
      try {
        const stat = new File(doc.path).info();
        if ((stat.size ?? 0) > 300 * 1024 * 1024) {
          setError('This archive is too large to browse in this version (over 300 MB).');
          setLoading(false);
          return;
        }
        const all = await listArchiveEntries(doc.path);
        setEntries(all);
      } catch (e: any) {
        setError(e.message || 'Failed to read archive');
      }
      setLoading(false);
    })();
  }, [id]);

  const filteredEntries = searchOpen && searchQuery.trim()
    ? entries.filter((e) => !e.isDirectory && e.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : currentPath
      ? entries.filter((e) => {
          if (!e.path.startsWith(currentPath)) return false;
          const relative = e.path.slice(currentPath.length);
          return relative && !relative.includes('/');
        })
      : entries.filter((e) => !e.path.includes('/'));

  const handleNavigate = useCallback((entry: ArchiveEntry) => {
    if (entry.isDirectory) {
      setCurrentPath(entry.path + (entry.path.endsWith('/') ? '' : '/'));
      setSearchOpen(false);
      setSearchQuery('');
    } else {
      const ext = entry.name.split('.').pop()?.toLowerCase() || '';
      if (PREVIEWABLE_EXTS.has(ext)) {
        setExtracting(true);
        (async () => {
          try {
            const tmp = await extractEntry(docPath, entry.path);
            const preview = encodeURIComponent(tmp);
            const name = encodeURIComponent(entry.name);
            if (ext === 'pdf') router.push(`/reader/pdf/${id}?preview=${preview}&name=${name}`);
            else if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) router.push(`/reader/image/${id}?preview=${preview}&name=${name}`);
            else router.push(`/reader/text/${id}?preview=${preview}&name=${name}`);
          } catch {}
          setExtracting(false);
        })();
      }
    }
  }, [id, docPath]);

  const goUp = useCallback(() => {
    const parts = currentPath.replace(/\/$/, '').split('/');
    parts.pop();
    setCurrentPath(parts.length > 0 ? parts.join('/') + '/' : '');
  }, [currentPath]);

  const handleDownloadAll = useCallback(async () => {
    if (!docPath) return;
    try {
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(docPath);
      } else {
        Alert.alert('Not Available', 'Sharing is not available on this device.');
      }
    } catch {
      Alert.alert('Error', 'Failed to share archive.');
    }
  }, [docPath]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={{ color: c.textSecondary, marginTop: 12 }}>Reading archive...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" accessibilityRole="button"><ArrowLeft size={24} color={c.text} /></TouchableOpacity>
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
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" accessibilityRole="button"><ArrowLeft size={24} color={c.text} /></TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: c.text, textAlign: 'center' }} numberOfLines={1}>{docName}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={{ padding: 6 }}
            onPress={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(''); }}
            accessibilityLabel="Search archive"
            accessibilityRole="button"
          >
            {searchOpen ? <X size={20} color={c.primary} /> : <Search size={20} color={c.textSecondary} />}
          </TouchableOpacity>
          <TouchableOpacity style={{ padding: 6 }} onPress={handleDownloadAll} accessibilityLabel="Download archive" accessibilityRole="button">
            <Download size={20} color={c.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {searchOpen && (
        <View style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.background, borderRadius: 10, paddingHorizontal: 12 }}>
            <Search size={16} color={c.textSecondary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search files..."
              placeholderTextColor={c.textTertiary}
              style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 15, color: c.text }}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={16} color={c.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={{ fontSize: 12, color: c.textSecondary, marginTop: 4 }}>
            {filteredEntries.length} file{filteredEntries.length !== 1 ? 's' : ''} found
          </Text>
        </View>
      )}

      {currentPath !== '' && !searchOpen && (
        <TouchableOpacity
          onPress={goUp}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}
          accessibilityLabel={`Go up from ${currentPath}`} accessibilityRole="button"
        >
          <ChevronLeft size={18} color={c.primary} />
          <Text style={{ color: c.primary, fontSize: 14, marginLeft: 4 }}>.. / {currentPath.replace(/\/$/, '')}</Text>
        </TouchableOpacity>
      )}

      {extracting && (
        <View style={{ padding: 12, backgroundColor: c.primaryContainer, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={c.primary} />
          <Text style={{ color: c.primary, fontSize: 13, marginTop: 6 }}>Extracting file...</Text>
        </View>
      )}

      <FlashList
        data={filteredEntries}
        keyExtractor={(item) => item.path}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: c.surface, borderRadius: 10, marginBottom: 6 }}
            onPress={() => handleNavigate(item)}
            accessibilityLabel={`${item.name}${item.isDirectory ? ' folder' : `, ${formatSize(item.size)}`}`}
            accessibilityRole="button"
          >
            {item.isDirectory ? (
              <Folder size={22} color={c.primary} />
            ) : (
              <FileArchive size={22} color={c.textSecondary} />
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '500', color: c.text }}>{item.name}</Text>
              {!item.isDirectory && (
                <Text style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>{formatSize(item.size)}</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: 'center' }}>
            <FileArchive size={48} color={c.textTertiary} />
            <Text style={{ color: c.textSecondary, marginTop: 12, fontSize: 16 }}>
              {searchOpen ? 'No matching files' : 'Archive is empty'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}