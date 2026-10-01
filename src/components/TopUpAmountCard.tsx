import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { TopUpProduct } from '@/lib/types';

type TopUpAmountCardProps = {
  product: TopUpProduct;
  selected: boolean;
  onPress: () => void;
};

export function TopUpAmountCard({
  product,
  selected,
  onPress,
}: TopUpAmountCardProps) {
  const isAirtime = product.productType === 'airtime';
  const total = product.price + product.serviceFee;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selectedCard,
        pressed && styles.pressedCard,
      ]}>
      <View style={styles.visualRow}>
        <View style={[styles.carrierMark, selected && styles.selectedCarrierMark]}>
          <Text style={[styles.carrierMarkText, selected && styles.selectedText]}>
            {product.carrier === 'Digicel' ? 'D' : 'N'}
          </Text>
        </View>

        <View style={styles.productMark}>
          <Text style={styles.productMarkText}>
            {isAirtime ? '$' : 'GB'}
          </Text>
        </View>
      </View>

      <View style={styles.copyBlock}>
        <Text style={[styles.productName, selected && styles.selectedText]} numberOfLines={2}>
          {product.label}
        </Text>

        <View style={styles.metaRow}>
          <Text style={[styles.total, selected && styles.selectedText]}>${total.toFixed(2)}</Text>

          <Text style={[styles.tag, selected && styles.selectedTag]}>
            {isAirtime ? 'Mobile credit' : 'Social data'}
          </Text>
        </View>
      </View>

      {selected ? (
        <View style={styles.selectedBadge}>
          <Text style={styles.selectedBadgeText}>Selected</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '48%',
    minWidth: '46%',
    minHeight: 148,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    justifyContent: 'space-between',
    position: 'relative',
  },
  selectedCard: {
    borderColor: Colors.light.gold,
    backgroundColor: Colors.light.primary,
  },
  pressedCard: {
    opacity: 0.94,
  },
  visualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  carrierMark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carrierMarkText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    color: Colors.light.text,
  },
  selectedCarrierMark: {
    borderColor: 'rgba(255, 255, 255, 0.35)',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  selectedText: {
    color: Colors.light.surface,
  },
  productMark: {
    minWidth: 48,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.light.text,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  productMarkText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    color: Colors.light.surface,
  },
  copyBlock: {
    gap: Spacing.xs,
  },
  productName: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: Colors.light.text,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  total: {
    fontSize: 18,
    lineHeight: 24,
    color: Colors.light.text,
    fontWeight: '800',
  },
  tag: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    backgroundColor: Colors.light.surfaceAlt,
    color: Colors.light.textSecondary,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    overflow: 'hidden',
  },
  selectedTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    color: '#D9DFE8',
  },
  selectedBadge: {
    position: 'absolute',
    right: Spacing.sm,
    bottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    backgroundColor: Colors.light.gold,
  },
  selectedBadgeText: {
    color: Colors.light.primary,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
});
