import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, ZoomIn, ZoomOut, RotateCw, Share2 } from 'lucide-react-native';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { loadDocumentUri } from '@/services/reader-loader';
import { shareDocument } from '@/services/file-operations';

export default function ImageViewerScreen() {
  const { id, preview, name } = useLocalSearchParams<{ id: string; preview?: string; name?: string }>();
  // Keying on the document identity makes React remount for a different image,
  // so the previous image and its zoom/rotation state cannot linger.
  const key = `${id ?? ''}|${preview ?? ''}|${name ?? ''}`;
  return <ImageViewer key={key} id={id} preview={preview} name={name} />;
}

function ImageViewer({ id, preview, name }: { id: string; preview?: string; name?: string }) {
  const c = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [uri, setUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState('Image');
  const [loading, setLoading] = useState(true);
  const [rotation, setRotation] = useState(0);
  const scale = useSharedValue(1);
  const [zoom, setZoom] = useState(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: `${rotation}deg` }] }));

  const handleZoomOut = useCallback(() => {
// eslint-disable-next-line react-hooks/immutability
    scale.value = withTiming(Math.max(0.25, scale.value - 0.25));
    setZoom(Math.max(0.25, zoom - 0.25));
  }, [scale, zoom]);

  const handleZoomIn = useCallback(() => {
// eslint-disable-next-line react-hooks/immutability
    scale.value = withTiming(Math.min(10, scale.value + 0.25));
    setZoom(Math.min(10, zoom + 0.25));
  }, [scale, zoom]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      if (preview) {
        if (cancelled) return;
        setFileName(name ? decodeURIComponent(name) : 'Image');
        setUri(decodeURIComponent(preview));
        setLoading(false);
        return;
      }
      const { doc, uri: fileUri, resolvedUri } = await loadDocumentUri(id);
      if (cancelled) return;
      if (doc) { setFileName(doc.name); setUri(resolvedUri || fileUri); }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, preview, name]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={c.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={22} color={c.text} />
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{fileName}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={handleZoomOut} accessibilityLabel="Zoom out">
            <ZoomOut size={22} color={c.text} />
          </TouchableOpacity>
          <Text style={{ color: c.text, fontSize: 13, minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Text>
          <TouchableOpacity onPress={handleZoomIn} accessibilityLabel="Zoom in">
            <ZoomIn size={22} color={c.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setRotation((r) => (r + 90) % 360)} accessibilityLabel="Rotate">
            <RotateCw size={22} color={c.text} />
          </TouchableOpacity>
          {uri && !preview && (
            <TouchableOpacity onPress={() => shareDocument(id!)} accessibilityLabel="Share">
              <Share2 size={22} color={c.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.readerBackground }}>
        {uri && (
          <Animated.View style={[animatedStyle]}>
            <Image source={{ uri }} style={{ width: screenWidth - 32, height: screenHeight - 120 }} contentFit="contain" />
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}
