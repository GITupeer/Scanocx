/** Lekkie animacje motywu „AI” — wszystkie na native driverze. */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Gradient } from './Gradient';
import { Icon } from './Icon';
import { colors, gradients, radius } from './theme';

/** Gradientowa kropka z pulsującą aureolą — sygnalizuje pracę AI. */
export function AiPulse({
  size = 34,
  active = true,
  style,
}: {
  size?: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1900,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [active, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.34, 0] });

  return (
    <View style={[{ width: size, height: size }, styles.center, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
      <Gradient
        colors={gradients.brandVivid}
        style={[styles.center, { width: size, height: size, borderRadius: size / 2 }]}>
        <Icon name="ai" size={Math.round(size * 0.5)} color={colors.white} />
      </Gradient>
    </View>
  );
}

/** Przesuwająca się smuga skanowania w ramce kamery. */
export function ScanBeam({ height, active = true }: { height: number; active?: boolean }) {
  const travel = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || height <= 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(travel, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(travel, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, height, travel]);

  if (!active || height <= 0) return null;

  const translateY = travel.interpolate({ inputRange: [0, 1], outputRange: [0, height - 3] });

  return (
    <Animated.View pointerEvents="none" style={[styles.beam, { transform: [{ translateY }] }]}>
      <Gradient
        colors={['rgba(124,92,255,0)', 'rgba(150,190,255,0.95)', 'rgba(124,92,255,0)']}
        angle={90}
        fallbackColor="rgba(150,190,255,0.7)"
        style={styles.beamFill}
      />
    </Animated.View>
  );
}

/** Delikatne wejście treści — używane na kartach nagłówkowych. */
export function FadeInUp({
  children,
  delay = 0,
  distance = 14,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(anim, {
      toValue: 1,
      duration: 380,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [anim, delay]);

  return (
    <Animated.View
      style={[
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
          ],
        },
        style,
      ]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    backgroundColor: colors.primary,
  },
  beam: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    borderRadius: radius.pill,
  },
  beamFill: {
    flex: 1,
    borderRadius: radius.pill,
  },
});
