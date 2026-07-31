import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isApiConfigured } from "@/src/ai/config";
import { getDisplayText } from "@/src/ai/displayText";
import { createBookShareLink } from "@/src/api/endpoints";
import { useAuth } from "@/src/auth/AuthProvider";
import type { Book } from "@/src/domain/types";
import { buildBookPlainText } from "@/src/export";
import { getLibraryBook } from "@/src/library/books";
import { pushBookToRemote } from "@/src/library/remote";
import {
  AiQueueCard,
  AppBar,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Loader,
  ScanQueueCard,
  colors,
  font,
  radius,
  shadow,
  space,
} from "@/src/ui";
import { pages as pagesLabel } from "@/src/utils/format";

function buildFullText(book: Book): string {
  return buildBookPlainText(book);
}

export default function BookTextScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready, isLoggedIn } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkBusy, setLinkBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!isLoggedIn) {
      router.replace("/login");
    }
  }, [ready, isLoggedIn, router]);

  useEffect(() => {
    if (!id || !isLoggedIn) return;
    void (async () => {
      try {
        const data = await getLibraryBook(id);
        setBook(data);
      } catch (error) {
        Alert.alert(
          "Błąd",
          error instanceof Error ? error.message : "Nie znaleziono książki.",
        );
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isLoggedIn, router]);

  const fullText = useMemo(() => (book ? buildFullText(book) : ""), [book]);

  const onShareText = async () => {
    if (!book || !fullText.trim()) return;
    try {
      await Share.share({ message: fullText, title: book.title });
    } catch (error) {
      Alert.alert(
        "Udostępnianie",
        error instanceof Error ? error.message : "Nie udało się udostępnić.",
      );
    }
  };

  const onShareLink = async () => {
    if (!book || linkBusy) return;
    if (!isApiConfigured()) {
      Alert.alert("Link do tekstu", "Brak konfiguracji API (EXPO_PUBLIC_API_BASE_URL).");
      return;
    }
    if (book.pages.length === 0) {
      Alert.alert("Link do tekstu", "Dodaj przynajmniej jedną stronę.");
      return;
    }

    setLinkBusy(true);
    try {
      await pushBookToRemote(book);
      const { url } = await createBookShareLink(book.id);
      await Clipboard.setStringAsync(url);
      Alert.alert("Link skopiowany", url, [
        { text: "OK", style: "cancel" },
        {
          text: "Udostępnij",
          onPress: () => {
            void Share.share({ message: url, title: book.title }).catch(() => undefined);
          },
        },
      ]);
    } catch (error) {
      Alert.alert(
        "Link do tekstu",
        error instanceof Error ? error.message : "Nie udało się wygenerować linku.",
      );
    } finally {
      setLinkBusy(false);
    }
  };

  if (loading || !book) {
    return <Loader label="Składam tekst…" />;
  }

  const pending = book.pages.filter(
    (p) => p.ocrStatus === "pending" || p.aiStatus === "pending",
  ).length;
  const errors = book.pages.filter(
    (p) => p.ocrStatus === "error" || p.aiStatus === "error",
  ).length;
  const empty = book.pages.filter((p) => !getDisplayText(p).trim()).length;
  const aiDone = book.pages.filter((p) => p.aiStatus === "done").length;

  return (
    <View style={styles.root}>
      <AppBar
        title={book.title}
        subtitle={`Cały tekst · ${pagesLabel(book.pages.length)}`}
        right={
          <View style={styles.appBarActions}>
            <IconButton
              name="share"
              accessibilityLabel="Kopiuj link do tekstu"
              variant="outline"
              size={42}
              round
              disabled={book.pages.length === 0 || linkBusy}
              onPress={() => void onShareLink()}
            />
          </View>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 140 + Math.max(insets.bottom, space.md) },
        ]}
      >
        <ScanQueueCard />
        <AiQueueCard />

        {pending > 0 || errors > 0 || empty > 0 || aiDone > 0 ? (
          <View style={styles.chips}>
            {aiDone > 0 ? (
              <Badge label={`AI: ${aiDone}`} tone="success" icon="ai" />
            ) : null}
            {pending > 0 ? (
              <Badge
                label={`w analizie: ${pending}`}
                tone="primary"
                icon="ai"
              />
            ) : null}
            {errors > 0 ? (
              <Badge label={`błędy: ${errors}`} tone="danger" icon="alert" />
            ) : null}
            {empty > 0 ? (
              <Badge
                label={`bez tekstu: ${empty}`}
                tone="warning"
                icon="pending"
              />
            ) : null}
          </View>
        ) : null}

        {book.pages.length === 0 ? (
          <EmptyState
            icon="notes"
            title="Brak stron"
            body="Zeskanuj strony, a ich tekst pojawi się tutaj jeden pod drugim."
          />
        ) : (
          book.pages.map((page) => {
            const body = getDisplayText(page).trim();
            return (
              <View key={page.id} style={styles.pageBlock}>
                <View style={styles.pageHeading}>
                  <Text style={styles.pageHeadingText}>
                    Strona {page.index}
                  </Text>
                  {page.printedPageNumber ? (
                    <Text style={styles.pageHeadingNumber}>
                      nr {page.printedPageNumber}
                    </Text>
                  ) : null}
                  {page.aiStatus === "done" ? (
                    <Text style={styles.pageHeadingNumber}>· AI</Text>
                  ) : null}
                </View>
                <Text style={[styles.pageBody, !body && styles.pageBodyEmpty]}>
                  {body || "(brak rozpoznanego tekstu)"}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>

      <View
        pointerEvents="box-none"
        style={[
          styles.dockWrap,
          { paddingBottom: Math.max(insets.bottom, space.md) },
        ]}
      >
        <Button
          label="Kopiuj link do tekstu"
          icon="share"
          size="lg"
          loading={linkBusy}
          disabled={book.pages.length === 0 || linkBusy}
          onPress={() => void onShareLink()}
        />
        <Button
          label="Udostępnij cały tekst"
          icon="export"
          size="lg"
          variant="outline"
          disabled={book.pages.length === 0 || linkBusy}
          onPress={() => void onShareText()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: space.lg,
    gap: space.xl,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  pageBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: space.md,
    ...shadow.soft,
  },
  pageHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  pageHeadingText: {
    ...font.caption,
    textTransform: "uppercase",
    color: colors.primary,
  },
  pageHeadingNumber: {
    ...font.caption,
    color: colors.faint,
  },
  pageBody: {
    fontSize: 16,
    lineHeight: 26,
    color: colors.ink,
    fontWeight: "400",
  },
  pageBodyEmpty: {
    color: colors.faint,
    fontStyle: "italic",
  },
  dockWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  appBarActions: {
    flexDirection: "row",
    gap: space.sm,
  },
});
