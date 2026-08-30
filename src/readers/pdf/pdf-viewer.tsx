import { useCallback, useRef, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import Pdf, { type PdfRef } from './pdf-native';
import { getViewerHtml, getPdfSourceUri, resolvePdfUri } from './pdf-engine';
import { useTheme } from '@/hooks/use-theme';
import { useReaderStore } from '@/stores/reader-store';

export interface PdfViewerActions {
  goToPage: (page: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleSearch: () => void;
  toggleThumbnails: () => void;
  enableSelection: () => void;
  switchToNative: () => void;
}

interface PdfViewerProps {
  path: string;
  onLoad?: (totalPages: number) => void;
  onError?: (error: string) => void;
  onTextSelection?: (text: string) => void;
  actionRef?: React.MutableRefObject<PdfViewerActions | null>;
}

type ViewerMode = 'native' | 'engine';

const TEXT_SELECTION_JS = `
  (function() {
    var lastText = '';
    document.addEventListener('selectionchange', function() {
      var sel = window.getSelection();
      if (sel && sel.toString().trim().length > 0) {
        var text = sel.toString().trim();
        if (text !== lastText) {
          lastText = text;
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selection', text: text }));
        }
      }
    });
  })();
`;

export function PdfViewer({ path, onLoad, onError, onTextSelection, actionRef }: PdfViewerProps) {
  const c = useTheme();
  const [resolvedUri, setResolvedUri] = useState(() => getPdfSourceUri(path));
  useEffect(() => {
    let cancelled = false;
    resolvePdfUri(path).then(u => { if (!cancelled) setResolvedUri(getPdfSourceUri(u)); });
    return () => { cancelled = true; };
  }, [path]);
  const uri = resolvedUri;

  const currentPage = useReaderStore((s) => s.currentPage);
  const zoom = useReaderStore((s) => s.zoom);
  const setCurrentPage = useReaderStore((s) => s.setCurrentPage);
  const setTotalPages = useReaderStore((s) => s.setTotalPages);
  const setZoom = useReaderStore((s) => s.setZoom);
  const toggleThumbnails = useReaderStore((s) => s.toggleThumbnails);

  const [mode, setMode] = useState<ViewerMode>(() => (Platform.OS === 'web' ? 'engine' : 'native'));
  const [html, setHtml] = useState<string | null>(null);
  const nativeRef = useRef<PdfRef | null>(null);
  const engineRef = useRef<WebView>(null);
  const pendingAction = useRef<'search' | null>(null);
  const modeRef = useRef<ViewerMode>(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    getViewerHtml().then(setHtml);
  }, []);

  const switchToNative = useCallback(() => {
    pendingAction.current = null;
    if (modeRef.current !== 'native' && Platform.OS !== 'web') setMode('native');
  }, []);

  const switchToEngine = useCallback((action: 'search' | null) => {
    pendingAction.current = action;
    setMode('engine');
  }, []);

  useEffect(() => {
    if (actionRef) {
      actionRef.current = {
        goToPage: (page: number) => {
          if (modeRef.current === 'native') {
            nativeRef.current?.setPage(page);
            setCurrentPage(page);
          } else {
            engineRef.current?.postMessage(JSON.stringify({ type: 'go', page }));
          }
        },
        zoomIn: () => {
          if (modeRef.current === 'native') {
            setZoom(Math.min(5, Math.round((zoom + 0.25) * 100) / 100));
          } else {
            engineRef.current?.postMessage(JSON.stringify({ type: 'zi' }));
          }
        },
        zoomOut: () => {
          if (modeRef.current === 'native') {
            setZoom(Math.max(0.5, Math.round((zoom - 0.25) * 100) / 100));
          } else {
            engineRef.current?.postMessage(JSON.stringify({ type: 'zo' }));
          }
        },
        toggleSearch: () => {
          if (modeRef.current === 'native') {
            switchToEngine('search');
          } else {
            engineRef.current?.postMessage(JSON.stringify({ type: 'search' }));
          }
        },
        toggleThumbnails: () => {
          if (modeRef.current === 'native') {
            toggleThumbnails();
          } else {
            engineRef.current?.postMessage(JSON.stringify({ type: 'thumbnails' }));
          }
        },
        enableSelection: () => {
          if (modeRef.current !== 'engine') switchToEngine(null);
        },
        switchToNative,
      };
    }
  }, [actionRef, zoom, setCurrentPage, setZoom, toggleThumbnails, switchToEngine, switchToNative]);

  const handleEngineMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'loaded') { onLoad?.(msg.pages); setTotalPages(msg.pages); }
      if (msg.type === 'error') onError?.(msg.message);
      if (msg.type === 'selection') onTextSelection?.(msg.text);
      if (msg.type === 'searchToggled') {
        if (msg.open === false && Platform.OS !== 'web') switchToNative();
      }
      if (msg.type === 'pageChanged') setCurrentPage(msg.page);
    } catch {}
  }, [onLoad, onError, onTextSelection, setTotalPages, setCurrentPage, switchToNative]);

  const handleNativeLoadComplete = useCallback((numberOfPages: number) => {
    setTotalPages(numberOfPages);
    onLoad?.(numberOfPages);
  }, [setTotalPages, onLoad]);

  const handleNativeError = useCallback((error: object) => {
    const message = (error as { message?: string })?.message || String(error);
    // Fallback to WebView engine for providers that native pdf cannot read (content://, encrypted, etc.)
    if (modeRef.current === 'native') {
      switchToEngine(null);
    }
    onError?.(message);
  }, [onError, switchToEngine]);

  const handleEngineLoadEnd = useCallback(() => {
    engineRef.current?.postMessage(JSON.stringify({ type: 'load', url: uri }));
    engineRef.current?.injectJavaScript(TEXT_SELECTION_JS);
    if (pendingAction.current === 'search') {
      pendingAction.current = null;
      setTimeout(() => engineRef.current?.postMessage(JSON.stringify({ type: 'search' })), 150);
    }
  }, [uri]);

  if (!html) {
    return (
      <View style={{ flex: 1, backgroundColor: c.readerBackground, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={{ color: c.textSecondary, marginTop: 12, fontSize: 14 }}>Loading PDF engine...</Text>
      </View>
    );
  }

  if (mode === 'native') {
    return (
      <View style={{ flex: 1, backgroundColor: c.readerBackground }}>
        <Pdf
          ref={nativeRef}
          source={{ uri }}
          page={currentPage}
          scale={zoom}
          minScale={0.5}
          maxScale={5}
          fitPolicy={0}
          enableDoubleTapZoom
          trustAllCerts
          onLoadComplete={handleNativeLoadComplete}
          onPageChanged={(page) => setCurrentPage(page)}
          onScaleChanged={(scale) => setZoom(Math.round(scale * 100) / 100)}
          onError={handleNativeError}
          style={{ flex: 1, backgroundColor: c.readerBackground }}
          renderActivityIndicator={() => (
            <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color={c.primary} />
              <Text style={{ color: c.textSecondary, marginTop: 12, fontSize: 14 }}>Loading PDF...</Text>
            </View>
          )}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.readerBackground }}>
      <WebView
        ref={engineRef}
        source={{ html }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        onMessage={handleEngineMessage}
        onLoadEnd={handleEngineLoadEnd}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={c.primary} />
            <Text style={{ color: c.textSecondary, marginTop: 12, fontSize: 14 }}>Preparing PDF engine...</Text>
          </View>
        )}
        renderError={(errorName) => (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Text style={{ color: c.error, fontSize: 16, fontWeight: '600' }}>Failed to load PDF</Text>
            <Text style={{ color: c.textSecondary, marginTop: 8, textAlign: 'center' }}>{errorName}</Text>
          </View>
        )}
      />
    </View>
  );
}
