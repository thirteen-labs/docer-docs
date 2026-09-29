import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Clock, BookOpen, Flame, TrendingUp } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { useStatsStore } from '@/stores/stats-store';

type Period = 'week' | 'month';

function getDateRange(period: Period): { from: string; to: string; labels: string[]; dates: string[] } {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  const days = period === 'week' ? 7 : 30;
  const labels: string[] = [];
  const dates: string[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);

    if (period === 'week') {
      labels.push(d.toLocaleDateString('en', { weekday: 'short' }));
    } else if (i % 5 === 0 || i === 0) {
      labels.push(d.toLocaleDateString('en', { month: 'short', day: 'numeric' }));
    } else {
      labels.push('');
    }
  }

  return { from: dates[0], to, labels, dates };
}

function BarChart({ data, labels, maxValue, color }: { data: number[]; labels: string[]; maxValue: number; color: string }) {
  const c = useTheme();
  const barWidth = Math.max(8, Math.min(24, (320 - labels.length * 2) / labels.length));

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-evenly', height: 120, paddingHorizontal: 4 }}>
        {data.map((value, i) => {
          const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
          return (
            <View key={i} style={{ alignItems: 'center', flex: 1 }}>
              <View
                style={{
                  width: barWidth,
                  height: Math.max(height, 2),
                  backgroundColor: value > 0 ? color : c.border,
                  borderRadius: barWidth / 2,
                  opacity: value > 0 ? 1 : 0.3,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 6 }}>
        {labels.map((label, i) => (
          <Text key={i} style={{ fontSize: 9, color: c.textTertiary, textAlign: 'center', flex: 1 }}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function StatsScreen() {
  const c = useTheme();
  const todayStats = useStatsStore((s) => s.todayStats);
  const readingStreak = useStatsStore((s) => s.readingStreak);
  const rangeStats = useStatsStore((s) => s.rangeStats);
  const fetchRangeStats = useStatsStore((s) => s.fetchRangeStats);
  const fetchTodayStats = useStatsStore((s) => s.fetchTodayStats);
  const fetchReadingStreak = useStatsStore((s) => s.fetchReadingStreak);
  const [period, setPeriod] = useState<Period>('week');

  const loadRange = useCallback(() => {
    const { from, to } = getDateRange(period);
    fetchRangeStats(from, to);
  }, [period, fetchRangeStats]);

  useEffect(() => {
    fetchTodayStats();
    fetchReadingStreak();
    loadRange();
    // Reading time is recorded by the readers, so refresh whenever the screen
    // comes back into view rather than showing whatever was there on mount.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        fetchTodayStats();
        fetchReadingStreak();
        loadRange();
      }
    });
    return () => sub.remove();
  }, [fetchTodayStats, fetchReadingStreak, loadRange]);

  const { labels, dates } = getDateRange(period);

  // reading_stats only has rows for days with activity, but the chart pairs
  // labels[i] with data[i]. Fill the gaps so days with no reading render as a
  // zero bar in the right position instead of shifting the whole series left.
  const byDate = new Map(rangeStats.map((s) => [s.date, s]));
  const pageData: number[] = [];
  const timeData: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    const day = byDate.get(dates[i]);
    pageData.push(day?.pages_read ?? 0);
    timeData.push(Math.round((day?.reading_time ?? 0) / 60));
  }

  const maxPages = Math.max(...pageData, 1);
  const maxTime = Math.max(...timeData, 1);
  const totalPages = pageData.reduce((a, b) => a + b, 0);
  const totalTime = timeData.reduce((a, b) => a + b, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
          <ArrowLeft size={24} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: '700', color: c.text }}>Statistics</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 16, padding: 20, alignItems: 'center' }}>
              <Clock size={24} color={c.primary} />
              <Text style={{ fontSize: 32, fontWeight: '700', color: c.text, marginTop: 8 }}>
                {Math.floor(todayStats.readingTime / 60)}
              </Text>
              <Text style={{ fontSize: 13, color: c.textSecondary }}>Minutes Today</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 16, padding: 20, alignItems: 'center' }}>
              <Flame size={24} color={c.primary} />
              <Text style={{ fontSize: 32, fontWeight: '700', color: c.text, marginTop: 8 }}>
                {readingStreak}
              </Text>
              <Text style={{ fontSize: 13, color: c.textSecondary }}>Day Streak</Text>
            </View>
          </View>
          <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 20, alignItems: 'center' }}>
            <BookOpen size={24} color={c.primary} />
            <Text style={{ fontSize: 32, fontWeight: '700', color: c.text, marginTop: 8 }}>
              {todayStats.pagesRead}
            </Text>
            <Text style={{ fontSize: 13, color: c.textSecondary }}>Pages Read Today</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <TrendingUp size={20} color={c.primary} />
            <Text style={{ fontSize: 18, fontWeight: '600', color: c.text }}>Trends</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {(['week', 'month'] as Period[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: period === p ? c.primary : c.surface }}
                onPress={() => setPeriod(p)}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: period === p ? '#FFF' : c.textSecondary }}>
                  {p === 'week' ? '7 Days' : '30 Days'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>Pages Read</Text>
              <Text style={{ fontSize: 14, color: c.textSecondary }}>{totalPages} total</Text>
            </View>
            <BarChart data={pageData} labels={labels} maxValue={maxPages} color={c.primary} />
          </View>

          <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>Reading Time</Text>
              <Text style={{ fontSize: 14, color: c.textSecondary }}>{totalTime} min total</Text>
            </View>
            <BarChart data={timeData} labels={labels} maxValue={maxTime} color={c.info} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
