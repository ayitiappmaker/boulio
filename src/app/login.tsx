import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { sendPasswordResetEmail, signInWithEmailPassword, signUpWithEmailPassword } from '@/lib/auth';
import { t, useLanguage } from '@/lib/i18n';

type AuthMode = 'signIn' | 'signUp' | 'resetPassword';

export default function LoginScreen() {
  const router = useRouter();
  useLanguage();

  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === 'signUp') {
        const session = await signUpWithEmailPassword(email.trim(), password);
        if (session) {
          router.replace('/account');
          return;
        }

        setMessage(t('checkYourInbox'));
        return;
      }

      if (mode === 'resetPassword') {
        await sendPasswordResetEmail(email.trim());
        setMessage(t('checkYourInbox'));
        return;
      }

      const session = await signInWithEmailPassword(email.trim(), password);
      if (session) {
        router.replace('/account');
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('useSupabaseEmailAndPassword'));
    } finally {
      setLoading(false);
    }
  };

  const submitLabel = mode === 'signUp' ? t('signUp') : mode === 'resetPassword' ? t('resetPassword') : t('signIn');
  const title = mode === 'signUp' ? t('signUp') : mode === 'resetPassword' ? t('resetPassword') : t('signIn');

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.sheet}>
        <View style={styles.topRow}>
          <Text style={styles.title}>{title}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.closeButton}>
            <Text style={styles.closeGlyph}>×</Text>
          </Pressable>
        </View>

        <Text style={styles.subtitle}>
          {mode === 'signUp'
            ? t('signUpPrompt')
            : mode === 'resetPassword'
              ? t('resetPasswordPrompt')
              : t('signInToContinue')}
        </Text>

        <View style={styles.form}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={t('email')}
            placeholderTextColor={Colors.light.textTertiary}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            style={styles.input}
          />
          {mode !== 'resetPassword' ? (
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t('password')}
              placeholderTextColor={Colors.light.textTertiary}
              secureTextEntry
              textContentType="password"
              style={styles.input}
            />
          ) : null}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {message ? <Text style={styles.messageText}>{message}</Text> : null}

        <PrimaryButton
          label={submitLabel}
          onPress={handleSubmit}
          disabled={!email.trim() || (mode !== 'resetPassword' && !password) || loading}
          style={styles.primaryButton}
        />

        <View style={styles.links}>
          <Text style={styles.helper}>{t('newHere')}</Text>
          <Pressable accessibilityRole="button" onPress={() => setMode('signUp')}>
            <Text style={[styles.link, mode === 'signUp' && styles.linkActive]}>{t('signUp')}</Text>
          </Pressable>
          <Text style={styles.helper}>•</Text>
          <Pressable accessibilityRole="button" onPress={() => setMode('resetPassword')}>
            <Text style={[styles.link, mode === 'resetPassword' && styles.linkActive]}>{t('resetPassword')}</Text>
          </Pressable>
          <Text style={styles.helper}>•</Text>
          <Pressable accessibilityRole="button" onPress={() => setMode('signIn')}>
            <Text style={[styles.link, mode === 'signIn' && styles.linkActive]}>{t('signIn')}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    justifyContent: 'center',
    backgroundColor: Colors.light.surfaceMuted,
  },
  sheet: {
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
    color: Colors.light.text,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.surface,
  },
  closeGlyph: {
    fontSize: 20,
    lineHeight: 20,
    color: Colors.light.text,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  form: {
    gap: Spacing.sm,
  },
  input: {
    minHeight: 50,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.light.text,
  },
  errorText: {
    color: Colors.light.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  messageText: {
    color: Colors.light.success,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  primaryButton: {
    alignSelf: 'stretch',
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  helper: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
  },
  link: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.primary,
    fontWeight: '600',
  },
  linkActive: {
    textDecorationLine: 'underline',
  },
});
