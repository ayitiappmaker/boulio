import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChipSelector } from '@/components/ChipSelector';
import { ResultCard } from '@/components/ResultCard';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { historyResults, lotteryStates } from '@/lib/mockData';
import { applyLotteryFilters, fetchLotteryResults, type LotteryResultsDateFilter, type LotteryResultsFilters } from '@/lib/publicData';
import { t, useLanguage } from '@/lib/i18n';
import type { LotteryDraw, LotteryGame, LotteryResult, LotteryState } from '@/lib/types';

type DateFilter = LotteryResultsDateFilter;
type GameFilter = LotteryGame | 'All';
type StateFilter = LotteryState | 'All';
type DrawFilter = LotteryDraw | 'All';

export default function ResultsScreen() {
  useLanguage();

  const [stateFilter, setStateFilter] = useState<StateFilter>('All');
  const [gameFilter, setGameFilter] = useState<GameFilter>('All');
  const [drawFilter, setDrawFilter] = useState<DrawFilter>('All');
  const [dateFilter] = useState<DateFilter>('Any');
  const [pickDate, setPickDate] = useState('');
  const [results, setResults] = useState<ReturnType<typeof applyLotteryFilters>>(
    applyLotteryFilters(historyResults, { state: 'All', game: 'All', draw: 'All', date: 'Any' })
  );

  useEffect(() => {
    let active = true;
    const filters: LotteryResultsFilters = { state: stateFilter, game: gameFilter, draw: drawFilter, date: dateFilter };

    void fetchLotteryResults(filters).then((nextResults) => {
      if (active) setResults(nextResults);
    });

    return () => { active = false; };
  }, [dateFilter, drawFilter, gameFilter, stateFilter]);

  const visibleResults = useMemo(() => {
    const normalizedPickDate = pickDate.trim();
    return normalizedPickDate ? results.filter((result) => result.date === normalizedPickDate) : results;
  }, [pickDate, results]);
  const groupedResults = useMemo(() => groupResultsByDraw(visibleResults), [visibleResults]);

  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>{t('results')}</Text>
          <Text style={styles.subtitle}>Latest draw results in one place.</Text>
        </View>

        <View style={styles.selectorSection}>
          <Text style={styles.eyebrow}>Select state</Text>
          <ScrollView horizontal contentContainerStyle={styles.stateRow} showsHorizontalScrollIndicator={false}>
            {(['All', ...lotteryStates] as const).map((state) => {
              const selected = stateFilter === state;
              return (
                <Pressable key={state} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setStateFilter(state)} style={[styles.statePill, selected && styles.statePillSelected]}>
                  <Text style={[styles.stateLabel, selected && styles.stateLabelSelected]}>{state}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.refineCard}>
          <View style={styles.refineHeader}>
            <Text style={styles.refineTitle}>Refine results</Text>
            <Text style={styles.resultCount}>{visibleResults.length} {visibleResults.length === 1 ? 'result' : 'results'}</Text>
          </View>
          <TextInput value={pickDate} onChangeText={setPickDate} placeholder="Draw date · YYYY-MM-DD" placeholderTextColor={Colors.light.textTertiary} style={styles.input} />
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>{t('game')}</Text>
            <ChipSelector value={gameFilter} options={['All', 'Pick 3', 'Pick 4'] as const} onChange={setGameFilter} />
          </View>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>{t('draw')}</Text>
            <ChipSelector value={drawFilter} options={['All', 'Midday', 'Evening'] as const} onChange={setDrawFilter} />
          </View>
        </View>

        {groupedResults.length ? (
          <View style={styles.list}>
            {groupedResults.map((drawResults) => <ResultCard key={getDrawGroupKey(drawResults[0])} results={drawResults} />)}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIndicator} />
            <Text style={styles.emptyTitle}>Results not posted yet</Text>
            <Text style={styles.emptyBody}>Check back after the draw.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function groupResultsByDraw(results: LotteryResult[]) {
  const groups = new Map<string, LotteryResult[]>();
  results.forEach((result) => {
    const key = getDrawGroupKey(result);
    groups.set(key, [...(groups.get(key) ?? []), result]);
  });
  return Array.from(groups.values());
}

function getDrawGroupKey(result: LotteryResult) {
  return `${result.state}-${result.date}-${result.draw}`;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: Colors.light.background, paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.xxl + Spacing.lg },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: Spacing.xl },
  hero: { gap: 5 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.5, color: Colors.light.text },
  subtitle: { fontSize: 15, lineHeight: 22, color: Colors.light.textSecondary },
  selectorSection: { gap: Spacing.sm },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: Colors.light.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  stateRow: { gap: Spacing.xs, paddingRight: Spacing.lg },
  statePill: { minHeight: 42, borderRadius: 999, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, paddingHorizontal: Spacing.md, alignItems: 'center', justifyContent: 'center' },
  statePillSelected: { borderColor: Colors.light.primary, backgroundColor: Colors.light.primary },
  stateLabel: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: Colors.light.textSecondary },
  stateLabelSelected: { color: Colors.light.surface },
  refineCard: { borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, padding: Spacing.lg, gap: Spacing.md },
  refineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  refineTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: Colors.light.text },
  resultCount: { fontSize: 13, lineHeight: 18, color: Colors.light.textSecondary },
  input: { minHeight: 46, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surfaceMuted, paddingHorizontal: Spacing.md, paddingVertical: 11, fontSize: 14, color: Colors.light.text },
  filterGroup: { gap: Spacing.xs },
  filterLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: Colors.light.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  list: { gap: Spacing.md },
  emptyState: { minHeight: 220, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, padding: Spacing.xl, alignItems: 'center', justifyContent: 'center', gap: 7 },
  emptyIndicator: { width: 28, height: 3, borderRadius: 2, backgroundColor: Colors.light.gold, marginBottom: 5 },
  emptyTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: Colors.light.text, textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 20, color: Colors.light.textSecondary, textAlign: 'center' },
});
