import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

type AirtimeAmountCardProps = {
  amountUsd: number;
  serviceFeeUsd: number;
  selected?: boolean;
  onPress: () => void;
};

export function AirtimeAmountCard({ amountUsd, serviceFeeUsd, selected, onPress }: AirtimeAmountCardProps) {
  const totalUsd = amountUsd + serviceFeeUsd;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.selectedCard, pressed && styles.pressedCard]}>
      <View style={styles.content}>
        <Text style={styles.amount}>{formatCurrency(amountUsd)}</Text>
        <Text style={styles.meta}>Airtime</Text>
        <Text style={styles.meta}>{`Fee ${formatCurrency(serviceFeeUsd)}`}</Text>
        <Text style={styles.total}>{`Total ${formatCurrency(totalUsd)}`}</Text>
      </View>
    </Pressable>
  );
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '48%',
    minWidth: '46%',
    minHeight: 96,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
  selectedCard: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primarySoft,
  },
  pressedCard: {
    opacity: 0.94,
  },
  content: {
    gap: 4,
  },
  amount: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: Colors.light.text,
  },
  meta: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  total: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '700',
  },
});
