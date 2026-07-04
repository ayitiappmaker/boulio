import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { latestResults } from '@/lib/mockData';
import { fetchLatestLotteryResults } from '@/lib/publicData';
import { t, useLanguage } from '@/lib/i18n';
import { getStoredUserMode, subscribeToUserModeChanges } from '@/lib/userMode';
import type { LotteryResult, UserMode } from '@/lib/types';

type ResultGroup = {
  key: string;
  state: LotteryResult['state'];
  date: string;
  results: LotteryResult[];
};

export default function HomeScreen() {
  const router = useRouter();
  useLanguage();

  const [latestLotteryResults, setLatestLotteryResults] = useState<LotteryResult[]>(latestResults);
  const [userMode, setUserMode] = useState<UserMode>(() => getStoredUserMode());

  useEffect(() => {
    let active = true;

    void fetchLatestLotteryResults().then((results) => {
      if (active) {
        setLatestLotteryResults(results);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToUserModeChanges(setUserMode);
    return unsubscribe;
  }, []);

  const recentResultGroups = useMemo(() => groupLatestResults(latestLotteryResults).slice(0, 3), [latestLotteryResults]);

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.quickActionsHeader}>
        <Text style={styles.sectionTitle}>{t('quickActions')}</Text>
      </View>
      <View style={styles.quickActionList}>
        <QuickActionCard
          title="$5 Top Up"
          subtitle="Digicel / Natcom"
          onPress={() => router.push('/topup')}
        />
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{t('latestResults')}</Text>
        <PressableLabel label={t('viewAll')} onPress={() => router.push('/results')} />
      </View>

      <View style={styles.resultsList}>
        {recentResultGroups.map((group, index) => (
          <GroupedResultRow key={group.key} group={group} isLast={index === recentResultGroups.length - 1} />
        ))}
      </View>
    </ScrollView>
  );
}

function PressableLabel({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Text style={styles.sectionAction}>
        {label} →
      </Text>
    </Pressable>
  );
}

function QuickActionCard({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quickActionCard, pressed && styles.pressed]}>
      <View style={styles.quickActionText}>
        <Text style={styles.quickActionTitle}>{title}</Text>
        <Text style={styles.quickActionSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.quickActionArrow}>→</Text>
    </Pressable>
  );
}

function groupLatestResults(results: LotteryResult[]): ResultGroup[] {
  const grouped = new Map<string, ResultGroup>();

  results.forEach((result) => {
    const key = `${result.state}-${result.date}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.results.push(result);
      return;
    }

    grouped.set(key, {
      key,
      state: result.state,
      date: result.date,
      results: [result],
    });
  });

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      results: group.results.slice().sort((a, b) => a.game.localeCompare(b.game) || a.draw.localeCompare(b.draw)),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.state.localeCompare(b.state));
}

function GroupedResultRow({ group, isLast }: { group: ResultGroup; isLast: boolean }) {
  return (
    <View style={[styles.resultGroup, isLast && styles.resultGroupLast]}>
      <View style={styles.resultGroupHeader}>
        <View style={styles.resultGroupMeta}>
          <Text style={styles.resultState}>{group.state}</Text>
          <Text style={styles.resultDate}>{group.date}</Text>
        </View>
        <Text style={styles.resultGroupCount}>{group.results.length} draw(s)</Text>
      </View>
      <View style={styles.groupRows}>
        {group.results.map((result, index) => (
          <View key={result.id} style={[styles.groupRow, index === 0 && styles.groupRowFirst]}>
            <View style={styles.groupRowMeta}>
              <Text style={styles.resultInfo}>
                {result.game} {result.draw}
              </Text>
            </View>
            <View style={styles.numberRow}>
              {result.winningNumbers.map((number) => (
                <View key={number} style={styles.numberPill}>
                  <Text style={styles.numberText}>{number}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
    backgroundColor: Colors.light.background,
  },
  quickActionsHeader: {
    paddingTop: 2,
  },
  quickActionList: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  quickActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  quickActionText: {
    flex: 1,
    gap: 2,
  },
  quickActionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
    color: Colors.light.text,
  },
  quickActionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
  },
  quickActionArrow: {
    fontSize: 16,
    lineHeight: 16,
    color: Colors.light.primary,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: Colors.light.text,
  },
  sectionAction: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.primary,
    fontWeight: '500',
  },
  resultsList: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  resultGroup: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    gap: 10,
  },
  resultGroupLast: {
    borderBottomWidth: 0,
  },
  resultGroupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  resultGroupMeta: {
    flex: 1,
    gap: 2,
  },
  resultGroupCount: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.light.textTertiary,
    fontWeight: '500',
  },
  groupRows: {
    gap: 4,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingTop: 4,
  },
  groupRowFirst: {
    paddingTop: 0,
  },
  groupRowMeta: {
    minWidth: 100,
  },
  resultState: {
    fontSize: 15,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '500',
  },
  resultInfo: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
  },
  resultDate: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.light.textSecondary,
  },
  numberRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: '56%',
  },
  numberPill: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontSize: 12,
    lineHeight: 14,
    color: Colors.light.text,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});
