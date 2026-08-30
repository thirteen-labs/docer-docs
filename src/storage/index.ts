import { createMMKV } from 'react-native-mmkv';

export const storage = createMMKV({
  id: 'omnidoc-storage',
});

const KEYS = {
  THEME: 'theme',
  FONT: 'font',
  FONT_SIZE: 'font_size',
  LINE_SPACING: 'line_spacing',
  MARGINS: 'margins',
  BRIGHTNESS: 'brightness',
  ORIENTATION: 'orientation',
  SCROLL_DIRECTION: 'scroll_direction',
  ANIMATION_ENABLED: 'animation_enabled',
  LAST_OPENED_DOCUMENT: 'last_opened_document',
  LAST_OPENED_FOLDER: 'last_opened_folder',
  RECENT_FOLDERS: 'recent_folders',
  READING_GOAL_ENABLED: 'reading_goal_enabled',
  DAILY_READING_GOAL: 'daily_reading_goal',
  NOTIFICATIONS_ENABLED: 'notifications_enabled',
  NOTIFICATION_HOUR: 'notification_hour',
  NOTIFICATION_MINUTE: 'notification_minute',
  GOAL_COMPLETION_NOTIFICATIONS: 'goal_completion_notifications',
  ONBOARDING_COMPLETE: 'onboarding_complete',
  APP_LOCK_ENABLED: 'app_lock_enabled',
  APP_LOCK_TYPE: 'app_lock_type',
  SEARCH_HISTORY: 'search_history',
  CONNECTED_LOCATIONS: 'connected_locations',
  LAST_DISCOVERY_TIMESTAMP: 'last_discovery_timestamp',
} as const;

export const appStorage = {
  getTheme: () => storage.getString(KEYS.THEME) ?? 'light',
  setTheme: (theme: string) => storage.set(KEYS.THEME, theme),

  getFont: () => storage.getString(KEYS.FONT) ?? 'system',
  setFont: (font: string) => storage.set(KEYS.FONT, font),

  getFontSize: () => storage.getNumber(KEYS.FONT_SIZE) ?? 16,
  setFontSize: (size: number) => storage.set(KEYS.FONT_SIZE, size),

  getLineSpacing: () => storage.getNumber(KEYS.LINE_SPACING) ?? 1.5,
  setLineSpacing: (spacing: number) => storage.set(KEYS.LINE_SPACING, spacing),

  getMargins: () => storage.getNumber(KEYS.MARGINS) ?? 16,
  setMargins: (margins: number) => storage.set(KEYS.MARGINS, margins),

  getBrightness: () => storage.getNumber(KEYS.BRIGHTNESS) ?? 1.0,
  setBrightness: (brightness: number) => storage.set(KEYS.BRIGHTNESS, brightness),

  getOrientation: () => storage.getString(KEYS.ORIENTATION) ?? 'auto',
  setOrientation: (orientation: string) => storage.set(KEYS.ORIENTATION, orientation),

  getScrollDirection: () => storage.getString(KEYS.SCROLL_DIRECTION) ?? 'vertical',
  setScrollDirection: (direction: string) => storage.set(KEYS.SCROLL_DIRECTION, direction),

  getAnimationEnabled: () => storage.getBoolean(KEYS.ANIMATION_ENABLED) ?? true,
  setAnimationEnabled: (enabled: boolean) => storage.set(KEYS.ANIMATION_ENABLED, enabled),

  getLastOpenedDocument: () => storage.getString(KEYS.LAST_OPENED_DOCUMENT),
  setLastOpenedDocument: (id: string) => storage.set(KEYS.LAST_OPENED_DOCUMENT, id),

  getLastOpenedFolder: () => storage.getString(KEYS.LAST_OPENED_FOLDER),
  setLastOpenedFolder: (path: string) => storage.set(KEYS.LAST_OPENED_FOLDER, path),

  getRecentFolders: (): string[] => {
    const raw = storage.getString(KEYS.RECENT_FOLDERS);
    return raw ? JSON.parse(raw) : [];
  },
  addRecentFolder: (path: string) => {
    const folders = appStorage.getRecentFolders();
    const updated = [path, ...folders.filter(f => f !== path)].slice(0, 10);
    storage.set(KEYS.RECENT_FOLDERS, JSON.stringify(updated));
  },

  getReadingGoalEnabled: () => storage.getBoolean(KEYS.READING_GOAL_ENABLED) ?? false,
  setReadingGoalEnabled: (enabled: boolean) => storage.set(KEYS.READING_GOAL_ENABLED, enabled),

  getDailyReadingGoal: () => storage.getNumber(KEYS.DAILY_READING_GOAL) ?? 30,
  setDailyReadingGoal: (minutes: number) => storage.set(KEYS.DAILY_READING_GOAL, minutes),

  getNotificationsEnabled: () => storage.getBoolean(KEYS.NOTIFICATIONS_ENABLED) ?? false,
  setNotificationsEnabled: (enabled: boolean) => storage.set(KEYS.NOTIFICATIONS_ENABLED, enabled),

  getNotificationHour: () => storage.getNumber(KEYS.NOTIFICATION_HOUR) ?? 20,
  setNotificationHour: (hour: number) => storage.set(KEYS.NOTIFICATION_HOUR, hour),

  getNotificationMinute: () => storage.getNumber(KEYS.NOTIFICATION_MINUTE) ?? 0,
  setNotificationMinute: (minute: number) => storage.set(KEYS.NOTIFICATION_MINUTE, minute),

  getGoalCompletionNotifications: () => storage.getBoolean(KEYS.GOAL_COMPLETION_NOTIFICATIONS) ?? true,
  setGoalCompletionNotifications: (enabled: boolean) => storage.set(KEYS.GOAL_COMPLETION_NOTIFICATIONS, enabled),

  getOnboardingComplete: () => storage.getBoolean(KEYS.ONBOARDING_COMPLETE) ?? false,
  setOnboardingComplete: (complete: boolean) => storage.set(KEYS.ONBOARDING_COMPLETE, complete),

  getAppLockEnabled: () => storage.getBoolean(KEYS.APP_LOCK_ENABLED) ?? false,
  setAppLockEnabled: (enabled: boolean) => storage.set(KEYS.APP_LOCK_ENABLED, enabled),

  getAppLockType: () => storage.getString(KEYS.APP_LOCK_TYPE) ?? 'pin',
  setAppLockType: (type: string) => storage.set(KEYS.APP_LOCK_TYPE, type),

  getSearchHistory: (): string[] => {
    const raw = storage.getString(KEYS.SEARCH_HISTORY);
    return raw ? JSON.parse(raw) : [];
  },
  addSearchHistory: (query: string) => {
    const history = appStorage.getSearchHistory();
    const updated = [query, ...history.filter(h => h !== query)].slice(0, 50);
    storage.set(KEYS.SEARCH_HISTORY, JSON.stringify(updated));
  },
  clearSearchHistory: () => storage.remove(KEYS.SEARCH_HISTORY),

  getConnectedLocations: (): string[] => {
    const raw = storage.getString(KEYS.CONNECTED_LOCATIONS);
    return raw ? JSON.parse(raw) : [];
  },
  addConnectedLocation: (uri: string) => {
    const locations = appStorage.getConnectedLocations();
    const updated = [uri, ...locations.filter((l) => l !== uri)];
    storage.set(KEYS.CONNECTED_LOCATIONS, JSON.stringify(updated));
  },
  removeConnectedLocation: (uri: string) => {
    const locations = appStorage.getConnectedLocations();
    const updated = locations.filter((l) => l !== uri);
    storage.set(KEYS.CONNECTED_LOCATIONS, JSON.stringify(updated));
  },
  setConnectedLocations: (uris: string[]) => {
    storage.set(KEYS.CONNECTED_LOCATIONS, JSON.stringify(uris));
  },

  getLastDiscoveryTimestamp: () => storage.getNumber(KEYS.LAST_DISCOVERY_TIMESTAMP) ?? 0,
  setLastDiscoveryTimestamp: (ts: number) => storage.set(KEYS.LAST_DISCOVERY_TIMESTAMP, ts),

  clearAll: () => storage.clearAll(),
};
