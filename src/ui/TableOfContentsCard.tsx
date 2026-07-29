import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import type { BookPage } from '@/src/domain/types';

import { colors, font, radius, shadow, space } from './theme';

export type TocEntry = {
  pageId: string;
  pageIndex: number;
  pageLabel: string;
  /** 0 = tytuł / rozdział, 1 = podtytuł */
  level: 0 | 1;
  text: string;
};

/** Buduje spis treści z tytułów i podtytułów wykrytych przez AI. */
export function buildTableOfContents(pages: BookPage[]): TocEntry[] {
  const ordered = [...pages].sort((a, b) => a.index - b.index);
  const entries: TocEntry[] = [];
  let lastTitle: string | null = null;
  let lastSubtitle: string | null = null;

  for (const page of ordered) {
    const analysis = page.aiAnalysis;
    if (!analysis) continue;

    const title = analysis.title?.trim() || null;
    const subtitle = analysis.subtitle?.trim() || null;
    if (!title && !subtitle) continue;

    if (title === lastTitle && subtitle === lastSubtitle) continue;
    lastTitle = title;
    lastSubtitle = subtitle;

    const pageLabel = String(page.index);
    const base = {
      pageId: page.id,
      pageIndex: page.index,
      pageLabel,
    };

    if (title) {
      const prevTitle = [...entries].reverse().find((entry) => entry.level === 0);
      if (!prevTitle || prevTitle.text !== title) {
        entries.push({ ...base, level: 0, text: title });
      }
    }

    if (subtitle) {
      const prev = entries[entries.length - 1];
      if (!prev || prev.level !== 1 || prev.text !== subtitle) {
        entries.push({ ...base, level: 1, text: subtitle });
      }
    }
  }

  return entries;
}

type TocGroup = {
  key: string;
  title: TocEntry | null;
  children: TocEntry[];
};

function groupEntries(entries: TocEntry[]): TocGroup[] {
  const groups: TocGroup[] = [];

  for (const entry of entries) {
    if (entry.level === 0) {
      groups.push({
        key: `${entry.pageId}:t:${entry.text}`,
        title: entry,
        children: [],
      });
      continue;
    }

    const current = groups[groups.length - 1];
    if (current) {
      current.children.push(entry);
    } else {
      groups.push({
        key: `${entry.pageId}:s:${entry.text}`,
        title: null,
        children: [entry],
      });
    }
  }

  return groups;
}

type Props = {
  entries: TocEntry[];
  onPressEntry: (entry: TocEntry) => void;
  /** Gdy true — bez zewnętrznej karty (np. pełna zakładka). */
  plain?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Spis treści książki — nagłówki i podtytuły z analizy AI.
 * Ukryty, gdy AI nie wykryło żadnych tytułów (chyba że plain — wtedy pusto).
 */
export function TableOfContentsCard({ entries, onPressEntry, plain, style }: Props) {
  if (entries.length === 0) return null;

  const groups = groupEntries(entries);
  const body = (
    <View style={styles.groups}>
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          {group.title ? (
            <TocRow entry={group.title} onPress={onPressEntry} />
          ) : null}
          {group.children.length > 0 ? (
            <View style={styles.children}>
              {group.children.map((child) => (
                <TocRow
                  key={`${child.pageId}:${child.text}`}
                  entry={child}
                  onPress={onPressEntry}
                />
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );

  if (plain) {
    return <View style={style}>{body}</View>;
  }

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Spis treści</Text>
        <Text style={styles.count}>{entries.length}</Text>
      </View>
      {body}
    </View>
  );
}

function TocRow({
  entry,
  onPress,
}: {
  entry: TocEntry;
  onPress: (entry: TocEntry) => void;
}) {
  const nested = entry.level === 1;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.text}, strona ${entry.pageLabel}`}
      onPress={() => onPress(entry)}
      style={({ pressed }) => [
        styles.row,
        nested && styles.rowNested,
        pressed && styles.rowPressed,
      ]}>
      <Text style={[styles.rowText, nested && styles.rowTextNested]} numberOfLines={2}>
        {entry.text}
      </Text>
      <View style={[styles.pageChip, nested && styles.pageChipNested]}>
        <Text style={[styles.pageChipText, nested && styles.pageChipTextNested]}>
          {entry.pageLabel}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: space.md,
    ...shadow.soft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    ...font.caption,
    textTransform: 'uppercase',
  },
  count: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    fontVariant: ['tabular-nums'],
    overflow: 'hidden',
  },
  groups: {
    gap: space.sm,
  },
  group: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  children: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingLeft: space.lg,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
  },
  rowNested: {
    paddingVertical: 10,
    paddingRight: space.md,
  },
  rowPressed: {
    backgroundColor: colors.pressTint,
  },
  rowText: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: colors.ink,
    lineHeight: 19,
  },
  rowTextNested: {
    fontSize: 13.5,
    fontWeight: '500',
    color: colors.inkSoft,
    lineHeight: 18,
  },
  pageChip: {
    minWidth: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
  },
  pageChipNested: {
    backgroundColor: colors.surfaceMuted,
  },
  pageChipText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.primaryDeep,
    fontVariant: ['tabular-nums'],
  },
  pageChipTextNested: {
    fontWeight: '700',
    color: colors.muted,
  },
});
