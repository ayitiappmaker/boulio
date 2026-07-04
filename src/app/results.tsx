import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChipSelector } from '@/components/ChipSelector';
import { ResultCard } from '@/components/ResultCard';
import { SectionCard } from '@/components/SectionCard';
import { Colors, Spacing } from '@/constants/theme';
import { historyResults, lotteryStates } from '@/lib/mockData';
import {
  applyLotteryFilters,
  fetchLotteryResults,
  type LotteryResultsDateFilter,
  type LotteryResultsFilters,
} from '@/lib/publicData';
import { t, useLanguage } from '@/lib/i18n';
import type { LotteryDraw, LotteryGame, LotteryState } from '@/lib/types';

type DateFilter = LotteryResultsDateFilter;
type GameFilter = LotteryGame | 'All';
type StateFilter = LotteryState | 'All';
type DrawFilter = LotteryDraw | 'All';

export default function ResultsScreen() {
  useLanguage();

  const [stateFilter, setStateFilter] = useState<StateFilter>('All');
  const [gameFilter, setGameFilter] = useState<GameFilter>('All');
  const [drawFilter, setDrawFilter] = useState<DrawFilter>('All');
  const [dateFilter, setDateFilter] = useState<DateFilter>('Any');
  const [pickDate, setPickDate] = useState('');
  const [results, setResults] = useState<ReturnType<typeof applyLotteryFilters>>(
    applyLotteryFilters(historyResults, {
      state: 'All',
      game: 'All',
      draw: 'All',
      date: 'Any',
    })
  );

  useEffect(() => {
    let active = true;
    const filters: LotteryResultsFilters = {
      state: stateFilter,
      game: gameFilter,
      draw: drawFilter,
      date: dateFilter,
    };

    void fetchLotteryResults(filters).then((nextResults) => {
      if (active) {
        setResults(nextResults);
      }
    });

    return () => {
      active = false;
    };
  }, [dateFilter, drawFilter, gameFilter, stateFilter]);

  const visibleResults = useMemo(() => {
    const normalizedPickDate = pickDate.trim();
    if (!normalizedPickDate) {
      return results;
    }

    return results.filter((result) => result.date === normalizedPickDate);
  }, [pickDate, results]);

  const analysis = useMemo(() => analyzeResults(visibleResults), [visibleResults]);

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('results')}</Text>
        <Text style={styles.subtitle}>Pick a date, review the draw, and analyze the numbers.</Text>
      </View>

      <SectionCard title="Pick date" subtitle="Filter by draw date or review a specific day">
        <View style={styles.filterStack}>
          <TextInput
            value={pickDate}
            onChangeText={setPickDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.light.textTertiary}
            style={styles.input}
          />
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>{t('state')}</Text>
            <ChipSelector
              value={stateFilter}
              options={['All', ...lotteryStates] as const}
              onChange={setStateFilter}
            />
          </View>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>{t('game')}</Text>
            <ChipSelector
              value={gameFilter}
              options={['All', 'Pick 3', 'Pick 4'] as const}
              onChange={setGameFilter}
            />
          </View>
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>{t('draw')}</Text>
            <ChipSelector
              value={drawFilter}
              options={['All', 'Midday', 'Evening'] as const}
              onChange={setDrawFilter}
            />
          </View>
        </View>
      </SectionCard>

      <SectionCard title="Draw results" subtitle={visibleResults.length ? `${visibleResults.length} result(s)` : 'No matching results'}>
        {visibleResults.length ? (
          <View style={styles.list}>
            {visibleResults.map((result) => (
              <ResultCard key={result.id} result={result} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptyBody}>Try a different date or relax one of the filters.</Text>
          </View>
        )}
      </SectionCard>

      <SectionCard title="Analyze draw results" subtitle="Quick summary of the selected draw set">
        <View style={styles.analysisGrid}>
          <AnalysisTile label="Results" value={`${analysis.count}`} />
          <AnalysisTile label="Latest date" value={analysis.latestDate} />
          <AnalysisTile label="Repeated digits" value={`${analysis.repeatedDigits}`} />
          <AnalysisTile label="Highest digit" value={analysis.highestDigit} />
        </View>
      </SectionCard>
    </ScrollView>
  );
}

function analyzeResults(results: ReturnType<typeof applyLotteryFilters>) {
  let latestDate = '—';
  let repeatedDigits = 0;
  let highestDigit = '—';
  let highestSeen = -1;

  results.forEach((result) => {
    if (result.date > latestDate) {
      latestDate = result.date;
    }

    const digits = result.winningNumbers;
    if (new Set(digits).size < digits.length) {
      repeatedDigits += 1;
    }

    digits.forEach((digit) => {
      const numericDigit = Number(digit);
      if (!Number.isNaN(numericDigit) && numericDigit > highestSeen) {
        highestSeen = numericDigit;
        highestDigit = digit;
      }
    });
  });

  return {
    count: results.length,
    latestDate,
    repeatedDigits,
    highestDigit,
  };
}

function AnalysisTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.analysisTile}>
      <Text style={styles.analysisLabel}>{label}</Text>
      <Text style={styles.analysisValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
    backgroundColor: Colors.light.background,
  },
  header: {
    gap: 6,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '600',
    color: Colors.light.text,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.light.textSecondary,
  },
  filterStack: {
    gap: Spacing.md,
  },
  filterGroup: {
    gap: Spacing.xs,
  },
  filterLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: Colors.light.text,
  },
  input: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.light.text,
  },
  list: {
    gap: Spacing.md,
  },
  emptyState: {
    paddingVertical: Spacing.md,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    color: Colors.light.text,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  analysisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  analysisTile: {
    flexGrow: 1,
    flexBasis: '48%',
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    gap: 4,
  },
  analysisLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  analysisValue: {
    fontSize: 16,
    lineHeight: 22,
    color: Colors.light.text,
    fontWeight: '600',
  },
});
