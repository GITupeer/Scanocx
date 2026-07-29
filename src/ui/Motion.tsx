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

/**
 * Ambientowe „świetlne” orbity w hero Home — wolny dryf + oddech.
 * Umieścić jako pierwsze dziecko kontenera z overflow: hidden.
 */
export function HomeHeroOrbs() {
  const driftA = useRef(new Animated.Value(0)).current;
  const driftB = useRef(new Animated.Value(0)).current;
  const driftC = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loopDrift = (value: Animated.Value, duration: number, delay = 0) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );

    const loops = [
      loopDrift(driftA, 5600),
      loopDrift(driftB, 7200, 400),
      loopDrift(driftC, 8400, 900),
      Animated.loop(
        Animated.sequence([
          Animated.timing(breath, {
            toValue: 1,
            duration: 4200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(breath, {
            toValue: 0,
            duration: 4200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    ];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [breath, driftA, driftB, driftC]);

  const orbA = {
    opacity: driftA.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.28, 0.48, 0.28] }),
    transform: [
      { translateX: driftA.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }) },
      { translateY: driftA.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
      { scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
    ],
  };

  const orbB = {
    opacity: driftB.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.22, 0.4, 0.22] }),
    transform: [
      { translateX: driftB.interpolate({ inputRange: [0, 1], outputRange: [0, -34] }) },
      { translateY: driftB.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) },
      { scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1.05, 0.92] }) },
    ],
  };

  const orbC = {
    opacity: driftC.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.18, 0.36, 0.18] }),
    transform: [
      { translateX: driftC.interpolate({ inputRange: [0, 1], outputRange: [-12, 20] }) },
      { translateY: driftC.interpolate({ inputRange: [0, 1], outputRange: [10, -16] }) },
      { scale: driftC.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }) },
    ],
  };

  const sheenX = driftA.interpolate({ inputRange: [0, 1], outputRange: [-80, 120] });
  const sheenOpacity = breath.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0.06, 0.16, 0.06],
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.heroOrb, styles.heroOrbA, orbA]} />
      <Animated.View style={[styles.heroOrb, styles.heroOrbB, orbB]} />
      <Animated.View style={[styles.heroOrb, styles.heroOrbC, orbC]} />
      <Animated.View
        style={[
          styles.heroSheen,
          { opacity: sheenOpacity, transform: [{ translateX: sheenX }, { rotate: '-18deg' }] },
        ]}
      />
    </View>
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
  heroOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  heroOrbA: {
    width: 220,
    height: 220,
    top: -70,
    right: -50,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  heroOrbB: {
    width: 180,
    height: 180,
    top: 40,
    left: -80,
    backgroundColor: 'rgba(180,160,255,0.55)',
  },
  heroOrbC: {
    width: 140,
    height: 140,
    bottom: 20,
    right: 40,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  heroSheen: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    width: 70,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
