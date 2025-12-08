import * as SQLite from "expo-sqlite";

export type HistoryRow = {
  id: number;
  bookId: string;
  title: string;
  authors: string;
  readers: string;
  cover: string;
  bookUrl: string;
  audioUrl: string;
  trackIndex: number;
  position: number;
  duration: number;
  updatedAt: number;
};

const dbPromise = SQLite.openDatabaseAsync("history.db");

export const setupDatabase = async () => {
  const db = await dbPromise;
  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookId TEXT UNIQUE,
      title TEXT,
      authors TEXT,
      readers TEXT,
      cover TEXT,
      bookUrl TEXT,
      audioUrl TEXT,
      trackIndex INTEGER DEFAULT 0,
      position REAL DEFAULT 0,
      duration REAL DEFAULT 0,
      updatedAt INTEGER
    );`
  );
};

export const upsertHistory = async (row: Omit<HistoryRow, "id" | "updatedAt">) => {
  const db = await dbPromise;
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO history (bookId, title, authors, readers, cover, bookUrl, audioUrl, trackIndex, position, duration, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(bookId) DO UPDATE SET
      title=excluded.title,
      authors=excluded.authors,
      readers=excluded.readers,
      cover=excluded.cover,
      bookUrl=excluded.bookUrl,
      audioUrl=excluded.audioUrl,
      trackIndex=excluded.trackIndex,
      position=excluded.position,
      duration=excluded.duration,
      updatedAt=excluded.updatedAt`,
    [
      row.bookId,
      row.title,
      row.authors,
      row.readers,
      row.cover,
      row.bookUrl,
      row.audioUrl,
      row.trackIndex,
      row.position,
      row.duration,
      now,
    ]
  );
};

export const fetchHistory = async (): Promise<HistoryRow[]> => {
  const db = await dbPromise;
  const rows = await db.getAllAsync<HistoryRow>(
    "SELECT * FROM history ORDER BY updatedAt DESC"
  );
  return rows ?? [];
};

export const deleteHistory = async (bookId: string) => {
  const db = await dbPromise;
  await db.runAsync("DELETE FROM history WHERE bookId = ?", bookId);
};
