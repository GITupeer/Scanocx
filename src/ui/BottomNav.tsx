import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './Icon';
import { BOTTOM_NAV_HEIGHT, colors, radius, shadow, space } from './theme';

export type NavTab = 'library' | 'menu';

const TABS: { key: NavTab; label: string; icon: IconName; href: '/' | '/menu' }[] = [
  { key: 'library', label: 'Biblioteka', icon: 'library', href: '/' },
  { key: 'menu', label: 'Menu', icon: 'tune', href: '/menu' },
];

const FAB_SIZE = 48;
/** Lekki odstęp między paskiem a home indicator / dolną krawędzią. */
const BOTTOM_GAP = space.sm;

/** Odstęp, jaki treść ekranu musi zostawić pod pływającym paskiem. */
export function useBottomNavInset() {
  const insets = useSafeAreaInsets();
  return BOTTOM_NAV_HEIGHT + insets.bottom + BOTTOM_GAP + space.xl;
}

type Props = {
  active: NavTab;
  onScan: () => void;
  scanBadge?: number;
};

export function BottomNav({ active, onScan, scanBadge }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: insets.bottom + BOTTOM_GAP }]}>
      <View style={styles.bar}>
        <TabButton
          tab={TABS[0]}
          active={active === TABS[0].key}
          onPress={() => {
            if (active !== TABS[0].key) router.replace(TABS[0].href);
          }}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skanuj strony"
          onPress={onScan}
          style={({ pressed }) => [styles.fabSlot, pressed && styles.fabPressed]}>
          <View style={styles.fab}>
            <Icon name="scan" size={22} color={colors.white} />
          </View>
          {scanBadge && scanBadge > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{scanBadge > 99 ? '99+' : scanBadge}</Text>
            </View>
          ) : null}
        </Pressable>

        <TabButton
          tab={TABS[1]}
          active={active === TABS[1].key}
          onPress={() => {
            if (active !== TABS[1].key) router.replace(TABS[1].href);
          }}
        />
      </View>
    </View>
  );
}

function TabButton({
  tab,
  active,
  onPress,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={tab.label}
      onPress={onPress}
      style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}>
      <Icon name={tab.icon} size={22} color={active ? colors.primary : colors.inkSoft} />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.xxl,
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    maxWidth: 420,
    height: BOTTOM_NAV_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xxl,
    backgroundColor: colors.surface,
    paddingHorizontal: space.sm,
    ...shadow.float,
  },
  tab: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabPressed: {
    opacity: 0.65,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.15,
    color: colors.inkSoft,
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  fabSlot: {
    width: FAB_SIZE + space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPressed: {
    transform: [{ scale: 0.94 }],
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 8,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: 0,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
});
