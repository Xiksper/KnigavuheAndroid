import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import { Image } from "expo-image";
import { Audio } from "expo-av";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../src/theme";
import { ThemeToggle } from "../src/components/ThemeToggle";
import { upsertHistory } from "../src/lib/db";

type Track = { title: string; url: string };

const asString = (v?: string | string[]) =>
  Array.isArray(v) ? v[0] : v ?? "";

const formatMs = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const extractTracks = (html: string): Track[] => {
  // 1) Попробуем вытащить массив треков из JS-конструкции new BookPlayer(<id>, [...tracks], ...).
  try {
    const playerMatch = html.match(/new BookPlayer\([^,]+,\s*(\[[\s\S]*?\])/);
    if (playerMatch?.[1]) {
      const jsonLike = playerMatch[1]
        .replace(/\\\//g, "/")
        .replace(/\t/g, " ");
      const parsed = JSON.parse(jsonLike);
      if (Array.isArray(parsed)) {
        return parsed.map((t: any, idx: number) => ({
          title: typeof t?.title === "string" && t.title.trim()
            ? t.title.trim()
            : `Трек ${idx + 1}`,
          url: String(t?.url ?? ""),
        })).filter((t) => t.url.startsWith("http"));
      }
    }
  } catch (e) {
    // fallback ниже
  }

  // 2) Фолбек — простое извлечение всех mp3-ссылок.
  const cleaned = html.replace(/\\\\/g, "\\").replace(/\s+/g, " ");
  const matches = [
    ...cleaned.matchAll(/https:\/\/[^"']+audio[^"']+\.mp3[^"']*/gi),
  ];
  const urls = matches
    .map((m) => m[0].replace(/\\\//g, "/"))
    .filter((url, idx, arr) => arr.indexOf(url) === idx);

  return urls.map((url, index) => ({
    title: `Трек ${index + 1}`,
    url,
  }));
};

export default function Player() {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{
    bookId?: string;
    title?: string;
    authors?: string;
    readers?: string;
    cover?: string;
    bookUrl?: string;
    startTrack?: string;
    startPosition?: string;
    resumeUrl?: string;
  }>();

  const title = asString(params.title);
  const authors = asString(params.authors);
  const readers = asString(params.readers);
  const cover = asString(params.cover);
  const bookUrl = asString(params.bookUrl);
  const bookId = asString(params.bookId);
  const resumeUrl = asString(params.resumeUrl);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(
    params.startTrack ? Number(asString(params.startTrack)) : 0
  );
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [loadingSound, setLoadingSound] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const lastSavedRef = useRef<number>(0);

  const currentTrack = tracks[currentIndex];

  useEffect(() => {
    const applyAudioMode = async () => {
      try {
        await Audio.setAudioModeAsync({
          staysActiveInBackground: true,
          playsInSilentModeIOS: true,
          interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DUCK_OTHERS,
          shouldDuckAndroid: true,
        });
      } catch (e) {
        console.warn("Failed to set audio mode", e);
      }
    };
    applyAudioMode();
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!bookUrl) {
        setLoadingTracks(false);
        return;
      }
      try {
        const res = await fetch(bookUrl);
        const html = await res.text();
        let parsed = extractTracks(html).slice(0, 80);
        if (resumeUrl && !parsed.find((t) => t.url === resumeUrl)) {
          parsed = [{ title: "Последний трек", url: resumeUrl }, ...parsed];
        }
        setTracks(parsed);
      } catch (e) {
        setTracks([]);
      } finally {
        setLoadingTracks(false);
      }
    };
    load();
  }, [params.bookUrl, params.resumeUrl]);

  useEffect(() => {
    const startPos = params.startPosition
      ? Number(asString(params.startPosition))
      : 0;
    if (!loadingTracks && tracks.length > 0) {
      loadTrack(currentIndex, startPos);
    }
    // unload on unmount
    return () => {
      soundRef.current?.unloadAsync();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingTracks, tracks.length]);

  const loadTrack = async (index: number, startMs = 0) => {
    if (!tracks[index]) return;
    setLoadingSound(true);
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      const sound = new Audio.Sound();
      await sound.loadAsync(
        { uri: tracks[index].url },
        { shouldPlay: true, positionMillis: startMs }
      );
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        setPosition(status.positionMillis ?? 0);
        setDuration(status.durationMillis ?? 1);
        setIsPlaying(status.isPlaying);

        if (status.didJustFinish) {
          handleNext();
        }

        const now = Date.now();
        if (now - lastSavedRef.current > 4000) {
          lastSavedRef.current = now;
          persistHistory(status.positionMillis ?? 0, status.durationMillis ?? 0, index);
        }
      });
      soundRef.current = sound;
      setCurrentIndex(index);
    } finally {
      setLoadingSound(false);
    }
  };

  const persistHistory = async (pos: number, dur: number, index: number) => {
    if (!bookId || !title || !bookUrl || !tracks[index]) return;
    await upsertHistory({
      bookId,
      title,
      authors,
      readers,
      cover,
      bookUrl,
      audioUrl: tracks[index].url,
      trackIndex: index,
      position: pos,
      duration: dur || duration,
    });
  };

  const togglePlay = async () => {
    if (!soundRef.current) return;
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      await soundRef.current.playAsync();
    }
  };

  const handleSeek = async (val: number) => {
    if (!soundRef.current) return;
    await soundRef.current.setPositionAsync(val);
  };

  const handleSkip = async (deltaMs: number) => {
    if (!soundRef.current) return;
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    const nextPos = Math.max(0, Math.min((status.durationMillis ?? 0) - 500, (status.positionMillis ?? 0) + deltaMs));
    await soundRef.current.setPositionAsync(nextPos);
  };

  const handleNext = () => {
    const next = currentIndex + 1;
    if (next < tracks.length) {
      loadTrack(next, 0);
    }
  };

  const handlePrev = () => {
    const prev = currentIndex - 1;
    if (prev >= 0) {
      loadTrack(prev, 0);
    }
  };

  const trackLabel = useMemo(() => {
    if (!currentTrack) return "Трек недоступен";
    return currentTrack.title || `Трек ${currentIndex + 1}`;
  }, [currentTrack, currentIndex]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.text }]}>Плеер</Text>
        <ThemeToggle />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View
        style={[
          styles.coverWrap,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {cover ? (
          <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, { backgroundColor: colors.surface }]} />
        )}
          <View style={styles.info}>
            <Text style={[styles.bookTitle, { color: colors.text }]}>
              {title || "Аудиокнига"}
            </Text>
            <Text style={[styles.meta, { color: colors.muted }]}>{authors}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>
              Читает: {readers || "—"}
            </Text>
            <Text style={[styles.meta, { color: colors.muted, marginTop: 6 }]}>
              {trackLabel}
            </Text>
          </View>
        </View>

        {loadingTracks && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.muted, marginTop: 6 }}>
              Тяну треки с knigavuhe...
            </Text>
          </View>
        )}

        {!loadingTracks && tracks.length === 0 && (
          <View style={styles.center}>
            <Ionicons name="alert-circle" size={22} color={colors.accent} />
            <Text style={{ color: colors.muted, marginTop: 6 }}>
              Не нашли аудио на странице книги.
            </Text>
          </View>
        )}

        {!loadingTracks && tracks.length > 0 && (
          <>
            <View style={styles.sliderRow}>
              <Slider
                value={position}
                minimumValue={0}
                maximumValue={duration || 1}
                minimumTrackTintColor={colors.accent}
                maximumTrackTintColor={colors.border}
                thumbTintColor={colors.accent}
                onSlidingComplete={handleSeek}
              />
              <View style={styles.sliderLabels}>
                <Text style={{ color: colors.muted }}>{formatMs(position)}</Text>
                <Text style={{ color: colors.muted }}>{formatMs(duration)}</Text>
              </View>
            </View>

            <View style={styles.controls}>
              <TouchableOpacity
                style={[styles.ctrlBtn, { backgroundColor: colors.card }]}
                onPress={() => handleSkip(-15000)}
              >
                <Ionicons name="play-back" size={22} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ctrlBtn, { backgroundColor: colors.card }]}
                onPress={handlePrev}
                disabled={currentIndex === 0}
              >
                <Ionicons
                  name="play-skip-back"
                  size={22}
                  color={currentIndex === 0 ? colors.border : colors.text}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.playBtn,
                  { backgroundColor: colors.accent },
                ]}
                onPress={togglePlay}
                disabled={loadingSound}
              >
                <Ionicons
                  name={isPlaying ? "pause" : "play"}
                  size={28}
                  color="#0b1521"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ctrlBtn, { backgroundColor: colors.card }]}
                onPress={handleNext}
                disabled={currentIndex >= tracks.length - 1}
              >
                <Ionicons
                  name="play-skip-forward"
                  size={22}
                  color={
                    currentIndex >= tracks.length - 1
                      ? colors.border
                      : colors.text
                  }
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ctrlBtn, { backgroundColor: colors.card }]}
                onPress={() => handleSkip(15000)}
              >
                <Ionicons name="play-forward" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.tracks}>
              <Text style={[styles.meta, { color: colors.text, marginBottom: 8 }]}>
                Треки книги
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {tracks.map((t, idx) => {
                  const active = idx === currentIndex;
                  return (
                    <TouchableOpacity
                      key={t.url}
                      style={[
                        styles.trackBadge,
                        {
                          backgroundColor: active ? `${colors.accent}22` : colors.surface,
                          borderColor: active ? colors.accent : colors.border,
                        },
                      ]}
                      onPress={() => loadTrack(idx, 0)}
                    >
                      <Text
                        style={{
                          color: active ? colors.accent : colors.text,
                          fontWeight: "600",
                        }}
                      >
                        {t.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </>
        )}
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
  coverWrap: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 12,
  },
  cover: {
    width: 120,
    height: 160,
    borderRadius: 12,
  },
  info: {
    flex: 1,
    gap: 6,
  },
  bookTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  meta: {
    fontSize: 13,
  },
  center: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 6,
  },
  sliderRow: {
    paddingVertical: 12,
    gap: 6,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  ctrlBtn: {
    width: 50,
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    width: 70,
    height: 70,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tracks: {
    marginTop: 10,
  },
  trackBadge: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 10,
  },
});
