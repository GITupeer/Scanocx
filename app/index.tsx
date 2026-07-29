import * as ImagePicker from "expo-image-picker";
import type { Href } from "expo-router";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth/AuthProvider";
import type { BookSummary } from "@/src/domain/types";
import { useOcrQueue } from "@/src/ocr/queue";
import { refreshOcrQuota, useOcrQuota } from "@/src/ocr/quota";
import { searchInBooks, type SearchHit } from "@/src/search/query";
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
  BookCover,
  BottomNav,
  BusyOverlay,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  FadeInUp,
  Gradient,
  HomeHeroOrbs,
  Icon,
  IconButton,
  Loader,
  Row,
  ScanQueueCard,
  Sheet,
  SheetGroup,
  TextField,
  colors,
  gradients,
  radius,
  shadow,
  space,
  useBottomNavInset,
  type IconName,
} from "@/src/ui";
import { pages as pagesLabel, relativeDate } from "@/src/utils/format";

const SCREEN_W = Dimensions.get("window").width;
const CARD_GAP = space.md;
const CATEGORY_W = (SCREEN_W - space.xl * 2 - CARD_GAP) / 2;
const DEST_W = Math.min(220, SCREEN_W * 0.58);
const DEST_H = Math.round(DEST_W * 1.28);

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function planLabel(plan: string | undefined): string {
  return plan === "pro" ? "Pro" : "Darmowy";
}

type QuickAction = {
  id: string;
  icon: IconName;
  tint: string;
  iconColor: string;
  meta: string;
  label: string;
  onPress: () => void;
};

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
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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

  useEffect(() => {
    const needle = query.trim();
    if (!needle) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const handle = setTimeout(() => {
      void searchInBooks(needle)
        .then((hits) => setSearchHits(hits))
        .catch(() => setSearchHits([]))
        .finally(() => setSearchLoading(false));
    }, 180);

    return () => clearTimeout(handle);
  }, [query]);

  const recentBooks = useMemo(
    () =>
      [...books].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [books],
  );

  const quotaPillLabel = useMemo(() => {
    if (!isLoggedIn || !user) return "Zaloguj";
    if (user.quota) return `${user.quota.remaining} AI`;
    return planLabel(user.plan);
  }, [isLoggedIn, user]);

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

  const scanParamHandled = useRef(false);
  useEffect(() => {
    if (params.scan !== "1" || loading || scanParamHandled.current) return;
    scanParamHandled.current = true;
    openScan();
  }, [loading, openScan, params.scan]);

  const quickActions: QuickAction[] = useMemo(
    () => [
      {
        id: "scan",
        icon: "camera",
        tint: "#FDE8E6",
        iconColor: "#E24B41",
        meta:
          queue.remaining > 0
            ? `${queue.remaining} w kolejce`
            : "Szybki skan stron",
        label: "Skanuj",
        onPress: openScan,
      },
      {
        id: "new",
        icon: "book",
        tint: "#DDF7F1",
        iconColor: "#10B981",
        meta: `${books.length} w bibliotece`,
        label: "Nowa książka",
        onPress: () => setCreateOpen(true),
      },
      {
        id: "ai",
        icon: "ai",
        tint: "#EDE9FE",
        iconColor: "#7C3AED",
        meta:
          isLoggedIn && user?.quota
            ? `${user.quota.remaining} analiz`
            : "Korekta tekstu",
        label: "AI",
        onPress: () => router.push((isLoggedIn ? "/usage" : "/login") as Href),
      },
      {
        id: "ocr",
        icon: "text",
        tint: "#FFF2D9",
        iconColor: "#F59E0B",
        meta: ocrQuota.unlimited
          ? "Bez limitu"
          : `${ocrQuota.remaining ?? 0} OCR`,
        label: "Odczyt tekstu",
        onPress: () => router.push((isLoggedIn ? "/usage" : "/login") as Href),
      },
      {
        id: "account",
        icon: "user",
        tint: "#FCE7F3",
        iconColor: "#EC4899",
        meta: isLoggedIn ? planLabel(user?.plan) : "Konto",
        label: isLoggedIn ? "Profil" : "Zaloguj",
        onPress: () => router.push(isLoggedIn ? "/profile" : "/login"),
      },
    ],
    [
      books.length,
      isLoggedIn,
      ocrQuota.remaining,
      ocrQuota.unlimited,
      openScan,
      queue.remaining,
      router,
      user?.plan,
      user?.quota,
    ],
  );

  if (loading && books.length === 0) {
    return <Loader label="Wczytywanie biblioteki…" />;
  }

  const greetingName = isLoggedIn
    ? user?.name?.trim() || "tam"
    : "w Scanocx";
  const searching = query.trim().length > 0;

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset + space.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <FadeInUp>
          <Gradient
            colors={gradients.homeHero}
            angle={165}
            fallbackColor={colors.blue}
            style={[styles.hero, { paddingTop: insets.top + space.md }]}
          >
            <HomeHeroOrbs />

            <FadeInUp delay={40} distance={10}>
              <View style={styles.heroTop}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Menu"
                  hitSlop={10}
                  onPress={() => setMenuOpen(true)}
                  style={({ pressed }) => [
                    styles.heroIconBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Icon name="menu" size={22} color={colors.white} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isLoggedIn
                      ? `Pakiet ${planLabel(user?.plan)}`
                      : "Zaloguj się"
                  }
                  onPress={() =>
                    router.push((isLoggedIn ? "/usage" : "/login") as Href)
                  }
                  style={({ pressed }) => [
                    styles.quotaPill,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.quotaAvatar}>
                    {isLoggedIn && user ? (
                      <Text style={styles.quotaAvatarText}>
                        {userInitials(user.name)}
                      </Text>
                    ) : (
                      <Icon name="user" size={14} color={colors.primary} />
                    )}
                  </View>
                  <Text style={styles.quotaLabel} numberOfLines={1}>
                    {quotaPillLabel}
                  </Text>
                  <Icon name="chevronDown" size={14} color={colors.inkSoft} />
                </Pressable>
              </View>
            </FadeInUp>

            <FadeInUp delay={120} distance={16}>
              <Text style={styles.welcomeLine}>Witaj</Text>
              <Text style={styles.welcomeName}>{greetingName}</Text>
            </FadeInUp>

            <FadeInUp delay={220} distance={18}>
              <View
                style={[
                  styles.searchBar,
                  searchFocused && styles.searchBarFocused,
                ]}
              >
                <Icon
                  name="ai"
                  size={18}
                  color={searchFocused ? colors.primary : colors.faint}
                />
                <View style={styles.searchTextCol}>
                  <Text style={styles.searchTitle}>
                    Szukaj w Twoich Tekstach
                  </Text>
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Wyszukaj w odczytanych tekstach frazę…"
                    placeholderTextColor={colors.faint}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    returnKeyType="search"
                    style={styles.searchInput}
                  />
                </View>
                {query.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Wyczyść"
                    hitSlop={8}
                    onPress={() => setQuery("")}
                    style={styles.searchAction}
                  >
                    <Icon name="close" size={16} color={colors.muted} />
                  </Pressable>
                ) : (
                  <View style={styles.searchAction}>
                    <Icon name="search" size={16} color={colors.ink} />
                  </View>
                )}
              </View>
            </FadeInUp>
          </Gradient>

          <View style={styles.body}>
            <ScanQueueCard style={styles.queue} />
            <AiQueueCard style={styles.queue} />

            {!searching ? (
              <>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Szybkie akcje</Text>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setCreateOpen(true)}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Text style={styles.sectionLink}>Dodaj</Text>
                  </Pressable>
                </View>

                <View style={styles.categoryGrid}>
                  {quickActions.map((action) => (
                    <Pressable
                      key={action.id}
                      accessibilityRole="button"
                      accessibilityLabel={action.label}
                      onPress={action.onPress}
                      style={({ pressed }) => [
                        styles.categoryCard,
                        { width: CATEGORY_W },
                        pressed && styles.categoryCardPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.categoryIcon,
                          { backgroundColor: action.tint },
                        ]}
                      >
                        <Icon
                          name={action.icon}
                          size={18}
                          color={action.iconColor}
                        />
                      </View>
                      <View style={styles.categoryText}>
                        <Text style={styles.categoryMeta} numberOfLines={1}>
                          {action.meta}
                        </Text>
                        <Text style={styles.categoryLabel} numberOfLines={1}>
                          {action.label}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>
                {searching
                  ? searchLoading
                    ? "Szukam…"
                    : `W treści (${searchHits.length})`
                  : "Twoje książki"}
              </Text>
              {!searching ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setCreateOpen(true)}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Text style={styles.sectionLink}>Nowa</Text>
                </Pressable>
              ) : null}
            </View>

            {searching ? (
              searchHits.length === 0 && !searchLoading ? (
                <EmptyState
                  icon="ai"
                  title="Brak trafień w treści"
                  body={`Nic nie pasuje do „${query.trim()}”. Spróbuj innej frazy — wyszukiwanie działa po OCR i tekście po korekcie AI.`}
                />
              ) : (
                <View style={styles.listStack}>
                  {searchHits.map((hit) => (
                    <SearchHitCard
                      key={`${hit.bookId}:${hit.pageId}`}
                      hit={hit}
                      onPress={() =>
                        router.push(
                          `/book/${hit.bookId}/page/${hit.pageId}` as Href,
                        )
                      }
                    />
                  ))}
                </View>
              )
            ) : books.length === 0 ? (
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
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.destRow}
                decelerationRate="fast"
                snapToInterval={DEST_W + space.md}
                snapToAlignment="start"
              >
                {recentBooks.map((book) => (
                  <DestinationCard
                    key={book.id}
                    book={book}
                    onPress={() => router.push(`/book/${book.id}`)}
                    onMore={() => setSheetBook(book)}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        </FadeInUp>
      </ScrollView>

      <BottomNav
        active="library"
        onScan={openScan}
        scanBadge={queue.remaining}
      />

      <Sheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        eyebrow="Scanocx"
        title="Menu"
      >
        <SheetGroup>
          <Row
            icon="user"
            label={isLoggedIn ? "Profil" : "Zaloguj się"}
            detail={
              isLoggedIn && user
                ? `${user.name} · ${planLabel(user.plan)}`
                : "Konto i pakiet"
            }
            chevron
            onPress={() => {
              setMenuOpen(false);
              router.push(isLoggedIn ? "/profile" : "/login");
            }}
          />
          <View style={styles.sheetDivider} />
          <Row
            icon="stats"
            label="Użycie AI i OCR"
            detail={
              isLoggedIn && user?.quota
                ? `${user.quota.remaining} analiz AI`
                : undefined
            }
            chevron
            onPress={() => {
              setMenuOpen(false);
              router.push((isLoggedIn ? "/usage" : "/login") as Href);
            }}
          />
          <View style={styles.sheetDivider} />
          <Row
            icon="plus"
            label="Nowa książka"
            onPress={() => {
              setMenuOpen(false);
              setCreateOpen(true);
            }}
          />
          <View style={styles.sheetDivider} />
          <Row
            icon="camera"
            label="Skanuj strony"
            tone="primary"
            onPress={() => {
              setMenuOpen(false);
              openScan();
            }}
          />
        </SheetGroup>
      </Sheet>

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

function DestinationCard({
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
        styles.destCard,
        pressed && styles.destCardPressed,
      ]}
    >
      <BookCover
        title={book.title}
        coverUri={book.coverUri}
        width={DEST_W}
        height={DEST_H}
        radius={22}
      />
      <View style={styles.destShade} pointerEvents="none" />
      <View style={styles.destBadge}>
        <Text style={styles.destBadgeText}>{pagesLabel(book.pageCount)}</Text>
      </View>
      <View style={styles.destFooter}>
        <Text numberOfLines={2} style={styles.destTitle}>
          {book.title}
        </Text>
        <Text style={styles.destMeta}>{relativeDate(book.updatedAt)}</Text>
      </View>
      <IconButton
        name="more"
        accessibilityLabel={`Opcje: ${book.title}`}
        variant="ghost"
        size={34}
        iconSize={16}
        round
        onPress={onMore}
        style={styles.destMore}
      />
    </Pressable>
  );
}

function pageHitLabel(hit: SearchHit): string {
  if (hit.printedPageNumber?.trim()) {
    return `s. ${hit.printedPageNumber.trim()}`;
  }
  return `str. ${hit.pageIndex}`;
}

function SearchHitCard({
  hit,
  onPress,
}: {
  hit: SearchHit;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${hit.bookTitle}, ${pageHitLabel(hit)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.hitCard,
        pressed && styles.hitCardPressed,
      ]}
    >
      <View style={styles.hitTop}>
        <Text numberOfLines={1} style={styles.hitBook}>
          {hit.bookTitle}
        </Text>
        <View style={styles.hitBadges}>
          <View
            style={[
              styles.hitBadge,
              hit.source === "ai" ? styles.hitBadgeAi : styles.hitBadgeOcr,
            ]}
          >
            <Icon
              name={hit.source === "ai" ? "ai" : "scan"}
              size={11}
              color={hit.source === "ai" ? colors.primary : colors.muted}
            />
            <Text
              style={[
                styles.hitBadgeText,
                hit.source === "ai" && styles.hitBadgeTextAi,
              ]}
            >
              {hit.source === "ai" ? "AI" : "OCR"}
            </Text>
          </View>
          <Text style={styles.hitPage}>{pageHitLabel(hit)}</Text>
        </View>
      </View>
      <Text numberOfLines={3} style={styles.hitSnippet}>
        {hit.snippet || "Fragment strony"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.82,
  },
  hero: {
    overflow: "hidden",
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  heroIconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  quotaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 160,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 12,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    ...shadow.soft,
  },
  quotaAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  quotaAvatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: -0.2,
  },
  quotaLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  welcomeLine: {
    fontSize: 22,
    fontWeight: "700",
    color: "rgba(255,255,255,0.92)",
    letterSpacing: -0.4,
    lineHeight: 26,
    marginBottom: 2,
  },
  welcomeName: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: -0.8,
    lineHeight: 34,
    marginBottom: space.xl,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 64,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    paddingVertical: space.sm,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: "transparent",
    ...shadow.soft,
  },
  searchBarFocused: {
    borderColor: colors.primary,
  },
  searchTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  searchTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  searchInput: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.inkSoft,
    paddingVertical: 0,
    margin: 0,
  },
  searchAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  body: {
    paddingTop: space.xxl,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  queue: {
    marginBottom: space.sm,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.md,
    marginBottom: space.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  sectionLink: {
    fontSize: 14,
    fontWeight: "700",
    color: "#3B82F6",
    letterSpacing: -0.2,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CARD_GAP,
    marginBottom: space.lg,
  },
  categoryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderRadius: 18,
    ...shadow.soft,
  },
  categoryCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  categoryMeta: {
    fontSize: 11.5,
    fontWeight: "600",
    color: colors.muted,
    letterSpacing: -0.1,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.2,
  },
  destRow: {
    paddingRight: space.xl,
    gap: space.md,
  },
  destCard: {
    width: DEST_W,
    height: DEST_H,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
    ...shadow.card,
  },
  destCardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.95,
  },
  destShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    experimental_backgroundImage:
      "linear-gradient(180deg, rgba(7,8,14,0) 45%, rgba(7,8,14,0.72) 100%)",
  },
  destBadge: {
    position: "absolute",
    top: space.md,
    left: space.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: "rgba(20, 24, 40, 0.45)",
  },
  destBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: -0.1,
  },
  destFooter: {
    position: "absolute",
    left: space.md,
    right: space.md,
    bottom: space.md,
    gap: 3,
  },
  destTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: -0.3,
  },
  destMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.78)",
  },
  destMore: {
    position: "absolute",
    top: space.sm,
    right: space.sm,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  listStack: {
    gap: space.md,
  },
  hitCard: {
    gap: 8,
    padding: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.soft,
  },
  hitCardPressed: {
    backgroundColor: colors.surfaceMuted,
    transform: [{ scale: 0.99 }],
  },
  hitTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  hitBook: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.25,
  },
  hitBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  hitBadgeAi: {
    backgroundColor: colors.primarySoft,
  },
  hitBadgeOcr: {
    backgroundColor: colors.surfaceSunken,
  },
  hitBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: -0.1,
  },
  hitBadgeTextAi: {
    color: colors.primary,
  },
  hitPage: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  hitSnippet: {
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "500",
    color: colors.inkSoft,
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
