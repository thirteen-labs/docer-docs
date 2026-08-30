import { View, ActivityIndicator, Text, TextInput, TouchableOpacity } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTheme } from '@/hooks/use-theme';
import { useCallback, useRef, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react-native';

interface EpubViewerProps {
  html: string;
  onLoad?: () => void;
  onTextSelection?: (text: string) => void;
}

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

function sanitizeEpubHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2');
}

const SEARCH_JS = `
(function() {
  window.__searchResults = [];
  window.__searchIdx = -1;
  window.searchInChapter = function(query) {
    if (!query.trim()) { window.__searchResults = []; return; }
    var q = query.toLowerCase();
    var results = [];
    var walker = document.createTreeWalker(document.body, 4, null, false);
    var node;
    var pos = 0;
    while (node = walker.nextNode()) {
      var text = node.textContent;
      if (!text) continue;
      var lower = text.toLowerCase();
      var idx = 0;
      while ((idx = lower.indexOf(q, idx)) !== -1) {
        results.push({ node: node, offset: idx, length: q.length, globalPos: pos + idx });
        idx += q.length;
      }
      pos += text.length;
    }
    window.__searchResults = results;
    window.__searchIdx = -1;
    return results.length;
  };
  window.goToSearchResult = function(idx) {
    var results = window.__searchResults;
    if (!results || idx < 0 || idx >= results.length) return;
    window.__searchIdx = idx;
    var r = results[idx];
    var range = document.createRange();
    range.setStart(r.node, r.offset);
    range.setEnd(r.node, r.offset + r.length);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    r.node.parentNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  window.clearSearchHighlights = function() {
    var sel = window.getSelection();
    sel.removeAllRanges();
    window.__searchResults = [];
    window.__searchIdx = -1;
  };
})();
`;

export function EpubViewer({ html, onLoad, onTextSelection }: EpubViewerProps) {
  const c = useTheme();
  const ref = useRef<WebView>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCount, setSearchCount] = useState(0);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'selection') onTextSelection?.(msg.text);
    } catch {}
  }, [onTextSelection]);

  useEffect(() => {
    if (ref.current) {
      ref.current.injectJavaScript(TEXT_SELECTION_JS);
    }
  }, [html]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (ref.current) {
      ref.current.injectJavaScript(`window.searchInChapter("${query.replace(/"/g, '\\"')}")`);
      if (query.trim()) {
        ref.current.injectJavaScript(`window.ReactNativeWebView.postMessage(JSON.stringify({type:'searchCount',count:window.__searchResults.length}))`);
      } else {
        setSearchCount(0);
      }
    }
  }, []);

  const goToNextResult = useCallback(() => {
    if (ref.current) {
      ref.current.injectJavaScript(`
        var r = window.__searchResults;
        var idx = window.__searchIdx;
        if (r && r.length > 0) {
          idx = (idx + 1) % r.length;
          window.goToSearchResult(idx);
        }
      `);
    }
  }, []);

  const goToPrevResult = useCallback(() => {
    if (ref.current) {
      ref.current.injectJavaScript(`
        var r = window.__searchResults;
        var idx = window.__searchIdx;
        if (r && r.length > 0) {
          idx = (idx - 1 + r.length) % r.length;
          window.goToSearchResult(idx);
        }
      `);
    }
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {searchOpen && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 12, paddingVertical: 8,
          backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
        }}>
          <Search size={18} color={c.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder="Search in chapter..."
            placeholderTextColor={c.textTertiary}
            style={{ flex: 1, fontSize: 14, color: c.text, paddingVertical: 4 }}
            autoFocus
          />
          {searchCount > 0 && (
            <Text style={{ fontSize: 12, color: c.textSecondary }}>{searchCount} results</Text>
          )}
          <TouchableOpacity onPress={goToPrevResult} style={{ padding: 4 }}>
            <Text style={{ color: c.primary, fontSize: 16 }}>{'<'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goToNextResult} style={{ padding: 4 }}>
            <Text style={{ color: c.primary, fontSize: 16 }}>{'>'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setSearchOpen(false); setSearchQuery(''); setSearchCount(0); }}>
            <X size={20} color={c.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
      <WebView
        ref={ref}
        source={{ html: sanitizeEpubHtml(html).replace('</body>', `<script>${SEARCH_JS}</script></body>`) }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        onLoad={onLoad}
        onMessage={handleMessage}
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={c.primary} />
          </View>
        )}
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
}

export function useEpubSearch(ref: React.RefObject<WebView>) {
  const toggleSearch = useCallback(() => {
    ref.current?.postMessage(JSON.stringify({ type: 'toggleSearch' }));
  }, [ref]);
  return { toggleSearch };
}
