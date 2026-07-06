import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { getCurrentSession, subscribeToSessionChanges } from '@/lib/auth';
import { setLanguage, supportedLanguages, t, useLanguage } from '@/lib/i18n';
import type { Session } from '@supabase/supabase-js';

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const hideTabs = pathname === '/login' || pathname.startsWith('/admin/');
  const [session, setSession] = useState<Session | null>(null);
  const languageCode = useLanguage();
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);

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

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const accountTarget = session ? '/account' : '/login';
  const currentLanguage = supportedLanguages.find((language) => language.code === languageCode) ?? supportedLanguages[0];

  return (
    <>
      <View style={styles.shell}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setLanguagePickerOpen(true)}
            style={styles.languageButton}>
            <Text style={styles.languageText}>{currentLanguage.label}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push(accountTarget)} style={styles.accountButton}>
            <Text style={styles.accountText}>{session ? t('account') : t('signIn')}</Text>
          </Pressable>
        </View>

        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: Colors.light.primary,
            tabBarInactiveTintColor: Colors.light.muted,
            tabBarShowLabel: true,
            tabBarLabelStyle: {
              fontSize: 11,
              lineHeight: 13,
              fontWeight: '600',
              marginBottom: 0,
            },
            tabBarItemStyle: {
              flex: 1,
              minWidth: 0,
              paddingTop: 6,
              paddingBottom: 6,
              alignItems: 'center',
              justifyContent: 'center',
            },
            tabBarIconStyle: {
              marginTop: 2,
            },
            tabBarStyle: {
              position: 'relative',
              height: 72 + insets.bottom,
              borderRadius: 0,
              backgroundColor: Colors.light.surface,
              borderTopColor: Colors.light.border,
              borderTopWidth: 1,
              shadowOpacity: 0,
              elevation: 0,
              paddingHorizontal: 0,
              paddingBottom: Math.max(insets.bottom, 12),
              marginBottom: Math.max(insets.bottom, 12),
              display: hideTabs ? 'none' : 'flex',
            },
          }}>
          <Tabs.Screen
            name="index"
            options={{
              title: t('home'),
              tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>⌂</Text>,
            }}
          />
          <Tabs.Screen
            name="results"
            options={{
              title: t('results'),
              tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>◫</Text>,
            }}
          />
          <Tabs.Screen
            name="topup"
            options={{
              title: t('topup'),
              tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>＋</Text>,
            }}
          />
          <Tabs.Screen name="admin/fulfillment" options={{ href: null }} />
          <Tabs.Screen name="notifications" options={{ href: null }} />
          <Tabs.Screen name="account" options={{ href: null }} />
          <Tabs.Screen name="login" options={{ href: null }} />
          <Tabs.Screen name="[...requestPath]" options={{ href: null }} />
        </Tabs>

        <Modal
          visible={languagePickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setLanguagePickerOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setLanguagePickerOpen(false)}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{t('language')}</Text>
              <ScrollView contentContainerStyle={styles.languageList} showsVerticalScrollIndicator={false}>
                {supportedLanguages.map((language) => {
                  const selected = language.code === languageCode;
                  return (
                    <Pressable
                      key={language.code}
                      accessibilityRole="button"
                      onPress={() => {
                        setLanguage(language.code);
                        setLanguagePickerOpen(false);
                      }}
                      style={[styles.languageRow, selected && styles.languageRowSelected]}>
                      <Text style={[styles.languageRowText, selected && styles.languageRowTextSelected]}>
                        {language.label}
                      </Text>
                      <Text style={[styles.languageRowCode, selected && styles.languageRowTextSelected]}>
                        {language.code.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable accessibilityRole="button" onPress={() => setLanguagePickerOpen(false)} style={styles.closeButton}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      </View>
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 10,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  languageButton: {
    minHeight: 40,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.light.text,
    letterSpacing: 0.3,
  },
  accountButton: {
    minHeight: 40,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '500',
    color: Colors.light.text,
  },
  tabIcon: {
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  modalCard: {
    borderRadius: 20,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    color: Colors.light.text,
  },
  languageList: {
    gap: 8,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  languageRowSelected: {
    borderColor: Colors.light.primary,
    backgroundColor: '#EFF6FF',
  },
  languageRowText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '500',
  },
  languageRowCode: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  languageRowTextSelected: {
    color: Colors.light.primary,
  },
  closeButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    color: Colors.light.textSecondary,
  },
});
