import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

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
import type { Session } from '@supabase/supabase-js';
import type { TopUpCarrier, TopUpProduct, UserMode } from '@/lib/types';

type FlowMode = 'choose' | 'send' | 'request';
type SendStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type RequestStep = 1 | 2 | 3 | 4 | 5;
type SendProductType = 'airtime' | 'data';
type PendingProfileAction = 'send' | 'request' | null;

const carrierOptions: readonly TopUpCarrier[] = ['Digicel', 'Natcom'];
const sendProductTypeOptions: readonly SendProductType[] = ['airtime', 'data'];

const emptyProfileForm: ProfileFormValues = {
  fullName: '',
  phoneNumber: '',
  country: '',
  userMode: 'haiti_user',
};

export default function TopUpScreen() {
  const router = useRouter();
  useLanguage();
  const [flowMode, setFlowMode] = useState<FlowMode>('choose');
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
  const [sendCarrier, setSendCarrier] = useState<TopUpCarrier>('Digicel');
  const [sendProductType, setSendProductType] = useState<SendProductType>('airtime');
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

  const sendProducts = useMemo(
    () => products.filter((product) => product.carrier === sendCarrier && product.productType === sendProductType),
    [products, sendCarrier, sendProductType]
  );
  const requestProducts = useMemo(
    () => products.filter((product) => product.carrier === requestCarrier && product.productType === 'data'),
    [products, requestCarrier]
  );

  const selectedSendProduct = sendProducts.find((product) => product.id === selectedSendProductId) ?? null;
  const selectedRequestProduct =
    requestProducts.find((product) => product.id === selectedRequestProductId) ?? null;

  const resetSendFlow = () => {
    setSendStep(1);
    setSendCarrier('Digicel');
    setSendProductType('airtime');
    setSendRecipientName('');
    setSendPhoneNumber('');
    setSelectedSendProductId(null);
    setSendSelectedRecipientId(null);
    setSendSaveRecipient(false);
    setSendRecipientMessage(null);
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

  const resetAllFlows = () => {
    resetSendFlow();
    resetRequestFlow();
    setFlowMode('choose');
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

  const startSendFlow = () => {
    resetRequestFlow();
    setFlowMode('send');
  };

  const startRequestFlow = () => {
    resetSendFlow();
    setFlowMode('request');
  };

  const changeSendCarrier = (carrier: TopUpCarrier) => {
    setSendCarrier(carrier);
    setSelectedSendProductId(null);
    setSendSelectedRecipientId(null);
    setSendError(null);
  };

  const changeSendProductType = (productType: SendProductType) => {
    setSendProductType(productType);
    setSelectedSendProductId(null);
    setSendSelectedRecipientId(null);
    setSendError(null);
  };

  const changeRequestCarrier = (carrier: TopUpCarrier) => {
    setRequestCarrier(carrier);
    setSelectedRequestProductId(null);
    setRequestSelectedRecipientId(null);
    setRequestError(null);
  };

  const editRequest = () => {
    setRequestStep(4);
    setRequestStatus(null);
    setRequestBusy(false);
    setRequestError(null);
    if (requestLink) {
      setRequestEditNote(t('editWillCreateNewLinkNote'));
    }
  };

  const createAnotherRequest = () => {
    resetRequestFlow();
    setFlowMode('choose');
  };

  const selectSendRecipient = (recipient: SavedRecipientRecord) => {
    setSendSelectedRecipientId(recipient.id);
    setSendRecipientName(recipient.name);
    setSendPhoneNumber(recipient.phoneNumber);
    setSendCarrier(recipient.carrier);
    setSelectedSendProductId(null);
    setSendError(null);
    setSendRecipientMessage(null);
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
        { label: t('recipientName'), value: sendRecipientName.trim() || '—' },
        { label: t('phoneNumber'), value: sendPhoneNumber },
        { label: t('carrier'), value: sendCarrier },
        { label: t('product'), value: selectedSendProduct.label },
        { label: t('servicePrice'), value: formatServiceTotal(selectedSendProduct.price) },
        { label: t('serviceFee'), value: formatServiceTotal(selectedSendProduct.serviceFee) },
        {
          label: t('serviceTotal'),
          value: formatServiceTotal(selectedSendProduct.price + selectedSendProduct.serviceFee),
          strong: true,
        },
      ]
    : [];

  const requestReviewSummary = selectedRequestProduct
    ? [
        { label: t('orderType'), value: t('dataRequest') },
        { label: t('recipientName'), value: requestRecipientName.trim() || '—' },
        { label: t('phoneNumber'), value: requestPhoneNumber },
        { label: t('carrier'), value: requestCarrier },
        { label: t('product'), value: selectedRequestProduct.label },
        { label: t('servicePrice'), value: formatServiceTotal(selectedRequestProduct.price) },
        { label: t('serviceFee'), value: formatServiceTotal(selectedRequestProduct.serviceFee) },
        {
          label: t('serviceTotal'),
          value: formatServiceTotal(selectedRequestProduct.price + selectedRequestProduct.serviceFee),
          strong: true,
        },
      ]
    : [];

  const sendStepLabel = `STEP ${sendStep} OF 7`;
  const requestStepLabel = `REQUEST STEP ${requestStep} OF 5`;

  const confirmSendOrder = async (skipProfileCheck = false) => {
    if (!selectedSendProduct) {
      setSendError(t('chooseAProductBeforeContinuing'));
      return;
    }

    if (!isSignedIn) {
      setSendError(t('signInRequiredBeforeTopUpOrder'));
      return;
    }

    if (!skipProfileCheck && !hasCompleteProfile) {
      promptForProfileCompletion('send');
      return;
    }

    setSendSubmitting(true);
    setSendError(null);

    try {
      const nextOrder = await createPendingTopUpOrder({
        carrier: sendCarrier,
        productType: sendProductType,
        productName: getProductName(sendCarrier, sendProductType, selectedSendProduct),
        recipientPhone: sendPhoneNumber.trim(),
        recipientName: sendRecipientName.trim() || null,
        amountUsd: selectedSendProduct.price,
        serviceFeeUsd: selectedSendProduct.serviceFee,
      });

      setSendOrder(nextOrder);
      setSendRecipientMessage(null);
      setSendStep(7);

      if (sendSaveRecipient) {
        await maybeSaveRecipient(
          sendRecipientName.trim(),
          sendPhoneNumber.trim(),
          sendCarrier,
          setSendRecipientMessage
        );
      }
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
      setRequestError(t('chooseADataPackageBeforeContinuing'));
      return;
    }

    if (!isSignedIn) {
      setRequestError(t('signInRequiredBeforeRequestLink'));
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
        recipientPhone: requestPhoneNumber.trim(),
        carrier: requestCarrier,
        productName: getProductName(requestCarrier, 'data', selectedRequestProduct),
        bundleLabel: selectedRequestProduct.label,
        amountUsd: selectedRequestProduct.price,
        serviceFeeUsd: selectedRequestProduct.serviceFee,
      });

      setRequestLink(`https://boulio.app/request/${nextRequest.requestCode}`);
      setRequestStep(5);
      setRequestStatus(t('requestLinkCreatedSuccessfully'));
      setRequestRecipientMessage(null);
      setRequestPaymentNotice(null);

      if (requestSaveRecipient) {
        await maybeSaveRecipient(
          requestRecipientName.trim(),
          requestPhoneNumber.trim(),
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

  const handleSendPaymentComingSoon = async () => {
    try {
      if (!sendOrder) {
        setSendPaymentNotice(t('onlinePaymentWillBeConnectedSoon'));
        return;
      }

      const result = await createPaymentForTopUpOrder(sendOrder.id);
      if (result.checkoutUrl) {
        await openCheckoutUrl(result.checkoutUrl);
        return;
      }

      setSendPaymentNotice(result.message);
    } catch {
      setSendPaymentNotice(t('onlinePaymentWillBeConnectedSoon'));
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
        <Text style={styles.title}>{t('sendAirtimeOrDataToHaiti')}</Text>
        <Text style={styles.subtitle}>{t('lotteryResultsAndHaitiTopUp')}</Text>
      </View>

      {flowMode === 'choose' ? (
        <>
          <SectionCard title={t('chooseEntryPath')} subtitle={t('chooseEntryPath')}>
            <View style={styles.entryGrid}>
              <FlowChoiceCard
                eyebrow={t('sendAirtimeData')}
                title={t('sendAirtimeOrDataToHaiti')}
                body={t('sendAirtimeOrDataToHaiti')}
                onPress={startSendFlow}
              />
              <FlowChoiceCard
                eyebrow={t('requestDataFromFamily')}
                title={t('requestData')}
                body={t('requestDataFromFamily')}
                onPress={startRequestFlow}
              />
            </View>
            {productsLoading ? <Text style={styles.loadingText}>{t('loadingProducts')}</Text> : null}
          </SectionCard>

          <SectionCard title={t('currentMode')} subtitle={modeSubtitle(userMode)}>
            <Text style={styles.bodyText}>
              {userMode === 'diaspora_supporter'
                ? t('diasporaUserFocus')
                : t('lotteryResultsAndHaitiTopUp')}
            </Text>
          </SectionCard>
        </>
      ) : flowMode === 'send' ? (
        <View style={styles.flowStack}>
          <View style={styles.flowHeader}>
            <View style={styles.flowHeaderText}>
              <Text style={styles.flowLabel}>{sendStepLabel}</Text>
              <Text style={styles.flowTitle}>{t('sendAirtimeData')}</Text>
              <Text style={styles.flowSubtitle}>{t('sendAirtimeOrDataToHaiti')}</Text>
            </View>
            <Pressable onPress={resetAllFlows} style={styles.changeFlowButton}>
              <Text style={styles.changeFlowText}>{t('changeFlow')}</Text>
            </Pressable>
          </View>

          {sendStep === 1 ? (
            <SectionCard title={t('chooseCarrier')} subtitle={t('chooseCarrier')}>
              <View style={styles.sectionStack}>
                <ChipSelector value={sendCarrier} options={carrierOptions} onChange={changeSendCarrier} />
                <PrimaryButton label={t('continue')} onPress={() => setSendStep(2)} />
              </View>
            </SectionCard>
          ) : null}

          {sendStep === 2 ? (
            <SectionCard title={t('chooseAirtimeOrData')} subtitle={t('chooseAirtimeOrData')}>
              <View style={styles.sectionStack}>
                <ChipSelector
                  value={sendProductType}
                  options={sendProductTypeOptions}
                  onChange={changeSendProductType}
                  renderLabel={renderSendProductType}
                />
                <PrimaryButton label={t('continue')} onPress={() => setSendStep(3)} />
              </View>
            </SectionCard>
          ) : null}

          {sendStep === 3 ? (
            <SectionCard title={t('enterHaitiPhoneNumber')} subtitle={t('enterHaitiPhoneNumber')}>
              <View style={styles.sectionStack}>
                {isSignedIn ? (
                  <SavedRecipientsPicker
                    title={t('savedRecipients')}
                    subtitle={t('chooseSavedRecipient')}
                    recipients={savedRecipients}
                    loading={savedRecipientsLoading}
                    selectedRecipientId={sendSelectedRecipientId}
                    onSelect={selectSendRecipient}
                  />
                ) : null}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t('recipientName')}</Text>
                  <TextInput
                    value={sendRecipientName}
                    onChangeText={(value) => {
                      setSendRecipientName(value);
                      setSendSelectedRecipientId(null);
                    }}
                    placeholder={t('recipientName')}
                    placeholderTextColor={Colors.light.muted}
                    autoCapitalize="words"
                    style={styles.input}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t('phoneNumber')}</Text>
                <TextInput
                  value={sendPhoneNumber}
                  onChangeText={(value) => {
                    setSendPhoneNumber(value);
                      setSendSelectedRecipientId(null);
                    setSendError(null);
                  }}
                  placeholder="e.g. (509) 34-12-44-11"
                  placeholderTextColor={Colors.light.muted}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  style={styles.input}
                />
                </View>
                {isSignedIn ? (
                  <RecipientSaveToggle
                    checked={sendSaveRecipient}
                    label={t('saveThisRecipient')}
                    onToggle={() => setSendSaveRecipient((current) => !current)}
                  />
                ) : null}
                {sendRecipientMessage ? <Text style={styles.noteText}>{sendRecipientMessage}</Text> : null}
                <PrimaryButton
                  label={t('continue')}
                  onPress={() => setSendStep(4)}
                  disabled={!sendPhoneNumber.trim()}
                />
              </View>
            </SectionCard>
          ) : null}

          {sendStep === 4 ? (
            <SectionCard title={t('chooseAirtimeOrData')} subtitle={t('chooseAirtimeOrData')}>
              <View style={styles.sectionStack}>
                <View style={styles.productGrid}>
                  {sendProducts.length ? (
                    sendProducts.map((product) => (
                      <TopUpAmountCard
                        key={product.id}
                        product={product}
                        selected={product.id === selectedSendProductId}
                        onPress={() => {
                          setSelectedSendProductId(product.id);
                          setSendError(null);
                        }}
                      />
                    ))
                  ) : (
                    <Text style={styles.emptyText}>{t('noResultsFound')}</Text>
                  )}
                </View>
                <PrimaryButton label={t('continue')} onPress={() => setSendStep(5)} disabled={!selectedSendProduct} />
              </View>
            </SectionCard>
          ) : null}

          {sendStep === 5 ? (
            <SectionCard title={t('reviewRequest')} subtitle={t('reviewBeforePayment')}>
              <View style={styles.sectionStack}>
                <View style={styles.summaryCard}>
                  {sendReviewSummary.map((row) => (
                    <SummaryRow key={row.label} label={row.label} value={row.value} strong={row.strong} />
                  ))}
                </View>
                <Text style={styles.noteText}>{t('reviewBeforePayment')}</Text>
                <PrimaryButton label={t('continueToPayment')} onPress={() => setSendStep(6)} />
              </View>
            </SectionCard>
          ) : null}

          {sendStep === 6 ? (
            <SectionCard title={t('completePayment')} subtitle={t('paySecurelyToCompleteOrder')}>
              <View style={styles.sectionStack}>
                <View style={styles.summaryCard}>
                  {sendReviewSummary.map((row) => (
                    <SummaryRow key={`payment-${row.label}`} label={row.label} value={row.value} strong={row.strong} />
                  ))}
                  <SummaryRow label={t('status')} value={t('pendingPayment')} />
                </View>
                {!isSignedIn ? (
                  <>
                    <Text style={styles.warningText}>{t('signInRequiredBeforeTopUpOrder')}</Text>
                    <PrimaryButton label={t('goToAccount')} onPress={() => router.push('/account')} />
                  </>
                ) : (
                  <>
                    {sendError ? <Text style={styles.errorText}>{sendError}</Text> : null}
                    <PrimaryButton
                      label={t('continueToPayment')}
                      onPress={confirmSendOrder}
                      disabled={sendSubmitting || !selectedSendProduct}
                    />
                  </>
                )}
              </View>
            </SectionCard>
          ) : null}

          {sendStep === 7 ? (
            <SectionCard title={t('completePayment')} subtitle={t('paySecurelyToCompleteOrder')}>
              <View style={styles.sectionStack}>
                <Text style={styles.bodyText}>{t('onlinePaymentWillBeConnectedSoon')}</Text>
                {sendOrder ? (
                  <View style={styles.summaryCard}>
                    <SummaryRow label={t('orderType')} value={t('topUpOrder')} />
                    <SummaryRow label={t('recipientName')} value={sendOrder.recipientName ?? '—'} />
                    <SummaryRow label={t('phoneNumber')} value={sendOrder.recipientPhone} />
                    <SummaryRow label={t('carrier')} value={sendOrder.carrier} />
                    <SummaryRow label={t('product')} value={sendOrder.productName} />
                    <SummaryRow label={t('serviceTotal')} value={formatServiceTotal(sendOrder.totalUsd)} strong />
                    <SummaryRow label={t('status')} value={t('pendingPayment')} />
                  </View>
                ) : null}
                <Text style={styles.noteText}>{t('pendingPayment')}</Text>
                {sendRecipientMessage ? <Text style={styles.noteText}>{sendRecipientMessage}</Text> : null}
                <PrimaryButton label={t('continueToPayment')} onPress={handleSendPaymentComingSoon} />
                <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={styles.secondaryActionButton}>
                  <Text style={styles.secondaryActionText}>{t('viewActivity')}</Text>
                </Pressable>
                {sendPaymentNotice ? <Text style={styles.noteText}>{sendPaymentNotice}</Text> : null}
              </View>
            </SectionCard>
          ) : null}
        </View>
      ) : (
        <View style={styles.flowStack}>
          <View style={styles.flowHeader}>
            <View style={styles.flowHeaderText}>
              <Text style={styles.flowLabel}>{requestStepLabel}</Text>
              <Text style={styles.flowTitle}>{t('requestDataFromFamily')}</Text>
              <Text style={styles.flowSubtitle}>{t('requestData')}</Text>
            </View>
            <Pressable
              onPress={requestStep === 5 ? editRequest : resetAllFlows}
              style={styles.changeFlowButton}>
              <Text style={styles.changeFlowText}>{requestStep === 5 ? t('editRequest') : t('changeFlow')}</Text>
            </Pressable>
          </View>

          {requestStep === 1 ? (
            <SectionCard title={t('chooseCarrier')} subtitle={t('chooseCarrier')}>
              <View style={styles.sectionStack}>
                <ChipSelector value={requestCarrier} options={carrierOptions} onChange={changeRequestCarrier} />
                    <PrimaryButton label={t('continue')} onPress={() => setRequestStep(2)} />
              </View>
            </SectionCard>
          ) : null}

          {requestStep === 2 ? (
            <SectionCard title={t('chooseDataPackage')} subtitle={t('chooseDataPackage')}>
              <View style={styles.sectionStack}>
                <View style={styles.productGrid}>
                  {requestProducts.length ? (
                    requestProducts.map((product) => (
                      <TopUpAmountCard
                        key={product.id}
                        product={product}
                        selected={product.id === selectedRequestProductId}
                        onPress={() => {
                          setSelectedRequestProductId(product.id);
                          setRequestError(null);
                        }}
                      />
                    ))
                  ) : (
                    <Text style={styles.emptyText}>{t('noResultsFound')}</Text>
                  )}
                </View>
                <PrimaryButton label={t('continue')} onPress={() => setRequestStep(3)} disabled={!selectedRequestProduct} />
              </View>
            </SectionCard>
          ) : null}

          {requestStep === 3 ? (
            <SectionCard title={t('enterHaitiPhoneNumber')} subtitle={t('enterHaitiPhoneNumber')}>
              <View style={styles.sectionStack}>
                {isSignedIn ? (
                  <SavedRecipientsPicker
                    title={t('savedRecipients')}
                    subtitle={t('chooseSavedRecipient')}
                    recipients={savedRecipients}
                    loading={savedRecipientsLoading}
                    selectedRecipientId={requestSelectedRecipientId}
                    onSelect={selectRequestRecipient}
                  />
                ) : null}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t('recipientName')}</Text>
                  <TextInput
                    value={requestRecipientName}
                    onChangeText={(value) => {
                      setRequestRecipientName(value);
                      setRequestSelectedRecipientId(null);
                    }}
                    placeholder={t('recipientName')}
                    placeholderTextColor={Colors.light.muted}
                    autoCapitalize="words"
                    style={styles.input}
                  />
                </View>
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
                </View>
                {isSignedIn ? (
                  <RecipientSaveToggle
                    checked={requestSaveRecipient}
                    label={t('saveThisRecipient')}
                    onToggle={() => setRequestSaveRecipient((current) => !current)}
                  />
                ) : null}
                {requestRecipientMessage ? <Text style={styles.noteText}>{requestRecipientMessage}</Text> : null}
                <PrimaryButton
                  label={t('continue')}
                  onPress={() => setRequestStep(4)}
                  disabled={!requestPhoneNumber.trim()}
                />
              </View>
            </SectionCard>
          ) : null}

          {requestStep === 4 ? (
            <SectionCard title={t('completeThisDataRequest')} subtitle={t('reviewBeforePayment')}>
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
                    <PrimaryButton
                      label={t('continueToPayment')}
                      onPress={createRequest}
                      disabled={requestBusy || !selectedRequestProduct}
                    />
                  </>
                )}
              </View>
            </SectionCard>
          ) : null}

          {requestStep === 5 ? (
            <SectionCard title={t('completeThisDataRequest')} subtitle={t('reviewBeforePayment')}>
              <View style={styles.sectionStack}>
                <Text style={styles.bodyText}>
                  {t('reviewBeforePayment')}
                </Text>
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
                <PrimaryButton label={t('completePayment')} onPress={handleRequestPaymentComingSoon} />
                <PrimaryButton label={t('createAnotherRequestButton')} onPress={createAnotherRequest} />
              </View>
            </SectionCard>
          ) : null}
        </View>
      )}
      </ScrollView>
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

function renderSendProductType(value: SendProductType) {
  return value === 'airtime' ? 'Airtime / Phone Credit' : 'Mobile Data';
}

function getProductName(carrier: TopUpCarrier, productType: SendProductType, product: TopUpProduct) {
  if (productType === 'airtime') {
    return `${carrier} Airtime ${product.label}`;
  }

  return `${carrier} Data ${product.label}`;
}

function modeSubtitle(mode: UserMode) {
  return mode === 'diaspora_supporter'
    ? 'Diaspora Supporter mode keeps the focus on family support.'
    : 'Haiti User mode keeps the focus on requests and results.';
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
  changeFlowButton: {
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
  changeFlowText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '600',
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
