import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { t, useLanguage } from '@/lib/i18n';

export default function NotificationsScreen() {
  useLanguage();

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('notifications')}</Text>
        <Text style={styles.subtitle}>{t('settingsMock')}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowTitle}>{t('lotteryReminders')}</Text>
          <Text style={styles.rowValue}>{t('on')}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowTitle}>{t('topUpUpdates')}</Text>
          <Text style={styles.rowValue}>{t('on')}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('support')}</Text>
        <Text style={styles.helper}>{t('supportQuestionsFeedback')}</Text>
      </View>
    </ScrollView>
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
    gap: 4,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '600',
    color: Colors.light.text,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  card: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.primary,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.border,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: Colors.light.text,
    fontWeight: '600',
  },
  helper: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
});
