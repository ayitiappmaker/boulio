import { Pressable, StyleSheet, Text } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { TopUpProduct } from '@/lib/types';

type TopUpAmountCardProps = {
  product: TopUpProduct;
  selected?: boolean;
  onPress: () => void;
};

export function TopUpAmountCard({ product, selected, onPress }: TopUpAmountCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, selected && styles.selectedCard]}>
      <Text style={styles.amount}>{product.label}</Text>
      <Text style={styles.fee}>
        {product.productType === 'airtime' ? 'Airtime' : 'Data'} • Fee ${product.serviceFee.toFixed(2)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '44%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: 4,
    minHeight: 90,
    justifyContent: 'center',
  },
  selectedCard: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.surfaceMuted,
  },
  amount: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
    color: Colors.light.text,
  },
  fee: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
});
