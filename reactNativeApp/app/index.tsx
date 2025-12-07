import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ThemeToggle } from "./components/ThemeToggle";
import { useAppTheme } from "./theme";

type Mode = "search" | "genres" | "authors" | "readers";

type BookResult = {
  id: string;
  title: string;
  authors: string;
  readers: string;
  cover?: string;
  url: string;
  likes: number;
  dislikes: number;
  genre?: string;
};

type CatalogItem = { title: string; url: string };
type GenrePage = { title: string; count?: string };
type GenreTab = "new" | "popular" | "rating";
type Period = "today" | "week" | "month" | "alltime";

const baseUrl = "https://knigavuhe.org";

const PillButton = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: active ? colors.accent : colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.pillText,
          { color: active ? "#0b1521" : colors.text },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const SearchCard = ({
  item,
  onPress,
}: {
  item: BookResult;
  onPress: () => void;
}) => {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
      ]}
      onPress={onPress}
    >
      {item.cover ? (
        <Image source={{ uri: item.cover }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.cover, { backgroundColor: "#2d2d2d", alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="book" color="#888" size={28} />
        </View>
      )}
      <View style={styles.cardText}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
          {item.authors || "Автор неизвестен"}
        </Text>
        <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
          Читает: {item.readers || "—"}
        </Text>
        <View style={styles.tagsRow}>
          {item.genre ? (
            <View
              style={[
                styles.tag,
                { backgroundColor: `${colors.accent}22`, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.tagText, { color: colors.accent }]}>
                {item.genre}
              </Text>
            </View>
          ) : null}
          <View style={styles.likesRow}>
            <Ionicons name="thumbs-up" size={14} color={colors.accent} />
            <Text style={[styles.tagText, { color: colors.text }]}>
              {item.likes}
            </Text>
            <Ionicons
              name="thumbs-down"
              size={14}
              color={colors.muted}
              style={{ marginLeft: 6 }}
            />
            <Text style={[styles.tagText, { color: colors.text }]}>
              {item.dislikes}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const CatalogCard = ({ item }: { item: CatalogItem }) => {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.catalogItem,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
    </View>
  );
};

const parseQuickSearch = (payload: any): BookResult[] => {
  const data = Array.isArray(payload)
    ? payload.find((d) => d && d.results) ?? payload[payload.length - 1]
    : payload;

  if (!data?.results?.books?.items?.length) return [];

  return data.results.books.items.map((id: number) => {
    const book = data.books?.[id];
    const extra = data.books_extra?.[id];
    const authorNames = (extra?.authors || [])
      .map((aid: number) => data.authors?.[aid])
      .map((a: any) => [a?.name, a?.surname].filter(Boolean).join(" ").trim())
      .filter(Boolean)
      .join(", ");
    const readerNames = (extra?.readers || [])
      .map((rid: number) => data.readers?.[rid])
      .map((r: any) => [r?.name, r?.surname].filter(Boolean).join(" ").trim())
      .filter(Boolean)
      .join(", ");

    return {
      id: String(book?.id ?? id),
      title: book?.name ?? "Без названия",
      authors: authorNames,
      readers: readerNames,
      cover: book?.poster_list_url,
      url: `${baseUrl}${book?.url ?? ""}`,
      likes: book?.likes ?? 0,
      dislikes: book?.dislikes ?? 0,
      genre: data.genres?.[book?.genre_id]?.name,
    };
  });
};

const parseCatalog = (html: string, anchorClass: string): CatalogItem[] => {
  const cleaned = html.replace(/[\n\r]/g, " ");
  // Match anchors with the target class and capture href regardless of attribute order
  const regex = new RegExp(
    `<a[^>]*?(?=[^>]*class="[^"]*${anchorClass}[^"]*")(?=[^>]*href="([^"]+)")[^>]*>(.*?)<\\/a>`,
    "gi"
  );
  const items: CatalogItem[] = [];
  let match;
  while ((match = regex.exec(cleaned)) !== null) {
    const rawTitle = match[2].replace(/<[^>]+>/g, "").trim();
    if (!rawTitle) continue;
    items.push({
      title: rawTitle,
      url: baseUrl + match[1],
    });
  }
  return items;
};

export default function Index() {
  const { colors } = useAppTheme();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState<BookResult[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [error, setError] = useState("");
  const [genreBooks, setGenreBooks] = useState<BookResult[]>([]);
  const [genrePageMeta, setGenrePageMeta] = useState<GenrePage | null>(null);
  const [activeGenre, setActiveGenre] = useState<CatalogItem | null>(null);
  const [genreTab, setGenreTab] = useState<GenreTab>("new");
  const [genrePeriod, setGenrePeriod] = useState<Period>("month");

  const callSearch = async () => {
    setMode("search");
    if (!query.trim()) {
      setError("Введите запрос");
      return;
    }
    setLoading(true);
    setError("");
    setCatalog([]);
    try {
      const res = await fetch(
        `${baseUrl}/search/quick.json?q=${encodeURIComponent(query.trim())}`
      );
      const json = await res.json();
      setBooks(parseQuickSearch(json));
    } catch (e) {
      setError("Не получилось загрузить результаты");
    } finally {
      setLoading(false);
    }
  };

  const loadCatalog = async (nextMode: Mode) => {
    setMode(nextMode);
    if (nextMode === "search") return;
    setLoading(true);
    setError("");
    setBooks([]);
    setCatalog([]);
    setGenreBooks([]);
    setGenrePageMeta(null);
    const endpoint =
      nextMode === "genres"
        ? "genres"
        : nextMode === "authors"
        ? "authors"
        : "readers";
    try {
      const res = await fetch(`${baseUrl}/${endpoint}/`);
      const html = await res.text();
      const anchorClass =
        nextMode === "genres"
          ? "genre2_item_name"
          : "author_item_name"; // readers list uses the same class as authors
      setCatalog(parseCatalog(html, anchorClass));
    } catch (e) {
      setError("Не получилось загрузить список");
    } finally {
      setLoading(false);
    }
  };

  const parseGenreBooks = (html: string): { meta: GenrePage | null; items: BookResult[] } => {
    const cleaned = html.replace(/\n/g, " ");
    const metaMatch = cleaned.match(
      /<div class="page_title">.*?<h1>([^<]+)<\/h1>.*?<span class="page_title_count">([^<]*)<\/span>/
    );
    const meta = metaMatch
      ? { title: metaMatch[1].trim(), count: metaMatch[2].trim() }
      : null;

    const cardRegex = /<div class="bookkitem">([\s\S]*?)<\/div>\s*<\/div>/g;
    const items: BookResult[] = [];
    let m;
    while ((m = cardRegex.exec(cleaned)) !== null) {
      const block = m[1];
      const titleMatch = block.match(/class="bookkitem_name"[^>]*>([^<]+)</);
      const urlMatch = block.match(/<a class="bookkitem_cover" href="([^"]+)"/);
      const coverMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/);
      const authorMatch = block.match(/bookkitem_author_label">автор<\/span>\s*<[^>]*>([^<]+)</);
      const readerMatch = block.match(/bookkitem_meta_label">Читает<\/span>\s*(?:<span[^>]*>)?<a[^>]*>([^<]+)</);
      const genreMatch = block.match(/bookkitem_genre">[^<]*<a[^>]*>([^<]+)</);

      const title = titleMatch?.[1]?.trim() || coverMatch?.[2]?.trim() || "Аудиокнига";
      const bookUrl = urlMatch ? `${baseUrl}${urlMatch[1]}` : "";
      const cover = coverMatch?.[1];
      items.push({
        id: bookUrl || title,
        title,
        authors: authorMatch?.[1]?.trim() || "",
        readers: readerMatch?.[1]?.trim() || "",
        cover,
        url: bookUrl,
        likes: 0,
        dislikes: 0,
        genre: genreMatch?.[1]?.trim(),
      });
    }
    return { meta, items };
  };

  const buildGenreUrl = (item: CatalogItem, tab: GenreTab, period: Period) => {
    const base = item.url.replace(/\/$/, "");
    if (tab === "new") return base + "/";
    if (tab === "popular") return `${base}/popular/?period=${period}`;
    return `${base}/rating/?period=${period}`;
  };

  const loadGenrePage = async (
    item: CatalogItem,
    tab: GenreTab = genreTab,
    period: Period = genrePeriod
  ) => {
    setLoading(true);
    setError("");
    setGenreBooks([]);
    setGenrePageMeta(null);
    setActiveGenre(item);
    setGenreTab(tab);
    setGenrePeriod(period);
    try {
      const res = await fetch(buildGenreUrl(item, tab, period));
      const html = await res.text();
      const parsed = parseGenreBooks(html);
      setGenrePageMeta(parsed.meta ?? { title: item.title });
      setGenreBooks(parsed.items);
    } catch (e) {
      setError("Не получилось загрузить жанр");
    } finally {
      setLoading(false);
    }
  };

  const headerHint = useMemo(() => {
    if (mode === "search") return "Поиск аудиокниг и авторов";
    if (mode === "genres") return "Каталог жанров с knigavuhe";
    if (mode === "authors") return "Каталог авторов";
    return "Каталог исполнителей";
  }, [mode]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.hero, { backgroundColor: colors.surface }]}>
        <View style={styles.logoRow}>
          <View style={[styles.logoDot, { backgroundColor: colors.accent }]} />
          <View>
            <Text style={[styles.logoText, { color: colors.text }]}>
              книга в ухе
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {headerHint}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          <ThemeToggle />
        </View>

        <View style={[styles.searchRow, { borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            placeholder="Поиск аудиокниг и авторов"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text }]}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={callSearch}
          />
          <TouchableOpacity
            onPress={callSearch}
            style={[styles.searchBtn, { backgroundColor: colors.accent }]}
          >
            <Ionicons name="arrow-forward" size={18} color="#0b1521" />
          </TouchableOpacity>
        </View>

        <View style={styles.pillsRow}>
          <PillButton
            label="Жанры"
            active={mode === "genres"}
            onPress={() => loadCatalog("genres")}
          />
          <PillButton
            label="Авторы"
            active={mode === "authors"}
            onPress={() => loadCatalog("authors")}
          />
          <PillButton
            label="Исполнители"
            active={mode === "readers"}
            onPress={() => loadCatalog("readers")}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      >
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={{ color: colors.muted, marginTop: 8 }}>Загрузка...</Text>
          </View>
        )}

        {!loading && error ? (
          <View style={styles.center}>
            <Text style={{ color: colors.text }}>{error}</Text>
          </View>
        ) : null}

        {!loading && mode === "search" && books.length === 0 && !error ? (
          <View style={styles.empty}>
            <Ionicons name="headset" size={26} color={colors.accent} />
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Введите запрос, чтобы подтянуть результаты с knigavuhe
            </Text>
          </View>
        ) : null}

        {!loading && mode !== "search" && catalog.length === 0 && genreBooks.length === 0 && !error ? (
          <View style={styles.empty}>
            <Ionicons name="list" size={22} color={colors.accent} />
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Нажмите нужную вкладку, чтобы загрузить свежий список
            </Text>
          </View>
        ) : null}

        {mode === "search" &&
          books.map((book) => (
            <SearchCard
              key={book.id}
              item={book}
              onPress={() =>
                router.push({
                  pathname: "/player",
                  params: {
                    bookId: book.id,
                    title: book.title,
                    authors: book.authors,
                    readers: book.readers,
                    cover: book.cover ?? "",
                    bookUrl: book.url,
                  },
                })
              }
            />
          ))}

        {mode !== "search" && genreBooks.length > 0 && (
          <View style={{ marginTop: 8, marginBottom: 8, gap: 6 }}>
            <Text style={[styles.title, { color: colors.text }]}>
              {genrePageMeta?.title ?? activeGenre?.title ?? "Жанр"}
            </Text>
            {genrePageMeta?.count ? (
              <Text style={[styles.meta, { color: colors.muted }]}>{genrePageMeta.count}</Text>
            ) : null}
            {mode === "genres" && (
              <>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["new", "popular", "rating"] as GenreTab[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => activeGenre && loadGenrePage(activeGenre, tab)}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: genreTab === tab ? colors.accent : colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: genreTab === tab ? "#0b1521" : colors.text },
                    ]}
                  >
                    {tab === "new" ? "Новинки" : tab === "popular" ? "Популярные" : "Рейтинг"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {genreTab !== "new" && (
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {(["today", "week", "month", "alltime"] as Period[]).map((p) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => activeGenre && loadGenrePage(activeGenre, genreTab, p)}
                    style={[
                      styles.pillSmall,
                      {
                        backgroundColor: genrePeriod === p ? colors.accent : colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        { color: genrePeriod === p ? "#0b1521" : colors.text },
                      ]}
                    >
                      {p === "today"
                        ? "Сутки"
                        : p === "week"
                        ? "Неделя"
                        : p === "month"
                        ? "Месяц"
                        : "Всё время"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
              </>
            )}
          </View>
        )}

        {mode !== "search" && genreBooks.length > 0
          ? genreBooks.map((book) => (
              <SearchCard
                key={book.id}
                item={book}
                onPress={() =>
                  router.push({
                    pathname: "/player",
                    params: {
                      bookId: book.id,
                      title: book.title,
                      authors: book.authors,
                      readers: book.readers,
                      cover: book.cover ?? "",
                      bookUrl: book.url,
                    },
                  })
                }
              />
            ))
          : null}

        {mode !== "search" &&
          genreBooks.length === 0 &&
          catalog.map((item, idx) => (
            <TouchableOpacity key={`${item.url}-${idx}`} onPress={() => loadGenrePage(item)}>
              <CatalogCard item={item} />
            </TouchableOpacity>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 12,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  logoText: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 10,
  },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 96,
    alignItems: "center",
  },
  pillText: {
    fontWeight: "700",
  },
  pillSmall: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 78,
    alignItems: "center",
  },
  scroll: { flex: 1 },
  card: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    marginTop: 14,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  cover: {
    width: 86,
    height: 120,
    borderRadius: 10,
    backgroundColor: "#333",
  },
  cardText: {
    flex: 1,
    marginLeft: 12,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  meta: {
    fontSize: 13,
  },
  tagsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    flexWrap: "wrap",
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  likesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
  },
  center: {
    alignItems: "center",
    marginTop: 24,
    gap: 8,
  },
  empty: {
    alignItems: "center",
    marginTop: 24,
    paddingHorizontal: 24,
    gap: 8,
  },
  catalogItem: {
    marginTop: 12,
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
  },
});
