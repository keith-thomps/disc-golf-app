import type { SQLiteDatabase } from 'expo-sqlite';

// Bump when adding a migration below. Migrations run in order on app start.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT);

  -- Player-surveyed hole data overrides the bundled seed (par, tee/basket GPS).
  CREATE TABLE hole_overrides (
    layout_id TEXT NOT NULL,
    hole_number INTEGER NOT NULL,
    par INTEGER,
    tee_lat REAL, tee_lng REAL,
    basket_lat REAL, basket_lng REAL,
    PRIMARY KEY (layout_id, hole_number)
  );

  -- The yardage book. Notes belong to a hole of a layout and outlive any single round.
  -- A note can carry a GPS pin (e.g. a landing zone) that the round screen measures to.
  CREATE TABLE hole_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    layout_id TEXT NOT NULL,
    hole_number INTEGER NOT NULL,
    category TEXT NOT NULL,
    body TEXT NOT NULL,
    lat REAL, lng REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX hole_notes_by_hole ON hole_notes (layout_id, hole_number);

  CREATE TABLE rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    layout_id TEXT NOT NULL,
    round_type TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    wind_mph REAL, gust_mph REAL, temp_f REAL, precip_in_hr REAL,
    -- Snapshotted at finish so later rating updates do not rewrite history.
    weather_bucket INTEGER,
    course_rating REAL,
    slope INTEGER,
    par INTEGER,
    adjusted_score INTEGER,
    differential REAL
  );

  CREATE TABLE hole_scores (
    round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    hole_number INTEGER NOT NULL,
    strokes INTEGER NOT NULL,
    PRIMARY KEY (round_id, hole_number)
  );
  `,
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
