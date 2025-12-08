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
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import TrackPlayer, {
  Capability,
  Event,
  State,
  usePlaybackState,
  useProgress,
  useTrackPlayerEvents,
} from "react-native-track-player";
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
  try {
    const playerMatch = html.match(/new BookPlayer\([^,]+,\s*(\[[\s\S]*?\])/);
    if (playerMatch?.[1]) {
      const jsonLike = playerMatch[1]
        .replace(/\\\//g, "/")
        .replace(/\t/g, " ");
      const parsed = JSON.parse(jsonLike);
      if (Array.isArray(parsed)) {
        return parsed
          .map((t: any, idx: number) => ({
            title:
              typeof t?.title === "string" && t.title.trim()
                ? t.title.trim()
                : `Трек ${idx + 1}`,
            url: String(t?.url ?? ""),
          }))
          .filter((t) => t.url.startsWith("http"));
      }
    }
  } catch (e) {
    // ignore parse error, fallback below
  }

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
  const playbackState = usePlaybackState();
  const progress = useProgress(0.5);
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
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [loadingSound, setLoadingSound] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackDurations, setTrackDurations] = useState<number[]>([]);

  const lastSavedRef = useRef<number>(0);

  const currentTrack = tracks[currentIndex];

  useEffect(() => {
    const setup = async () => {
      try {
        await TrackPlayer.setupPlayer();
        await TrackPlayer.updateOptions({
          stoppingAppPausesPlayback: false,
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SeekTo,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
          progressUpdateEventInterval: 2,
        });
        setPlayerReady(true);
      } catch (e) {
        console.warn("Failed to setup player", e);
      }
    };
    setup();
  }, []);

  // reset when book changes to avoid playing previous queue
  useEffect(() => {
    setTracks([]);
    setCurrentIndex(params.startTrack ? Number(asString(params.startTrack)) : 0);
    setTrackDurations([]);
    setLoadingTracks(true);
    TrackPlayer.reset().catch(() => {});
    return () => {
      TrackPlayer.reset().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

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
          parsed = [{ title: "Продолжение", url: resumeUrl }, ...parsed];
        }
        setTracks(parsed);
      } catch (e) {
        setTracks([]);
      } finally {
        setLoadingTracks(false);
      }
    };
    load();
  }, [params.bookUrl, params.resumeUrl, bookId]);

  useEffect(() => {
    const startPos = params.startPosition
      ? Number(asString(params.startPosition))
      : 0;
    if (!loadingTracks && tracks.length > 0 && playerReady) {
      loadQueueAndPlay(currentIndex, startPos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingTracks, tracks.length, playerReady]);

  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged], (event) => {
    if (event.type === Event.PlaybackActiveTrackChanged) {
      if (typeof event.index === "number" && event.index >= 0) {
        setCurrentIndex(event.index);
      }
    }
  });

  useEffect(() => {
    const state =
      typeof playbackState === "object"
        ? playbackState.state
        : playbackState;
    setIsPlaying(state === State.Playing || state === State.Buffering);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackState]);

  const positionMs = Math.floor((progress.position || 0) * 1000);
  const durationMs = Math.max(
    Math.floor((progress.duration || 0) * 1000),
    1
  );

  useEffect(() => {
    if (!bookId || !title || !bookUrl || !tracks[currentIndex]) return;
    const now = Date.now();
    if (now - lastSavedRef.current < 4000) return;
    lastSavedRef.current = now;
    persistHistory(positionMs, durationMs, currentIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionMs, durationMs, currentIndex]);

  const loadQueueAndPlay = async (index: number, startMs = 0) => {
    if (!tracks[index]) return;
    setLoadingSound(true);
    try {
      await TrackPlayer.reset();
      await TrackPlayer.add(
        tracks.map((t, idx) => ({
          id: `${bookId || "track"}-${idx}`,
          url: t.url,
          title: t.title,
          artist: readers || authors || "Knigavuhe",
          artwork: cover || undefined,
        }))
      );
      await refreshDurations();
      await TrackPlayer.skip(index);
      if (startMs > 0) {
        await TrackPlayer.seekTo(startMs / 1000);
      }
      await TrackPlayer.play();
      setCurrentIndex(index);
    } catch (e) {
      console.warn("Failed to load track", e);
    } finally {
      setLoadingSound(false);
    }
  };

  const persistHistory = async (pos: number, dur: number, index: number) => {
    if (!bookId || !title || !bookUrl || !tracks[index]) return;
    const knownTotalDur = trackDurations.reduce((acc, v) => acc + (v || 0), 0);
    const estimatedTotalDur =
      knownTotalDur > 0
        ? knownTotalDur
        : tracks.length > 0
        ? (dur || durationMs) * tracks.length
        : dur || durationMs;
    const knownElapsed = trackDurations
      .slice(0, index)
      .reduce((acc, v) => acc + (v || 0), 0);
    const estimatedElapsed =
      knownTotalDur > 0
        ? knownElapsed + pos
        : index * (dur || durationMs) + pos;
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
      duration: dur || durationMs,
      totalPosition: estimatedElapsed,
      totalDuration: estimatedTotalDur,
    });
  };

  const togglePlay = async () => {
    // ensure queue is ready
    try {
      const queue = await TrackPlayer.getQueue();
      if ((!queue || queue.length === 0) && tracks.length > 0) {
        await loadQueueAndPlay(currentIndex, positionMs);
        return;
      }
    } catch {
      // ignore
    }
    const state =
      typeof playbackState === "object"
        ? playbackState.state
        : playbackState;
    if (state === State.Playing || state === State.Buffering) {
      await TrackPlayer.pause();
    } else {
      await TrackPlayer.play();
    }
  };

  const handleSeek = async (val: number) => {
    await TrackPlayer.seekTo(val / 1000);
  };

  const handleSkip = async (deltaMs: number) => {
    const nextPos = Math.max(0, Math.min(durationMs - 500, positionMs + deltaMs));
    await TrackPlayer.seekTo(nextPos / 1000);
  };

  const handleNext = async () => {
    try {
      await TrackPlayer.skipToNext();
    } catch {
      // no next track
    }
  };

  const handlePrev = async () => {
    try {
      await TrackPlayer.skipToPrevious();
    } catch {
      await TrackPlayer.seekTo(0);
    }
  };

  const handleSelectTrack = async (idx: number) => {
    if (!tracks[idx]) return;
    setLoadingSound(true);
    try {
      await TrackPlayer.skip(idx);
      await refreshDurations();
      await TrackPlayer.play();
      setCurrentIndex(idx);
    } catch (e) {
      console.warn("Failed to change track", e);
    } finally {
      setLoadingSound(false);
    }
  };

  const trackLabel = useMemo(() => {
    if (!currentTrack) return "Трек не выбран";
    return currentTrack.title || `Трек ${currentIndex + 1}`;
  }, [currentTrack, currentIndex]);

  const refreshDurations = async () => {
    try {
      const queue = await TrackPlayer.getQueue();
      setTrackDurations(
        queue.map((t) => {
          const d = (t as any)?.duration;
          return typeof d === "number" && d > 0 ? Math.floor(d * 1000) : 0;
        })
      );
    } catch {
      // ignore
    }
  };

  const knownTotalDur = trackDurations.reduce((acc, v) => acc + (v || 0), 0);
  const estTotalDur =
    knownTotalDur > 0
      ? knownTotalDur
      : tracks.length > 0
      ? (durationMs || 1) * tracks.length
      : durationMs;
  const elapsedKnown = trackDurations
    .slice(0, currentIndex)
    .reduce((acc, v) => acc + (v || 0), 0);
  const estElapsed =
    knownTotalDur > 0
      ? elapsedKnown + positionMs
      : currentIndex * (durationMs || 1) + positionMs;
  const overallPercent =
    estTotalDur > 0 ? Math.min(100, (estElapsed / estTotalDur) * 100) : 0;

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
              {title || "Неизвестная книга"}
            </Text>
            <Text style={[styles.meta, { color: colors.muted }]}>{authors}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>
              Читает: {readers || "Неизвестно"}
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
              Ищем треки на knigavuhe...
            </Text>
          </View>
        )}

        {!loadingTracks && tracks.length === 0 && (
          <View style={styles.center}>
            <Ionicons name="alert-circle" size={22} color={colors.accent} />
            <Text style={{ color: colors.muted, marginTop: 6 }}>
              Не удалось найти аудио для этой книги.
            </Text>
          </View>
        )}

        {!loadingTracks && tracks.length > 0 && (
          <>
            <View style={styles.sliderRow}>
              <Slider
                value={positionMs}
                minimumValue={0}
                maximumValue={durationMs || 1}
                minimumTrackTintColor={colors.accent}
                maximumTrackTintColor={colors.border}
                thumbTintColor={colors.accent}
                onSlidingComplete={handleSeek}
              />
              <View style={styles.sliderLabels}>
                <Text style={{ color: colors.muted }}>
                  {formatMs(positionMs)}
                </Text>
                <Text style={{ color: colors.muted }}>
                  {formatMs(durationMs)}
                </Text>
              </View>
              <View style={styles.sliderLabels}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  Всего: {formatMs(estElapsed)} / {formatMs(estTotalDur)}
                </Text>
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {Math.round(overallPercent)}%
                </Text>
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
                          backgroundColor: active
                            ? `${colors.accent}22`
                            : colors.surface,
                          borderColor: active ? colors.accent : colors.border,
                        },
                      ]}
                      onPress={() => handleSelectTrack(idx)}
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
