import * as ImagePicker from "expo-image-picker";
import type { Href } from "expo-router";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth/AuthProvider";
import type { BookSummary } from "@/src/domain/types";
import { useOcrQueue } from "@/src/ocr/queue";
import { refreshOcrQuota, useOcrQuota } from "@/src/ocr/quota";
import {
  clearBookCover,
  createBook,
  deleteBook,
  listBooks,
  renameBook,
  setBookCover,
} from "@/src/storage/books";
import {
  AiQueueCard,
  AuroraBackdrop,
  Badge,
  BookCover,
  BottomNav,
  BusyOverlay,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  FadeInUp,
  Icon,
  IconButton,
  Loader,
  ProgressBar,
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
} from "@/src/ui";
import { pages as pagesLabel, relativeDate } from "@/src/utils/format";

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function planLabel(plan: string | undefined): string {
  return plan === "pro" ? "Pro" : "Darmowy";
}

export default function LibraryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scan?: string }>();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomNavInset();
  const queue = useOcrQueue();
  const ocrQuota = useOcrQuota();
  const { user, isLoggedIn, ready, refresh: refreshAuth } = useAuth();

  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [sheetBook, setSheetBook] = useState<BookSummary | null>(null);
  const [renameTarget, setRenameTarget] = useState<BookSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
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
      void refreshOcrQuota();
      if (ready && isLoggedIn) {
        void refreshAuth();
      }
    }, [refresh, ready, isLoggedIn, refreshAuth]),
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
      setTitle("");
      router.push(`/book/${book.id}`);
    } catch (error) {
      Alert.alert(
        "Błąd",
        error instanceof Error
          ? error.message
          : "Nie udało się utworzyć książki.",
      );
    } finally {
      setCreating(false);
    }
  };

  const openRename = (book: BookSummary) => {
    setSheetBook(null);
    setRenameTitle(book.title);
    setRenameTarget(book);
  };

  const onRename = async () => {
    const target = renameTarget;
    if (!target) return;
    setRenaming(true);
    try {
      await renameBook(target.id, renameTitle);
      setRenameTarget(null);
      setRenameTitle("");
      await refresh();
    } catch (error) {
      Alert.alert(
        "Błąd",
        error instanceof Error ? error.message : "Nie udało się zmienić nazwy.",
      );
    } finally {
      setRenaming(false);
    }
  };

  const pickCover = async (book: BookSummary) => {
    setSheetBook(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    setCoverBusy(true);
    try {
      await setBookCover(book.id, result.assets[0].uri);
      await refresh();
    } catch (error) {
      Alert.alert(
        "Okładka",
        error instanceof Error
          ? error.message
          : "Nie udało się ustawić okładki.",
      );
    } finally {
      setCoverBusy(false);
    }
  };

  const onClearCover = (book: BookSummary) => {
    setSheetBook(null);
    void (async () => {
      setCoverBusy(true);
      try {
        await clearBookCover(book.id);
        await refresh();
      } catch (error) {
        Alert.alert(
          "Okładka",
          error instanceof Error
            ? error.message
            : "Nie udało się usunąć okładki.",
        );
      } finally {
        setCoverBusy(false);
      }
    })();
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
    if (params.scan !== "1" || loading || scanParamHandled.current) return;
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
          {
            paddingTop: insets.top + space.md,
            paddingBottom: bottomInset + space.xl,
          },
        ]}
        ListHeaderComponent={
          <FadeInUp>
            <View style={styles.brandRow}>
              <Image
                source={require("../assets/images/logo.png")}
                style={styles.brandMark}
                resizeMode="contain"
                accessibilityLabel="Scanocx"
              />
              <View style={styles.brandText}>
                <Text style={styles.brand}>Scanocx AI</Text>
                <Text style={styles.tagline}>Scan and Analyze Your Books</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isLoggedIn && user ? `Konto: ${user.name}` : "Zaloguj się"
                }
                onPress={() => router.push(isLoggedIn ? "/profile" : "/login")}
                style={({ pressed }) => [
                  styles.userChip,
                  pressed && styles.userChipPressed,
                ]}
              >
                {isLoggedIn && user ? (
                  <>
                    <View style={styles.userAvatar}>
                      <Text style={styles.userAvatarText}>
                        {userInitials(user.name)}
                      </Text>
                    </View>
                    <View style={styles.userMeta}>
                      <Text numberOfLines={1} style={styles.userName}>
                        {user.name.split(/\s+/)[0]}
                      </Text>
                      <Text numberOfLines={1} style={styles.userPlan}>
                        {planLabel(user.plan)}
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.userAvatarGuest}>
                      <Icon name="user" size={16} color={colors.primary} />
                    </View>
                    <Text style={styles.userNameGuest}>Zaloguj</Text>
                  </>
                )}
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Użycie AI"
              onPress={() =>
                router.push((isLoggedIn ? "/usage" : "/login") as Href)
              }
              style={({ pressed }) => [
                styles.planCard,
                pressed && styles.planCardPressed,
              ]}
            >
              {isLoggedIn && user ? (
                <>
                  <View style={styles.planTop}>
                    <View style={styles.planIcon}>
                      <Icon name="shield" size={16} color={colors.primary} />
                    </View>
                    <View style={styles.planText}>
                      <Text style={styles.planTitle}>
                        Pakiet {planLabel(user.plan)}
                      </Text>
                      <Text style={styles.planDetail} numberOfLines={2}>
                        {ocrQuota.unlimited
                          ? "OCR nielimitowane"
                          : `OCR ${ocrQuota.remaining}/${ocrQuota.limit} / miesiąc`}
                        {" · "}
                        {user.quota
                          ? `AI ${user.quota.remaining}/${user.quota.limit} / ${
                              user.quota.period_type === "day"
                                ? "dzień"
                                : "miesiąc"
                            }`
                          : "AI —"}
                      </Text>
                    </View>
                    <Badge
                      label={planLabel(user.plan)}
                      tone={user.plan === "pro" ? "success" : "primary"}
                      icon={user.plan === "pro" ? "bolt" : "ai"}
                    />
                  </View>
                  {!ocrQuota.unlimited &&
                  ocrQuota.loggedIn &&
                  ocrQuota.limit != null &&
                  ocrQuota.limit > 0 ? (
                    <ProgressBar
                      value={Math.max(
                        0,
                        Math.min(
                          1,
                          (ocrQuota.used + ocrQuota.reserved) / ocrQuota.limit,
                        ),
                      )}
                      height={5}
                      style={styles.planBar}
                    />
                  ) : user.quota && user.quota.limit > 0 ? (
                    <ProgressBar
                      value={Math.max(
                        0,
                        Math.min(
                          1,
                          (user.quota.limit - user.quota.remaining) /
                            user.quota.limit,
                        ),
                      )}
                      height={5}
                      style={styles.planBar}
                    />
                  ) : null}
                </>
              ) : (
                <View style={styles.planTop}>
                  <View style={styles.planIcon}>
                    <Icon name="lock" size={16} color={colors.primary} />
                  </View>
                  <View style={styles.planText}>
                    <Text style={styles.planTitle}>Zaloguj się</Text>
                    <Text style={styles.planDetail} numberOfLines={2}>
                      Bez konta: tylko zdjęcia. OCR (30/mies.) i AI po zalogowaniu
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={16} color={colors.faint} />
                </View>
              )}
            </Pressable>

            <ScanQueueCard style={styles.queue} />
            <AiQueueCard style={styles.queue} />

            {books.length > 2 ? (
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder="Szukaj książki…"
              />
            ) : null}

            {filtered.length > 0 ? (
              <SectionHeader
                title={query ? `Wyniki (${filtered.length})` : "Twoje książki"}
                action={
                  query
                    ? undefined
                    : { label: "Dodaj", onPress: () => setCreateOpen(true) }
                }
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
              action={{
                label: "Nowa książka",
                icon: "plus",
                onPress: () => setCreateOpen(true),
              }}
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

      <BottomNav
        active="library"
        onScan={openScan}
        scanBadge={queue.remaining}
      />

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
        }
      >
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
        title="Do której książki?"
      >
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
        title={sheetBook?.title ?? ""}
      >
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
            icon="edit"
            label="Zmień nazwę"
            onPress={() => {
              if (sheetBook) openRename(sheetBook);
            }}
          />
          <View style={styles.sheetDivider} />
          <Row
            icon="image"
            label={sheetBook?.coverUri ? "Zmień okładkę" : "Dodaj okładkę"}
            detail="Zdjęcie z galerii"
            onPress={() => {
              if (sheetBook) void pickCover(sheetBook);
            }}
          />
          {sheetBook?.coverUri ? (
            <>
              <View style={styles.sheetDivider} />
              <Row
                icon="trash"
                label="Usuń okładkę"
                onPress={() => {
                  if (sheetBook) onClearCover(sheetBook);
                }}
              />
            </>
          ) : null}
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

      <Dialog
        visible={renameTarget != null}
        onClose={() => setRenameTarget(null)}
        icon="edit"
        title="Zmień nazwę"
        body="Nowa nazwa książki w bibliotece."
        actions={
          <>
            <Button
              label="Anuluj"
              variant="outline"
              onPress={() => setRenameTarget(null)}
              style={styles.flex}
            />
            <Button
              label="Zapisz"
              icon="check"
              loading={renaming}
              onPress={() => void onRename()}
              style={styles.flex}
            />
          </>
        }
      >
        <TextField
          value={renameTitle}
          onChangeText={setRenameTitle}
          placeholder="Tytuł książki"
          icon="bookOpen"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void onRename()}
        />
      </Dialog>

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

      <BusyOverlay visible={coverBusy} label="Zapisuję okładkę…" />
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
      style={({ pressed }) => [
        styles.bookCard,
        pressed && styles.bookCardPressed,
      ]}
    >
      <BookCover title={book.title} coverUri={book.coverUri} width={50} />

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
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingBottom: space.lg,
  },
  brandMark: {
    width: 52,
    height: 54,
  },
  brandText: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  brand: {
    ...font.h1,
    fontSize: 24,
  },
  tagline: {
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.muted,
    letterSpacing: -0.1,
  },
  userChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 140,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
    backgroundColor: colors.glass,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadow.soft,
  },
  userChipPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  userAvatarText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: -0.2,
  },
  userAvatarGuest: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  userMeta: {
    flexShrink: 1,
    minWidth: 0,
    gap: 1,
  },
  userName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  userPlan: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: -0.1,
  },
  userNameGuest: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: -0.2,
  },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    gap: space.sm,
    marginBottom: space.md,
    ...shadow.soft,
  },
  planCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
  },
  planTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  planIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  planText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  planTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  planDetail: {
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.muted,
    letterSpacing: -0.1,
  },
  planBar: {
    marginTop: 2,
  },
  queue: {
    marginBottom: space.sm,
  },
  section: {
    marginTop: space.sm,
  },
  bookCard: {
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bookMeta: {
    fontSize: 12.5,
    fontWeight: "600",
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
