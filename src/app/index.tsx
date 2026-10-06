import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChipSelector } from '@/components/ChipSelector';
import { TopUpAmountCard } from '@/components/TopUpAmountCard';
import { Colors, Radius, SHADOW, Spacing } from '@/constants/theme';
import { analyticsCarrier, trackAnalyticsEvent } from '@/lib/analytics';
import { detectHaitiCarrierFromPhone, isValidHaitiMobilePhone, normalizeHaitiPhoneForDisplay } from '@/lib/carrierDetection';
import { t, useLanguage } from '@/lib/i18n';
import { fetchActiveTopUpProducts } from '@/lib/publicData';
import { hasAuthoritativeAirtimeDestination } from '@/lib/topupProductDisplay';
import type { TopUpCarrier, TopUpProduct } from '@/lib/types';

type ProductType = 'data' | 'airtime';
const carrierOptions: readonly TopUpCarrier[] = ['Digicel', 'Natcom'];

export default function HomeScreen() {
  const router = useRouter();
  useLanguage();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [manualCarrier, setManualCarrier] = useState<TopUpCarrier | null>(null);
  const [showCarrierPicker, setShowCarrierPicker] = useState(false);
  const [productType, setProductType] = useState<ProductType>('data');
  const [products, setProducts] = useState<TopUpProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const phoneValid = isValidHaitiMobilePhone(phoneNumber);
  const detectedCarrier = phoneValid ? detectHaitiCarrierFromPhone(phoneNumber) : null;
  const carrier = showCarrierPicker ? manualCarrier : detectedCarrier;

  useEffect(() => {
    let active = true;
    void fetchActiveTopUpProducts()
      .then((nextProducts) => { if (active) setProducts(nextProducts); })
      .catch(() => { if (active) setProducts([]); })
      .finally(() => { if (active) setProductsLoading(false); });
    return () => { active = false; };
  }, []);

  const visibleProducts = useMemo(() => {
    if (!phoneValid || !carrier) return [];
    const matching = products.filter((product) =>
      product.active &&
      isUuid(product.id) &&
      product.carrier === carrier &&
      product.productType === productType &&
      (product.productType !== 'airtime' || hasAuthoritativeAirtimeDestination(product))
    );
    if (productType === 'data') return matching;
    const seen = new Set<number>();
    return matching.filter((product) => {
      if (seen.has(product.amountUsd)) return false;
      seen.add(product.amountUsd);
      return true;
    });
  }, [carrier, phoneValid, productType, products]);

  const updatePhoneNumber = (value: string) => {
    setPhoneNumber(value);
    setManualCarrier(null);
    setShowCarrierPicker(false);
  };

  const chooseProduct = (product: TopUpProduct) => {
    const normalizedPhone = normalizeHaitiPhoneForDisplay(phoneNumber);
    if (!normalizedPhone || !carrier) return;
    trackAnalyticsEvent('topup_product_selected', {
      flow: productType === 'airtime' ? 'phone_credit' : 'data_bundle',
      carrier: analyticsCarrier(carrier), product_type: product.productType,
      product_id: product.id, price_usd: product.totalUsd,
    });
    router.push({ pathname: '/topup', params: {
      mode: productType, recipient: normalizedPhone, carrier, productId: product.id,
    } });
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.headline}>{t('sendToHaiti')}</Text>
      </View>

      <View style={styles.topUpCard}>
        <Text style={styles.inputLabel}>{t('recipient')}</Text>
        <View style={[styles.phoneField, phoneNumber.trim() && !phoneValid && styles.phoneFieldError]}>
          <View style={styles.countryCode}>
            <Text style={styles.flag}>🇭🇹</Text><Text style={styles.countryCodeText}>+509</Text>
          </View>
          <TextInput accessibilityLabel={t('enterHaitiPhoneNumber')} value={phoneNumber} onChangeText={updatePhoneNumber}
            placeholder={t('enterHaitiPhoneNumber')} placeholderTextColor={Colors.light.textTertiary}
            keyboardType="phone-pad" textContentType="telephoneNumber" style={styles.phoneInput} />
        </View>
        {phoneNumber.trim() && !phoneValid ? <Text style={styles.errorText}>{t('invalidHaitiMobileNumber')}</Text> : null}

        {phoneValid ? <View style={styles.carrierBlock}>
          {carrier && !showCarrierPicker ? <View style={styles.carrierRow}>
            <View style={styles.carrierStatus}><View style={styles.statusDot} /><Text style={styles.carrierText}>{`${t('carrierDetected')}: ${carrier}`}</Text></View>
            <Pressable accessibilityRole="button" onPress={() => { setManualCarrier(carrier); setShowCarrierPicker(true); }}>
              <Text style={styles.changeText}>{t('change')}</Text>
            </Pressable>
          </View> : <>
            <Text style={styles.carrierPrompt}>{t('chooseCarrier')}</Text>
            <ChipSelector value={manualCarrier} options={carrierOptions} onChange={(nextCarrier) => {
              setManualCarrier(nextCarrier);
              setShowCarrierPicker(true);
            }} />
          </>}
        </View> : null}

        <View style={styles.segmentedControl}>
          <ProductTab label={t('bundle')} selected={productType === 'data'} onPress={() => setProductType('data')} />
          <ProductTab label={t('topUp')} selected={productType === 'airtime'} onPress={() => setProductType('airtime')} />
        </View>

        {phoneValid && carrier ? <View style={styles.productsSection}>
          <View style={styles.productsHeadingRow}>
            <Text style={styles.productsHeading}>{productType === 'data' ? t('chooseDataPackage') : t('chooseAmount')}</Text>
            <Text style={styles.productsCarrier}>{carrier}</Text>
          </View>
          <View style={styles.productList}>
            {visibleProducts.map((product) => <TopUpAmountCard key={product.id} product={product} onPress={() => chooseProduct(product)} />)}
            {!visibleProducts.length ? <Text style={styles.emptyText}>
              {productsLoading ? t('loadingProducts') : t('noProductsAvailableForThisCarrierYet')}
            </Text> : null}
          </View>
        </View> : <Text style={styles.helperText}>{t('enterHaitiPhoneNumber')}</Text>}
      </View>

      <View style={styles.secondaryActions}>
        <SecondaryAction title={t('requestTopUp')} onPress={() => {
          trackAnalyticsEvent('home_request_data_clicked');
          router.push({ pathname: '/topup', params: { mode: 'request' } });
        }} />
        <SecondaryAction title={t('lotteryResults')} onPress={() => router.push('/results')} />
      </View>
    </ScrollView>
  );
}

function ProductTab({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [styles.productTab, selected && styles.productTabSelected, pressed && styles.pressed]}>
    <Text style={[styles.productTabText, selected && styles.productTabTextSelected]}>{label}</Text>
  </Pressable>;
}

function SecondaryAction({ title, onPress }: { title: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}>
    <View style={styles.secondaryCopy}><Text style={styles.secondaryTitle}>{title}</Text></View>
    <Text style={styles.chevron}>›</Text>
  </Pressable>;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg, backgroundColor: Colors.light.background },
  hero: { gap: 6 },
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 1.2, color: Colors.light.gold },
  headline: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -1, color: Colors.light.text },
  supportingCopy: { fontSize: 15, lineHeight: 22, color: Colors.light.textSecondary },
  topUpCard: { gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, ...SHADOW },
  inputLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: Colors.light.text },
  phoneField: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.light.border, borderRadius: Radius.md, backgroundColor: Colors.light.surfaceAlt, overflow: 'hidden' },
  phoneFieldError: { borderColor: Colors.light.danger },
  countryCode: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: Spacing.sm, borderRightWidth: 1, borderRightColor: Colors.light.border },
  flag: { fontSize: 20 }, countryCodeText: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: Colors.light.text },
  phoneInput: { flex: 1, minHeight: 56, paddingHorizontal: Spacing.sm, fontSize: 16, color: Colors.light.text },
  errorText: { marginTop: -Spacing.sm, fontSize: 12, lineHeight: 17, color: Colors.light.danger },
  carrierBlock: { gap: Spacing.sm }, carrierRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  carrierStatus: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }, statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.light.success },
  carrierText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: Colors.light.text }, carrierPrompt: { fontSize: 13, lineHeight: 18, color: Colors.light.textSecondary },
  changeText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: Colors.light.gold },
  segmentedControl: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: Radius.md, backgroundColor: Colors.light.primarySoft },
  productTab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm }, productTabSelected: { backgroundColor: Colors.light.primary },
  productTabText: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: Colors.light.textSecondary }, productTabTextSelected: { color: Colors.light.surface },
  productsSection: { gap: Spacing.sm }, productsHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  productsHeading: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: Colors.light.text }, productsCarrier: { fontSize: 12, lineHeight: 17, fontWeight: '700', color: Colors.light.textSecondary },
  productList: { gap: Spacing.sm }, emptyText: { paddingVertical: Spacing.md, textAlign: 'center', fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  helperText: { textAlign: 'center', fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary }, secondaryActions: { gap: Spacing.sm },
  secondaryAction: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface },
  secondaryCopy: { flex: 1, gap: 2 }, secondaryTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: Colors.light.text }, secondaryDescription: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  chevron: { fontSize: 25, lineHeight: 28, color: Colors.light.gold }, pressed: { opacity: 0.72 },
});
