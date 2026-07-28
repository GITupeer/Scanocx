import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BookSummary } from '@/src/domain/types';
import { useOcrQueue } from '@/src/ocr/queue';
import { createBook, deleteBook, listBooks } from '@/src/storage/books';
import {
  AuroraBackdrop,
  BookCover,
  BottomNav,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  FadeInUp,
  Icon,
  IconButton,
  Loader,
  Row,
  ScanQueueCard,
  SearchField,
  SectionHeader,
  Sheet,
  SheetGroup,
  TextField,
  colors,
  font,
  radius,
  shadow,
  space,
  useBottomNavInset,
} from '@/src/ui';
import { pages as pagesLabel, relativeDate } from '@/src/utils/format';

export default function LibraryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scan?: string }>();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomNavInset();
  const queue = useOcrQueue();

  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [sheetBook, setSheetBook] = useState<BookSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BookSummary | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBooks(await listBooks());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const totalPages = useMemo(
    () => books.reduce((sum, book) => sum + book.pageCount, 0),
    [books]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return books;
    return books.filter((book) => book.title.toLowerCase().includes(needle));
  }, [books, query]);

  const onCreate = async () => {
    setCreating(true);
    try {
      const book = await createBook(title);
      setCreateOpen(false);
      setTitle('');
      router.push(`/book/${book.id}`);
    } catch (error) {
      Alert.alert('Błąd', error instanceof Error ? error.message : 'Nie udało się utworzyć książki.');
    } finally {
      setCreating(false);
    }
  };

  const onConfirmDelete = () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    void (async () => {
      await deleteBook(target.id);
      await refresh();
    })();
  };

  const openScan = useCallback(() => {
    if (books.length === 0) {
      setCreateOpen(true);
      return;
    }
    setScanOpen(true);
  }, [books.length]);

  // Wejście z Menu („Skanuj”) otwiera wybór książki od razu po wczytaniu listy.
  const scanParamHandled = useRef(false);
  useEffect(() => {
    if (params.scan !== '1' || loading || scanParamHandled.current) return;
    scanParamHandled.current = true;
    openScan();
  }, [loading, openScan, params.scan]);

  if (loading && books.length === 0) {
    return <Loader label="Wczytywanie biblioteki…" />;
  }

  return (
    <View style={styles.root}>
      <AuroraBackdrop height={430} />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.list,
          { paddingTop: insets.top + space.md, paddingBottom: bottomInset + space.xl },
        ]}
        ListHeaderComponent={
          <FadeInUp>
            <View style={styles.brandRow}>
              <Image
                source={require('../assets/images/logo.png')}
                style={styles.brandMark}
                accessibilityLabel="Scanocx"
              />
              <View style={styles.brandText}>
                <Text style={styles.brand}>Scanocx</Text>
                <Text style={styles.tagline}>Skanuj książki — AI czyta za Ciebie</Text>
              </View>
              <IconButton
                name="plus"
                accessibilityLabel="Nowa książka"
                variant="primary"
                size={44}
                round
                onPress={() => setCreateOpen(true)}
              />
            </View>

            <View style={styles.statRow}>
              <StatTile icon="library" value={String(books.length)} label="Książki" />
              <StatTile icon="notes" value={String(totalPages)} label="Strony" tone="mint" />
              <StatTile
                icon="ai"
                value={queue.remaining > 0 ? String(queue.remaining) : '—'}
                label="W kolejce"
                tone="amber"
              />
            </View>

            <ScanQueueCard style={styles.queue} />

            {books.length > 2 ? (
              <SearchField value={query} onChangeText={setQuery} placeholder="Szukaj książki…" />
            ) : null}

            {filtered.length > 0 ? (
              <SectionHeader
                title={query ? `Wyniki (${filtered.length})` : 'Twoje książki'}
                style={styles.section}
              />
            ) : null}
          </FadeInUp>
        }
        ListEmptyComponent={
          query ? (
            <EmptyState
              icon="search"
              title="Brak wyników"
              body={`Żadna książka nie pasuje do „${query.trim()}”.`}
            />
          ) : (
            <EmptyState
              icon="book"
              title="Zacznij od pierwszej książki"
              body="Utwórz książkę, zrób zdjęcia stron, a Scanocx rozpozna tekst lokalnie na urządzeniu."
              action={{ label: 'Nowa książka', icon: 'plus', onPress: () => setCreateOpen(true) }}
            />
          )
        }
        renderItem={({ item }) => (
          <BookCard
            book={item}
            onPress={() => router.push(`/book/${item.id}`)}
            onMore={() => setSheetBook(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
      />

      <BottomNav active="library" onScan={openScan} scanBadge={queue.remaining} />

      <Dialog
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        icon="book"
        title="Nowa książka"
        body="Nadaj tytuł — możesz go zostawić pusty, wtedy dostanie nazwę z datą."
        actions={
          <>
            <Button
              label="Anuluj"
              variant="outline"
              onPress={() => setCreateOpen(false)}
              style={styles.flex}
            />
            <Button
              label="Utwórz"
              icon="check"
              loading={creating}
              onPress={() => void onCreate()}
              style={styles.flex}
            />
          </>
        }>
        <TextField
          value={title}
          onChangeText={setTitle}
          placeholder="np. Lem — Solaris"
          icon="bookOpen"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void onCreate()}
        />
      </Dialog>

      <Sheet
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        eyebrow="Skanowanie"
        title="Do której książki?">
        <ScrollView style={styles.sheetScroll} bounces={false}>
          <SheetGroup>
            {books.map((book, index) => (
              <View key={book.id}>
                {index > 0 ? <View style={styles.sheetDivider} /> : null}
                <Row
                  icon="bookOpen"
                  label={book.title}
                  detail={`${pagesLabel(book.pageCount)} · ${relativeDate(book.updatedAt)}`}
                  chevron
                  onPress={() => {
                    setScanOpen(false);
                    router.push(`/book/${book.id}/capture`);
                  }}
                />
              </View>
            ))}
          </SheetGroup>
        </ScrollView>
        <Button
          label="Nowa książka"
          icon="plus"
          variant="soft"
          onPress={() => {
            setScanOpen(false);
            setCreateOpen(true);
          }}
        />
      </Sheet>

      <Sheet
        visible={sheetBook != null}
        onClose={() => setSheetBook(null)}
        eyebrow="Książka"
        title={sheetBook?.title ?? ''}>
        <SheetGroup>
          <Row
            icon="bookOpen"
            label="Otwórz"
            detail={sheetBook ? pagesLabel(sheetBook.pageCount) : undefined}
            onPress={() => {
              const id = sheetBook?.id;
              setSheetBook(null);
              if (id) router.push(`/book/${id}`);
            }}
          />
          <View style={styles.sheetDivider} />
          <Row
            icon="camera"
            label="Skanuj strony"
            tone="primary"
            onPress={() => {
              const id = sheetBook?.id;
              setSheetBook(null);
              if (id) router.push(`/book/${id}/capture`);
            }}
          />
          <View style={styles.sheetDivider} />
          <Row
            icon="pdf"
            label="Eksport PDF"
            onPress={() => {
              const id = sheetBook?.id;
              setSheetBook(null);
              if (id) router.push(`/book/${id}/export`);
            }}
          />
          <View style={styles.sheetDivider} />
          <Row
            icon="notes"
            label="Cały tekst"
            onPress={() => {
              const id = sheetBook?.id;
              setSheetBook(null);
              if (id) router.push(`/book/${id}/text`);
            }}
          />
        </SheetGroup>
        <SheetGroup>
          <Row
            icon="trash"
            label="Usuń książkę"
            tone="danger"
            onPress={() => {
              const book = sheetBook;
              setSheetBook(null);
              setDeleteTarget(book);
            }}
          />
        </SheetGroup>
      </Sheet>

      <ConfirmDialog
        visible={deleteTarget != null}
        title="Usunąć książkę?"
        body={
          deleteTarget
            ? `„${deleteTarget.title}” i ${pagesLabel(deleteTarget.pageCount)} zostaną trwale usunięte z urządzenia.`
            : undefined
        }
        confirmLabel="Usuń"
        onConfirm={onConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
}

function BookCard({
  book,
  onPress,
  onMore,
}: {
  book: BookSummary;
  onPress: () => void;
  onMore: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={book.title}
      onPress={onPress}
      onLongPress={onMore}
      style={({ pressed }) => [styles.bookCard, pressed && styles.bookCardPressed]}>
      <BookCover title={book.title} width={50} />

      <View style={styles.bookText}>
        <Text numberOfLines={2} style={styles.bookTitle}>
          {book.title}
        </Text>
        <View style={styles.bookMetaRow}>
          <Icon name="notes" size={12} color={colors.faint} />
          <Text style={styles.bookMeta}>{pagesLabel(book.pageCount)}</Text>
          <View style={styles.dot} />
          <Text style={styles.bookMeta}>{relativeDate(book.updatedAt)}</Text>
        </View>
      </View>

      <IconButton
        name="more"
        accessibilityLabel={`Opcje: ${book.title}`}
        variant="ghost"
        size={36}
        iconSize={18}
        round
        onPress={onMore}
      />
    </Pressable>
  );
}

function StatTile({
  icon,
  value,
  label,
  tone = 'violet',
}: {
  icon: 'library' | 'notes' | 'ai';
  value: string;
  label: string;
  tone?: 'violet' | 'mint' | 'amber';
}) {
  const tint =
    tone === 'mint' ? colors.mint : tone === 'amber' ? colors.amber : colors.primary;
  const bg =
    tone === 'mint' ? colors.mintSoft : tone === 'amber' ? colors.amberSoft : colors.primarySoft;

  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Icon name={icon} size={15} color={tint} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  list: {
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingBottom: space.lg,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: '#000000',
    ...shadow.soft,
  },
  brandText: {
    flex: 1,
    gap: 1,
  },
  brand: {
    ...font.h1,
    fontSize: 24,
  },
  tagline: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: -0.1,
  },
  statRow: {
    flexDirection: 'row',
    gap: space.md,
    marginBottom: space.md,
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.glass,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    gap: 3,
    ...shadow.soft,
  },
  statIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: -0.1,
  },
  queue: {
    marginBottom: space.sm,
  },
  section: {
    marginTop: space.sm,
  },
  bookCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.md,
    paddingRight: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.soft,
  },
  bookCardPressed: {
    backgroundColor: colors.surfaceMuted,
    transform: [{ scale: 0.99 }],
  },
  bookText: {
    flex: 1,
    gap: 5,
  },
  bookTitle: {
    ...font.h3,
    fontSize: 16.5,
  },
  bookMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bookMeta: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.muted,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.faint,
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: space.lg + 36 + space.md,
  },
  sheetScroll: {
    maxHeight: 320,
  },
});
