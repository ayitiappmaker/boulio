import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
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
import { t, useLanguage, type TranslationKey } from '@/lib/i18n';
import { getCurrentSession, subscribeToSessionChanges } from '@/lib/auth';
import { createDataRequest } from '@/lib/dataRequests';
import { createPendingTopUpOrder, type TopUpOrderRecord } from '@/lib/topupOrders';
import { formatServiceTotal } from '@/lib/paymentFlow';
import { createPaymentForTopUpOrder, openCheckoutUrl } from '@/lib/payments';
import { fetchMyProfile, isProfileRequiredError, upsertMyProfile, type ProfileRecord } from '@/lib/profile';
import { getStoredUserMode, subscribeToUserModeChanges } from '@/lib/userMode';
import {
  getRecipientReceivesLabel,
  hasAuthoritativeAirtimeDestination,
  isRecipientBenefitShownAfterConfirmation,
} from '@/lib/topupProductDisplay';
import {
  detectHaitiCarrierFromPhone,
  isValidHaitiMobilePhone,
  normalizeHaitiPhoneForFulfillment,
} from '@/lib/carrierDetection';
import type { Session } from '@supabase/supabase-js';
import type { TopUpCarrier, TopUpProduct, UserMode } from '@/lib/types';
import { analyticsCarrier, trackAnalyticsEvent } from '@/lib/analytics';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SendStep = 1 | 2 | 3;
type RequestStep = 1 | 2 | 3 | 4 | 5;
type SendProductType = 'airtime' | 'data';
type PendingProfileAction = 'send' | 'request' | null;
type LocalizedMessage = TranslationKey | {
  key: TranslationKey;
  values: Record<string, string | number>;
};

const carrierOptions: readonly TopUpCarrier[] = ['Digicel', 'Natcom'];

const emptyProfileForm: ProfileFormValues = {
  fullName: '',
  phoneNumber: '',
  country: '',
  userMode: 'haiti_user',
};

export default function TopUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    mode?: string | string[];
    recipient?: string | string[];
    carrier?: string | string[];
    productId?: string | string[];
  }>();
  useLanguage();
  const [session, setSession] = useState<Session | null>(null);
  const [products, setProducts] = useState<TopUpProduct[]>(() => (__DEV__ ? mockTopUpProducts : []));
  const [productsLoading, setProductsLoading] = useState(true);
  const [savedRecipients, setSavedRecipients] = useState<SavedRecipientRecord[]>([]);
  const [savedRecipientsLoading, setSavedRecipientsLoading] = useState(false);
  const [userMode, setUserMode] = useState<UserMode>(() => getStoredUserMode());
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileMessage, setProfileMessage] = useState<TranslationKey | null>(null);
  const [profileError, setProfileError] = useState<TranslationKey | null>(null);
  const [pendingProfileAction, setPendingProfileAction] = useState<PendingProfileAction>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormValues>(emptyProfileForm);

  const [sendStep, setSendStep] = useState<SendStep>(1);
  const [sendCarrier, setSendCarrier] = useState<TopUpCarrier | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const requestedMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const sendProductType: SendProductType = requestedMode === 'data' ? 'data' : 'airtime';
  const [sendRecipientName, setSendRecipientName] = useState('');
  const [sendPhoneNumber, setSendPhoneNumber] = useState('');
  const [senderPhoneNumber, setSenderPhoneNumber] = useState('');
  const [selectedSendProductId, setSelectedSendProductId] = useState<string | null>(null);
  const [sendSelectedRecipientId, setSendSelectedRecipientId] = useState<string | null>(null);
  const [sendSaveRecipient, setSendSaveRecipient] = useState(false);
  const [sendRecipientMessage, setSendRecipientMessage] = useState<string | null>(null);
  const [sendOrder, setSendOrder] = useState<TopUpOrderRecord | null>(null);
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const [sendError, setSendError] = useState<LocalizedMessage | null>(null);

  const [requestStep, setRequestStep] = useState<RequestStep>(1);
  const [requestCarrier, setRequestCarrier] = useState<TopUpCarrier | null>(null);
  const [requestCarrierManual, setRequestCarrierManual] = useState(false);
  const [requestProductType, setRequestProductType] = useState<SendProductType>('data');
  const [requestRecipientName, setRequestRecipientName] = useState('');
  const [requestPhoneNumber, setRequestPhoneNumber] = useState('');
  const [selectedRequestProductId, setSelectedRequestProductId] = useState<string | null>(null);
  const [requestProductSearch, setRequestProductSearch] = useState('');
  const [requestSelectedRecipientId, setRequestSelectedRecipientId] = useState<string | null>(null);
  const [requestSaveRecipient, setRequestSaveRecipient] = useState(false);
  const [requestRecipientMessage, setRequestRecipientMessage] = useState<TranslationKey | null>(null);
  const [requestLink, setRequestLink] = useState<string | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<TranslationKey | null>(null);
  const [requestStatus, setRequestStatus] = useState<TranslationKey | null>(null);
  const [requestEditNote, setRequestEditNote] = useState<string | null>(null);
  const [sendPaymentNotice, setSendPaymentNotice] = useState<TranslationKey | null>(null);
  const [sendCarrierManual, setSendCarrierManual] = useState(false);

  const requestModalVisible = requestedMode === 'request';
  const routeRecipient = firstParam(params.recipient);
  const routeCarrier = firstParam(params.carrier);
  const routeProductId = firstParam(params.productId);

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
          setProducts(__DEV__ ? mockTopUpProducts : []);
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
    if (
      productsLoading ||
      !routeRecipient ||
      !routeProductId ||
      !isValidHaitiMobilePhone(routeRecipient) ||
      (routeCarrier !== 'Digicel' && routeCarrier !== 'Natcom')
    ) {
      return;
    }

    const matchingProduct = products.find(
      (product) =>
        product.id === routeProductId &&
        product.active &&
        product.carrier === routeCarrier &&
        product.productType === sendProductType &&
        hasAuthoritativeAirtimeDestination(product) &&
        isUuid(product.id)
    );

    if (!matchingProduct) {
      return;
    }

    setSendPhoneNumber(routeRecipient);
    setSendCarrier(routeCarrier);
    setSendCarrierManual(true);
    setSelectedSendProductId(matchingProduct.id);
    setSendError(null);
    setSendPaymentNotice(null);
    setSendStep(3);
  }, [products, productsLoading, routeCarrier, routeProductId, routeRecipient, sendProductType]);

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
  const sendPhoneValid = isValidHaitiMobilePhone(sendPhoneNumber);
  const senderPhoneValid = isValidInternationalPhone(senderPhoneNumber);
  const detectedSendCarrier = sendPhoneValid ? detectHaitiCarrierFromPhone(sendPhoneNumber) : null;
  const confirmedSendCarrier = sendCarrier ?? detectedSendCarrier;
  const filteredSendProducts = useMemo(() => {
    const normalizedSearch = productSearch.trim().toLowerCase();

    return displaySendProducts.filter((product) => {
      if (product.productType !== sendProductType || (confirmedSendCarrier && product.carrier !== confirmedSendCarrier)) {
        return false;
      }

      if (!hasAuthoritativeAirtimeDestination(product)) {
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
  }, [confirmedSendCarrier, displaySendProducts, productSearch, sendProductType]);
  const requestProducts = useMemo(
    () => products.filter((product) => {
      if (!product.active || !isUuid(product.id)) return false;
      return product.productType === 'data' || hasAuthoritativeAirtimeDestination(product);
    }),
    [products]
  );
  const filteredRequestProducts = useMemo(() => {
    const normalizedSearch = requestProductSearch.trim().toLowerCase();

    return requestProducts.filter((product) => {
      if (product.productType !== requestProductType) {
        return false;
      }
      if (requestCarrier && product.carrier !== requestCarrier) {
        return false;
      }
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
  }, [requestCarrier, requestProductSearch, requestProductType, requestProducts]);

  const selectedSendProductCandidate =
    products.find((product) => product.id === selectedSendProductId && product.active) ?? null;
  const selectedSendProductIdIsUuid = Boolean(
    selectedSendProductCandidate && isUuid(selectedSendProductCandidate.id)
  );
  const selectedRequestProduct =
    requestProducts.find((product) => product.id === selectedRequestProductId) ?? null;
  const selectedSendProduct =
    selectedSendProductIdIsUuid
      ? resolveSelectedTopUpProduct(activeSendProducts, selectedSendProductCandidate, confirmedSendCarrier)
      : null;
  const sendProductSelectionInvalid = Boolean(selectedSendProductCandidate && !selectedSendProductIdIsUuid);
  const carrierMismatch = Boolean(
    selectedSendProduct && confirmedSendCarrier && selectedSendProduct.carrier !== confirmedSendCarrier
  );
  const requestPhoneValid = isValidHaitiMobilePhone(requestPhoneNumber);
  const detectedRequestCarrier = requestPhoneValid ? detectHaitiCarrierFromPhone(requestPhoneNumber) : null;
  const sendPhoneError = sendPhoneNumber.trim() && !sendPhoneValid ? t('invalidHaitiMobileNumber') : null;
  const requestPhoneError = requestPhoneNumber.trim() && !requestPhoneValid ? t('invalidHaitiMobileNumber') : null;

  const resetSendFlow = () => {
    setSendStep(1);
    setSendCarrier(null);
    setSendCarrierManual(false);
    setProductSearch('');
    setSendPhoneNumber('');
    setSenderPhoneNumber('');
    setSelectedSendProductId(null);
    setSendPaymentNotice(null);
    setSendOrder(null);
    setSendSubmitting(false);
    setSendError(null);
  };

  const resetRequestFlow = () => {
    setRequestStep(1);
    setRequestCarrier(null);
    setRequestCarrierManual(false);
    setRequestProductType('data');
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
    setProfileError('completeProfileToContinue');
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
      setProfileError('profileRequiredForService');
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const nextProfile = await upsertMyProfile(profileForm);
      setProfile(nextProfile);
      setProfileForm(profileToFormValues(nextProfile));
      setProfileMessage('profileSaved');
      setProfileModalVisible(false);

      const nextAction = pendingProfileAction;
      setPendingProfileAction(null);

      if (nextAction === 'send') {
        await confirmSendOrder();
      }
    } catch (error) {
      setProfileError('profileSaveFailed');
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
    setRequestCarrierManual(true);
    setSelectedRequestProductId(null);
    setRequestSelectedRecipientId(null);
    setRequestError(null);
  };

  useEffect(() => {
    if (!requestPhoneNumber.trim() || !isValidHaitiMobilePhone(requestPhoneNumber)) {
      setRequestCarrier(null);
      setRequestCarrierManual(false);
      return;
    }

    const detectedCarrier = detectHaitiCarrierFromPhone(requestPhoneNumber);
    if (detectedCarrier && !requestCarrierManual) {
      setRequestCarrier(detectedCarrier);
    } else if (!detectedCarrier && !requestCarrierManual) {
      setRequestCarrier(null);
    }
  }, [requestCarrierManual, requestPhoneNumber]);

  const createAnotherRequest = () => {
    resetRequestFlow();
  };

  useEffect(() => {
    if (requestModalVisible) {
      resetRequestFlow();
    }
  }, [requestModalVisible]);

  const selectSendRecipient = (recipient: SavedRecipientRecord) => {
    setSendSelectedRecipientId(recipient.id);
    setSendRecipientName(recipient.name);
    setSendPhoneNumber(recipient.phoneNumber);
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
    onMessage: (message: TranslationKey) => void
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

      onMessage(result.created ? 'recipientSaved' : 'recipientAlreadySaved');
      setSavedRecipients((currentRecipients) => {
        const nextRecipients = currentRecipients.filter((recipient) => recipient.id !== result.recipient.id);
        return [result.recipient, ...nextRecipients];
      });
    } catch {
      onMessage('recipientSaved');
    }
  };

  const isSignedIn = Boolean(session?.user?.id);

  const sendRecipientBenefit = selectedSendProduct
    ? getRecipientReceivesLabel(selectedSendProduct)
    : null;
  const showSendRecipientBenefit =
    Boolean(sendRecipientBenefit) &&
    selectedSendProduct != null &&
    !isRecipientBenefitShownAfterConfirmation(selectedSendProduct) &&
    hasAuthoritativeAirtimeDestination(selectedSendProduct);

  const requestReviewSummary = selectedRequestProduct
    ? [
        { label: t('product'), value: selectedRequestProduct.name },
        { label: t('recipientReceives'), value: getRecipientReceivesLabel(selectedRequestProduct) },
        { label: t('carrier'), value: requestCarrier ?? selectedRequestProduct.carrier },
        { label: t('phoneNumber'), value: requestPhoneNumber },
        { label: t('servicePrice'), value: formatServiceTotal(selectedRequestProduct.amountUsd) },
        { label: t('serviceFee'), value: formatServiceTotal(selectedRequestProduct.serviceFeeUsd) },
        { label: t('serviceTotal'), value: formatServiceTotal(selectedRequestProduct.totalUsd), strong: true },
      ]
    : [];

  const sendStepLabel = [t('recipient'), t('product'), t('reviewAndPay')][sendStep - 1];
  const requestStepLabel = [t('recipient'), t('productType'), t('product'), t('reviewRequest'), t('share')][requestStep - 1];

  const confirmSendOrder = async () => {
    if (selectedSendProductCandidate && !selectedSendProductIdIsUuid) {
      setSendError('noProductsAvailableForThisCarrierYet');
      return;
    }

    if (!selectedSendProduct) {
      setSendError('chooseAProductBeforeContinuing');
      return;
    }

    if (!hasAuthoritativeAirtimeDestination(selectedSendProduct)) {
      setSendError('noProductsAvailableForThisCarrierYet');
      return;
    }

    const normalizedPhone = normalizeHaitiPhoneForFulfillment(sendPhoneNumber);
    if (!normalizedPhone) {
      setSendError('invalidHaitiMobileNumber');
      return;
    }

    const effectiveCarrier = confirmedSendCarrier;
    if (!effectiveCarrier) {
      setSendError('confirmCarrier');
      return;
    }

    if (selectedSendProduct.carrier !== effectiveCarrier) {
      setSendError({
        key: 'productCarrierMismatch',
        values: {
          productCarrier: selectedSendProduct.carrier,
          detectedCarrier: effectiveCarrier,
        },
      });
      return;
    }

    if (!senderPhoneValid) {
      setSendError('internationalPhoneHint');
      return;
    }

    setSendSubmitting(true);
    setSendError(null);
    setSendPaymentNotice(null);

    try {
      const nextOrder = await createPendingTopUpOrder({
        productId: selectedSendProduct.id,
        recipientPhone: normalizedPhone,
        senderPhone: senderPhoneNumber.trim(),
        recipientName: null,
      });

      setSendOrder(nextOrder);
      trackAnalyticsEvent('checkout_started', {
        target_type: 'topup_order',
        carrier: analyticsCarrier(selectedSendProduct.carrier),
        price_usd: selectedSendProduct.totalUsd,
      });
      const paymentResult = await createPaymentForTopUpOrder(nextOrder.id);
      if (paymentResult.checkoutUrl) {
        setSendPaymentNotice('stripeCheckoutOpenedNotice');
        await openCheckoutUrl(paymentResult.checkoutUrl);
        return;
      }

      setSendPaymentNotice('paymentCouldNotBeStarted');
    } catch {
      setSendError('unableToCreateOrder');
    } finally {
      setSendSubmitting(false);
    }
  };

  const createRequest = async () => {
    if (!selectedRequestProduct) {
      setRequestError('chooseAProductBeforeContinuing');
      return;
    }

    const normalizedPhone = normalizeHaitiPhoneForFulfillment(requestPhoneNumber);
    if (!normalizedPhone) {
      setRequestError('invalidHaitiMobileNumber');
      return;
    }

    if (!requestCarrier || selectedRequestProduct.carrier !== requestCarrier) {
      setRequestError('confirmCarrier');
      return;
    }

    setRequestBusy(true);
    setRequestError(null);
    setRequestStatus(null);

    try {
      const nextRequest = await createDataRequest({
        productId: selectedRequestProduct.id,
        recipientPhone: normalizedPhone,
      });

      setRequestLink(`https://boulio.app/request/${nextRequest.requestCode}`);
      setRequestStep(5);
      setRequestStatus('requestLinkCreatedSuccessfully');
      setRequestRecipientMessage(null);
      trackAnalyticsEvent('request_created', {
        carrier: analyticsCarrier(nextRequest.carrier),
        price_usd: nextRequest.totalUsd,
      });

      if (isSignedIn && requestSaveRecipient) {
        await maybeSaveRecipient(
          requestRecipientName.trim(),
          normalizedPhone,
          requestCarrier,
          setRequestRecipientMessage
        );
      }
    } catch {
      setRequestError('requestCouldNotBeLoaded');
    } finally {
      setRequestBusy(false);
    }
  };

  const getRequestShareMessage = () => t('requestShareMessage', { link: requestLink ?? '' });

  const handleShare = async () => {
    if (!requestLink) return;

    try {
      const result = await Share.share({ message: getRequestShareMessage(), url: requestLink });
      if (result.action === Share.sharedAction) {
        trackAnalyticsEvent('request_shared', { method: 'native_share' });
      }
    } catch {
      setRequestStatus('sharingUnavailable');
    }
  };

  const handleWhatsAppShare = async () => {
    if (!requestLink) return;

    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(getRequestShareMessage())}`;
    try {
      if (await Linking.canOpenURL(whatsappUrl)) {
        await Linking.openURL(whatsappUrl);
        trackAnalyticsEvent('request_shared', { method: 'whatsapp' });
      } else {
        await handleShare();
      }
    } catch {
      await handleShare();
    }
  };

  const handleCopyLink = async () => {
    if (!requestLink) {
      return;
    }

    try {
      await Clipboard.setStringAsync(requestLink);
      trackAnalyticsEvent('request_shared', { method: 'copy_link' });
      setRequestStatus('copyLinkSuccess');
    } catch {
      setRequestStatus('copyLinkUnavailable');
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
            {profileError ? <Text style={styles.modalError}>{t(profileError)}</Text> : null}
            {profileMessage ? <Text style={styles.modalSuccess}>{t(profileMessage)}</Text> : null}
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
        {sendStep !== 3 ? (
          <View style={styles.hero}>
            <Text style={styles.title}>{sendProductType === 'airtime' ? t('phoneCredit') : t('dataBundle')}</Text>
            <Text style={styles.subtitle}>Haiti +509</Text>
          </View>
        ) : null}

        <View style={styles.flowStack}>
          {sendStep !== 3 ? (
            <>
              <ProgressIndicator step={sendStep} />
              <View style={styles.flowHeader}>
                <View style={styles.flowHeaderText}>
                  <Text style={styles.flowLabel}>{sendStepLabel}</Text>
                </View>
              </View>
            </>
          ) : null}

          {sendStep === 2 ? (
            <SectionCard title={sendProductType === 'airtime' ? t('chooseAmount') : t('chooseDataPackage')} subtitle={confirmedSendCarrier ?? t('recipient')}>
              <View style={styles.sectionStack}>
                <Pressable accessibilityRole="button" onPress={() => setSendStep(1)} style={styles.backButton}>
                  <Text style={styles.backButtonText}>{t('backWithArrow')}</Text>
                </Pressable>
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
                <View style={styles.productGrid}>
                  {filteredSendProducts.length ? (
                    filteredSendProducts.map((product) => (
                      <TopUpAmountCard
                        key={product.id}
                        product={product}
                        selected={product.id === selectedSendProductId}
                        onPress={() => {
                          trackAnalyticsEvent('topup_product_selected', {
                            flow: sendProductType === 'airtime' ? 'phone_credit' : 'data_bundle',
                            carrier: analyticsCarrier(product.carrier),
                            product_type: product.productType,
                            product_id: product.id,
                            price_usd: product.totalUsd,
                          });
                          setSelectedSendProductId(product.id);
                          setSendError(null);
                          setSendPaymentNotice(null);
                          setSendStep(3);
                        }}
                      />
                    ))
                  ) : productsLoading ? (
                    <Text style={styles.emptyText}>{t('loadingProducts')}</Text>
                  ) : !isSupabaseConfigured && !__DEV__ ? (
                    <Text style={styles.emptyText}>
                      {t('noProductsAvailableForThisCarrierYet')}
                    </Text>
                  ) : activeSendProducts.length === 0 ? (
                    <Text style={styles.emptyText}>{t('noProductsAvailableForThisCarrierYet')}</Text>
                  ) : (
                    <Text style={styles.emptyText}>{t('noMatchingProducts')}</Text>
                  )}
                </View>
              </View>
            </SectionCard>
          ) : null}

          {sendStep === 1 ? (
            <SectionCard title={t('recipient')} subtitle="Haiti +509">
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
                {!detectedSendCarrier || sendCarrierManual ? (
                  <ChipSelector value={sendCarrier} options={carrierOptions} onChange={changeSendCarrier} />
                ) : null}
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
                    {t('noProductsAvailableForThisCarrierYet')}
                  </Text>
                ) : null}
                <View style={styles.actionRow}>
                  <PrimaryButton
                    label={t('backWithArrow')}
                    onPress={() => router.back()}
                    style={styles.actionButtonFlex}
                  />
                        <PrimaryButton
                          label={t('continueWithArrow')}
                          onPress={() => {
                            if (confirmedSendCarrier) {
                              trackAnalyticsEvent('recipient_phone_valid', {
                                flow: sendProductType === 'airtime' ? 'phone_credit' : 'data_bundle',
                                carrier: analyticsCarrier(confirmedSendCarrier),
                              });
                            }
                            setSendStep(2);
                          }}
                          disabled={!sendPhoneValid || !confirmedSendCarrier}
                          style={styles.actionButtonFlex}
                        />
                      </View>
              </View>
            </SectionCard>
          ) : null}

          {sendStep === 3 ? (
            <View style={styles.sendReviewSection}>
              <Text style={styles.sendReviewTitle}>{t('reviewAndPay')}</Text>
              {selectedSendProduct ? (
                <View style={styles.sendReviewCard}>
                  <View style={styles.sendRecipientBlock}>
                    <Text style={styles.sendRecipientPhone}>{formatHaitiPhoneForDisplay(sendPhoneNumber)}</Text>
                    <Text style={styles.sendRecipientCarrier}>
                      {confirmedSendCarrier ?? selectedSendProduct.carrier}
                    </Text>
                  </View>
                  {showSendRecipientBenefit && sendRecipientBenefit ? (
                    <SummaryRow
                      label={selectedSendProduct.productType === 'data' ? t('bundle') : t('recipientGets')}
                      value={sendRecipientBenefit}
                    />
                  ) : null}
                  <SummaryRow
                    label={selectedSendProduct.productType === 'airtime' ? t('topUp') : t('price')}
                    value={formatServiceTotal(selectedSendProduct.amountUsd)}
                  />
                  <SummaryRow
                    label={t('serviceFee')}
                    value={formatServiceTotal(selectedSendProduct.serviceFeeUsd)}
                  />
                  <View style={styles.sendReviewDivider} />
                  <SummaryRow
                    label={t('total')}
                    value={formatServiceTotal(selectedSendProduct.totalUsd)}
                    strong
                  />
                  <View style={styles.senderPhoneGroup}>
                    <Text style={styles.inputLabel}>{t('yourMobileNumber')}</Text>
                    <TextInput
                      value={senderPhoneNumber}
                      onChangeText={(value) => {
                        setSenderPhoneNumber(value);
                        setSendError(null);
                        setSendPaymentNotice(null);
                      }}
                      placeholder="+1 812 555 0123"
                      placeholderTextColor={Colors.light.muted}
                      keyboardType="phone-pad"
                      textContentType="telephoneNumber"
                      autoComplete="tel"
                      style={styles.input}
                    />
                    {senderPhoneNumber.trim() && !senderPhoneValid ? (
                      <Text style={styles.errorText}>{t('internationalPhoneHint')}</Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
              <View style={styles.sectionStack}>
                {sendError ? <Text style={styles.errorText}>{translateMessage(sendError)}</Text> : null}
                {sendPaymentNotice ? <Text style={styles.noteText}>{t(sendPaymentNotice)}</Text> : null}
                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSendStep(2)}
                    style={[styles.secondaryActionButton, styles.actionButtonFlex]}>
                    <Text style={styles.secondaryActionText}>{t('back')}</Text>
                  </Pressable>
                  <PrimaryButton
                    label={selectedSendProduct ? t('payAmount', { amount: formatServiceTotal(selectedSendProduct.totalUsd) }) : t('pay')}
                    onPress={() => void confirmSendOrder()}
                    disabled={sendSubmitting || !selectedSendProduct || !sendPhoneValid || !senderPhoneValid || !confirmedSendCarrier || carrierMismatch}
                    style={styles.actionButtonFlex}
                  />
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Modal visible={requestModalVisible} transparent animationType="slide" onRequestClose={() => router.back()}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.requestModalOverlay}>
          <View style={styles.requestModalSheet}>
            <ScrollView
              contentContainerStyle={[styles.requestModalContainer, { paddingBottom: Spacing.xxl + insets.bottom }]}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <View style={styles.flowStack}>
                <View style={styles.flowHeader}>
                  <View style={styles.flowHeaderText}>
                    <Text style={styles.flowLabel}>{requestStepLabel}</Text>
                    <Text style={styles.flowTitle}>{t('requestTopUp')}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.back()}
                    style={styles.modalHeaderCloseButton}>
                    <Text style={styles.modalHeaderCloseText}>{t('close')}</Text>
                  </Pressable>
                </View>

                {requestStep === 1 ? (
                  <SectionCard title={t('recipient')} subtitle="Haiti +509">
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
                          placeholder="+509 34 12 34 56"
                          placeholderTextColor={Colors.light.muted}
                          keyboardType="phone-pad"
                          textContentType="telephoneNumber"
                          style={styles.input}
                        />
                        {requestPhoneError ? <Text style={styles.errorText}>{requestPhoneError}</Text> : null}
                      </View>
                      {requestPhoneNumber.trim() ? (
                        detectedRequestCarrier ? (
                          <View style={styles.carrierConfirmationRow}>
                            <Text style={styles.inputLabel}>{`${t('carrierDetected')}: ${detectedRequestCarrier}`}</Text>
                            <Pressable onPress={() => setRequestCarrierManual(true)} style={styles.carrierChangeButton}>
                              <Text style={styles.carrierChangeText}>{t('change')}</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Text style={styles.noteText}>{t('carrierCouldNotBeDetected')}</Text>
                        )
                      ) : null}
                      {!detectedRequestCarrier || requestCarrierManual ? (
                        <ChipSelector value={requestCarrier} options={carrierOptions} onChange={changeRequestCarrier} />
                      ) : null}
                      <View style={styles.actionRow}>
                        <PrimaryButton
                          label={t('backWithArrow')}
                          onPress={() => router.back()}
                          style={styles.actionButtonFlex}
                        />
                        <PrimaryButton
                          label={t('continueWithArrow')}
                          onPress={() => {
                            if (requestCarrier) {
                              trackAnalyticsEvent('recipient_phone_valid', {
                                flow: 'request_data',
                                carrier: analyticsCarrier(requestCarrier),
                              });
                            }
                            setRequestStep(2);
                          }}
                          disabled={!requestPhoneValid || !requestCarrier}
                          style={styles.actionButtonFlex}
                        />
                      </View>
                    </View>
                  </SectionCard>
                ) : null}

                {requestStep === 2 ? (
                  <SectionCard title={t('chooseProductShort')}>
                    <View style={styles.sectionStack}>
                      <Pressable accessibilityRole="button" onPress={() => setRequestStep(1)} style={styles.backButton}>
                        <Text style={styles.backButtonText}>{t('backWithArrow')}</Text>
                      </Pressable>
                      <ChipSelector
                        value={requestProductType}
                        options={['data', 'airtime'] as const}
                        renderLabel={(value) => value === 'data' ? t('bundle') : t('topUp')}
                        onChange={(value) => {
                          setRequestProductType(value);
                          setSelectedRequestProductId(null);
                          setRequestProductSearch('');
                          setRequestStep(3);
                        }}
                      />
                    </View>
                  </SectionCard>
                ) : null}

                {requestStep === 3 ? (
                  <SectionCard
                    title={requestProductType === 'airtime' ? t('chooseAmount') : t('chooseDataPackage')}
                    subtitle={requestCarrier ?? t('carrier')}>
                    <View style={styles.sectionStack}>
                      <Pressable accessibilityRole="button" onPress={() => setRequestStep(2)} style={styles.backButton}>
                        <Text style={styles.backButtonText}>{t('backWithArrow')}</Text>
                      </Pressable>
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
                                trackAnalyticsEvent('request_product_selected', {
                                  carrier: analyticsCarrier(product.carrier),
                                  product_id: product.id,
                                  price_usd: product.totalUsd,
                                });
                                setSelectedRequestProductId(product.id);
                                setRequestCarrier(product.carrier);
                                setRequestError(null);
                                setRequestStep(4);
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

                {requestStep === 4 ? (
                  <SectionCard title={t('reviewRequest')}>
                    <View style={styles.sectionStack}>
                      <View style={styles.summaryCard}>
                        {requestReviewSummary.map((row) => (
                          <SummaryRow key={row.label} label={row.label} value={row.value} strong={row.strong} />
                        ))}
                      </View>
                      {requestEditNote ? <Text style={styles.editNoteText}>{requestEditNote}</Text> : null}
                      {requestError ? <Text style={styles.errorText}>{t(requestError)}</Text> : null}
                      <View style={styles.actionRow}>
                        <PrimaryButton
                          label={t('backWithArrow')}
                          onPress={() => setRequestStep(3)}
                          style={styles.actionButtonFlex}
                        />
                        <PrimaryButton
                          label={t('createRequestLink')}
                          onPress={() => void createRequest()}
                          disabled={requestBusy || !selectedRequestProduct || !requestPhoneValid}
                          style={styles.actionButtonFlex}
                        />
                      </View>
                    </View>
                  </SectionCard>
                ) : null}

                {requestStep === 5 ? (
                  <SectionCard title={t('requestReady')}>
                    <View style={styles.sectionStack}>
                      {requestLink ? <Text style={styles.linkText}>{requestLink}</Text> : null}
                      {requestStatus ? <Text style={styles.noteText}>{t(requestStatus)}</Text> : null}
                      {requestRecipientMessage ? <Text style={styles.noteText}>{t(requestRecipientMessage)}</Text> : null}
                      <View style={styles.shareGrid}>
                        <SharePill label={t('copyLink')} onPress={handleCopyLink} />
                        <SharePill label={t('openRequest')} onPress={() => requestLink && Linking.openURL(requestLink)} />
                        <SharePill label={t('share')} onPress={() => void handleShare()} />
                      </View>
                      <PrimaryButton label={t('createAnotherRequestButton')} onPress={createAnotherRequest} />
                    </View>
                  </SectionCard>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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

function ProgressIndicator({ step }: { step: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 3, now: step }} style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${(step / 3) * 100}%` }]} />
    </View>
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

function dedupeAirtimeProducts(products: TopUpProduct[]) {
  const seenAirtimeAmounts = new Set<string>();
  const nextProducts: TopUpProduct[] = [];

  for (const product of products) {
    if (product.productType !== 'airtime') {
      nextProducts.push(product);
      continue;
    }

    const productKey = `${product.carrier}:${product.amountUsd}`;
    if (seenAirtimeAmounts.has(productKey)) {
      continue;
    }

    seenAirtimeAmounts.add(productKey);
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

function isValidInternationalPhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  return /^\+[\d\s().-]+$/.test(trimmed) && digits.length >= 8 && digits.length <= 15;
}

function translateMessage(message: LocalizedMessage) {
  return typeof message === 'string' ? t(message) : t(message.key, message.values);
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatHaitiPhoneForDisplay(value: string) {
  const digits = value.replace(/\D/g, '');
  const localNumber = digits.length === 11 && digits.startsWith('509') ? digits.slice(3) : digits;

  if (localNumber.length !== 8) {
    return value;
  }

  return `+509 ${localNumber.slice(0, 2)} ${localNumber.slice(2, 4)} ${localNumber.slice(4, 6)} ${localNumber.slice(6, 8)}`;
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
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.light.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.light.gold,
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
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.light.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: Spacing.sm,
  },
  sendReviewSection: {
    gap: Spacing.md,
  },
  sendReviewTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
    color: Colors.light.text,
  },
  sendReviewCard: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: Spacing.sm,
  },
  sendRecipientBlock: {
    gap: 2,
    paddingBottom: Spacing.xs,
  },
  sendRecipientPhone: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: Colors.light.text,
  },
  sendRecipientCarrier: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  sendReviewDivider: {
    height: 1,
    marginVertical: Spacing.xs,
    backgroundColor: Colors.light.border,
  },
  senderPhoneGroup: {
    gap: 6,
    paddingTop: Spacing.xs,
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
    color: Colors.light.primary,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
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
