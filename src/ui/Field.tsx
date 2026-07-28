import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { Icon, type IconName } from './Icon';
import { colors, font, radius, space } from './theme';

type FieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  label?: string;
  hint?: string;
  placeholder?: string;
  icon?: IconName;
  multiline?: boolean;
  autoFocus?: boolean;
  minHeight?: number;
  maxLength?: number;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'next' | 'go';
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'number-pad';
  autoComplete?: 'email' | 'password' | 'name' | 'off';
  textContentType?: 'emailAddress' | 'password' | 'newPassword' | 'name' | 'none';
};

export function TextField({
  value,
  onChangeText,
  label,
  hint,
  placeholder,
  icon,
  multiline,
  autoFocus,
  minHeight,
  maxLength,
  style,
  inputStyle,
  onSubmitEditing,
  returnKeyType,
  secureTextEntry,
  autoCapitalize,
  keyboardType,
  autoComplete,
  textContentType,
}: FieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.block, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.shell,
          multiline && styles.shellMultiline,
          focused && styles.shellFocused,
          minHeight ? { minHeight } : null,
        ]}>
        {icon ? (
          <Icon
            name={icon}
            size={18}
            color={focused ? colors.primary : colors.faint}
            style={multiline ? styles.iconTop : undefined}
          />
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          multiline={multiline}
          autoFocus={autoFocus}
          maxLength={maxLength}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          textContentType={textContentType}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          style={[styles.input, multiline && styles.inputMultiline, inputStyle]}
        />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Szukaj…',
  style,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.search, focused && styles.shellFocused, style]}>
      <Icon name="search" size={17} color={focused ? colors.primary : colors.faint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType="search"
        style={styles.searchInput}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wyczyść"
          hitSlop={8}
          onPress={() => onChangeText('')}>
          <Icon name="close" size={15} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: space.sm,
  },
  label: {
    ...font.caption,
    textTransform: 'uppercase',
  },
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  shellMultiline: {
    alignItems: 'flex-start',
    paddingVertical: space.md,
  },
  shellFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  iconTop: {
    marginTop: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.ink,
    paddingVertical: space.md,
  },
  inputMultiline: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '400',
    paddingTop: 0,
  },
  hint: {
    ...font.small,
    fontSize: 12.5,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  searchInput: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '500',
    color: colors.ink,
    paddingVertical: 0,
  },
});
