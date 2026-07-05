import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { ChipSelector } from '@/components/ChipSelector';
import { CompleteProfileForm, type ProfileFormValues } from '@/components/CompleteProfileForm';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SectionCard } from '@/components/SectionCard';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { preferredLotteryState, savedRecipients as mockSavedRecipients } from '@/lib/mockData';
import { getCurrentSession, signOut, subscribeToSessionChanges } from '@/lib/auth';
import { fetchMyActivity } from '@/lib/activity';
import { deleteSavedRecipient, fetchSavedRecipients, type SavedRecipientRecord } from '@/lib/savedRecipients';
import type { DataRequestRecord } from '@/lib/dataRequests';
import { getFulfillmentStatusLabel } from '@/lib/fulfillment';
import { getLanguage, supportedLanguages, setLanguage, t, useLanguage } from '@/lib/i18n';
import { fetchMyProfile, isProfileRequiredError, upsertMyProfile, type ProfileRecord } from '@/lib/profile';
import { getStoredUserMode, setStoredUserMode, subscribeToUserModeChanges } from '@/lib/userMode';
import type { TopUpOrderRecord } from '@/lib/topupOrders';
import type { Session } from '@supabase/supabase-js';
import type { UserMode } from '@/lib/types';

export default function AccountScreen() {
  const router = useRouter();
  useLanguage();

  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [activityTopUpOrders, setActivityTopUpOrders] = useState<TopUpOrderRecord[]>([]);
  const [activityDataRequests, setActivityDataRequests] = useState<DataRequestRecord[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [savedRecipients, setSavedRecipients] = useState<SavedRecipientRecord[]>(mapMockSavedRecipients());
  const [savedRecipientsLoading, setSavedRecipientsLoading] = useState(false);
  const [savedRecipientsSource, setSavedRecipientsSource] = useState<'live' | 'mock'>('mock');
  const [deletingRecipientId, setDeletingRecipientId] = useState<string | null>(null);
  const [userMode, setUserMode] = useState<UserMode>(() => getStoredUserMode());
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormValues>({
    fullName: '',
    phoneNumber: '',
    country: '',
    userMode: 'haiti_user',
  });

  const refreshActivity = useCallback(() => {
    if (!session) {
      setActivityTopUpOrders([]);
      setActivityDataRequests([]);
      setActivityLoading(false);
      return undefined;
    }

    let active = true;
    setActivityLoading(true);

    void fetchMyActivity()
      .then((nextActivity) => {
        if (active) {
          setActivityTopUpOrders(nextActivity.topUpOrders);
          setActivityDataRequests(nextActivity.dataRequests);
        }
      })
      .catch(() => {
        if (active) {
          setActivityTopUpOrders([]);
          setActivityDataRequests([]);
        }
      })
      .finally(() => {
        if (active) {
          setActivityLoading(false);
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
      })
      .finally(() => {
        if (active) {
          setLoadingSession(false);
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
      setProfileEditing(false);
      setProfileMessage(null);
      setProfileError(null);
      setProfileForm({
        fullName: '',
        phoneNumber: '',
        country: '',
        userMode: 'haiti_user',
      });
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
        setStoredUserMode(nextProfile?.userMode ?? getStoredUserMode());
        setProfileEditing(!nextProfile || !isProfileCompleteRecord(nextProfile));
      })
      .catch(() => {
        if (active) {
          setProfile(null);
          setProfileForm({
            fullName: '',
            phoneNumber: '',
            country: '',
            userMode: getStoredUserMode(),
          });
          setProfileEditing(true);
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

  useEffect(() => refreshActivity(), [refreshActivity]);

  useFocusEffect(
    useCallback(() => {
      return refreshActivity();
    }, [refreshActivity])
  );

  useEffect(() => {
    let active = true;

    if (!session) {
      setSavedRecipients(mapMockSavedRecipients());
      setSavedRecipientsSource('mock');
      setSavedRecipientsLoading(false);
      return undefined;
    }

    setSavedRecipientsLoading(true);

    void fetchSavedRecipients()
      .then((nextRecipients) => {
        if (active) {
          setSavedRecipients(nextRecipients);
          setSavedRecipientsSource('live');
        }
      })
      .catch(() => {
        if (active) {
          setSavedRecipients(mapMockSavedRecipients());
          setSavedRecipientsSource('mock');
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

  const handleSignOut = async () => {
    setSignOutLoading(true);

    try {
      await signOut();
      setSession(null);
      setProfile(null);
      setProfileEditing(false);
      setProfileMessage(null);
      setProfileError(null);
      setProfileForm({
        fullName: '',
        phoneNumber: '',
        country: '',
        userMode: 'haiti_user',
      });
      setActivityTopUpOrders([]);
      setActivityDataRequests([]);
      setSavedRecipients(mapMockSavedRecipients());
      setSavedRecipientsSource('mock');
    } catch {
      // Keep sign-out failures quiet; the account screen remains usable.
    } finally {
      setSignOutLoading(false);
    }
  };

  const handleDeleteRecipient = async (recipientId: string) => {
    setDeletingRecipientId(recipientId);

    try {
      await deleteSavedRecipient(recipientId);
      setSavedRecipients((currentRecipients) => currentRecipients.filter((recipient) => recipient.id !== recipientId));
    } catch {
      // Keep the list usable even if the delete request fails.
    } finally {
      setDeletingRecipientId(null);
    }
  };

  const handleProfileSave = async () => {
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
      setStoredUserMode(nextProfile.userMode ?? getStoredUserMode());
      setProfileEditing(false);
      setProfileMessage(t('profileSaved'));
    } catch (error) {
      if (isProfileRequiredError(error)) {
        setProfileError(t('profileRequiredForService'));
      } else {
        setProfileError(error instanceof Error ? error.message : t('profileRequiredForService'));
      }
    } finally {
      setProfileSaving(false);
    }
  };

  const openProfileEditor = () => {
    setProfileForm(profileToFormValues(profile));
    setProfileEditing(true);
    setProfileMessage(null);
    setProfileError(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.iconWrap}>
              <Text style={styles.iconGlyph}>◯</Text>
            </View>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{t('account')}</Text>
            <Text style={styles.subtitle}>{t('savedContactsQuickCheckout')}</Text>
          </View>
        </View>
      </View>

      <SectionCard title={t('language')} subtitle={t('chooseHowYouUseBoulioToday')}>
        <View style={styles.block}>
          <Text style={styles.label}>{t('language')}</Text>
          <ChipSelector
            value={getLanguage()}
            options={supportedLanguages.map((languageOption) => languageOption.code)}
            onChange={setLanguage}
            renderLabel={languageLabel}
          />
        </View>
      </SectionCard>

      {session ? (
        <SectionCard
          title={isProfileCompleteRecord(profile) ? t('editProfile') : t('completeProfile')}
          subtitle={t('completeProfileToContinue')}>
          {profileLoading ? (
            <EmptyState title={t('completeProfile')} body={t('loadingProfile')} />
          ) : profileEditing || !isProfileCompleteRecord(profile) ? (
            <View style={styles.stack}>
              {profileMessage ? <Text style={styles.successText}>{profileMessage}</Text> : null}
              {profileError ? <Text style={styles.errorText}>{profileError}</Text> : null}
              <CompleteProfileForm
                values={profileForm}
                onChange={(patch) => setProfileForm((current) => ({ ...current, ...patch }))}
                onSave={handleProfileSave}
                saving={profileSaving}
                submitLabel={t('saveProfile')}
                helper={t('profileRequiredForService')}
              />
              {isProfileCompleteRecord(profile) ? (
                <Pressable onPress={() => setProfileEditing(false)} style={styles.profileCancelButton}>
                  <Text style={styles.profileCancelText}>{t('cancel')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.profileSummary}>
              {profileMessage ? <Text style={styles.successText}>{profileMessage}</Text> : null}
              <SummaryRow label={t('fullName')} value={profile?.fullName || '—'} />
              <SummaryRow label={t('phoneNumber')} value={profile?.phoneNumber || '—'} />
              <SummaryRow label={t('country')} value={profile?.country || '—'} />
              <SummaryRow label={t('currentMode')} value={modeLabel(profile?.userMode ?? userMode)} />
              <PrimaryButton label={t('editProfile')} onPress={openProfileEditor} style={styles.actionButton} />
            </View>
          )}
        </SectionCard>
      ) : null}

      <SectionCard title={session ? t('signedInAs') : t('signIn')} subtitle={t('signInWillBeRequiredBeforeRealTopUp')}>
        {loadingSession ? (
          <View style={styles.authCard}>
            <Text style={styles.sectionTitle}>{t('checkingSession')}</Text>
            <Text style={styles.helper}>{t('loadingSession')}</Text>
          </View>
        ) : session ? (
          <View style={styles.authCard}>
            <Text style={styles.sectionTitle}>{t('signedInAs')}</Text>
            <Text style={styles.email}>{session.user.email ?? t('noEmailOnFile')}</Text>
            <Text style={styles.helper}>{t('whileSignedInBrowsePublicAndMock')}</Text>
            <PrimaryButton label={signOutLoading ? t('signOut') : t('signOut')} onPress={handleSignOut} style={styles.actionButton} />
          </View>
        ) : (
          <View style={styles.authCard}>
            <Text style={styles.sectionTitle}>{t('signedOut')}</Text>
            <Text style={styles.helper}>{t('signInToContinue')}</Text>
            <PrimaryButton label={t('signIn')} onPress={() => router.push('/login')} style={styles.actionButton} />
            <Text style={styles.helper}>{`${t('newHere')} ${t('signUp')} · ${t('resetPassword')}`}</Text>
          </View>
        )}
      </SectionCard>

      <SectionCard title={t('activity')} subtitle={t('recentActivity')}>
        {!session ? (
          <EmptyState title={t('activity')} body={t('signInToViewActivity')} />
        ) : activityLoading ? (
          <EmptyState title={t('activity')} body={t('loadingActivity')} />
        ) : activityTopUpOrders.length === 0 && activityDataRequests.length === 0 ? (
          <EmptyState title={t('activity')} body={t('noActivityYet')} />
        ) : (
          <View style={styles.activityList}>
            {[...mapTopUpActivity(activityTopUpOrders), ...mapDataRequestActivity(activityDataRequests)]
              .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
              .map((item) => (
                <View key={item.id} style={styles.activityRow}>
                  <View style={styles.activityRowMain}>
                    <View style={styles.activityRowTop}>
                      <Text style={styles.activityType}>{item.typeLabel}</Text>
                      <Text style={styles.activityAmount}>{formatMoney(item.totalUsd)}</Text>
                    </View>
                    <Text style={styles.activitySubtitle}>{item.recipientPhone}</Text>
                    <Text style={styles.activityDetail}>{item.productName}</Text>
                    <View style={styles.activityMetaRow}>
                      <Text style={styles.activityDate}>{formatDate(item.createdAt)}</Text>
                      <Text style={styles.activityStatus}>{item.statusLabel}</Text>
                    </View>
                  </View>
                </View>
              ))}
          </View>
        )}
      </SectionCard>

      <SectionCard title={t('savedRecipients')} subtitle={t('savedContactsForQuickTopUpCheckout')}>
        {savedRecipientsLoading ? (
          <EmptyState title={t('savedRecipients')} body={t('loadingSavedRecipients')} />
        ) : savedRecipients.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.sectionTitle}>{t('noSavedRecipients')}</Text>
            <Text style={styles.helper}>{session ? t('addRecipient') : t('signInToContinue')}</Text>
            {session ? (
              <PrimaryButton label={t('addRecipient')} onPress={() => router.push('/topup')} style={styles.actionButton} />
            ) : (
              <PrimaryButton label={t('signIn')} onPress={() => router.push('/login')} style={styles.actionButton} />
            )}
          </View>
        ) : (
          <View style={styles.list}>
            {savedRecipients.map((recipient) => (
              <View key={recipient.id} style={styles.recipientRow}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{recipient.name}</Text>
                  <Text style={styles.rowSubtitle}>
                    {recipient.carrier} · {recipient.phoneNumber}
                  </Text>
                </View>
                {savedRecipientsSource === 'live' ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => handleDeleteRecipient(recipient.id)}
                    disabled={deletingRecipientId === recipient.id}
                    style={styles.deleteButton}>
                    <Text style={styles.deleteButtonText}>
                      {deletingRecipientId === recipient.id ? t('loadingSavedRecipients') : t('deleteRecipient')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      <SectionCard title={t('preferredLotteryState')} subtitle={t('preferredLotteryStateUsedToPersonalize')}>
        <View style={styles.settingsCard}>
          <Text style={styles.value}>{preferredLotteryState}</Text>
          <Text style={styles.helper}>{t('settingsConnectedLater')}</Text>
        </View>
      </SectionCard>

      <SectionCard title={t('notifications')} subtitle={t('settingsMock')}>
        <View style={styles.settingRow}>
          <Text style={styles.rowTitle}>{t('lotteryReminders')}</Text>
          <Text style={styles.rowSubtitle}>{t('on')}</Text>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.rowTitle}>{t('topUpUpdates')}</Text>
          <Text style={styles.rowSubtitle}>{t('on')}</Text>
        </View>
      </SectionCard>

      <SectionCard title={t('support')} subtitle={t('supportQuestionsFeedback')}>
        <View style={styles.supportCard}>
          <Text style={styles.rowTitle}>support@boulio.app</Text>
          <Text style={styles.rowSubtitle}>{t('supportQuestionsFeedback')}</Text>
        </View>
      </SectionCard>
    </ScrollView>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.helper}>{body}</Text>
    </View>
  );
}

function InfoRow({
  title,
  subtitle,
  badge,
  detail,
  badgeTone,
}: {
  title: string;
  subtitle: string;
  badge: string;
  detail: string;
  badgeTone: 'default' | 'success';
}) {
  return (
    <View style={styles.mockRow}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Text style={[styles.badge, badgeTone === 'success' && styles.successBadge]}>{badge}</Text>
    </View>
  );
}

function mapMockSavedRecipients(): SavedRecipientRecord[] {
  return mockSavedRecipients.map((recipient, index) => ({
    id: recipient.id,
    userId: null,
    name: recipient.name,
    carrier: recipient.carrier,
    phoneNumber: recipient.phoneNumber,
    createdAt: `2026-07-${String(index + 1).padStart(2, '0')}`,
    updatedAt: null,
  }));
}

function profileToFormValues(profile: ProfileRecord | null): ProfileFormValues {
  return {
    fullName: profile?.fullName ?? '',
    phoneNumber: profile?.phoneNumber ?? '',
    country: profile?.country ?? '',
    userMode: profile?.userMode ?? 'haiti_user',
  };
}

function isProfileCompleteRecord(profile: ProfileRecord | null) {
  return Boolean(
    profile?.fullName.trim() &&
      profile?.phoneNumber.trim() &&
      profile?.country.trim() &&
      profile?.userMode
  );
}

type ActivityRowItem = {
  id: string;
  typeLabel: string;
  recipientPhone: string;
  productName: string;
  totalUsd: number;
  statusLabel: string;
  createdAt: string;
};

function mapTopUpActivity(orders: TopUpOrderRecord[]): ActivityRowItem[] {
  return orders.map((order) => ({
    id: `topup-${order.id}`,
    typeLabel: t('topUpOrder'),
    recipientPhone: order.recipientPhone,
    productName: order.productName,
    totalUsd: order.totalUsd,
    statusLabel: getFulfillmentStatusLabel({
      targetType: 'topup_order',
      status: order.status,
      paymentStatus: order.paymentStatus,
      supplierStatus: order.supplierStatus,
    }),
    createdAt: order.createdAt,
  }));
}

function mapDataRequestActivity(requests: DataRequestRecord[]): ActivityRowItem[] {
  return requests.map((request) => ({
    id: `request-${request.id}`,
    typeLabel: t('dataRequest'),
    recipientPhone: request.recipientPhone,
    productName: request.bundleLabel ?? request.productName,
    totalUsd: request.totalUsd,
    statusLabel: getFulfillmentStatusLabel({
      targetType: 'data_request',
      publicStatus: request.publicStatus,
      internalStatus: request.internalStatus,
      paymentStatus: request.paymentStatus,
      fulfillmentStatus: request.fulfillmentStatus,
    }),
    createdAt: request.createdAt,
  }));
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function languageLabel(code: string) {
  return supportedLanguages.find((language) => language.code === code)?.label ?? code;
}

function modeLabel(mode: UserMode) {
  return mode === 'diaspora_supporter' ? t('diasporaSupporter') : t('haitiUser');
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
  header: {
    gap: 10,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    fontSize: 24,
    lineHeight: 24,
    color: Colors.light.text,
    fontWeight: '500',
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
  block: {
    gap: Spacing.sm,
  },
  stack: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Colors.light.textSecondary,
  },
  value: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    color: Colors.light.text,
  },
  helper: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  successText: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.success,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.danger,
    fontWeight: '600',
  },
  profileSummary: {
    gap: Spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  summaryLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
    flexShrink: 1,
  },
  summaryValue: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  authCard: {
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 0,
    borderRadius: Radius.lg,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: Colors.light.text,
  },
  email: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.light.text,
    fontWeight: '600',
  },
  actionButton: {
    marginTop: 2,
    width: 'auto',
    alignSelf: 'flex-start',
    minWidth: 136,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  list: {
    gap: Spacing.sm,
  },
  activityList: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  activityRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  activityRowMain: {
    gap: 4,
  },
  activityRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  activityType: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.light.text,
  },
  activityAmount: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.light.text,
  },
  activitySubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
  },
  activityDetail: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
  },
  activityMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  activityDate: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.light.textSecondary,
  },
  activityStatus: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.light.primary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  noticeCard: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.light.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 4,
  },
  noticeTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.light.text,
  },
  noticeBody: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
  },
  emptyState: {
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  mockRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: Colors.light.text,
  },
  rowSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  deleteButton: {
    minHeight: 36,
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  deleteButtonText: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.danger,
    fontWeight: '600',
  },
  rowDetail: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.light.surfaceMuted,
    color: Colors.light.text,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  successBadge: {
    backgroundColor: Colors.light.surfaceMuted,
    color: Colors.light.success,
  },
  pendingBadge: {
    backgroundColor: Colors.light.surfaceMuted,
    color: Colors.light.textSecondary,
  },
  settingsCard: {
    gap: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: 2,
  },
  supportCard: {
    gap: 4,
  },
  profileCancelButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  profileCancelText: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
});
