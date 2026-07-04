import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';

import { PrimaryButton } from '@/components/PrimaryButton';
import { SectionCard } from '@/components/SectionCard';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { fetchPublicDataRequestByCode, type DataRequestRecord, type PublicDataRequestLookup } from '@/lib/dataRequests';
import { formatServiceTotal } from '@/lib/paymentFlow';
import { createPaymentForDataRequest, openCheckoutUrl } from '@/lib/payments';
import { t, useLanguage } from '@/lib/i18n';

type RequestPageState = {
  loading: boolean;
  lookup: PublicDataRequestLookup | null;
  request: DataRequestRecord | null;
};

export default function PublicRequestReviewScreen() {
  useLanguage();
  const pathname = usePathname();
  const [state, setState] = useState<RequestPageState>({
    loading: true,
    lookup: null,
    request: null,
  });
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);

  useEffect(() => {
    const requestCode = getRequestCodeFromPath(pathname);
    let active = true;

    if (!requestCode) {
      setState({
        loading: false,
        lookup: { status: 'not_found', message: t('requestLinkNotFound'), request: null },
        request: null,
      });
      return undefined;
    }

    setState((current) => ({ ...current, loading: true }));

    void fetchPublicDataRequestByCode(requestCode)
      .then((lookup) => {
        if (active) {
          setState({
            loading: false,
            lookup,
            request: lookup.request,
          });
        }
      })
      .catch((error) => {
        if (active) {
          setState({
            loading: false,
            lookup: {
              status: 'unavailable',
              message: error instanceof Error ? error.message : t('requestCouldNotBeLoaded'),
              request: null,
            },
            request: null,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  const handlePaymentComingSoon = async () => {
    try {
      const requestCode = request?.requestCode ?? getRequestCodeFromPath(pathname) ?? '';
      const result = await createPaymentForDataRequest(requestCode);
      if (result.checkoutUrl) {
        await openCheckoutUrl(result.checkoutUrl);
        return;
      }

      setPaymentNotice(result.message);
    } catch {
      setPaymentNotice(t('onlinePaymentWillBeConnectedSoon'));
    }
  };

  const request = state.request;
  const lookup = state.lookup;

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.brand}>{t('appName')}</Text>
        <Text style={styles.title}>{t('familyDataRequest')}</Text>
        <Text style={styles.subtitle}>{t('familyReviewBeforeContinuing')}</Text>
        <Text style={styles.helper}>{t('youWillReceiveConfirmationLater')}</Text>
      </View>

      {state.loading ? (
        <SectionCard title={t('loadingRequest')} subtitle={t('checkingRequestLink')}>
          <Text style={styles.body}>{t('pleaseWaitLoadingRequestDetails')}</Text>
        </SectionCard>
      ) : lookup?.status === 'found' && request ? (
        <>
        <SectionCard title={t('requestDetails')} subtitle={t('quickSummaryOfRequest')}>
            <View style={styles.summaryCard}>
              <SummaryRow label={t('carrier')} value={formatCarrier(request.carrier)} />
              <SummaryRow label={t('chooseDataPackage')} value={request.bundleLabel ?? request.productName} />
              <SummaryRow label={t('enterHaitiPhoneNumber')} value={request.recipientPhone} />
              <SummaryRow label={t('serviceTotal')} value={formatServiceTotal(request.totalUsd)} strong />
              <SummaryRow label={t('pendingPayment')} value={t('pendingPayment')} />
              <SummaryRow label={t('requestStatus')} value={formatRequestStatus(request.publicStatus)} />
              <SummaryRow label={t('created')} value={formatDate(request.createdAt)} />
            </View>
                <Text style={styles.note}>{paymentNotice ?? t('onlinePaymentWillBeConnectedSoon')}</Text>
            </SectionCard>

          <SectionCard title={t('completeThisDataRequest')} subtitle={t('reviewBeforePayment')}>
            <Text style={styles.body}>{t('reviewBeforePayment')}</Text>
            <PrimaryButton label={t('completePayment')} onPress={handlePaymentComingSoon} style={styles.button} />
          </SectionCard>
        </>
      ) : (
        <SectionCard title={t('requestUnavailable')} subtitle={t('thisRequestLinkCannotBeUsedRightNow')}>
          <Text style={styles.body}>{lookup?.message ?? t('requestLinkNotFound')}</Text>
          <Text style={styles.note}>{t('thisRequestMayHaveExpired')}</Text>
          <PrimaryButton label={t('continue')} onPress={() => undefined} style={styles.button} />
        </SectionCard>
      )}
    </ScrollView>
  );
}

function getRequestCodeFromPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'request' || parts.length < 2) {
    return null;
  }

  return parts[1];
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

function formatCarrier(carrier: string) {
  return carrier === 'digicel' ? 'Digicel' : 'Natcom';
}

function formatRequestStatus(status: string) {
  switch (status) {
    case 'open':
      return t('waitingForSupporter');
    case 'paid':
      return t('paid');
    case 'completed':
      return t('completed');
    case 'expired':
      return t('expired');
    case 'cancelled':
      return t('cancelled');
    default:
      return status;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  brand: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.light.textSecondary,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '600',
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  rowLabel: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  rowValueStrong: {
    color: Colors.light.text,
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  button: {
    marginTop: Spacing.xs,
  },
});
