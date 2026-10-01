import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, SHADOW, Spacing } from '@/constants/theme';

type ServiceKind = 'phone' | 'social' | 'request';

const services: Array<{
  kind: ServiceKind;
  title: string;
  description: string;
  badge?: string;
}> = [
  {
    kind: 'phone',
    title: 'Phone Credit',
    description: 'Top up Digicel or Natcom instantly.',
    badge: 'From $5',
  },
  {
    kind: 'social',
    title: 'Social Data',
    description: 'WhatsApp, TikTok, Facebook and more.',
    badge: 'From $5',
  },
  {
    kind: 'request',
    title: 'Request Data',
    description: 'Ask for a data bundle for yourself or someone else.',
  },
];

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.headline}>Send data. Buy credit.{`\n`}Stay connected.</Text>
        <Text style={styles.supportingCopy}>
          Top up your phone, get data bundles, and stay close to what matters.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/topup')}
          style={({ pressed }) => [styles.primaryAction, pressed && styles.primaryActionPressed]}>
          <Text style={styles.primaryActionText}>Get started</Text>
          <Text style={styles.primaryActionArrow}>→</Text>
        </Pressable>
      </View>

      <View style={styles.serviceList}>
        {services.map((service) => (
          <ServiceCard
            key={service.title}
            {...service}
            onPress={() => router.push('/topup')}
          />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/results')}
        style={({ pressed }) => [styles.drawCard, pressed && styles.pressed]}>
        <View style={styles.drawIconWell}>
          <Text style={styles.drawIcon}>★</Text>
        </View>
        <View style={styles.drawText}>
          <Text style={styles.drawTitle}>Upcoming Draw</Text>
          <Text style={styles.drawCopy}>Check the latest results when posted.</Text>
        </View>
        <ChevronButton />
      </Pressable>
    </ScrollView>
  );
}

function ServiceCard({
  kind,
  title,
  description,
  badge,
  onPress,
}: {
  kind: ServiceKind;
  title: string;
  description: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.serviceCard, pressed && styles.pressed]}>
      <ServiceIcon kind={kind} />
      <View style={styles.serviceText}>
        <Text style={styles.serviceTitle}>{title}</Text>
        <Text style={styles.serviceDescription}>{description}</Text>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <ChevronButton />
    </Pressable>
  );
}

function ServiceIcon({ kind }: { kind: ServiceKind }) {
  return (
    <View style={styles.iconWell}>
      {kind === 'phone' ? (
        <View style={styles.phoneIcon}>
          <View style={styles.phoneSpeaker} />
          <View style={styles.phoneButton} />
        </View>
      ) : null}
      {kind === 'social' ? (
        <View style={styles.signalIcon}>
          <View style={[styles.signalBar, styles.signalBarOne]} />
          <View style={[styles.signalBar, styles.signalBarTwo]} />
          <View style={[styles.signalBar, styles.signalBarThree]} />
          <View style={[styles.signalBar, styles.signalBarFour]} />
        </View>
      ) : null}
      {kind === 'request' ? (
        <View style={styles.documentIcon}>
          <View style={styles.documentLineShort} />
          <View style={styles.documentLine} />
          <View style={styles.documentLine} />
        </View>
      ) : null}
      <View style={styles.iconBadge}>
        <Text style={styles.iconBadgeText}>{kind === 'phone' ? '$' : kind === 'social' ? '●' : '↑'}</Text>
      </View>
    </View>
  );
}

function ChevronButton() {
  return (
    <View style={styles.chevronButton}>
      <Text style={styles.chevron}>›</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.xl,
    backgroundColor: Colors.light.background,
  },
  hero: {
    gap: Spacing.md,
  },
  headline: {
    maxWidth: 370,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -1.25,
    color: Colors.light.text,
  },
  supportingCopy: {
    maxWidth: 350,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.light.textSecondary,
  },
  primaryAction: {
    minHeight: 58,
    width: '100%',
    marginTop: Spacing.xs,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.light.primary,
  },
  primaryActionPressed: {
    backgroundColor: Colors.light.primaryPressed,
  },
  primaryActionText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  primaryActionArrow: {
    fontSize: 25,
    lineHeight: 26,
    color: Colors.light.gold,
  },
  serviceList: {
    gap: Spacing.md,
  },
  serviceCard: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    ...SHADOW,
  },
  iconWell: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F5F8',
  },
  phoneIcon: {
    width: 28,
    height: 46,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: Colors.light.primary,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  phoneSpeaker: { width: 8, height: 2, borderRadius: 1, backgroundColor: Colors.light.primary },
  phoneButton: { width: 7, height: 3, borderRadius: 2, backgroundColor: Colors.light.primary },
  signalIcon: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
  },
  signalBar: { width: 7, borderRadius: 4, backgroundColor: Colors.light.primary },
  signalBarOne: { height: 17 },
  signalBarTwo: { height: 27 },
  signalBarThree: { height: 38 },
  signalBarFour: { height: 48 },
  documentIcon: {
    width: 34,
    height: 46,
    borderRadius: 5,
    borderWidth: 3,
    borderColor: Colors.light.primary,
    padding: 6,
    gap: 6,
  },
  documentLineShort: { width: 9, height: 3, borderRadius: 2, backgroundColor: Colors.light.primary },
  documentLine: { width: 17, height: 3, borderRadius: 2, backgroundColor: Colors.light.primary },
  iconBadge: {
    position: 'absolute',
    right: 2,
    bottom: 3,
    width: 29,
    height: 29,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.gold,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  iconBadgeText: { fontSize: 16, lineHeight: 18, fontWeight: '700', color: '#FFFFFF' },
  serviceText: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    gap: 5,
  },
  serviceTitle: { fontSize: 18, lineHeight: 23, fontWeight: '700', color: Colors.light.text },
  serviceDescription: { fontSize: 14, lineHeight: 20, color: Colors.light.textSecondary },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#FBF5E9',
  },
  badgeText: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: '#9A6815' },
  chevronButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FBF6EC',
  },
  chevron: { marginTop: -2, fontSize: 28, lineHeight: 30, fontWeight: '500', color: '#B77A12' },
  drawCard: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E8D6B4',
    backgroundColor: '#FFFCF7',
  },
  drawIconWell: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F3EA',
  },
  drawIcon: { fontSize: 25, color: Colors.light.gold },
  drawText: { flex: 1, gap: 4 },
  drawTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: Colors.light.text },
  drawCopy: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  pressed: { opacity: 0.72 },
});
