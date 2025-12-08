import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  deleteHistory,
  fetchHistory,
  HistoryRow,
  setupDatabase,
} from "../src/lib/db";
import { useAppTheme } from "../src/theme";
import { ThemeToggle } from "../src/components/ThemeToggle";

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export default function History() {
  const { colors } = useAppTheme();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HistoryRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    await setupDatabase();
    const rows = await fetchHistory();
    setItems(rows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleDelete = async (bookId: string) => {
    await deleteHistory(bookId);
    setItems((prev) => prev.filter((row) => row.bookId !== bookId));
  };

  const confirmDelete = (bookId: string) => {
    Alert.alert(
      "Удалить из истории?",
      "Вы уверены, что хотите удалить эту запись?",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () => handleDelete(bookId),
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.text }]}>История прослушивания</Text>
        <ThemeToggle />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            tintColor={colors.accent}
            refreshing={loading}
            onRefresh={load}
          />
        }
        contentContainerStyle={{ padding: 16, gap: 12 }}
      >
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}

        {!loading && items.length === 0 && (
          <View style={styles.center}>
            <Ionicons name="time" size={22} color={colors.accent} />
            <Text style={{ color: colors.muted, marginTop: 6 }}>
              Пока пусто. Начните слушать — даже пара минут попадёт сюда.
            </Text>
          </View>
        )}

        {items.map((row) => {
          const progress = row.duration
            ? Math.min(1, row.position / row.duration)
            : 0;
          return (
            <TouchableOpacity
              key={row.id}
              style={[
                styles.card,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
              onPress={() =>
                router.push({
                  pathname: "/player",
                  params: {
                    bookId: row.bookId,
                    title: row.title,
                    authors: row.authors,
                    readers: row.readers,
                    cover: row.cover,
                    bookUrl: row.bookUrl,
                    startTrack: String(row.trackIndex ?? 0),
                    startPosition: String(row.position ?? 0),
                    resumeUrl: row.audioUrl,
                  },
                })
              }
            >
              {row.cover ? (
                <Image
                  source={{ uri: row.cover }}
                  style={styles.cover}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.cover, { backgroundColor: colors.surface }]} />
              )}
              <View style={styles.cardText}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                      {row.title}
                    </Text>
                    <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
                      {row.authors}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      confirmDelete(row.bookId);
                    }}
                    style={[
                      styles.deleteBtn,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <Ionicons name="trash" size={16} color={colors.muted} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
                  Читает: {row.readers || "—"}
                </Text>
                <View style={styles.progressRow}>
                  <View
                    style={[
                      styles.progressBar,
                      { backgroundColor: colors.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        { backgroundColor: colors.accent, width: `${progress * 100}%` },
                      ]}
                    />
                  </View>
                  <Text style={[styles.meta, { color: colors.text }]}>
                    {formatTime(row.position)} / {formatTime(row.duration)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  center: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 6,
  },
  card: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 10,
  },
  cover: {
    width: 70,
    height: 96,
    borderRadius: 10,
  },
  cardText: { flex: 1, gap: 4 },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  meta: {
    fontSize: 12,
  },
  progressRow: {
    marginTop: 6,
    gap: 6,
  },
  progressBar: {
    width: "100%",
    height: 6,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
