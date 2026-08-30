import { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { FileText, Clock, Star, BookOpen, Settings, Search, TrendingUp, Plus, FolderOpen } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { useDocumentStore } from '@/stores/document-store';
import { useStatsStore } from '@/stores/stats-store';
import { useLibraryStore } from '@/stores/library-store';
import { pickAndImportDocument } from '@/services/import-service';

export default function HomeScreen() {
  const c = useTheme();
  const recentDocuments = useDocumentStore((s) => s.recentDocuments);
  const fetchRecent = useDocumentStore((s) => s.fetchRecentDocuments);
  const fetchFavorites = useDocumentStore((s) => s.fetchFavorites);
  const todayStats = useStatsStore((s) => s.todayStats);
  const fetchTodayStats = useStatsStore((s) => s.fetchTodayStats);
  const fetchReadingStreak = useStatsStore((s) => s.fetchReadingStreak);
  const readingStreak = useStatsStore((s) => s.readingStreak);
  const categories = useLibraryStore((s) => s.categories);
  const fetchCategories = useLibraryStore((s) => s.fetchCategories);
  const [importing, setImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchRecent();
    fetchFavorites();
    fetchTodayStats();
    fetchReadingStreak();
    fetchCategories();
  }, [fetchRecent, fetchFavorites, fetchTodayStats, fetchReadingStreak, fetchCategories]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchRecent(), fetchFavorites(), fetchTodayStats(), fetchReadingStreak(), fetchCategories()]);
    setRefreshing(false);
  }, [fetchRecent, fetchFavorites, fetchTodayStats, fetchReadingStreak, fetchCategories]);

  const handleImport = async () => {
    setImporting(true);
    const doc = await pickAndImportDocument();
    if (doc) {
      fetchRecent();
      fetchCategories();
    }
    setImporting(false);
  };

  const navigateToReader = (doc: any) => {
    useDocumentStore.getState().openDocument(doc.id);
    const type = doc.type;
    if (type === 'pdf') router.push(`/reader/pdf/${doc.id}`);
    else if (type === 'epub') router.push(`/reader/epub/${doc.id}`);
    else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'image'].includes(type)) router.push(`/reader/image/${doc.id}`);
    else if (['zip', 'rar', '7z', 'tar', 'archive'].includes(type)) router.push(`/reader/archive/${doc.id}`);
    else if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'office'].includes(type)) router.push(`/reader/office/${doc.id}`);
    else router.push(`/reader/text/${doc.id}`);
  };

  const totalDocs = categories.reduce((sum, c) => sum + c.count, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 }}>
          <View>
            <Text style={{ fontSize: 28, fontWeight: '700', color: c.text }}>OmniDoc</Text>
            <Text style={{ fontSize: 14, color: c.textSecondary, marginTop: 2 }}>
              {totalDocs > 0 ? `${totalDocs} documents` : 'Your offline document reader'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={() => router.push('/search')} accessibilityLabel="Search" accessibilityRole="button"><Search size={24} color={c.text} /></TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/settings')} accessibilityLabel="Settings" accessibilityRole="button"><Settings size={24} color={c.text} /></TouchableOpacity>
          </View>
        </View>

        {/* Stats Summary */}
        <View style={{ flexDirection: 'row', marginHorizontal: 20, marginBottom: 20, gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 16, padding: 16 }}>
            <Clock size={20} color={c.primary} />
            <Text style={{ fontSize: 24, fontWeight: '700', color: c.text, marginTop: 8 }}>{Math.floor(todayStats.readingTime / 60)}m</Text>
            <Text style={{ fontSize: 12, color: c.textSecondary }}>Today</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 16, padding: 16 }}>
            <TrendingUp size={20} color={c.primary} />
            <Text style={{ fontSize: 24, fontWeight: '700', color: c.text, marginTop: 8 }}>{readingStreak}d</Text>
            <Text style={{ fontSize: 12, color: c.textSecondary }}>Streak</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 16, padding: 16 }}>
            <Star size={20} color={c.primary} />
            <Text style={{ fontSize: 24, fontWeight: '700', color: c.text, marginTop: 8 }}>{todayStats.pagesRead}</Text>
            <Text style={{ fontSize: 12, color: c.textSecondary }}>Pages</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: c.primaryContainer, borderRadius: 12, padding: 16, alignItems: 'center' }} onPress={handleImport} accessibilityLabel={importing ? 'Importing document' : 'Import document'} accessibilityRole="button">
              <Plus size={24} color={c.primary} />
              <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600', marginTop: 8 }}>{importing ? 'Importing...' : 'Import'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: c.primaryContainer, borderRadius: 12, padding: 16, alignItems: 'center' }} onPress={() => router.push('/explore')} accessibilityLabel="Open library" accessibilityRole="button">
              <FolderOpen size={24} color={c.primary} />
              <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600', marginTop: 8 }}>Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: c.primaryContainer, borderRadius: 12, padding: 16, alignItems: 'center' }} onPress={() => router.push('/bookmarks')} accessibilityLabel="Open bookmarks" accessibilityRole="button">
              <BookOpen size={24} color={c.primary} />
              <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600', marginTop: 8 }}>Bookmarks</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Continue Reading */}
        {recentDocuments.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: c.text }}>Continue Reading</Text>
              <TouchableOpacity onPress={() => router.push('/explore')} accessibilityLabel="See all documents" accessibilityRole="button"><Text style={{ fontSize: 14, color: c.primary }}>See All</Text></TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {recentDocuments.slice(0, 5).map((doc) => (
                <TouchableOpacity key={doc.id} style={{ width: 160, backgroundColor: c.surface, borderRadius: 16, padding: 16 }} onPress={() => navigateToReader(doc)} accessibilityLabel={`${doc.name}, ${Math.round(doc.progress * 100)}% complete`} accessibilityRole="button">
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={20} color={c.primary} />
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, marginTop: 12 }} numberOfLines={2}>{doc.name}</Text>
                  <View style={{ height: 4, backgroundColor: c.border, borderRadius: 2, marginTop: 8 }}>
                    <View style={{ width: `${Math.min(doc.progress * 100, 100)}%`, height: 4, backgroundColor: c.primary, borderRadius: 2 }} />
                  </View>
                  <Text style={{ fontSize: 11, color: c.textSecondary, marginTop: 4 }}>{Math.round(doc.progress * 100)}%</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Recent Documents */}
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: c.text, marginBottom: 12 }}>Recent Documents</Text>
          {recentDocuments.length === 0 ? (
            <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 32, alignItems: 'center' }}>
              <FileText size={48} color={c.textTertiary} />
              <Text style={{ fontSize: 16, color: c.textSecondary, marginTop: 12 }}>No documents yet</Text>
              <Text style={{ fontSize: 13, color: c.textTertiary, marginTop: 4, textAlign: 'center' }}>Tap Import to add your first document</Text>
              <TouchableOpacity style={{ backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 16 }} onPress={handleImport} accessibilityLabel="Import your first document" accessibilityRole="button">
                <Text style={{ color: '#FFF', fontWeight: '600' }}>Import Document</Text>
              </TouchableOpacity>
            </View>
          ) : (
            recentDocuments.slice(0, 10).map((doc) => (
              <TouchableOpacity key={doc.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: 12, padding: 14, marginBottom: 8 }} onPress={() => navigateToReader(doc)} accessibilityLabel={`${doc.name}, ${Math.round(doc.progress * 100)}% complete`} accessibilityRole="button">
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: c.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={18} color={c.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: c.text }} numberOfLines={1}>{doc.name}</Text>
                  <Text style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                    {Math.round(doc.progress * 100)}% · {new Date(doc.lastReadAt).toLocaleDateString()}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
