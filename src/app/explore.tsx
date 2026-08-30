import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions, Alert, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { FileText, Grid3X3, List, Plus, FolderOpen, Tag, FileSpreadsheet, Presentation, Image as ImageIcon, FileArchive, Scan, BookOpen, FileType, FileCode } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';

import { useTheme } from '@/hooks/use-theme';
import { useLibraryStore } from '@/stores/library-store';
import { useDocumentStore } from '@/stores/document-store';
import { pickAndImportDocument } from '@/services/import-service';
import { deleteDocument, shareDocument } from '@/services/file-operations';
import { DocumentDiscoveryManager } from '@/services/discovery/discovery-manager';
import { FileActionsSheet } from '@/features/file-manager/file-actions';
import { PropertiesPanel } from '@/features/file-manager/properties-panel';
import { CollectionPicker } from '@/features/organization/collection-picker';
import { TagPicker } from '@/features/organization/tag-picker';
import type { Document, DocumentType, SortBy } from '@/types';
import { EmptyState, ErrorState } from '@/components/empty-state';

function getReaderRoute(type: DocumentType, id: string): string {
  switch (type) {
    case 'pdf': return `/reader/pdf/${id}`;
    case 'epub': return `/reader/epub/${id}`;
    case 'doc': case 'docx': case 'xls': case 'xlsx': case 'ppt': case 'pptx': return `/reader/office/${id}`;
    case 'txt': case 'md': case 'code': case 'csv': case 'rtf': return `/reader/text/${id}`;
    case 'image': return `/reader/image/${id}`;
    case 'archive': return `/reader/archive/${id}`;
    default: return `/reader/text/${id}`;
  }
}

function getTypeIcon(type: DocumentType) {
  switch (type) {
    case 'xls': case 'xlsx': case 'csv': return FileSpreadsheet;
    case 'ppt': case 'pptx': return Presentation;
    case 'image': return ImageIcon;
    case 'archive': return FileArchive;
    default: return FileText;
  }
}

function getCategoryIcon(type: string) {
  switch (type) {
    case 'pdf': return FileText;
    case 'epub': return BookOpen;
    case 'office': return FileSpreadsheet;
    case 'image': return ImageIcon;
    case 'archive': return FileArchive;
    case 'text': return FileType;
    case 'code': return FileCode;
    default: return null;
  }
}

function getCategoryDisplayName(type: string): string {
  switch (type) {
    case 'all': return 'All';
    case 'pdf': return 'PDF';
    case 'epub': return 'EPUB';
    case 'office': return 'Office';
    case 'image': return 'Images';
    case 'archive': return 'Archives';
    case 'text': return 'Text';
    case 'code': return 'Code';
    case 'other': return 'Other';
    default: return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

export default function LibraryScreen() {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const documents = useLibraryStore((s) => s.documents);
  const categories = useLibraryStore((s) => s.categories);
  const selectedCategory = useLibraryStore((s) => s.selectedCategory);
  const viewMode = useLibraryStore((s) => s.viewMode);
  const sortBy = useLibraryStore((s) => s.sortBy);
  const sortOrder = useLibraryStore((s) => s.sortOrder);
  const isLoading = useLibraryStore((s) => s.isLoading);
  const hasMore = useLibraryStore((s) => s.hasMore);
  const setSelectedCategory = useLibraryStore((s) => s.setSelectedCategory);
  const setViewMode = useLibraryStore((s) => s.setViewMode);
  const setSortBy = useLibraryStore((s) => s.setSortBy);
  const setSortOrder = useLibraryStore((s) => s.setSortOrder);
  const fetchDocuments = useLibraryStore((s) => s.fetchDocuments);
  const loadMore = useLibraryStore((s) => s.loadMore);
  const fetchCategories = useLibraryStore((s) => s.fetchCategories);
  const favoriteIds = useDocumentStore((s) => s.favoriteIds);

  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const handleScanDevice = useCallback(async () => {
    Alert.alert('Scan for Documents', 'Choose how to scan:', [
      { text: 'Device (MediaStore)', onPress: async () => {
        setScanning(true);
        try {
          const result = await DocumentDiscoveryManager.discoverAll({ includeImages: false, sources: ['mediastore'] });
          if (result.imported > 0) {
            await Promise.all([fetchDocuments(), fetchCategories()]);
            Alert.alert('Scan Complete', `Found and imported ${result.imported} document(s) from your device.`);
          } else {
            Alert.alert('Scan Complete', 'No new documents found on device.');
          }
        } catch (e: any) {
          Alert.alert('Scan Failed', e?.message || 'Could not scan device.');
        } finally { setScanning(false); }
      }},
      { text: 'Pick Folder...', onPress: async () => {
        setScanning(true);
        try {
          const count = await DocumentDiscoveryManager.scanFolder();
          if (count > 0) {
            await Promise.all([fetchDocuments(), fetchCategories()]);
            Alert.alert('Scan Complete', `Found and imported ${count} document(s).`);
          } else {
            Alert.alert('Scan Complete', 'No new documents found in that folder.');
          }
        } catch (e: any) {
          Alert.alert('Scan Failed', e?.message || 'Could not scan folder.');
        } finally { setScanning(false); }
      }},
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [fetchDocuments, fetchCategories]);

  useEffect(() => {
    const load = async () => {
      try {
        setFetchError(null);
        await Promise.all([fetchDocuments(), fetchCategories()]);
      } catch (e: any) {
        setFetchError(e.message || 'Failed to load library');
      }
    };
    load();
  }, [fetchDocuments, fetchCategories]);

  const sortOptions: { key: SortBy; label: string }[] = [
    { key: 'date', label: 'Date' }, { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' }, { key: 'size', label: 'Size' },
  ];

  const handleImport = async () => {
    const doc = await pickAndImportDocument();
    if (doc) { fetchDocuments(); fetchCategories(); }
  };

  const gridColumnCount = width > 700 ? 4 : width > 420 ? 3 : 2;
  const gridItemWidth = (width - 40 - gridColumnCount * 12) / gridColumnCount;

  const renderGridItem = ({ item }: { item: Document }) => {
    const TypeIcon = getTypeIcon(item.type);
    return (
      <TouchableOpacity
        style={{ width: gridItemWidth, backgroundColor: c.surface, borderRadius: 10, padding: 10, marginBottom: 8, marginRight: viewMode === 'grid' ? 12 : 0 }}
        onPress={() => router.push(getReaderRoute(item.type, item.id))}
        onLongPress={() => { setSelectedDoc(item); setShowActions(true); }}
        accessibilityLabel={`${item.name}, ${item.type.toUpperCase()}${item.size ? `, ${(item.size / 1024 / 1024).toFixed(1)} MB` : ''}${favoriteIds.has(item.id) ? ', favorited' : ''}`}
        accessibilityHint="Double tap to open, long press for actions"
        accessibilityRole="button"
      >
        <View style={{ width: '100%', height: gridItemWidth * 1.15, borderRadius: 8, backgroundColor: c.primaryContainer, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {item.thumbnailPath ? (
            <Image source={{ uri: item.thumbnailPath }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
          ) : (
            <TypeIcon size={24} color={c.primary} />
          )}
        </View>
        <Text style={{ fontSize: 12, fontWeight: '500', color: c.text, marginTop: 6 }} numberOfLines={2}>{item.name}</Text>
        <Text style={{ fontSize: 10, color: c.textSecondary, marginTop: 1 }}>
          {item.type.toUpperCase()} · {item.size ? `${(item.size / 1024 / 1024).toFixed(1)} MB` : '--'}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderListItem = ({ item }: { item: Document }) => {
    const TypeIcon = getTypeIcon(item.type);
    return (
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: 12, padding: 14, marginBottom: 8 }}
        onPress={() => router.push(getReaderRoute(item.type, item.id))}
        onLongPress={() => { setSelectedDoc(item); setShowActions(true); }}
        accessibilityLabel={`${item.name}, ${item.type.toUpperCase()}${item.size ? `, ${(item.size / 1024 / 1024).toFixed(1)} MB` : ''}${favoriteIds.has(item.id) ? ', favorited' : ''}`}
        accessibilityHint="Double tap to open, long press for actions"
        accessibilityRole="button"
      >
        <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: c.primaryContainer, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {item.thumbnailPath ? (
            <Image source={{ uri: item.thumbnailPath }} style={{ width: 44, height: 44 }} contentFit="cover" transition={200} />
          ) : (
            <TypeIcon size={20} color={c.primary} />
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '500', color: c.text }} numberOfLines={1}>{item.name}</Text>
          <Text style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
            {item.type.toUpperCase()} · {item.size ? `${(item.size / 1024 / 1024).toFixed(1)} MB` : '--'}
            {favoriteIds.has(item.id) ? ' · ★' : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: c.text }}>Library</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {scanning ? (
            <ActivityIndicator size="small" color={c.primary} style={{ padding: 6 }} />
          ) : (
            <TouchableOpacity onPress={handleScanDevice} style={{ padding: 6 }} accessibilityLabel="Scan device for documents" accessibilityRole="button">
              <Scan size={22} color={c.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleImport} style={{ padding: 6 }} accessibilityLabel="Import document" accessibilityRole="button">
            <Plus size={22} color={c.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/library/collections')} style={{ padding: 6 }} accessibilityLabel="Open collections" accessibilityRole="button">
            <FolderOpen size={22} color={c.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/library/tags')} style={{ padding: 6 }} accessibilityLabel="Open tags" accessibilityRole="button">
            <Tag size={22} color={c.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <FlashList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[{ type: 'all', count: categories.reduce((sum, cat) => sum + cat.count, 0) }, ...categories]}
        keyExtractor={(item) => item.type}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingVertical: 2, marginBottom: 16 }}
        renderItem={({ item }) => {
          const active = selectedCategory === item.type || (!selectedCategory && item.type === 'all');
          const CategoryIcon = getCategoryIcon(item.type);
          return (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: active ? c.primary : c.surface,
                borderWidth: active ? 0 : 1,
                borderColor: c.border,
                minHeight: 40,
              }}
              onPress={() => setSelectedCategory(item.type === 'all' ? null : item.type)}
              accessibilityLabel={`Filter by ${getCategoryDisplayName(item.type)}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              {CategoryIcon && <CategoryIcon size={16} color={active ? '#FFF' : c.textSecondary} style={{ marginRight: 6 }} />}
              <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#FFF' : c.textSecondary }}>
                {getCategoryDisplayName(item.type)}
              </Text>
              {item.count > 0 && (
                <View style={{
                  backgroundColor: active ? 'rgba(255,255,255,0.25)' : c.primaryContainer,
                  borderRadius: 12,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  marginLeft: 6,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#FFF' : c.primary }}>
                    {item.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {sortOptions.map((opt) => (
            <TouchableOpacity key={opt.key} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: sortBy === opt.key ? c.primaryContainer : 'transparent' }}
              onPress={() => { if (sortBy === opt.key) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); else { setSortBy(opt.key); setSortOrder('desc'); } }}
              accessibilityLabel={`Sort by ${opt.label}${sortBy === opt.key ? `, currently ${sortOrder === 'asc' ? 'ascending' : 'descending'}` : ''}`}
              accessibilityRole="button"
              accessibilityState={{ selected: sortBy === opt.key }}
            >
              <Text style={{ fontSize: 12, fontWeight: '500', color: sortBy === opt.key ? c.primary : c.textSecondary }}>
                {opt.label} {sortBy === opt.key ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity onPress={() => setViewMode('list')} style={{ padding: 6, opacity: viewMode === 'list' ? 1 : 0.4 }} accessibilityLabel="Switch to list view" accessibilityRole="button" accessibilityState={{ selected: viewMode === 'list' }}><List size={18} color={c.text} /></TouchableOpacity>
          <TouchableOpacity onPress={() => setViewMode('grid')} style={{ padding: 6, opacity: viewMode === 'grid' ? 1 : 0.4 }} accessibilityLabel="Switch to grid view" accessibilityRole="button" accessibilityState={{ selected: viewMode === 'grid' }}><Grid3X3 size={18} color={c.text} /></TouchableOpacity>
        </View>
      </View>

      <FlashList
        key={viewMode}
        data={documents}
        keyExtractor={(item) => item.id}
        numColumns={viewMode === 'grid' ? gridColumnCount : 1}
        renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        refreshing={isLoading && documents.length === 0}
        onRefresh={() => { fetchDocuments(); fetchCategories(); }}
        onEndReached={() => { if (hasMore) loadMore(); }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          hasMore ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={c.textSecondary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          fetchError ? <ErrorState message={fetchError} onRetry={() => { setFetchError(null); fetchDocuments(); fetchCategories(); }} />
          : <EmptyState icon={FileText} title="No documents yet" subtitle="Import your first document to get started" actionLabel="Import Document" onAction={handleImport} />
        }
      />

      <FileActionsSheet
        visible={showActions}
        documentId={selectedDoc?.id || ''}
        fileName={selectedDoc?.name || ''}
        onClose={() => { setShowActions(false); setSelectedDoc(null); }}
        onRename={() => { fetchDocuments(); fetchCategories(); }}
        onDelete={async () => { if (selectedDoc) { await deleteDocument(selectedDoc.id); fetchDocuments(); } }}
        onShare={async () => { if (selectedDoc) await shareDocument(selectedDoc.id); }}
        onInfo={() => { setShowActions(false); setShowProperties(true); }}
        onOpenWith={async () => {
          if (selectedDoc) {
            const available = await Sharing.isAvailableAsync();
            if (available) {
              await Sharing.shareAsync(selectedDoc.path);
            } else {
              Alert.alert('Not Available', 'Opening with other apps is not supported on this device.');
            }
          }
          setShowActions(false);
        }}
        onAddToCollection={() => { setShowActions(false); setShowCollectionPicker(true); }}
        onAddTag={() => { setShowActions(false); setShowTagPicker(true); }}
      />

      <PropertiesPanel
        visible={showProperties}
        document={selectedDoc}
        onClose={() => { setShowProperties(false); setSelectedDoc(null); }}
        onToggleHidden={() => { fetchDocuments(); fetchCategories(); }}
      />

      {selectedDoc && (
        <>
          <CollectionPicker visible={showCollectionPicker} documentId={selectedDoc.id} onClose={() => setShowCollectionPicker(false)} />
          <TagPicker visible={showTagPicker} documentId={selectedDoc.id} onClose={() => setShowTagPicker(false)} />
        </>
      )}
    </SafeAreaView>
  );
}
