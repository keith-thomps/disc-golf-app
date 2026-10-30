import type { SQLiteDatabase } from 'expo-sqlite';
import type { Hole, LatLng, Layout, Weather } from '../domain/types.ts';

export type RoundType = 'casual' | 'practice' | 'tournament' | 'league';

export const NOTE_CATEGORIES = [
  'Landing zone',
  'Disc & line',
  'Green / circle',
  'Hazard / OB',
  'Wind',
  'General',
] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export type HoleNote = {
  id: number;
  layoutId: string;
  holeNumber: number;
  category: NoteCategory;
  body: string;
  pin: LatLng | null;
  updatedAt: string;
};

export type RoundRow = {
  id: number;
  layoutId: string;
  roundType: RoundType;
  startedAt: string;
  finishedAt: string | null;
  weather: Weather | null;
  weatherBucket: number | null;
  courseRating: number | null;
  slope: number | null;
  par: number | null;
  adjustedScore: number | null;
  differential: number | null;
};

const now = () => new Date().toISOString();

// ---------- settings ----------

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string | null): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

// ---------- holes (seed + surveyed overrides) ----------

type OverrideRow = {
  hole_number: number;
  par: number | null;
  tee_lat: number | null;
  tee_lng: number | null;
  basket_lat: number | null;
  basket_lng: number | null;
};

/** Seed holes with any par/GPS the player has surveyed merged on top. */
export async function getHoles(db: SQLiteDatabase, layout: Layout): Promise<Hole[]> {
  const rows = await db.getAllAsync<OverrideRow>(
    'SELECT * FROM hole_overrides WHERE layout_id = ?',
    layout.id,
  );
  const byHole = new Map(rows.map((r) => [r.hole_number, r]));
  return layout.holes.map((h) => {
    const o = byHole.get(h.number);
    if (!o) return h;
    return {
      ...h,
      par: o.par ?? h.par,
      tee: o.tee_lat !== null && o.tee_lng !== null ? { lat: o.tee_lat, lng: o.tee_lng } : h.tee,
      basket:
        o.basket_lat !== null && o.basket_lng !== null ? { lat: o.basket_lat, lng: o.basket_lng } : h.basket,
    };
  });
}

export async function setHolePar(db: SQLiteDatabase, layoutId: string, hole: number, par: number) {
  await db.runAsync(
    `INSERT INTO hole_overrides (layout_id, hole_number, par) VALUES (?, ?, ?)
     ON CONFLICT(layout_id, hole_number) DO UPDATE SET par = excluded.par`,
    layoutId,
    hole,
    par,
  );
}

export async function setHolePoint(
  db: SQLiteDatabase,
  layoutId: string,
  hole: number,
  which: 'tee' | 'basket',
  p: LatLng,
) {
  const [latCol, lngCol] = which === 'tee' ? ['tee_lat', 'tee_lng'] : ['basket_lat', 'basket_lng'];
  await db.runAsync(
    `INSERT INTO hole_overrides (layout_id, hole_number, ${latCol}, ${lngCol}) VALUES (?, ?, ?, ?)
     ON CONFLICT(layout_id, hole_number) DO UPDATE SET ${latCol} = excluded.${latCol}, ${lngCol} = excluded.${lngCol}`,
    layoutId,
    hole,
    p.lat,
    p.lng,
  );
}

// ---------- yardage book ----------

type NoteRow = {
  id: number;
  layout_id: string;
  hole_number: number;
  category: NoteCategory;
  body: string;
  lat: number | null;
  lng: number | null;
  updated_at: string;
};

const toNote = (r: NoteRow): HoleNote => ({
  id: r.id,
  layoutId: r.layout_id,
  holeNumber: r.hole_number,
  category: r.category,
  body: r.body,
  pin: r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng } : null,
  updatedAt: r.updated_at,
});

export async function getNotes(db: SQLiteDatabase, layoutId: string, hole?: number): Promise<HoleNote[]> {
  const rows =
    hole === undefined
      ? await db.getAllAsync<NoteRow>(
          'SELECT * FROM hole_notes WHERE layout_id = ? ORDER BY hole_number, category, updated_at DESC',
          layoutId,
        )
      : await db.getAllAsync<NoteRow>(
          'SELECT * FROM hole_notes WHERE layout_id = ? AND hole_number = ? ORDER BY category, updated_at DESC',
          layoutId,
          hole,
        );
  return rows.map(toNote);
}

export async function saveNote(
  db: SQLiteDatabase,
  note: { id?: number; layoutId: string; holeNumber: number; category: NoteCategory; body: string; pin: LatLng | null },
): Promise<void> {
  const t = now();
  if (note.id) {
    await db.runAsync(
      'UPDATE hole_notes SET category = ?, body = ?, lat = ?, lng = ?, updated_at = ? WHERE id = ?',
      note.category,
      note.body,
      note.pin?.lat ?? null,
      note.pin?.lng ?? null,
      t,
      note.id,
    );
  } else {
    await db.runAsync(
      `INSERT INTO hole_notes (layout_id, hole_number, category, body, lat, lng, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      note.layoutId,
      note.holeNumber,
      note.category,
      note.body,
      note.pin?.lat ?? null,
      note.pin?.lng ?? null,
      t,
      t,
    );
  }
}

export async function deleteNote(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM hole_notes WHERE id = ?', id);
}

// ---------- rounds ----------

type RoundDbRow = {
  id: number;
  layout_id: string;
  round_type: RoundType;
  started_at: string;
  finished_at: string | null;
  wind_mph: number | null;
  gust_mph: number | null;
  temp_f: number | null;
  precip_in_hr: number | null;
  weather_bucket: number | null;
  course_rating: number | null;
  slope: number | null;
  par: number | null;
  adjusted_score: number | null;
  differential: number | null;
};

const toRound = (r: RoundDbRow): RoundRow => ({
  id: r.id,
  layoutId: r.layout_id,
  roundType: r.round_type,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  weather:
    r.wind_mph === null
      ? null
      : { windMph: r.wind_mph, gustMph: r.gust_mph ?? r.wind_mph, tempF: r.temp_f ?? 70, precipInPerHr: r.precip_in_hr ?? 0 },
  weatherBucket: r.weather_bucket,
  courseRating: r.course_rating,
  slope: r.slope,
  par: r.par,
  adjustedScore: r.adjusted_score,
  differential: r.differential,
});

export async function startRound(db: SQLiteDatabase, layoutId: string, roundType: RoundType): Promise<number> {
  const res = await db.runAsync(
    'INSERT INTO rounds (layout_id, round_type, started_at) VALUES (?, ?, ?)',
    layoutId,
    roundType,
    now(),
  );
  return res.lastInsertRowId;
}

export async function getRound(db: SQLiteDatabase, id: number): Promise<RoundRow | null> {
  const r = await db.getFirstAsync<RoundDbRow>('SELECT * FROM rounds WHERE id = ?', id);
  return r ? toRound(r) : null;
}

export async function listRounds(db: SQLiteDatabase): Promise<RoundRow[]> {
  const rows = await db.getAllAsync<RoundDbRow>('SELECT * FROM rounds ORDER BY started_at DESC');
  return rows.map(toRound);
}

export async function setRoundWeather(db: SQLiteDatabase, id: number, w: Weather): Promise<void> {
  await db.runAsync(
    'UPDATE rounds SET wind_mph = ?, gust_mph = ?, temp_f = ?, precip_in_hr = ? WHERE id = ?',
    w.windMph,
    w.gustMph,
    w.tempF,
    w.precipInPerHr,
    id,
  );
}

export async function getScores(db: SQLiteDatabase, roundId: number): Promise<Map<number, number>> {
  const rows = await db.getAllAsync<{ hole_number: number; strokes: number }>(
    'SELECT hole_number, strokes FROM hole_scores WHERE round_id = ?',
    roundId,
  );
  return new Map(rows.map((r) => [r.hole_number, r.strokes]));
}

export async function setScore(db: SQLiteDatabase, roundId: number, hole: number, strokes: number) {
  await db.runAsync(
    `INSERT INTO hole_scores (round_id, hole_number, strokes) VALUES (?, ?, ?)
     ON CONFLICT(round_id, hole_number) DO UPDATE SET strokes = excluded.strokes`,
    roundId,
    hole,
    strokes,
  );
}

export async function finishRound(
  db: SQLiteDatabase,
  id: number,
  result: {
    weatherBucket: number;
    courseRating: number;
    slope: number;
    par: number;
    adjustedScore: number;
    differential: number | null;
  },
): Promise<void> {
  await db.runAsync(
    `UPDATE rounds SET finished_at = ?, weather_bucket = ?, course_rating = ?, slope = ?, par = ?,
       adjusted_score = ?, differential = ? WHERE id = ?`,
    now(),
    result.weatherBucket,
    result.courseRating,
    result.slope,
    result.par,
    result.adjustedScore,
    result.differential,
    id,
  );
}

export async function deleteRound(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM rounds WHERE id = ?', id);
}

/** Differentials of finished rounds, newest first, for the handicap index. */
export async function getDifferentials(db: SQLiteDatabase): Promise<number[]> {
  const rows = await db.getAllAsync<{ differential: number }>(
    `SELECT differential FROM rounds WHERE finished_at IS NOT NULL AND differential IS NOT NULL
     ORDER BY finished_at DESC LIMIT 20`,
  );
  return rows.map((r) => r.differential);
}
