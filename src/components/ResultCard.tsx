import { StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, SHADOW, Spacing } from '@/constants/theme';
import type { LotteryResult } from '@/lib/types';

type ResultCardProps = {
  results: LotteryResult[];
};

export function ResultCard({ results }: ResultCardProps) {
  const [firstResult] = results;

  if (!firstResult) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.state}>{firstResult.state}</Text>
          <View style={styles.metaRow}>
            <View style={styles.dateAccent} />
            <Text style={styles.meta}>
              {firstResult.date} · {firstResult.draw}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.games}>
        {results.map((result, index) => (
          <View key={result.id} style={[styles.gameBlock, index > 0 && styles.gameBlockDivided]}>
            <Text style={styles.game}>{result.game}</Text>
            <View style={styles.numberRow}>
              {result.winningNumbers.map((number, numberIndex) => (
                <View key={`${result.id}-${numberIndex}`} style={styles.numberBall}>
                  <Text style={styles.number}>{number}</Text>
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
  card: { borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, padding: Spacing.lg, gap: Spacing.lg, ...SHADOW },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.md },
  headerCopy: { flex: 1, gap: 7 },
  state: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: Colors.light.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dateAccent: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.light.gold },
  meta: { fontSize: 13, lineHeight: 18, color: Colors.light.textSecondary },
  games: { gap: Spacing.lg },
  gameBlock: { gap: Spacing.sm },
  gameBlockDivided: { borderTopWidth: 1, borderTopColor: Colors.light.border, paddingTop: Spacing.lg },
  game: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: Colors.light.text },
  numberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  numberBall: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.light.surfaceMuted, borderWidth: 1, borderColor: Colors.light.border, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 20, lineHeight: 24, fontWeight: '700', color: Colors.light.text },
});
