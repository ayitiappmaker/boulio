import { StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { LotteryResult } from '@/lib/types';

type ResultCardProps = {
  result: LotteryResult;
};

export function ResultCard({ result }: ResultCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.metaRow}>
        <Text style={styles.state}>{result.state}</Text>
        <Text style={styles.meta}>
          {result.game} - {result.draw}
        </Text>
      </View>

      <Text style={styles.date}>{result.date}</Text>

      <View style={styles.numberRow}>
        {result.winningNumbers.map((number) => (
          <View key={number} style={styles.numberPill}>
            <Text style={styles.number}>{number}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  metaRow: {
    gap: 2,
  },
  state: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.light.text,
  },
  meta: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  date: {
    fontSize: 13,
    color: Colors.light.textTertiary,
  },
  numberRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  numberPill: {
    minWidth: 42,
    minHeight: 42,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.light.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '600',
    color: Colors.light.text,
  },
});
