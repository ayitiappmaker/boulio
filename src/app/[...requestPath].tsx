import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePathname } from 'expo-router';

import { PrimaryButton } from '@/components/PrimaryButton';
import { SectionCard } from '@/components/SectionCard';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { fetchPublicDataRequestByCode, type DataRequestRecord, type PublicDataRequestLookup } from '@/lib/dataRequests';
import { formatServiceTotal } from '@/lib/paymentFlow';
import { createPaymentForTopUpOrder, openCheckoutUrl } from '@/lib/payments';
import { claimDataRequestForCheckout } from '@/lib/topupOrders';
import { t, useLanguage, type TranslationKey } from '@/lib/i18n';
import { analyticsCarrier, trackAnalyticsEvent } from '@/lib/analytics';

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
  const [paymentNotice, setPaymentNotice] = useState<TranslationKey | null>(null);
  const [senderPhone, setSenderPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const trackedViewedRequestId = useRef<string | null>(null);

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
              message: t('requestCouldNotBeLoaded'),
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

  const handleContinueToPay = async () => {
    if (!request?.productId || !isValidInternationalPhone(senderPhone)) {
      setPaymentNotice('internationalPhoneHint');
      return;
    }

    setSubmitting(true);
    setPaymentNotice(null);
    try {
      trackAnalyticsEvent('request_payment_started', {
        carrier: analyticsCarrier(request.carrier),
        price_usd: request.totalUsd,
      });
      trackAnalyticsEvent('checkout_started', {
        target_type: 'data_request',
        carrier: analyticsCarrier(request.carrier),
        price_usd: request.totalUsd,
      });
      const order = await claimDataRequestForCheckout({
        requestCode: request.requestCode,
        senderPhone: senderPhone.trim(),
      });
      const result = await createPaymentForTopUpOrder(order.id);
      if (result.checkoutUrl) {
        await openCheckoutUrl(result.checkoutUrl);
        return;
      }

      setPaymentNotice('paymentCouldNotBeStarted');
    } catch (error) {
      setPaymentNotice('paymentCouldNotBeStarted');
    } finally {
      setSubmitting(false);
    }
  };

  const request = state.request;
  const lookup = state.lookup;

  useEffect(() => {
    if (lookup?.status !== 'found' || !request || trackedViewedRequestId.current === request.id) {
      return;
    }

    trackedViewedRequestId.current = request.id;
    trackAnalyticsEvent('request_payment_viewed', {
      carrier: analyticsCarrier(request.carrier),
      price_usd: request.totalUsd,
    });
  }, [lookup?.status, request]);

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.brand}>{t('appName')}</Text>
        <Text style={styles.title}>{t('sendTopUpTo')}</Text>
      </View>

      {state.loading ? (
        <SectionCard title={t('loadingRequest')} subtitle="">
        </SectionCard>
      ) : lookup?.status === 'found' && request ? (
        <>
        <SectionCard title={formatHaitiPhone(request.recipientPhone)} subtitle="">
            <View style={styles.summaryCard}>
              <SummaryRow label={t('carrier')} value={formatCarrier(request.carrier)} />
              <SummaryRow label={t('product')} value={request.productName} />
              <SummaryRow label={t('recipientGets')} value={request.recipientBenefit} />
              <SummaryRow label={request.productType === 'airtime' ? t('topUp') : t('bundle')} value={formatServiceTotal(request.amountUsd)} />
              <SummaryRow label={t('serviceFee')} value={formatServiceTotal(request.serviceFeeUsd)} />
              <SummaryRow label={t('total')} value={formatServiceTotal(request.totalUsd)} strong />
            </View>
            {paymentNotice ? <Text style={styles.note}>{t(paymentNotice)}</Text> : null}
            </SectionCard>

          <SectionCard title={t('yourPhone')} subtitle="">
            <TextInput
              value={senderPhone}
              onChangeText={(value) => {
                setSenderPhone(value);
                setPaymentNotice(null);
              }}
              placeholder="+1 812 555 0123"
              placeholderTextColor={Colors.light.muted}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              style={styles.input}
            />
            <PrimaryButton
              label={t('continue')}
              onPress={() => void handleContinueToPay()}
              disabled={submitting || !isValidInternationalPhone(senderPhone)}
              style={styles.button}
            />
          </SectionCard>
        </>
      ) : (
        <SectionCard title={t('requestUnavailable')} subtitle="">
          <Text style={styles.body}>{getLookupMessage(lookup)}</Text>
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

function getLookupMessage(lookup: PublicDataRequestLookup | null) {
  switch (lookup?.status) {
    case 'expired':
      return t('requestHasExpired');
    case 'cancelled':
      return t('requestHasBeenCancelled');
    case 'completed':
      return t('requestHasAlreadyBeenCompleted');
    case 'unavailable':
      return t('requestNotAvailableRightNow');
    default:
      return t('requestLinkNotFound');
  }
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
  return carrier.toLowerCase() === 'digicel' ? 'Digicel' : 'Natcom';
}

function formatHaitiPhone(phone: string) {
  const digits = phone.replace(/\D/g, '').replace(/^509/, '');
  if (digits.length !== 8) return phone;
  return `+509 ${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6)}`;
}

function isValidInternationalPhone(phone: string) {
  const trimmed = phone.trim();
  if (!trimmed.startsWith('+')) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
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
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    color: Colors.light.text,
    backgroundColor: Colors.light.surface,
  },
});
