import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth/AuthProvider";
import {
  PLAN_FEATURES,
  PRO_AI_MONTHLY_LIMIT,
  PRO_OCR_MONTHLY_LIMIT,
} from "@/src/plans/features";
import {
  AppBar,
  AuroraBackdrop,
  Badge,
  Button,
  Gradient,
  Icon,
  colors,
  font,
  gradients,
  radius,
  shadow,
  space,
} from "@/src/ui";

type BillingPeriod = "monthly" | "yearly";

const PRICES = {
  monthly: {
    amount: "14,99",
    oldAmount: "29,99",
    discount: "50%",
    suffix: "zł / miesiąc",
    note: "Anuluj w dowolnym momencie",
  },
  yearly: {
    amount: "239,99",
    suffix: "zł / rok",
    note: "Oszczędzasz ok. 33% · 20 zł / miesiąc",
  },
} as const;

export default function SubscribeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, ready, isLoggedIn } = useAuth();
  const [period, setPeriod] = useState<BillingPeriod>("monthly");

  const isPro = user?.plan === "pro";
  const price = PRICES[period];

  const periodOptions = useMemo(
    () =>
      [
        { id: "monthly" as const, label: "Miesięcznie" },
        // { id: "yearly" as const, label: "Rocznie" },
      ] as const,
    [],
  );

  const onSubscribe = () => {
    if (!ready) return;
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    Alert.alert(
      "Wkrótce",
      "Płatności są w przygotowaniu. Subskrypcję Pro możesz na razie otrzymać od administratora.",
    );
  };

  return (
    <View style={styles.root}>
      <AuroraBackdrop height={340} />
      <AppBar
        title="Scanocx Pro"
        subtitle={isPro ? "Masz już plan Pro" : "Odblokuj pełny potencjał"}
        onBack={() => router.back()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.xxxl },
        ]}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Gradient
              colors={gradients.brand}
              style={StyleSheet.absoluteFill}
            />
            <Icon name="bolt" size={28} color={colors.white} />
          </View>
          <Text style={styles.heroTitle}>Więcej AI. Więcej OCR.</Text>
          <Text style={styles.heroBody}>
            Pro: {PRO_AI_MONTHLY_LIMIT.toLocaleString("pl-PL")} tokenów AI (~1000 stron) i{" "}
            {PRO_OCR_MONTHLY_LIMIT.toLocaleString("pl-PL")} OCR na miesiąc — bez limitu książek i
            eksportów.
          </Text>
        </View>

        {isPro ? (
          <View style={styles.proActive}>
            <Icon name="checkCircle" size={22} color={colors.success} />
            <View style={styles.proActiveText}>
              <Text style={styles.proActiveTitle}>Subskrypcja aktywna</Text>
              <Text style={styles.proActiveDetail}>
                Korzystasz z limitu Pro: {PRO_AI_MONTHLY_LIMIT.toLocaleString("pl-PL")} tokenów AI
                (~1000 stron) i {PRO_OCR_MONTHLY_LIMIT.toLocaleString("pl-PL")} OCR na okres.
              </Text>
            </View>
          </View>
        ) : (
          <>
            {/* <SegmentedControl
              options={periodOptions}
              value={period}
              onChange={setPeriod}
            /> */}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: true }}
              onPress={onSubscribe}
              style={({ pressed }) => [
                styles.planCard,
                pressed && styles.planCardPressed,
              ]}
            >
              <Gradient
                colors={gradients.aurora}
                fallbackColor={colors.primarySoft}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.planTop}>
                <View style={styles.planTitles}>
                  <Text style={styles.planName}>Pro · miesięcznie</Text>
                  <Text style={styles.planTagline}>
                    Najlepszy wybór do regularnego skanowania
                  </Text>
                </View>
                {"discount" in price ? (
                  <Badge
                    label={`−${price.discount}`}
                    tone="warning"
                    icon="bolt"
                  />
                ) : period === "yearly" ? (
                  <Badge label="−33%" tone="success" icon="bolt" />
                ) : (
                  <Badge label="Popularne" tone="primary" icon="ai" />
                )}
              </View>

              <View style={styles.priceRow}>
                {"oldAmount" in price ? (
                  <Text style={styles.priceOld}>{price.oldAmount}</Text>
                ) : null}
                <Text style={styles.priceAmount}>{price.amount}</Text>
                <Text style={styles.priceSuffix}>{price.suffix}</Text>
              </View>

              {"oldAmount" in price && "discount" in price ? (
                <View style={styles.promoInline}>
                  <Text style={styles.promoInlineTitle}>
                    Promocja startowa — połowa ceny
                  </Text>
                  <Text style={styles.promoInlineText}>
                    Zamiast {price.oldAmount} zł płacisz {price.amount} zł /
                    miesiąc. Oferta ograniczona czasowo.
                  </Text>
                </View>
              ) : null}

              <Text style={styles.priceNote}>{price.note}</Text>
            </Pressable>

            <Button
              label={isLoggedIn ? "Kup subskrypcję" : "Zaloguj się, aby kupić"}
              icon="bolt"
              size="lg"
              onPress={onSubscribe}
            />
          </>
        )}

        <Text style={styles.sectionTitle}>Co zyskujesz</Text>

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
              ]}
            >
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

        <View style={styles.perks}>
          {[
            `${PRO_AI_MONTHLY_LIMIT.toLocaleString("pl-PL")} tokenów AI (~1000 stron) na okres`,
            "Priorytetowa kolejka AI — szybsza analiza",
            `${PRO_OCR_MONTHLY_LIMIT.toLocaleString("pl-PL")} odczytów OCR na okres`,
            "TXT bez limitu · PDF i eBook bez limitu",
          ].map((line) => (
            <View key={line} style={styles.perkRow}>
              <Icon name="check" size={16} color={colors.success} />
              <Text style={styles.perkText}>{line}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.legal}>
          Płatności w aplikacji pojawią się wkrótce. Ceny przykładowe — tylko
          podgląd interfejsu.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: space.lg,
    gap: space.lg,
  },
  hero: {
    alignItems: "center",
    gap: space.md,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...shadow.float,
  },
  heroTitle: {
    ...font.h1,
    fontSize: 26,
    textAlign: "center",
  },
  heroBody: {
    ...font.body,
    textAlign: "center",
    maxWidth: 320,
  },
  proActive: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    backgroundColor: colors.successSoft,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
  },
  proActiveText: {
    flex: 1,
    gap: 4,
  },
  proActiveTitle: {
    ...font.h3,
    fontSize: 16,
  },
  proActiveDetail: {
    ...font.small,
  },
  planCard: {
    borderRadius: radius.xl,
    padding: space.xl,
    gap: space.sm,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: colors.primary,
    ...shadow.card,
  },
  planCardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  planTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.md,
  },
  planTitles: {
    flex: 1,
    gap: 4,
  },
  planName: {
    ...font.h2,
  },
  planTagline: {
    ...font.small,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.sm,
    marginTop: space.sm,
  },
  priceOld: {
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.4,
    color: colors.faint,
    textDecorationLine: "line-through",
    fontVariant: ["tabular-nums"],
  },
  priceAmount: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1.2,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  priceSuffix: {
    ...font.label,
    color: colors.muted,
  },
  promoInline: {
    marginTop: space.xs,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.warningSoft,
    gap: 4,
  },
  promoInlineTitle: {
    ...font.label,
    color: colors.ink,
  },
  promoInlineText: {
    ...font.small,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  priceNote: {
    ...font.small,
    color: colors.primaryDeep,
  },
  sectionTitle: {
    ...font.h3,
    marginTop: space.xs,
  },
  periodNote: {
    ...font.small,
    color: colors.muted,
    marginTop: -space.sm,
  },
  compare: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
    ...shadow.soft,
  },
  compareHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.surfaceMuted,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  compareFeatureCol: {
    flex: 1.15,
    ...font.caption,
    textTransform: "uppercase",
  },
  compareCol: {
    flex: 1,
    textAlign: "right",
    ...font.caption,
    textTransform: "uppercase",
  },
  compareColFree: {
    textAlign: "left",
  },
  compareColPro: {
    color: colors.primaryDeep,
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  compareIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  compareFeatureLabel: {
    ...font.label,
    fontSize: 13.5,
  },
  compareValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.muted,
    lineHeight: 17,
  },
  compareValueFree: {
    textAlign: "left",
  },
  compareValuePro: {
    color: colors.primaryDeep,
    fontWeight: "700",
  },
  perks: {
    gap: space.md,
    paddingHorizontal: space.xs,
  },
  perkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  perkText: {
    flex: 1,
    ...font.bodyStrong,
    fontSize: 14.5,
    color: colors.inkSoft,
  },
  legal: {
    ...font.small,
    textAlign: "center",
    color: colors.faint,
    paddingHorizontal: space.md,
  },
});
