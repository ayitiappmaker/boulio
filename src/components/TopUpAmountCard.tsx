import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { getRecipientReceivesLabel } from '@/lib/topupProductDisplay';
import { t, useLanguage } from '@/lib/i18n';
import type { TopUpProduct } from '@/lib/types';

type TopUpAmountCardProps = {
  product: TopUpProduct;
  selected?: boolean;
  onPress: () => void;
};

export function TopUpAmountCard({
  product,
  selected,
  onPress,
}: TopUpAmountCardProps) {
  useLanguage();
  const isAirtime = product.productType === 'airtime';
  const recipientReceivesLabel = getRecipientReceivesLabel(product);

  const primaryLabel = isAirtime
    ? getAirtimeRecipientLabel(recipientReceivesLabel)
    : getBundlePrimaryLabel(product);

  const secondaryLabel = isAirtime
    ? null
    : getBundleSecondaryLabel(product, primaryLabel);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selectedCard,
        pressed && styles.pressedCard,
      ]}>
      <View style={styles.mainRow}>
        <View style={styles.copyBlock}>
          <Text style={styles.primaryLabel} numberOfLines={2}>
            {primaryLabel}
          </Text>

          {secondaryLabel ? (
            <Text style={styles.secondaryLabel} numberOfLines={2}>
              {secondaryLabel}
            </Text>
          ) : null}
        </View>

        <View style={[styles.pricePill, selected && styles.selectedPricePill]}>
          <Text style={styles.priceText}>
            {formatCurrency(product.amountUsd)}
          </Text>
        </View>
      </View>

      {selected ? (
        <Text style={styles.selectedHint}>{t('selected')}</Text>
      ) : null}
    </Pressable>
  );
}

function getAirtimeRecipientLabel(label: string) {
  const normalized = label
    .replace(/\s+credit$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized) {
    return normalized;
  }

  return t('airtime');
}

function getBundlePrimaryLabel(product: TopUpProduct) {
  const label =
    product.bundleLabel?.trim() ||
    product.label?.trim() ||
    product.name.trim();

  const [benefitPart, validityPart] = label
    .split('/')
    .map((part) => part.trim());

  if (!validityPart) {
    return label;
  }

  const dataOnly = benefitPart
    .replace(
      /\s*\+\s*(?:unlimited\s+)?(?:\d+\s*)?(?:minutes?|mins?).*$/i,
      ''
    )
    .trim();

  return `${dataOnly || benefitPart} / ${validityPart}`;
}

function getBundleSecondaryLabel(
  product: TopUpProduct,
  primaryLabel: string
) {
  const source =
    product.bundleLabel?.trim() ||
    product.label?.trim() ||
    product.name.trim();

  const normalized = source
    .replace(/\s*\+\s*/g, ' · ')
    .replace(/\s*\/\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();

  const comparablePrimary = primaryLabel
    .replace(/\s*\/\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.toLowerCase() === comparablePrimary.toLowerCase()
    ? null
    : normalized;
}

function formatCurrency(value: number) {
  return `$${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}`;
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  selectedCard: {
    borderColor: Colors.light.gold,
    borderWidth: 2,
  },
  pressedCard: {
    opacity: 0.92,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  copyBlock: {
    flex: 1,
    gap: 6,
  },
  primaryLabel: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    color: Colors.light.text,
  },
  secondaryLabel: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },
  pricePill: {
    minWidth: 96,
    minHeight: 52,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedPricePill: {
    backgroundColor: Colors.light.primaryPressed,
  },
  priceText: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: Colors.light.surface,
  },
  selectedHint: {
    alignSelf: 'flex-end',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: Colors.light.gold,
  },
});
