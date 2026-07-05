import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { t } from '@/lib/i18n';
import type { TopUpProduct } from '@/lib/types';
import {
  getRecipientReceivesLabel,
} from '@/lib/topupProductDisplay';

type TopUpAmountCardProps = {
  product: TopUpProduct;
  selected?: boolean;
  onPress: () => void;
};

export function TopUpAmountCard({ product, selected, onPress }: TopUpAmountCardProps) {
  const isAirtime = product.productType === 'airtime';
  const amountLabel = formatCurrency(product.price);
  const serviceFeeLabel = formatCurrency(product.serviceFee);
  const totalLabel = formatCurrency(product.totalUsd);
  const recipientReceivesLabel = isAirtime ? null : getRecipientReceivesLabel(product);
  const bundleHelpfulLine = isAirtime ? null : getBundleHelpfulLine(product);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isAirtime ? styles.airtimeCard : styles.bundleCard,
        selected && styles.selectedCard,
        pressed && styles.pressedCard,
      ]}>
      {isAirtime ? (
        <View style={styles.airtimeContent}>
          <Text style={styles.airtimeAmount}>{amountLabel}</Text>
          <Text style={styles.airtimeMeta}>{`Fee ${serviceFeeLabel}`}</Text>
          <Text style={styles.airtimeTotal}>{`Total ${totalLabel}`}</Text>
        </View>
      ) : (
        <View style={styles.bundleContent}>
          <Text style={styles.bundleCarrier}>{product.carrier}</Text>
          <Text style={styles.bundleName}>{product.name}</Text>
          <Text style={styles.bundleMeta}>{t('socialData')}</Text>
          {recipientReceivesLabel ? (
            <Text style={styles.recipientReceives}>{`Recipient receives: ${recipientReceivesLabel}`}</Text>
          ) : null}
          {bundleHelpfulLine ? <Text style={styles.bundleDetail}>{bundleHelpfulLine}</Text> : null}
          <Text style={styles.paymentBreakdown}>{`You pay: ${amountLabel} + ${serviceFeeLabel} fee`}</Text>
          <Text style={styles.total}>{`Total: ${totalLabel}`}</Text>
        </View>
      )}
    </Pressable>
  );
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

function getBundleHelpfulLine(product: TopUpProduct) {
  const metadata = product.externalProductMetadata;
  const hasMinutes =
    Boolean(metadata && typeof metadata === 'object' && !Array.isArray(metadata)) &&
    Object.values(metadata as Record<string, unknown>)
      .some((value) => typeof value === 'string' && /(minute|call|voice)/i.test(value));

  return hasMinutes ? t('bundleHelpfulLineWithCalls') : t('bundleHelpfulLine');
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: 6,
    justifyContent: 'center',
  },
  airtimeCard: {
    flexGrow: 1,
    flexBasis: '48%',
    minWidth: '46%',
    minHeight: 96,
  },
  bundleCard: {
    flexBasis: '100%',
    minWidth: '100%',
    minHeight: 164,
    alignItems: 'stretch',
  },
  selectedCard: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primarySoft,
  },
  pressedCard: {
    opacity: 0.94,
  },
  airtimeContent: {
    gap: 4,
  },
  bundleContent: {
    gap: 4,
  },
  airtimeAmount: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: Colors.light.text,
  },
  airtimeMeta: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  airtimeTotal: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '700',
  },
  bundleCarrier: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.light.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  bundleName: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: Colors.light.text,
  },
  bundleMeta: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  recipientReceives: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '600',
  },
  bundleDetail: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  paymentBreakdown: {
    fontSize: 13,
    lineHeight: 18,
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
