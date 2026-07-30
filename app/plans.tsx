import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/src/auth/AuthProvider';
import { useOcrQueue } from '@/src/ocr/queue';
import {
  FREE_AI_MONTHLY_LIMIT,
  PLAN_FEATURES,
  PRO_AI_MONTHLY_LIMIT,
  PRO_OCR_MONTHLY_LIMIT,
} from '@/src/plans/features';
import {
  BottomNav,
  Button,
  FadeInUp,
  Gradient,
  HomeHeroOrbs,
  Icon,
  colors,
  font,
  gradients,
  radius,
  shadow,
  space,
  useBottomNavInset,
} from '@/src/ui';

function planLabel(plan: string | undefined): string {
  return plan === 'pro' ? 'Pro' : 'Darmowy';
}

function userInitials(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email?.trim() || '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default function PlansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomNavInset();
  const queue = useOcrQueue();
  const { user, isLoggedIn } = useAuth();

  const isPro = user?.plan === 'pro';

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + space.xl }}>
        <FadeInUp>
          <Gradient
            colors={gradients.homeHero}
            angle={165}
            fallbackColor={colors.blue}
            style={[styles.hero, { paddingTop: insets.top + space.md }]}>
            <HomeHeroOrbs />

            <FadeInUp delay={40} distance={10}>
              <View style={styles.heroTop}>
                <View style={styles.heroIconBtn}>
                  <Icon name="bolt" size={22} color={colors.white} />
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isLoggedIn
                      ? `Plan ${planLabel(user?.plan)}`
                      : 'Zaloguj się'
                  }
                  onPress={() =>
                    router.push(
                      (isLoggedIn
                        ? isPro
                          ? '/usage'
                          : '/subscribe'
                        : '/login') as Href,
                    )
                  }
                  style={({ pressed }) => [
                    styles.planPill,
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.planAvatar}>
                    {isLoggedIn && user ? (
                      <Text style={styles.planAvatarText}>
                        {userInitials(user.name, user.email)}
                      </Text>
                    ) : (
                      <Icon name="user" size={14} color={colors.primary} />
                    )}
                  </View>
                  <Text style={styles.planLabel} numberOfLines={1}>
                    {isLoggedIn ? planLabel(user?.plan) : 'Konto'}
                  </Text>
                  <Icon name="chevronRight" size={14} color={colors.inkSoft} />
                </Pressable>
              </View>
            </FadeInUp>

            <FadeInUp delay={120} distance={16}>
              <Text style={styles.welcomeLine}>Plany</Text>
              <Text style={styles.welcomeName}>Free vs Pro</Text>
              <Text style={styles.welcomeSub}>
                Limity OCR, AI i eksportów — w jednym miejscu
              </Text>
            </FadeInUp>
          </Gradient>
        </FadeInUp>

        <View style={styles.body}>
          <FadeInUp delay={160} distance={14}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Porównanie</Text>
              {!isPro ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() =>
                    router.push((isLoggedIn ? '/subscribe' : '/login') as Href)
                  }
                  style={({ pressed }) => pressed && styles.pressed}>
                  <Text style={styles.sectionLink}>Przejdź na Pro</Text>
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.periodNote}>
              Liczby dotyczą jednego okresu rozliczeniowego (miesiąc).
            </Text>

            <View style={styles.compare}>
              <View style={styles.compareHeader}>
                <Text style={styles.compareFeatureCol}>Funkcja</Text>
                <Text style={[styles.compareCol, styles.compareColFree]}>Free</Text>
                <Text style={[styles.compareCol, styles.compareColPro]}>Pro</Text>
              </View>

              {PLAN_FEATURES.map((feature, index) => (
                <View
                  key={feature.title}
                  style={[
                    styles.compareRow,
                    index === PLAN_FEATURES.length - 1 && styles.compareRowLast,
                  ]}>
                  <View style={styles.compareFeature}>
                    <View style={styles.compareIcon}>
                      <Icon name={feature.icon} size={15} color={colors.primary} />
                    </View>
                    <Text style={styles.compareFeatureLabel}>{feature.title}</Text>
                  </View>
                  <Text style={[styles.compareValue, styles.compareValueFree]}>
                    {feature.free}
                  </Text>
                  <Text style={[styles.compareValue, styles.compareValuePro]}>
                    {feature.pro}
                  </Text>
                </View>
              ))}
            </View>
          </FadeInUp>

          <FadeInUp delay={360} distance={14}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Jak działają limity</Text>
            </View>
            <View style={styles.panel}>
              {[
                {
                  icon: 'clock' as const,
                  text: 'Limity OCR, AI, zdjęć i PDF odnawiają się z każdym okresem rozliczeniowym.',
                },
                {
                  icon: 'lock' as const,
                  text: 'OCR wymaga konta — gość może tylko robić zdjęcia.',
                },
                {
                  icon: 'ai' as const,
                  text: `AI: Free ${FREE_AI_MONTHLY_LIMIT.toLocaleString('pl-PL')} tokenów (~5 stron), Pro ${PRO_AI_MONTHLY_LIMIT.toLocaleString('pl-PL')} tokenów (~1000 stron).`,
                },
                {
                  icon: 'bolt' as const,
                  text: `Pro: ${PRO_OCR_MONTHLY_LIMIT.toLocaleString('pl-PL')} OCR i priorytetowa kolejka AI.`,
                },
                {
                  icon: 'ebook' as const,
                  text: 'Export eBook dostępny wyłącznie w planie Pro.',
                },
              ].map((item, index, arr) => (
                <View key={item.text}>
                  <View style={styles.noteRow}>
                    <View style={styles.noteIcon}>
                      <Icon name={item.icon} size={16} color={colors.primary} />
                    </View>
                    <Text style={styles.noteText}>{item.text}</Text>
                  </View>
                  {index < arr.length - 1 ? <View style={styles.noteDivider} /> : null}
                </View>
              ))}
            </View>
          </FadeInUp>

          <FadeInUp delay={420} distance={14}>
            {!isPro ? (
              <View style={styles.ctaCard}>
                <View style={styles.ctaIcon}>
                  <Icon name="bolt" size={20} color="#7C3AED" />
                </View>
                <View style={styles.ctaText}>
                  <Text style={styles.ctaTitle}>Odblokuj Scanocx Pro</Text>
                  <Text style={styles.ctaBody}>
                    {PRO_AI_MONTHLY_LIMIT.toLocaleString('pl-PL')} tokenów AI (~1000 stron),{' '}
                    {PRO_OCR_MONTHLY_LIMIT.toLocaleString('pl-PL')} OCR i eksport eBook bez ograniczeń.
                  </Text>
                </View>
                <Button
                  label={isLoggedIn ? 'Zobacz subskrypcję' : 'Zaloguj się'}
                  icon="bolt"
                  onPress={() =>
                    router.push((isLoggedIn ? '/subscribe' : '/login') as Href)
                  }
                />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/usage')}
                style={({ pressed }) => [
                  styles.proCard,
                  pressed && styles.proCardPressed,
                ]}>
                <View style={[styles.ctaIcon, { backgroundColor: '#D1FAE5' }]}>
                  <Icon name="checkCircle" size={18} color="#059669" />
                </View>
                <View style={styles.ctaText}>
                  <Text style={styles.ctaTitle}>Masz plan Pro</Text>
                  <Text style={styles.ctaBody}>
                    {PRO_OCR_MONTHLY_LIMIT.toLocaleString('pl-PL')} OCR ·{' '}
                    {PRO_AI_MONTHLY_LIMIT.toLocaleString('pl-PL')} tokenów AI (~1000 stron)
                  </Text>
                </View>
                <Icon name="chevronRight" size={18} color={colors.muted} />
              </Pressable>
            )}
          </FadeInUp>
        </View>
      </ScrollView>

      <BottomNav
        active="plans"
        onScan={() => router.push('/?scan=1' as Href)}
        scanBadge={queue.remaining}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  pressed: {
    opacity: 0.82,
  },
  hero: {
    overflow: 'hidden',
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xl,
  },
  heroIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 160,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 12,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    ...shadow.soft,
  },
  planAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  planAvatarText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.2,
  },
  planLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.2,
  },
  welcomeLine: {
    fontSize: 22,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: -0.4,
    lineHeight: 26,
    marginBottom: 2,
  },
  welcomeName: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.8,
    lineHeight: 34,
    marginBottom: 6,
  },
  welcomeSub: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  body: {
    paddingTop: space.xxl,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
    marginBottom: space.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.4,
  },
  sectionLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3B82F6',
    letterSpacing: -0.2,
  },
  periodNote: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
    letterSpacing: -0.15,
    lineHeight: 18,
    marginTop: -space.sm,
    marginBottom: space.md,
  },
  compare: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: space.sm,
    ...shadow.soft,
  },
  compareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.surfaceMuted,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  compareFeatureCol: {
    flex: 1.15,
    ...font.caption,
    textTransform: 'uppercase',
  },
  compareCol: {
    flex: 1,
    textAlign: 'right',
    ...font.caption,
    textTransform: 'uppercase',
  },
  compareColFree: {
    textAlign: 'left',
  },
  compareColPro: {
    color: colors.primaryDeep,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  compareRowLast: {
    borderBottomWidth: 0,
  },
  compareFeature: {
    flex: 1.15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  compareIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compareFeatureLabel: {
    ...font.label,
    fontSize: 13.5,
    flexShrink: 1,
  },
  compareValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.muted,
    lineHeight: 17,
  },
  compareValueFree: {
    textAlign: 'left',
  },
  compareValuePro: {
    color: colors.primaryDeep,
    fontWeight: '700',
  },
  panel: {
    padding: space.lg,
    backgroundColor: colors.surface,
    borderRadius: 18,
    marginBottom: space.sm,
    ...shadow.soft,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  noteIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  noteText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '500',
    color: colors.inkSoft,
    letterSpacing: -0.15,
    lineHeight: 19,
    paddingTop: 5,
  },
  noteDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: space.md,
    marginLeft: 32 + space.md,
  },
  ctaCard: {
    gap: space.md,
    padding: space.lg,
    backgroundColor: colors.surface,
    borderRadius: 18,
    marginTop: space.md,
    marginBottom: space.sm,
    ...shadow.soft,
  },
  ctaIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDE9FE',
  },
  ctaText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  ctaTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  ctaBody: {
    fontSize: 13.5,
    fontWeight: '500',
    color: colors.muted,
    letterSpacing: -0.15,
    lineHeight: 19,
  },
  proCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    backgroundColor: colors.surface,
    borderRadius: 18,
    marginTop: space.md,
    marginBottom: space.sm,
    ...shadow.soft,
  },
  proCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
});
