import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ChipSelector } from '@/components/ChipSelector';
import { CompleteProfileForm, type ProfileFormValues } from '@/components/CompleteProfileForm';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SectionCard } from '@/components/SectionCard';
import { TopUpAmountCard } from '@/components/TopUpAmountCard';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { topUpProducts as mockTopUpProducts } from '@/lib/mockData';
import { fetchActiveTopUpProducts } from '@/lib/publicData';
import { createSavedRecipient, fetchSavedRecipients, type SavedRecipientRecord } from '@/lib/savedRecipients';
import { t, useLanguage } from '@/lib/i18n';
import { getCurrentSession, subscribeToSessionChanges } from '@/lib/auth';
import { createDataRequest } from '@/lib/dataRequests';
import { createPendingTopUpOrder, type TopUpOrderRecord } from '@/lib/topupOrders';
import { formatServiceTotal } from '@/lib/paymentFlow';
import { createPaymentForDataRequest, createPaymentForTopUpOrder, openCheckoutUrl } from '@/lib/payments';
import { fetchMyProfile, isProfileRequiredError, upsertMyProfile, type ProfileRecord } from '@/lib/profile';
import { getStoredUserMode, subscribeToUserModeChanges } from '@/lib/userMode';
import { getRecipientReceivesLabel } from '@/lib/topupProductDisplay';
import {
  detectHaitiCarrierFromPhone,
  isValidHaitiMobilePhone,
  normalizeHaitiPhoneForFulfillment,
} from '@/lib/carrierDetection';
import type { Session } from '@supabase/supabase-js';
import type { TopUpCarrier, TopUpProduct, UserMode } from '@/lib/types';

type SendStep = 1 | 2 | 3;
type RequestStep = 1 | 2 | 3 | 4 | 5;
type SendProductType = 'airtime' | 'data';
type PendingProfileAction = 'send' | 'request' | null;
type ProductFilter = 'All' | 'airtime' | 'data';

const carrierOptions: readonly TopUpCarrier[] = ['Digicel', 'Natcom'];
const productFilterOptions: readonly ProductFilter[] = ['All', 'airtime', 'data'];

const emptyProfileForm: ProfileFormValues = {
  fullName: '',
  phoneNumber: '',
  country: '',
  userMode: 'haiti_user',
};

export default function TopUpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string | string[] }>();
  useLanguage();
  const [session, setSession] = useState<Session | null>(null);
  const [products, setProducts] = useState<TopUpProduct[]>(mockTopUpProducts);
  const [productsLoading, setProductsLoading] = useState(true);
  const [savedRecipients, setSavedRecipients] = useState<SavedRecipientRecord[]>([]);
  const [savedRecipientsLoading, setSavedRecipientsLoading] = useState(false);
  const [userMode, setUserMode] = useState<UserMode>(() => getStoredUserMode());
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [pendingProfileAction, setPendingProfileAction] = useState<PendingProfileAction>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormValues>(emptyProfileForm);

  const [sendStep, setSendStep] = useState<SendStep>(1);
  const [sendCarrier, setSendCarrier] = useState<TopUpCarrier | null>(null);
  const [productFilter, setProductFilter] = useState<ProductFilter>('All');
  const [productSearch, setProductSearch] = useState('');
  const [sendProductType, setSendProductType] = useState<'airtime' | 'data'>('airtime');
  const [sendAirtimeAmountUsd, setSendAirtimeAmountUsd] = useState<number | null>(null);
  const [sendRecipientName, setSendRecipientName] = useState('');
  const [sendPhoneNumber, setSendPhoneNumber] = useState('');
  const [selectedSendProductId, setSelectedSendProductId] = useState<string | null>(null);
  const [sendSelectedRecipientId, setSendSelectedRecipientId] = useState<string | null>(null);
  const [sendSaveRecipient, setSendSaveRecipient] = useState(false);
  const [sendRecipientMessage, setSendRecipientMessage] = useState<string | null>(null);
  const [sendOrder, setSendOrder] = useState<TopUpOrderRecord | null>(null);
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [requestStep, setRequestStep] = useState<RequestStep>(1);
  const [requestCarrier, setRequestCarrier] = useState<TopUpCarrier>('Digicel');
  const [requestRecipientName, setRequestRecipientName] = useState('');
  const [requestPhoneNumber, setRequestPhoneNumber] = useState('');
  const [selectedRequestProductId, setSelectedRequestProductId] = useState<string | null>(null);
  const [requestProductSearch, setRequestProductSearch] = useState('');
  const [requestSelectedRecipientId, setRequestSelectedRecipientId] = useState<string | null>(null);
  const [requestSaveRecipient, setRequestSaveRecipient] = useState(false);
  const [requestRecipientMessage, setRequestRecipientMessage] = useState<string | null>(null);
  const [requestLink, setRequestLink] = useState<string | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [requestEditNote, setRequestEditNote] = useState<string | null>(null);
  const [requestPaymentNotice, setRequestPaymentNotice] = useState<string | null>(null);
  const [sendPaymentNotice, setSendPaymentNotice] = useState<string | null>(null);
  const [sendCarrierManual, setSendCarrierManual] = useState(false);

  const requestedMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const requestModalVisible = requestedMode === 'request';

  useEffect(() => {
    let active = true;

    void fetchActiveTopUpProducts()
      .then((nextProducts) => {
        if (active) {
          setProducts(nextProducts);
        }
      })
      .catch(() => {
        if (active) {
          setProducts(mockTopUpProducts);
        }
      })
      .finally(() => {
        if (active) {
          setProductsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!session) {
      setSavedRecipients([]);
      setSavedRecipientsLoading(false);
      return undefined;
    }

    setSavedRecipientsLoading(true);

    void fetchSavedRecipients()
      .then((nextRecipients) => {
        if (active) {
          setSavedRecipients(nextRecipients);
        }
      })
      .catch(() => {
        if (active) {
          setSavedRecipients([]);
        }
      })
      .finally(() => {
        if (active) {
          setSavedRecipientsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    let active = true;

    void getCurrentSession()
      .then((nextSession) => {
        if (active) {
          setSession(nextSession);
        }
      })
      .catch(() => {
        if (active) {
          setSession(null);
        }
      });

    const unsubscribe = subscribeToSessionChanges((nextSession) => {
      setSession(nextSession);
    });
    const unsubscribeMode = subscribeToUserModeChanges(setUserMode);

    return () => {
      active = false;
      unsubscribe();
      unsubscribeMode();
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!session) {
      setProfile(null);
      setProfileLoading(false);
      setProfileModalVisible(false);
      setPendingProfileAction(null);
      setProfileMessage(null);
      setProfileError(null);
      setProfileForm(emptyProfileForm);
      return undefined;
    }

    setProfileLoading(true);

    void fetchMyProfile()
      .then((nextProfile) => {
        if (!active) {
          return;
        }

        setProfile(nextProfile);
        setProfileForm(profileToFormValues(nextProfile));
      })
      .catch(() => {
        if (active) {
          setProfile(null);
          setProfileForm(emptyProfileForm);
        }
      })
      .finally(() => {
        if (active) {
          setProfileLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [session]);

  const activeSendProducts = useMemo(
    () => products.filter((product) => product.active && isUuid(product.id)),
    [products]
  );
  const displaySendProducts = useMemo(() => dedupeAirtimeProducts(activeSendProducts), [activeSendProducts]);
  const filteredSendProducts = useMemo(() => {
    const normalizedSearch = productSearch.trim().toLowerCase();

    return displaySendProducts.filter((product) => {
      const filterMatches =
        productFilter === 'All' || product.productType === productFilter;
      if (!filterMatches) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchSpace = [
        product.carrier,
        product.name,
        product.bundleLabel ?? '',
        product.productType === 'airtime' ? 'airtime' : 'internet bundle',
        formatCurrency(product.amountUsd),
        formatCurrency(product.serviceFeeUsd),
        formatCurrency(product.totalUsd),
      ]
        .join(' ')
        .toLowerCase();

      return searchSpace.includes(normalizedSearch);
    });
  }, [displaySendProducts, productFilter, productSearch]);
  const requestBundleProducts = useMemo(
    () => products.filter((product) => product.active && product.productType === 'data'),
    [products]
  );
  const filteredRequestProducts = useMemo(() => {
    const normalizedSearch = requestProductSearch.trim().toLowerCase();

    return requestBundleProducts.filter((product) => {
      if (!normalizedSearch) {
        return true;
      }

      const searchSpace = [
        product.carrier,
        product.name,
        product.bundleLabel ?? '',
        'internet bundle',
        formatCurrency(product.amountUsd),
        formatCurrency(product.serviceFeeUsd),
        formatCurrency(product.totalUsd),
      ]
        .join(' ')
        .toLowerCase();

      return searchSpace.includes(normalizedSearch);
    });
  }, [requestBundleProducts, requestProductSearch]);

  const selectedSendProductCandidate =
    products.find((product) => product.id === selectedSendProductId && product.active) ?? null;
  const selectedSendProductIdIsUuid = Boolean(
    selectedSendProductCandidate && isUuid(selectedSendProductCandidate.id)
  );
  const selectedRequestProduct =
    requestBundleProducts.find((product) => product.id === selectedRequestProductId) ?? null;
  const sendPhoneValid = isValidHaitiMobilePhone(sendPhoneNumber);
  const detectedSendCarrier = sendPhoneValid ? detectHaitiCarrierFromPhone(sendPhoneNumber) : null;
  const confirmedSendCarrier = sendCarrier ?? detectedSendCarrier;
  const selectedSendProduct =
    selectedSendProductIdIsUuid
      ? resolveSelectedTopUpProduct(activeSendProducts, selectedSendProductCandidate, confirmedSendCarrier)
      : null;
  const sendProductSelectionInvalid = Boolean(selectedSendProductCandidate && !selectedSendProductIdIsUuid);
  const carrierMismatch = Boolean(
    selectedSendProduct && confirmedSendCarrier && selectedSendProduct.carrier !== confirmedSendCarrier
  );
  const requestPhoneValid = isValidHaitiMobilePhone(requestPhoneNumber);
  const sendPhoneError = sendPhoneNumber.trim() && !sendPhoneValid ? t('invalidHaitiMobileNumber') : null;
  const requestPhoneError = requestPhoneNumber.trim() && !requestPhoneValid ? t('invalidHaitiMobileNumber') : null;

  const resetSendFlow = () => {
    setSendStep(1);
    setSendCarrier(null);
    setSendCarrierManual(false);
    setProductFilter('All');
    setProductSearch('');
    setSendPhoneNumber('');
    setSelectedSendProductId(null);
    setSendPaymentNotice(null);
    setSendOrder(null);
    setSendSubmitting(false);
    setSendError(null);
  };

  const resetRequestFlow = () => {
    setRequestStep(1);
    setRequestCarrier('Digicel');
    setRequestRecipientName('');
    setRequestPhoneNumber('');
    setSelectedRequestProductId(null);
    setRequestProductSearch('');
    setRequestSelectedRecipientId(null);
    setRequestSaveRecipient(false);
    setRequestRecipientMessage(null);
    setRequestLink(null);
    setRequestBusy(false);
    setRequestError(null);
    setRequestStatus(null);
    setRequestEditNote(null);
    setRequestPaymentNotice(null);
  };

  const hasCompleteProfile =
    Boolean(profile?.fullName.trim()) &&
    Boolean(profile?.phoneNumber.trim()) &&
    Boolean(profile?.country.trim()) &&
    Boolean(profile?.userMode);

  function profileToFormValues(nextProfile: ProfileRecord | null): ProfileFormValues {
    return {
      fullName: nextProfile?.fullName ?? '',
      phoneNumber: nextProfile?.phoneNumber ?? '',
      country: nextProfile?.country ?? '',
      userMode: nextProfile?.userMode ?? 'haiti_user',
    };
  }

  const promptForProfileCompletion = (nextAction: PendingProfileAction) => {
    setPendingProfileAction(nextAction);
    setProfileMessage(null);
    setProfileError(t('completeProfileToContinue'));
    setProfileForm(profileToFormValues(profile));
    setProfileModalVisible(true);
  };

  const handleProfileSubmit = async () => {
    if (
      !profileForm.fullName.trim() ||
      !profileForm.phoneNumber.trim() ||
      !profileForm.country.trim() ||
      !profileForm.userMode
    ) {
      setProfileError(t('profileRequiredForService'));
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const nextProfile = await upsertMyProfile(profileForm);
      setProfile(nextProfile);
      setProfileForm(profileToFormValues(nextProfile));
      setProfileMessage(t('profileSaved'));
      setProfileModalVisible(false);

      const nextAction = pendingProfileAction;
      setPendingProfileAction(null);

      if (nextAction === 'send') {
        await confirmSendOrder(true);
      } else if (nextAction === 'request') {
        await createRequest(true);
      }
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : t('profileRequiredForService'));
    } finally {
      setProfileSaving(false);
    }
  };

  const changeSendCarrier = (carrier: TopUpCarrier) => {
    if (!isValidHaitiMobilePhone(sendPhoneNumber)) {
      return;
    }

    setSendCarrier(carrier);
    setSendCarrierManual(true);
    setSendError(null);
  };

  useEffect(() => {
    if (!sendPhoneNumber.trim() || !isValidHaitiMobilePhone(sendPhoneNumber)) {
      setSendCarrier(null);
      setSendCarrierManual(false);
      return;
    }

    const detectedCarrier = detectHaitiCarrierFromPhone(sendPhoneNumber);
    if (detectedCarrier && !sendCarrierManual) {
      setSendCarrier(detectedCarrier);
    } else if (!detectedCarrier && !sendCarrierManual) {
      setSendCarrier(null);
    }
  }, [sendCarrierManual, sendPhoneNumber]);

  const changeRequestCarrier = (carrier: TopUpCarrier) => {
    setRequestCarrier(carrier);
    setSelectedRequestProductId(null);
    setRequestSelectedRecipientId(null);
    setRequestError(null);
  };

  const createAnotherRequest = () => {
    resetRequestFlow();
  };

  useEffect(() => {
    if (requestModalVisible) {
      resetRequestFlow();
    }
  }, [requestModalVisible]);

  const selectSendRecipient = (recipient: SavedRecipientRecord) => {
    setSendCarrier(recipient.carrier);
    setSendCarrierManual(true);
    setSendError(null);
  };

  const selectRequestRecipient = (recipient: SavedRecipientRecord) => {
    setRequestSelectedRecipientId(recipient.id);
    setRequestRecipientName(recipient.name);
    setRequestPhoneNumber(recipient.phoneNumber);
    setRequestCarrier(recipient.carrier);
    setSelectedRequestProductId(null);
    setRequestError(null);
    setRequestRecipientMessage(null);
  };

  const maybeSaveRecipient = async (
    recipientName: string,
    phoneNumber: string,
    carrier: TopUpCarrier,
    onMessage: (message: string) => void
  ) => {
    if (!isSignedIn || !phoneNumber.trim()) {
      return;
    }

    try {
      const result = await createSavedRecipient({
        recipientName,
        phoneNumber,
        carrier,
      });

      onMessage(result.created ? t('recipientSaved') : t('recipientAlreadySaved'));
      setSavedRecipients((currentRecipients) => {
        const nextRecipients = currentRecipients.filter((recipient) => recipient.id !== result.recipient.id);
        return [result.recipient, ...nextRecipients];
      });
    } catch {
      onMessage(t('recipientSaved'));
    }
  };

  const isSignedIn = Boolean(session?.user?.id);

  const sendReviewSummary = selectedSendProduct
    ? [
        { label: t('orderType'), value: t('topUpOrder') },
        { label: t('phoneNumber'), value: sendPhoneNumber },
        { label: t('carrier'), value: confirmedSendCarrier ?? selectedSendProduct.carrier },
        { label: t('product'), value: selectedSendProduct.name },
        { label: t('recipientReceives'), value: getRecipientReceivesLabel(selectedSendProduct) },
        { label: t('servicePrice'), value: formatServiceTotal(selectedSendProduct.amountUsd) },
        { label: t('serviceFee'), value: formatServiceTotal(selectedSendProduct.serviceFeeUsd) },
        {
          label: t('serviceTotal'),
          value: formatServiceTotal(selectedSendProduct.totalUsd),
          strong: true,
        },
      ]
    : [];

  const requestReviewSummary = selectedRequestProduct
    ? [
        { label: t('product'), value: selectedRequestProduct.name },
        { label: t('recipientReceives'), value: getRecipientReceivesLabel(selectedRequestProduct) },
        { label: t('carrier'), value: requestCarrier },
        { label: t('phoneNumber'), value: requestPhoneNumber },
        { label: t('servicePrice'), value: formatServiceTotal(selectedRequestProduct.amountUsd) },
        { label: t('serviceFee'), value: formatServiceTotal(selectedRequestProduct.serviceFeeUsd) },
        { label: t('serviceTotal'), value: formatServiceTotal(selectedRequestProduct.totalUsd), strong: true },
      ]
    : [];

  const sendStepLabel = `STEP ${sendStep} OF 3`;
  const requestStepLabel = `REQUEST STEP ${requestStep} OF 5`;

  const confirmSendOrder = async (skipProfileCheck = false) => {
    if (selectedSendProductCandidate && !selectedSendProductIdIsUuid) {
      setSendError('Product is not ready for checkout. Please refresh and try again.');
      return;
    }

    if (!selectedSendProduct) {
      setSendError(t('chooseAProductBeforeContinuing'));
      return;
    }

    if (!isSignedIn) {
      setSendError(t('signInRequiredBeforeTopUpOrder'));
      return;
    }

    const normalizedPhone = normalizeHaitiPhoneForFulfillment(sendPhoneNumber);
    if (!normalizedPhone) {
      setSendError(t('invalidHaitiMobileNumber'));
      return;
    }

    const effectiveCarrier = confirmedSendCarrier;
    if (!effectiveCarrier) {
      setSendError(t('confirmCarrier'));
      return;
    }

    if (selectedSendProduct.carrier !== effectiveCarrier) {
      setSendError(
        t('productCarrierMismatch', {
          productCarrier: selectedSendProduct.carrier,
          detectedCarrier: effectiveCarrier,
        })
      );
      return;
    }

    if (!skipProfileCheck && !hasCompleteProfile) {
      promptForProfileCompletion('send');
      return;
    }

    setSendSubmitting(true);
    setSendError(null);
    setSendPaymentNotice(null);

    try {
      const nextOrder = await createPendingTopUpOrder({
        productId: selectedSendProduct.id,
        carrier: selectedSendProduct.carrier,
        productType: selectedSendProduct.productType,
        productName: selectedSendProduct.name,
        recipientPhone: normalizedPhone,
        recipientName: null,
        amountUsd: selectedSendProduct.amountUsd,
        serviceFeeUsd: selectedSendProduct.serviceFeeUsd,
      });

      setSendOrder(nextOrder);
      const paymentResult = await createPaymentForTopUpOrder(nextOrder.id);
      if (paymentResult.checkoutUrl) {
        setSendPaymentNotice(t('stripeCheckoutOpenedNotice'));
        await openCheckoutUrl(paymentResult.checkoutUrl);
        return;
      }

      setSendPaymentNotice(paymentResult.message);
    } catch (error) {
      if (isProfileRequiredError(error)) {
        promptForProfileCompletion('send');
        return;
      }
      setSendError(error instanceof Error ? error.message : 'Unable to create this order.');
    } finally {
      setSendSubmitting(false);
    }
  };

  const createRequest = async (skipProfileCheck = false) => {
    if (!selectedRequestProduct) {
      setRequestError(t('chooseAProductBeforeContinuing'));
      return;
    }

    if (!isSignedIn) {
      setRequestError(t('signInRequiredBeforeRequestLink'));
      return;
    }

    const normalizedPhone = normalizeHaitiPhoneForFulfillment(requestPhoneNumber);
    if (!normalizedPhone) {
      setRequestError(t('invalidHaitiMobileNumber'));
      return;
    }

    if (!skipProfileCheck && !hasCompleteProfile) {
      promptForProfileCompletion('request');
      return;
    }

    setRequestBusy(true);
    setRequestError(null);
    setRequestStatus(null);

    try {
      const nextRequest = await createDataRequest({
        recipientPhone: normalizedPhone,
        carrier: requestCarrier,
        productName: selectedRequestProduct.name,
        bundleLabel: selectedRequestProduct.bundleLabel,
        amountUsd: selectedRequestProduct.amountUsd,
        serviceFeeUsd: selectedRequestProduct.serviceFeeUsd,
      });

      setRequestLink(`https://boulio.app/request/${nextRequest.requestCode}`);
      setRequestStep(5);
      setRequestStatus(t('requestLinkCreatedSuccessfully'));
      setRequestRecipientMessage(null);
      setRequestPaymentNotice(null);

      if (requestSaveRecipient) {
        await maybeSaveRecipient(
          requestRecipientName.trim(),
          normalizedPhone,
          requestCarrier,
          setRequestRecipientMessage
        );
      }
    } catch (error) {
      if (isProfileRequiredError(error)) {
        promptForProfileCompletion('request');
        return;
      }
      setRequestError(error instanceof Error ? error.message : t('requestCouldNotBeLoaded'));
    } finally {
      setRequestBusy(false);
    }
  };

  const handleCopyLink = async () => {
    if (!requestLink) {
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(requestLink);
        setRequestStatus(t('copyLinkSuccess'));
      } else {
        setRequestStatus(t('copyLinkBrowserOnly'));
      }
    } catch {
      setRequestStatus(t('copyLinkUnavailable'));
    }
  };

  const handleRequestPaymentComingSoon = async () => {
    try {
      if (!requestLink) {
        setRequestPaymentNotice(t('onlinePaymentWillBeConnectedSoon'));
        return;
      }

      const requestCode = requestLink.split('/').pop() ?? requestLink;
      const result = await createPaymentForDataRequest(requestCode);
      if (result.checkoutUrl) {
        await openCheckoutUrl(result.checkoutUrl);
        return;
      }

      setRequestPaymentNotice(result.message);
    } catch {
      setRequestPaymentNotice(t('onlinePaymentWillBeConnectedSoon'));
    }
  };

  return (
    <>
      <Modal visible={profileModalVisible} transparent animationType="fade" onRequestClose={() => setProfileModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('completeProfile')}</Text>
            <Text style={styles.modalSubtitle}>{t('completeProfileToContinue')}</Text>
            {profileLoading ? <Text style={styles.modalHelper}>{t('loadingProfile')}</Text> : null}
            {profileError ? <Text style={styles.modalError}>{profileError}</Text> : null}
            {profileMessage ? <Text style={styles.modalSuccess}>{profileMessage}</Text> : null}
            <CompleteProfileForm
              values={profileForm}
              onChange={(patch) => setProfileForm((current) => ({ ...current, ...patch }))}
              onSave={handleProfileSubmit}
              saving={profileSaving}
              submitLabel={t('saveProfile')}
              helper={t('profileRequiredForService')}
            />
            <Pressable onPress={() => setProfileModalVisible(false)} style={styles.modalCancelButton}>
              <Text style={styles.modalCancelText}>{t('cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.title}>{t('topUpHaiti')}</Text>
          <Text style={styles.subtitle}>{t('chooseAirtimeOrAnInternetBundle')}</Text>
        </View>

        <View style={styles.flowStack}>
          <View style={styles.flowHeader}>
            <View style={styles.flowHeaderText}>
              <Text style={styles.flowLabel}>{sendStepLabel}</Text>
              <Text style={styles.flowTitle}>{t('topUpHaiti')}</Text>
              <Text style={styles.flowSubtitle}>{t('chooseAirtimeOrAnInternetBundle')}</Text>
            </View>
          </View>

          {sendStep === 1 ? (
            <SectionCard title={t('chooseProduct')} subtitle={t('chooseAirtimeOrAnInternetBundle')}>
              <View style={styles.sectionStack}>
                <View style={styles.inputGroup}>
                  <TextInput
                    value={productSearch}
                    onChangeText={setProductSearch}
                    placeholder={t('searchProducts')}
                    placeholderTextColor={Colors.light.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                    style={styles.input}
                  />
                </View>
                <ChipSelector
                  value={productFilter}
                  options={productFilterOptions}
                  onChange={setProductFilter}
                  renderLabel={renderProductFilterLabel}
                />
                <View style={styles.productGrid}>
                  {filteredSendProducts.length ? (
                    filteredSendProducts.map((product) => (
                      <TopUpAmountCard
                        key={product.id}
                        product={product}
                        selected={product.id === selectedSendProductId}
                        onPress={() => {
                          setSelectedSendProductId(product.id);
                          setSendError(null);
                          setSendPaymentNotice(null);
                          setSendStep(2);
                        }}
                      />
                    ))
                  ) : productsLoading ? (
                    <Text style={styles.emptyText}>Loading products...</Text>
                  ) : activeSendProducts.length === 0 ? (
                    <Text style={styles.emptyText}>
                      Product is not ready for checkout. Please refresh and try again.
                    </Text>
                  ) : (
                    <Text style={styles.emptyText}>{t('noMatchingProducts')}</Text>
                  )}
                </View>
              </View>
            </SectionCard>
          ) : null}

          {sendStep === 2 ? (
            <SectionCard title={t('enterHaitiPhoneNumber')} subtitle={t('enterHaitiPhoneNumber')}>
              <View style={styles.sectionStack}>
                <View style={styles.inputGroup}>
                  <TextInput
                    value={sendPhoneNumber}
                          onChangeText={(value) => {
                            setSendPhoneNumber(value);
                            setSendError(null);
                            setSendPaymentNotice(null);
                          }}
                    placeholder="+509 34 12 34 56"
                    placeholderTextColor={Colors.light.muted}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    style={styles.input}
                        />
                        {sendPhoneError ? <Text style={styles.errorText}>{sendPhoneError}</Text> : null}
                      </View>
                      {sendPhoneNumber.trim() ? (
                        detectedSendCarrier ? (
                    <View style={styles.carrierConfirmationRow}>
                      <View style={styles.carrierConfirmationText}>
                        <Text style={styles.inputLabel}>{`${t('carrierDetected')}: ${detectedSendCarrier}`}</Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setSendCarrier(null);
                          setSendCarrierManual(true);
                        }}
                        style={styles.carrierChangeButton}>
                        <Text style={styles.carrierChangeText}>{t('change')}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.carrierPromptBlock}>
                      <Text style={styles.inputLabel}>{t('confirmCarrier')}</Text>
                      <Text style={styles.noteText}>{t('carrierCouldNotBeDetected')}</Text>
                    </View>
                  )
                ) : null}
                <ChipSelector value={sendCarrier} options={carrierOptions} onChange={changeSendCarrier} />
                {carrierMismatch ? (
                  <Text style={styles.warningText}>
                    {t('productCarrierMismatch', {
                      productCarrier: selectedSendProduct?.carrier ?? '',
                      detectedCarrier: detectedSendCarrier ?? confirmedSendCarrier ?? '',
                    })}
                  </Text>
                ) : null}
                {sendProductSelectionInvalid ? (
                  <Text style={styles.errorText}>
                    Product is not ready for checkout. Please refresh and try again.
                  </Text>
                ) : null}
                <View style={styles.actionRow}>
                  <PrimaryButton
                    label={t('backWithArrow')}
                    onPress={() => setSendStep(1)}
                    style={styles.actionButtonFlex}
                  />
                        <PrimaryButton
                          label={t('continueWithArrow')}
                          onPress={() => setSendStep(3)}
                          disabled={!sendPhoneValid || !selectedSendProduct || !confirmedSendCarrier || carrierMismatch}
                          style={styles.actionButtonFlex}
                        />
                      </View>
              </View>
            </SectionCard>
          ) : null}

          {sendStep === 3 ? (
            <SectionCard title={t('reviewAndPay')} subtitle={t('reviewAndPaySubtitle')}>
              <View style={styles.sectionStack}>
                <View style={styles.summaryCard}>
                  {sendReviewSummary.map((row) => (
                    <SummaryRow key={row.label} label={row.label} value={row.value} strong={row.strong} />
                  ))}
                </View>
                {sendError ? <Text style={styles.errorText}>{sendError}</Text> : null}
                {sendPaymentNotice ? <Text style={styles.noteText}>{sendPaymentNotice}</Text> : null}
                <View style={styles.actionRow}>
                  <PrimaryButton
                    label={t('backWithArrow')}
                    onPress={() => setSendStep(2)}
                    style={styles.actionButtonFlex}
                  />
                  <PrimaryButton
                    label={t('continueToPaymentWithArrow')}
                    onPress={() => void confirmSendOrder()}
                    disabled={sendSubmitting || !selectedSendProduct || !sendPhoneValid || !confirmedSendCarrier || carrierMismatch}
                    style={styles.actionButtonFlex}
                  />
                </View>
              </View>
            </SectionCard>
          ) : null}
        </View>
      </ScrollView>

      <Modal visible={requestModalVisible} transparent animationType="slide" onRequestClose={() => router.replace('/topup')}>
        <View style={styles.requestModalOverlay}>
          <View style={styles.requestModalSheet}>
            <ScrollView contentContainerStyle={styles.requestModalContainer} showsVerticalScrollIndicator={false}>
              <View style={styles.flowStack}>
                <View style={styles.flowHeader}>
                  <View style={styles.flowHeaderText}>
                    <Text style={styles.flowLabel}>{requestStepLabel}</Text>
                    <Text style={styles.flowTitle}>{t('requestSocialData')}</Text>
                    <Text style={styles.flowSubtitle}>{t('createLinkFamilyCanPay')}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.replace('/topup')}
                    style={styles.modalHeaderCloseButton}>
                    <Text style={styles.modalHeaderCloseText}>{t('close')}</Text>
                  </Pressable>
                </View>

                {requestStep === 1 ? (
                  <SectionCard title={t('chooseCarrier')} subtitle={t('chooseCarrier')}>
                    <View style={styles.sectionStack}>
                      <ChipSelector value={requestCarrier} options={carrierOptions} onChange={changeRequestCarrier} />
                      <View style={styles.actionRow}>
                        <PrimaryButton
                          label={t('backWithArrow')}
                          onPress={() => router.replace('/topup')}
                          style={styles.actionButtonFlex}
                        />
                        <PrimaryButton
                          label={t('continueWithArrow')}
                          onPress={() => setRequestStep(2)}
                          style={styles.actionButtonFlex}
                        />
                      </View>
                    </View>
                  </SectionCard>
                ) : null}

                {requestStep === 2 ? (
                  <SectionCard title={t('socialData')} subtitle={t('chooseSocialDataProducts')}>
                    <View style={styles.sectionStack}>
                      <View style={styles.inputGroup}>
                        <TextInput
                          value={requestProductSearch}
                          onChangeText={setRequestProductSearch}
                          placeholder={t('searchProducts')}
                          placeholderTextColor={Colors.light.muted}
                          autoCapitalize="none"
                          autoCorrect={false}
                          clearButtonMode="while-editing"
                          style={styles.input}
                        />
                      </View>
                      <View style={styles.productGrid}>
                        {filteredRequestProducts.length ? (
                          filteredRequestProducts.map((product) => (
                            <TopUpAmountCard
                              key={product.id}
                              product={product}
                              selected={product.id === selectedRequestProductId}
                              onPress={() => {
                                setSelectedRequestProductId(product.id);
                                setRequestCarrier(product.carrier);
                                setRequestError(null);
                                setRequestStep(3);
                              }}
                            />
                          ))
                        ) : (
                          <Text style={styles.emptyText}>{t('noMatchingProducts')}</Text>
                        )}
                      </View>
                    </View>
                  </SectionCard>
                ) : null}

                {requestStep === 3 ? (
                  <SectionCard title={t('enterHaitiPhoneNumber')} subtitle={t('enterHaitiPhoneNumber')}>
                    <View style={styles.sectionStack}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>{t('phoneNumber')}</Text>
                        <TextInput
                          value={requestPhoneNumber}
                          onChangeText={(value) => {
                            setRequestPhoneNumber(value);
                            setRequestSelectedRecipientId(null);
                            setRequestError(null);
                          }}
                          placeholder="e.g. (509) 34-12-44-11"
                          placeholderTextColor={Colors.light.muted}
                          keyboardType="phone-pad"
                          textContentType="telephoneNumber"
                          style={styles.input}
                        />
                        {requestPhoneError ? <Text style={styles.errorText}>{requestPhoneError}</Text> : null}
                      </View>
                      {requestRecipientMessage ? <Text style={styles.noteText}>{requestRecipientMessage}</Text> : null}
                      <View style={styles.actionRow}>
                        <PrimaryButton
                          label={t('backWithArrow')}
                          onPress={() => setRequestStep(2)}
                          style={styles.actionButtonFlex}
                        />
                        <PrimaryButton
                          label={t('continueWithArrow')}
                          onPress={() => setRequestStep(4)}
                          disabled={!requestPhoneValid}
                          style={styles.actionButtonFlex}
                        />
                      </View>
                    </View>
                  </SectionCard>
                ) : null}

                {requestStep === 4 ? (
                  <SectionCard title={t('reviewRequest')} subtitle={t('familyReviewBeforeContinuing')}>
                    <View style={styles.sectionStack}>
                      <View style={styles.summaryCard}>
                        {requestReviewSummary.map((row) => (
                          <SummaryRow key={row.label} label={row.label} value={row.value} strong={row.strong} />
                        ))}
                      </View>
                      {requestEditNote ? <Text style={styles.editNoteText}>{requestEditNote}</Text> : null}
                      {!isSignedIn ? (
                        <>
                          <Text style={styles.warningText}>{t('signInRequiredBeforeRequestLink')}</Text>
                          <PrimaryButton label={t('goToAccount')} onPress={() => router.push('/account')} />
                        </>
                      ) : (
                        <>
                          {requestError ? <Text style={styles.errorText}>{requestError}</Text> : null}
                          <View style={styles.actionRow}>
                            <PrimaryButton
                              label={t('backWithArrow')}
                              onPress={() => setRequestStep(3)}
                              style={styles.actionButtonFlex}
                            />
                            <PrimaryButton
                              label={t('createRequestLink')}
                              onPress={createRequest}
                              disabled={requestBusy || !selectedRequestProduct || !requestPhoneValid}
                              style={styles.actionButtonFlex}
                            />
                          </View>
                        </>
                      )}
                    </View>
                  </SectionCard>
                ) : null}

                {requestStep === 5 ? (
                  <SectionCard title={t('requestLinkCreated')} subtitle={t('requestLinkCreatedSubtitle')}>
                    <View style={styles.sectionStack}>
                      <Text style={styles.bodyText}>{t('requestLinkReadyShare')}</Text>
                      {requestLink ? <Text style={styles.linkText}>{requestLink}</Text> : null}
                      {requestStatus ? <Text style={styles.noteText}>{requestStatus}</Text> : null}
                      {requestRecipientMessage ? <Text style={styles.noteText}>{requestRecipientMessage}</Text> : null}
                      {requestPaymentNotice ? <Text style={styles.noteText}>{requestPaymentNotice}</Text> : null}
                      <Text style={styles.editNoteText}>{t('onlinePaymentWillBeConnectedSoon')}</Text>
                      <View style={styles.shareGrid}>
                        <SharePill label={t('whatsapp')} onPress={() => setRequestStatus('WhatsApp share placeholder.')} />
                        <SharePill label={t('sms')} onPress={() => setRequestStatus('SMS share placeholder.')} />
                        <SharePill label={t('messenger')} onPress={() => setRequestStatus('Messenger share placeholder.')} />
                        <SharePill label={t('copyLink')} onPress={handleCopyLink} />
                      </View>
                      <PrimaryButton label={t('copyLink')} onPress={handleCopyLink} />
                      <PrimaryButton label={t('createAnotherRequestButton')} onPress={createAnotherRequest} />
                    </View>
                  </SectionCard>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function FlowChoiceCard({
  eyebrow,
  title,
  body,
  onPress,
}: {
  eyebrow: string;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.choiceCard, pressed && styles.choiceCardPressed]}>
      <Text style={styles.choiceEyebrow}>{eyebrow}</Text>
      <Text style={styles.choiceTitle}>{title}</Text>
      <Text style={styles.choiceBody}>{body}</Text>
    </Pressable>
  );
}

function SavedRecipientsPicker({
  title,
  subtitle,
  recipients,
  loading,
  selectedRecipientId,
  onSelect,
}: {
  title: string;
  subtitle: string;
  recipients: SavedRecipientRecord[];
  loading: boolean;
  selectedRecipientId: string | null;
  onSelect: (recipient: SavedRecipientRecord) => void;
}) {
  return (
    <View style={styles.savedRecipientsBlock}>
      <View style={styles.savedRecipientsHeader}>
        <View style={styles.savedRecipientsHeaderText}>
          <Text style={styles.savedRecipientsTitle}>{title}</Text>
          <Text style={styles.savedRecipientsSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {loading ? <Text style={styles.loadingText}>{t('loadingSavedRecipients')}</Text> : null}
      {!loading && recipients.length === 0 ? (
        <Text style={styles.emptyText}>{t('noSavedRecipients')}</Text>
      ) : null}
      <View style={styles.savedRecipientList}>
        {recipients.map((recipient) => {
          const selected = recipient.id === selectedRecipientId;
          return (
            <Pressable
              key={recipient.id}
              accessibilityRole="button"
              onPress={() => onSelect(recipient)}
              style={({ pressed }) => [
                styles.savedRecipientRow,
                selected && styles.savedRecipientRowSelected,
                pressed && styles.savedRecipientRowPressed,
              ]}>
              <View style={styles.savedRecipientCopy}>
                <Text style={styles.savedRecipientName}>{recipient.name}</Text>
                <Text style={styles.savedRecipientMeta}>
                  {recipient.carrier} · {recipient.phoneNumber}
                </Text>
              </View>
              <Text style={[styles.savedRecipientAction, selected && styles.savedRecipientActionSelected]}>
                {t('useRecipient')}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function RecipientSaveToggle({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onToggle} style={styles.saveToggleRow}>
      <View style={[styles.saveToggleBox, checked && styles.saveToggleBoxChecked]}>
        {checked ? <Text style={styles.saveToggleMark}>✓</Text> : null}
      </View>
      <Text style={styles.saveToggleLabel}>{label}</Text>
    </Pressable>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, strong && styles.summaryValueStrong]}>{value}</Text>
    </View>
  );
}

function SharePill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.sharePill}>
      <Text style={styles.shareText}>{label}</Text>
    </Pressable>
  );
}

function renderProductFilterLabel(value: ProductFilter) {
  if (value === 'All') {
    return t('all');
  }

  return value === 'airtime' ? t('airtime') : t('socialData');
}

function renderProductTypeLabel(value: SendProductType) {
  return value === 'airtime' ? t('airtime') : t('socialData');
}

function dedupeAirtimeProducts(products: TopUpProduct[]) {
  const seenAirtimeAmounts = new Set<number>();
  const nextProducts: TopUpProduct[] = [];

  for (const product of products) {
    if (product.productType !== 'airtime') {
      nextProducts.push(product);
      continue;
    }

    if (seenAirtimeAmounts.has(product.amountUsd)) {
      continue;
    }

    seenAirtimeAmounts.add(product.amountUsd);
    nextProducts.push(product);
  }

  return nextProducts;
}

function resolveSelectedTopUpProduct(
  products: TopUpProduct[],
  selectedProduct: TopUpProduct | null,
  confirmedCarrier: TopUpCarrier | null
) {
  if (!selectedProduct || selectedProduct.productType !== 'airtime' || !confirmedCarrier) {
    return selectedProduct;
  }

  return (
    products.find(
      (product) =>
        product.active &&
        product.productType === 'airtime' &&
        product.carrier === confirmedCarrier &&
        product.amountUsd === selectedProduct.amountUsd
    ) ?? selectedProduct
  );
}

function modeSubtitle(mode: UserMode) {
  return mode === 'diaspora_supporter'
    ? 'Diaspora Supporter mode keeps the focus on family support.'
    : 'Haiti User mode keeps the focus on requests and results.';
}

function formatCurrency(value: number) {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.light.text,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  carrierConfirmationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  carrierConfirmationText: {
    flex: 1,
  },
  carrierPromptBlock: {
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  carrierChangeButton: {
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
  carrierChangeText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '600',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
  backButtonText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  actionButtonFlex: {
    flex: 1,
    width: 'auto',
  },
  editNoteText: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.warning,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.warning,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  loadingText: {
    marginTop: Spacing.sm,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  entryGrid: {
    gap: Spacing.sm,
  },
  choiceCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    gap: 6,
  },
  choiceCardPressed: {
    opacity: 0.92,
  },
  choiceEyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.light.textSecondary,
  },
  choiceTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    color: Colors.light.text,
  },
  choiceBody: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  flowStack: {
    gap: Spacing.md,
  },
  flowHeader: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  flowHeaderText: {
    flex: 1,
    gap: 4,
  },
  modalHeaderCloseButton: {
    paddingHorizontal: 0,
    paddingVertical: 4,
    marginTop: 2,
  },
  modalHeaderCloseText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '600',
  },
  flowLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.light.textSecondary,
    fontWeight: '600',
    letterSpacing: 0.9,
  },
  flowTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
    color: Colors.light.text,
  },
  flowSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.48)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  modalCard: {
    borderRadius: Radius.xl,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    color: Colors.light.text,
  },
  modalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  modalHelper: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
  },
  modalError: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.danger,
    fontWeight: '600',
  },
  modalSuccess: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.success,
    fontWeight: '600',
  },
  modalCancelButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  modalCancelText: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  requestModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.48)',
    justifyContent: 'flex-end',
  },
  requestModalSheet: {
    maxHeight: '92%',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    backgroundColor: Colors.light.background,
    overflow: 'hidden',
  },
  requestModalContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  sectionStack: {
    gap: Spacing.sm,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  input: {
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.light.text,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  summaryCard: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.light.surfaceAlt,
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
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.muted,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  summaryValueStrong: {
    color: Colors.light.text,
  },
  savedRecipientsBlock: {
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  savedRecipientsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  savedRecipientsHeaderText: {
    flex: 1,
    gap: 2,
  },
  savedRecipientsTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.light.text,
  },
  savedRecipientsSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
  },
  savedRecipientList: {
    gap: Spacing.xs,
  },
  savedRecipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surfaceMuted,
  },
  savedRecipientRowSelected: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primarySoft,
  },
  savedRecipientRowPressed: {
    opacity: 0.92,
  },
  savedRecipientCopy: {
    flex: 1,
    gap: 2,
  },
  savedRecipientName: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '600',
  },
  savedRecipientMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.light.textSecondary,
  },
  savedRecipientAction: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.primary,
    fontWeight: '600',
  },
  savedRecipientActionSelected: {
    color: Colors.light.primaryPressed,
  },
  saveToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  saveToggleBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveToggleBoxChecked: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primary,
  },
  saveToggleMark: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
  },
  saveToggleLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '500',
  },
  linkText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  shareGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  sharePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    minHeight: 42,
    borderRadius: Radius.lg,
    backgroundColor: Colors.light.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  secondaryActionButton: {
    minHeight: 44,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.light.text,
  },
  shareText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.light.text,
  },
});
