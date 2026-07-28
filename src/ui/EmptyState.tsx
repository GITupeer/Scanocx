import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Button } from './Button';
import { Gradient } from './Gradient';
import { Icon, type IconName } from './Icon';
import { colors, font, gradients, radius, space } from './theme';

type Props = {
  icon?: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({ icon = 'ai', title, body, action, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <Gradient colors={gradients.aurora} fallbackColor={colors.primarySoft} style={styles.orb}>
        <Icon name={icon} size={30} color={colors.primary} />
      </Gradient>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? (
        <Button
          label={action.label}
          icon={action.icon}
          onPress={action.onPress}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: space.xxl,
    paddingVertical: space.huge,
    gap: space.md,
  },
  orb: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: space.xs,
  },
  title: {
    ...font.h2,
    textAlign: 'center',
  },
  body: {
    ...font.body,
    textAlign: 'center',
    maxWidth: 280,
  },
  action: {
    marginTop: space.md,
    minWidth: 200,
    borderRadius: radius.pill,
  },
});
