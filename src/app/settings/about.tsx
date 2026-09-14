import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Heart, Code } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';

const APP_VERSION = '1.0.0';
const BUILD_NUMBER = '1';
const LICENSES = [
  { name: 'React Native', license: 'MIT' },
  { name: 'Expo', license: 'MIT' },
  { name: 'Zustand', license: 'MIT' },
  { name: 'SQLite', license: 'Public Domain' },
  { name: 'PDF.js', license: 'Apache 2.0' },
  { name: 'JSZip', license: 'MIT' },
  { name: 'Lucide Icons', license: 'ISC' },
];

export default function AboutScreen() {
  const c = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}><ArrowLeft size={24} color={c.text} /></TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: '700', color: c.text }}>About</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 32, alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ fontSize: 42, fontWeight: '800', color: c.primary, letterSpacing: -1 }}>DOCER</Text>
          <Text style={{ fontSize: 15, color: c.textSecondary, marginTop: 4 }}>Offline Document Reader</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <View style={{ backgroundColor: c.primaryContainer, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 }}>
              <Text style={{ color: c.primary, fontSize: 12, fontWeight: '600' }}>v{APP_VERSION}</Text>
            </View>
            <View style={{ backgroundColor: c.primaryContainer, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 }}>
              <Text style={{ color: c.primary, fontSize: 12, fontWeight: '600' }}>Build {BUILD_NUMBER}</Text>
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Heart size={16} color={c.primary} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>Credits</Text>
          </View>
          <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>
            DOCER is a fully offline document reader supporting PDF, EPUB, text, code, images, archives, and office formats.
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 12 }}>
            Built with React Native and Expo. All document processing happens locally on your device.
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 12 }}>
            Special thanks to thirteen labs and obsidian Northern for their contributions.
          </Text>
        </View>

        <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Code size={16} color={c.primary} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>Open Source Licenses</Text>
          </View>
          {LICENSES.map((l, i) => (
            <View key={l.name} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: i < LICENSES.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
              <Text style={{ color: c.text, fontSize: 15 }}>{l.name}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 14 }}>{l.license}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
