import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ChipSelector } from '@/components/ChipSelector';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { UserMode } from '@/lib/types';
import { t } from '@/lib/i18n';

export type ProfileFormValues = {
  fullName: string;
  phoneNumber: string;
  country: string;
  userMode: UserMode;
};

type CompleteProfileFormProps = {
  values: ProfileFormValues;
  onChange: (patch: Partial<ProfileFormValues>) => void;
  onSave: () => void;
  saving?: boolean;
  submitLabel?: string;
  helper?: string;
};

export function CompleteProfileForm({
  values,
  onChange,
  onSave,
  saving,
  submitLabel,
  helper,
}: CompleteProfileFormProps) {
  return (
    <View style={styles.stack}>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
      <View style={styles.field}>
        <Text style={styles.label}>{t('fullName')}</Text>
        <TextInput
          value={values.fullName}
          onChangeText={(value) => onChange({ fullName: value })}
          placeholder={t('fullName')}
          placeholderTextColor={Colors.light.muted}
          style={styles.input}
          autoCapitalize="words"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t('phoneNumber')}</Text>
        <TextInput
          value={values.phoneNumber}
          onChangeText={(value) => onChange({ phoneNumber: value })}
          placeholder={t('phoneNumber')}
          placeholderTextColor={Colors.light.muted}
          style={styles.input}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t('country')}</Text>
        <TextInput
          value={values.country}
          onChangeText={(value) => onChange({ country: value })}
          placeholder={t('country')}
          placeholderTextColor={Colors.light.muted}
          style={styles.input}
          autoCapitalize="words"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t('currentMode')}</Text>
        <ChipSelector
          value={values.userMode}
          options={['haiti_user', 'diaspora_supporter']}
          onChange={(value) => onChange({ userMode: value })}
          renderLabel={renderUserModeLabel}
        />
      </View>
      <PrimaryButton label={submitLabel ?? t('saveProfile')} onPress={onSave} disabled={saving} />
    </View>
  );
}

function renderUserModeLabel(mode: UserMode) {
  return mode === 'diaspora_supporter' ? t('diasporaSupporter') : t('haitiUser');
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.sm,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  input: {
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.light.text,
  },
  helper: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
});
