/**
 * Jedno źródło ikon w aplikacji.
 *
 * Nazwy semantyczne → symbole natywne (SF Symbols na iOS, Material Symbols na
 * Androidzie/web) + znak zapasowy, gdy symbol nie jest dostępny.
 */
import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { colors } from './theme';

const ICONS = {
  library: { ios: 'books.vertical.fill', android: 'library_books', glyph: '▤' },
  book: { ios: 'book.closed.fill', android: 'auto_stories', glyph: '▭' },
  bookOpen: { ios: 'book.fill', android: 'menu_book', glyph: '▤' },
  ai: { ios: 'sparkles', android: 'auto_awesome', glyph: '✦' },
  scan: { ios: 'doc.text.viewfinder', android: 'document_scanner', glyph: '⛶' },
  camera: { ios: 'camera.fill', android: 'photo_camera', glyph: '◉' },
  frame: { ios: 'viewfinder', android: 'center_focus_strong', glyph: '⛶' },
  gallery: { ios: 'photo.on.rectangle', android: 'photo_library', glyph: '▨' },
  image: { ios: 'photo', android: 'image', glyph: '▨' },
  pdf: { ios: 'doc.richtext.fill', android: 'picture_as_pdf', glyph: 'PDF' },
  export: { ios: 'arrow.up.doc.fill', android: 'file_upload', glyph: '⤒' },
  ebook: { ios: 'book.fill', android: 'menu_book', glyph: '▤' },
  text: { ios: 'textformat', android: 'text_fields', glyph: 'Aa' },
  notes: { ios: 'text.alignleft', android: 'notes', glyph: '≡' },
  share: { ios: 'square.and.arrow.up', android: 'ios_share', glyph: '↗' },
  save: { ios: 'square.and.arrow.down.fill', android: 'save', glyph: '⤓' },
  edit: { ios: 'pencil', android: 'edit', glyph: '✎' },
  trash: { ios: 'trash', android: 'delete', glyph: '⌫' },
  rotate: { ios: 'arrow.clockwise', android: 'rotate_right', glyph: '↻' },
  refresh: { ios: 'arrow.triangle.2.circlepath', android: 'refresh', glyph: '↺' },
  swap: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', glyph: '⇄' },
  sort: { ios: 'arrow.up.arrow.down', android: 'swap_vert', glyph: '⇅' },
  plus: { ios: 'plus', android: 'add', glyph: '＋' },
  close: { ios: 'xmark', android: 'close', glyph: '✕' },
  check: { ios: 'checkmark', android: 'check', glyph: '✓' },
  checkCircle: { ios: 'checkmark.circle.fill', android: 'check_circle', glyph: '✓' },
  alert: { ios: 'exclamationmark.triangle.fill', android: 'warning', glyph: '!' },
  info: { ios: 'info.circle.fill', android: 'info', glyph: 'i' },
  pending: { ios: 'hourglass', android: 'hourglass_empty', glyph: '◔' },
  clock: { ios: 'clock.fill', android: 'schedule', glyph: '◷' },
  chip: { ios: 'cpu.fill', android: 'memory', glyph: '▩' },
  bolt: { ios: 'bolt.fill', android: 'bolt', glyph: '⚡' },
  torchOn: { ios: 'bolt.fill', android: 'flashlight_on', glyph: '⚡' },
  torchOff: { ios: 'bolt.slash.fill', android: 'flashlight_off', glyph: '⚡' },
  search: { ios: 'magnifyingglass', android: 'search', glyph: '⌕' },
  grid: { ios: 'square.grid.2x2.fill', android: 'grid_view', glyph: '▦' },
  settings: { ios: 'gearshape.fill', android: 'settings', glyph: '⚙' },
  tune: { ios: 'slider.horizontal.3', android: 'tune', glyph: '≣' },
  more: { ios: 'ellipsis', android: 'more_horiz', glyph: '⋯' },
  back: { ios: 'chevron.left', android: 'arrow_back', glyph: '‹' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', glyph: '›' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', glyph: '‹' },
  arrowRight: { ios: 'arrow.right', android: 'arrow_forward', glyph: '→' },
  eye: { ios: 'eye.fill', android: 'visibility', glyph: '◉' },
  eyeOff: { ios: 'eye.slash.fill', android: 'visibility_off', glyph: '◍' },
  lock: { ios: 'lock.fill', android: 'lock', glyph: '▮' },
  user: { ios: 'person.fill', android: 'person', glyph: '☺' },
  shield: { ios: 'lock.shield.fill', android: 'shield', glyph: '⛨' },
  storage: { ios: 'internaldrive.fill', android: 'storage', glyph: '▤' },
  tips: { ios: 'lightbulb.fill', android: 'tips_and_updates', glyph: '✦' },
  play: { ios: 'play.fill', android: 'play_arrow', glyph: '▶' },
  pause: { ios: 'pause.fill', android: 'pause', glyph: '⏸' },
  stats: { ios: 'chart.bar.fill', android: 'bar_chart', glyph: '▥' },
  menu: { ios: 'line.3.horizontal', android: 'menu', glyph: '☰' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more', glyph: '▾' },
  home: { ios: 'house.fill', android: 'home', glyph: '⌂' },
} as const;

export type IconName = keyof typeof ICONS;

type Props = {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, size = 20, color = colors.ink, style }: Props) {
  const spec = ICONS[name];

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      <SymbolView
        name={{ ios: spec.ios, android: spec.android, web: spec.android }}
        size={size}
        tintColor={color}
        fallback={
          <Text
            allowFontScaling={false}
            style={{
              fontSize: Math.round(size * 0.8),
              lineHeight: Math.round(size * 1.05),
              fontWeight: '700',
              color: color as string,
            }}>
            {spec.glyph}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
