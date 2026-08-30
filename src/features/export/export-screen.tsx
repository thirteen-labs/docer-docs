import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, FileText, FileSpreadsheet, Download, BookMarked, StickyNote, Highlighter, BarChart3 } from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import { File, Directory, Paths } from 'expo-file-system';

import { useTheme } from '@/hooks/use-theme';
import { getDb } from '@/db/connection';
import { getAllDocuments } from '@/db/documents';
import { getAllNotes } from '@/db/notes';
import { getAllHighlights } from '@/db/highlights';
import { getAllBookmarks } from '@/db/bookmarks';
import { getDateRangeStats } from '@/db/stats';

type ExportType = 'library' | 'notes' | 'highlights' | 'bookmarks' | 'stats';

const EXPORT_OPTIONS: { type: ExportType; label: string; description: string; icon: typeof FileText }[] = [
  { type: 'library', label: 'Library Index', description: 'Export your document list as a spreadsheet', icon: FileSpreadsheet },
  { type: 'notes', label: 'All Notes', description: 'Export all your notes as text or JSON', icon: StickyNote },
  { type: 'highlights', label: 'Highlights', description: 'Export all highlights with colors and text', icon: Highlighter },
  { type: 'bookmarks', label: 'Bookmarks', description: 'Export all bookmarks across documents', icon: BookMarked },
  { type: 'stats', label: 'Reading Stats', description: 'Export your reading statistics', icon: BarChart3 },
];

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}

export function ExportScreen() {
  const c = useTheme();
  const [exporting, setExporting] = useState<ExportType | null>(null);

  const handleExport = async (type: ExportType) => {
    setExporting(type);
    try {
      const db = await getDb();
      const exportDir = new Directory(Paths.cache, 'exports');
      await exportDir.create({ intermediates: true });
      const timestamp = new Date().toISOString().split('T')[0];

      switch (type) {
        case 'library': {
          const docs = await getAllDocuments(db);
          const rows = docs.map((d) => ({
            name: d.name, type: d.type, size: d.size, author: d.author || '',
            created: d.createdAt, modified: d.modifiedAt, added: d.addedAt,
          }));
          const csv = toCsv(rows);
          const file = new File(exportDir, `omnidoc-library-${timestamp}.csv`);
          await file.write(csv);
          await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
          break;
        }
        case 'notes': {
          const notes = await getAllNotes(db);
          const rows = notes.map((n) => ({
            documentId: n.documentId, page: n.page ?? '', content: n.content,
            created: n.createdAt, updated: n.updatedAt,
          }));
          const csv = toCsv(rows);
          const file = new File(exportDir, `omnidoc-notes-${timestamp}.csv`);
          await file.write(csv);
          await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
          break;
        }
        case 'highlights': {
          const highlights = await getAllHighlights(db);
          const rows = highlights.map((h) => ({
            documentId: h.documentId, page: h.page, color: h.color,
            text: h.text, created: h.createdAt,
          }));
          const csv = toCsv(rows);
          const file = new File(exportDir, `omnidoc-highlights-${timestamp}.csv`);
          await file.write(csv);
          await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
          break;
        }
        case 'bookmarks': {
          const bookmarks = await getAllBookmarks(db);
          const rows = bookmarks.map((b) => ({
            documentId: b.documentId, page: b.page ?? '', label: b.label,
            chapter: b.chapter || '', created: b.createdAt,
          }));
          const csv = toCsv(rows);
          const file = new File(exportDir, `omnidoc-bookmarks-${timestamp}.csv`);
          await file.write(csv);
          await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
          break;
        }
        case 'stats': {
          const fromDate = new Date(timestamp + 'T00:00:00Z');
          fromDate.setDate(fromDate.getDate() - 90);
          const from = fromDate.toISOString().split('T')[0];
          const to = timestamp;
          const stats = await getDateRangeStats(db, from, to);
          const rows = (stats as any[]).map((s) => ({
            date: s.date, pagesRead: s.pages_read, readingTimeMinutes: Math.round(s.reading_time / 60),
            documentsOpened: s.documents_opened,
          }));
          const csv = toCsv(rows);
          const file = new File(exportDir, `omnidoc-stats-${timestamp}.csv`);
          await file.write(csv);
          await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
          break;
        }
      }
      Alert.alert('Export Complete', `Your ${type} data has been exported.`);
    } catch (err: any) {
      Alert.alert('Export Failed', err.message || 'Failed to export data.');
    }
    setExporting(null);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
          <ArrowLeft size={24} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: '700', color: c.text }}>Export Data</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
        <Text style={{ fontSize: 14, color: c.textSecondary, marginBottom: 16 }}>
          Export your reading data as CSV files that can be opened in any spreadsheet application.
        </Text>
        {EXPORT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isExporting = exporting === opt.type;
          return (
            <TouchableOpacity
              key={opt.type}
              style={{
                flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface,
                borderRadius: 14, padding: 16, marginBottom: 10, opacity: isExporting ? 0.6 : 1,
              }}
              onPress={() => handleExport(opt.type)}
              disabled={isExporting}
              accessibilityLabel={`Export ${opt.label}`}
              accessibilityRole="button"
            >
              <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: c.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                {isExporting ? (
                  <ActivityIndicator size="small" color={c.primary} />
                ) : (
                  <Icon size={24} color={c.primary} />
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={{ fontSize: 16, fontWeight: '500', color: c.text }}>{opt.label}</Text>
                <Text style={{ fontSize: 13, color: c.textSecondary, marginTop: 2 }}>{opt.description}</Text>
              </View>
              <Download size={20} color={c.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
