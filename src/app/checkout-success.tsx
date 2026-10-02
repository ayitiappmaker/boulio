import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { PrimaryButton } from '@/components/PrimaryButton';
import { SectionCard } from '@/components/SectionCard';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { getCurrentSession } from '@/lib/auth';
import { formatServiceTotal } from '@/lib/paymentFlow';
import { getTopUpOrderCustomerSummary } from '@/lib/fulfillment';
import { fetchMyTopUpOrders, type TopUpOrderRecord } from '@/lib/topupOrders';
import { t, useLanguage } from '@/lib/i18n';

type RouteParams = {
  orderId?: string | string[];
  order_id?: string | string[];
  target_id?: string | string[];
  session_id?: string | string[];
};

export default function CheckoutSuccessScreen() {
  const router = useRouter();
  useLanguage();
  const params = useLocalSearchParams<RouteParams>();
  const preferredOrderId =
    firstParam(params.orderId) ?? firstParam(params.order_id) ?? firstParam(params.target_id);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<TopUpOrderRecord | null>(null);

  useEffect(() => {
    let active = true;

    void loadOrder(preferredOrderId)
      .then((nextOrder) => {
        if (active) {
          setOrder(nextOrder);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [preferredOrderId]);

  const successSummary = useMemo(() => buildSuccessSummary(order), [order]);

  const detailRows = useMemo(() => {
    if (!order) {
      return [];
    }

    return [
      { label: t('carrier'), value: order.carrier },
      { label: t('product'), value: order.productName },
      { label: t('recipientPhone'), value: order.recipientPhone },
      { label: t('totalPaid'), value: formatServiceTotal(order.totalUsd) },
      { label: t('status'), value: successSummary.statusLabel },
    ];
  }, [order, successSummary.statusLabel]);

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{successSummary.badge}</Text>
        </View>
        <Text style={styles.title}>{successSummary.title}</Text>
        <Text style={styles.subtitle}>{successSummary.subtitle}</Text>
      </View>

      {loading ? (
        <SectionCard title={t('orderDetails')} subtitle={t('loadingYourTopUpOrders')}>
          <Text style={styles.body}>{t('loadingYourTopUpOrders')}</Text>
        </SectionCard>
      ) : order ? (
        <SectionCard title={t('orderDetails')} subtitle={successSummary.detailSubtitle}>
          <View style={styles.summaryCard}>
            {detailRows.map((row) => (
              <SummaryRow key={row.label} label={row.label} value={row.value} />
            ))}
          </View>
        </SectionCard>
      ) : (
        <SectionCard title={t('paymentReceived')} subtitle={t('topUpBeingProcessed')}>
          <Text style={styles.body}>{t('noOrderDetailsAvailable')}</Text>
        </SectionCard>
      )}

      <View style={styles.actions}>
        <PrimaryButton label={t('viewOrderStatus')} onPress={() => router.push('/account')} />
        <Pressable accessibilityRole="button" onPress={() => router.push('/topup')} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{t('sendAnotherTopUp')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

async function loadOrder(preferredId: string | null): Promise<TopUpOrderRecord | null> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return null;
  }

  const orders = await fetchMyTopUpOrders().catch(() => []);

  if (orders.length === 0) {
    return null;
  }

  if (preferredId) {
    const matched = orders.find((nextOrder) => nextOrder.id === preferredId);
    if (matched) {
      return matched;
    }
  }

  return orders[0] ?? null;
}

function buildSuccessSummary(order: TopUpOrderRecord | null) {
  if (!order) {
    return {
      badge: t('paymentReceived'),
      title: t('topUpBeingProcessed'),
      subtitle: t('checkStatusInAccount'),
      detailSubtitle: t('paymentReceived'),
      statusLabel: t('paymentReceived'),
    };
  }

  if (order.status === 'completed' || order.supplierStatus === 'successful') {
    const completed = getTopUpOrderCustomerSummary({
      status: order.status,
      paymentStatus: order.paymentStatus,
      supplierStatus: order.supplierStatus,
    });

    return {
      badge: completed.label,
      title: completed.detail,
      subtitle: t('checkStatusInAccount'),
      detailSubtitle: completed.detail,
      statusLabel: completed.label,
    };
  }

  if (order.status === 'failed' || order.supplierStatus === 'failed') {
    return {
      badge: t('orderNeedsReview'),
      title: t('orderNeedsReview'),
      subtitle: t('checkStatusInAccount'),
      detailSubtitle: t('orderNeedsReviewDetail'),
      statusLabel: t('orderNeedsReview'),
    };
  }

  return {
    badge: t('paymentReceived'),
    title: t('topUpBeingProcessed'),
    subtitle: t('checkStatusInAccount'),
    detailSubtitle: t('topUpBeingProcessed'),
    statusLabel: t('topUpBeingProcessed'),
  };
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
    backgroundColor: Colors.light.background,
  },
  hero: {
    gap: 10,
    paddingVertical: Spacing.xs,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.light.primarySoft,
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Colors.light.primary,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.light.textSecondary,
  },
  helper: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.light.text,
  },
  summaryCard: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: Spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  summaryLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
    fontWeight: '600',
    flexShrink: 1,
  },
  summaryValue: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.text,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  actions: {
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  secondaryButtonText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: Colors.light.text,
  },
});
