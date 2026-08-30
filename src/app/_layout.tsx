import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Home, Compass, Search, Bookmark, Settings } from 'lucide-react-native';

import * as Notifications from 'expo-notifications';
import { runMigrations } from '@/db/migrations';
import { getDb } from '@/db/connection';
import { useThemeStore } from '@/stores/theme-store';
import { useSettingsStore } from '@/stores/settings-store';
import { THEME_COLORS } from '@/constants/theme-config';
import { setupNotifications } from '@/services/notification-service';
import { DocumentDiscoveryManager } from '@/services/discovery/discovery-manager';
import { requestPermissions, useMediaChangeEvent } from '@/services/mediastore-service';
import { enforceCacheLimit } from '@/services/cache-cleanup';
import { useLibraryStore } from '@/stores/library-store';
import { appStorage } from '@/storage';
import { ErrorBoundary } from '@/components/error-boundary';
import { OfflineBanner } from '@/components/offline-banner';
import { AppLockGate } from '@/features/security/app-lock-screen';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  const theme = useThemeStore((s) => s.theme);
  const loadFromStorage = useThemeStore((s) => s.loadFromStorage);
  const loadSettings = useSettingsStore((s) => s.loadFromStorage);
  const refreshLibrary = useLibraryStore((s) => s.refreshLibrary);
  const colors = THEME_COLORS[theme];

  useMediaChangeEvent((event) => {
    DocumentDiscoveryManager.handleMediaChange(event).then((changed) => {
      if (changed) refreshLibrary();
    }).catch(() => {});
  });

  useEffect(() => {
    loadFromStorage();
    loadSettings();
    getDb().then(async (db) => {
      await runMigrations(db);
      if (!appStorage.getOnboardingComplete()) {
        try { await requestPermissions(); } catch {}
        appStorage.setOnboardingComplete(true);
      }
      // Docs-only fetch on launch via the unified discovery manager
      try {
        const result = await DocumentDiscoveryManager.discoverAll({ includeImages: false });
        if (result.imported > 0 || result.updated > 0) {
          refreshLibrary();
        }
      } catch {}
    });
    setupNotifications();
    enforceCacheLimit().catch(() => {});
  }, [loadFromStorage, loadSettings, refreshLibrary]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
          <OfflineBanner />
          <AppLockGate>
          <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: 1 },
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textSecondary,
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home size={22} color={color} /> }} />
          <Tabs.Screen name="explore" options={{ title: 'Library', tabBarIcon: ({ color }) => <Compass size={22} color={color} /> }} />
          <Tabs.Screen name="search/index" options={{ title: 'Search', tabBarIcon: ({ color }) => <Search size={22} color={color} /> }} />
          <Tabs.Screen name="bookmarks/index" options={{ title: 'Bookmarks', tabBarIcon: ({ color }) => <Bookmark size={22} color={color} /> }} />
          <Tabs.Screen name="settings/index" options={{ title: 'Settings', tabBarIcon: ({ color }) => <Settings size={22} color={color} /> }} />
          <Tabs.Screen name="reader" options={{ href: null }} />
          <Tabs.Screen name="notes/index" options={{ href: null }} />
          <Tabs.Screen name="stats/index" options={{ href: null }} />
          <Tabs.Screen name="library" options={{ href: null }} />
          <Tabs.Screen name="library/collections" options={{ href: null }} />
          <Tabs.Screen name="library/tags" options={{ href: null }} />
          <Tabs.Screen name="highlights/index" options={{ href: null }} />
          <Tabs.Screen name="settings/goals" options={{ href: null }} />
          <Tabs.Screen name="settings/backup" options={{ href: null }} />
          <Tabs.Screen name="settings/security" options={{ href: null }} />
          <Tabs.Screen name="settings/appearance" options={{ href: null }} />
          <Tabs.Screen name="settings/storage" options={{ href: null }} />
          <Tabs.Screen name="settings/about" options={{ href: null }} />
          <Tabs.Screen name="settings/notifications" options={{ href: null }} />
          <Tabs.Screen name="settings/export" options={{ href: null }} />
        </Tabs>
        </AppLockGate>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
