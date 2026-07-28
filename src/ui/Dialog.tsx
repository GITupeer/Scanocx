import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { Gradient } from './Gradient';
import { Icon, type IconName } from './Icon';
import { colors, font, gradients, radius, shadow, space } from './theme';

type DialogProps = {
  visible: boolean;
  onClose: () => void;
  icon?: IconName;
  tone?: 'primary' | 'danger';
  title: string;
  body?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  dismissOnBackdrop?: boolean;
};

export function Dialog({
  visible,
  onClose,
  icon,
  tone = 'primary',
  title,
  body,
  children,
  actions,
  dismissOnBackdrop = true,
}: DialogProps) {
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(anim, {
        toValue: 1,
        damping: 20,
        stiffness: 260,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(anim, {
      toValue: 0,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [anim, visible]);

  if (!mounted) return null;

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: anim }]}>
          {dismissOnBackdrop ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zamknij"
              style={StyleSheet.absoluteFill}
              onPress={onClose}
            />
          ) : null}
        </Animated.View>

        <Animated.View style={[styles.card, { opacity: anim, transform: [{ scale }] }]}>
          {icon ? (
            <Gradient
              colors={tone === 'danger' ? gradients.rose : gradients.brand}
              style={styles.icon}>
              <Icon name={icon} size={22} color={colors.white} />
            </Gradient>
          ) : null}

          <View style={styles.texts}>
            <Text style={styles.title}>{title}</Text>
            {body ? <Text style={styles.body}>{body}</Text> : null}
          </View>

          {children}
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

type ConfirmProps = {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  icon?: IconName;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel = 'Potwierdź',
  cancelLabel = 'Anuluj',
  tone = 'danger',
  icon = 'trash',
  busy,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <Dialog
      visible={visible}
      onClose={onCancel}
      icon={icon}
      tone={tone}
      title={title}
      body={body}
      actions={
        <>
          <Button label={cancelLabel} variant="outline" onPress={onCancel} style={styles.flex} />
          <Button
            label={confirmLabel}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={busy}
            onPress={onConfirm}
            style={styles.flex}
          />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    padding: space.xxl,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: space.xl,
    gap: space.lg,
    ...shadow.float,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    gap: space.sm,
  },
  title: {
    ...font.h2,
  },
  body: {
    ...font.body,
  },
  actions: {
    flexDirection: 'row',
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
});
