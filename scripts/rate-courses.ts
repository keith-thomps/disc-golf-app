// Turn PDGA-sanctioned round results into Course Ratings, Slopes and a fitted weather model.
//
//   npm run rate -- [--in data/pdga/rounds.csv] [--out src/data/generated/ratings.json] [--no-fetch]
//
// Input CSV columns (header row required):
//   event_id,event_date,round,layout_id,pdga_number,player_rating,score[,wind_mph,gust_mph,temp_f,precip_in_hr]
// layout_id must match an id in src/data/tulsa.ts (e.g. "chandler-park-black:main").
// If the weather columns are blank, conditions are pulled from the Open-Meteo archive
// and cached in data/pdga/weather-cache.json.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { rateLayouts } from '../src/domain/courseRating.ts';
import type { SanctionedScore, Weather } from '../src/domain/types.ts';
import { ALL_LAYOUTS, findLayout } from '../src/data/tulsa.ts';
import { fetchHistoricalWeather } from '../src/services/openMeteo.ts';

const TULSA_CENTER = { lat: 36.15398, lng: -95.99277 };
const CACHE_PATH = 'data/pdga/weather-cache.json';

const { values: args } = parseArgs({
  options: {
    in: { type: 'string', default: 'data/pdga/rounds.csv' },
    out: { type: 'string', default: 'src/data/generated/ratings.json' },
    'no-fetch': { type: 'boolean', default: false },
  },
});

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(',').map((c) => c.trim());
  return lines
    .filter((l) => l.trim())
    .map((l) => {
      const cells = l.split(',');
      return Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? '').trim()]));
    });
}

const num = (s: string | undefined) => (s === undefined || s === '' ? null : Number(s));

async function main() {
  const rows = parseCsv(readFileSync(args.in!, 'utf8'));
  const scores: SanctionedScore[] = [];
  const csvWeather = new Map<string, Weather>();
  const unknownLayouts = new Set<string>();

  for (const r of rows) {
    if (!findLayout(r.layout_id)) {
      unknownLayouts.add(r.layout_id);
      continue;
    }
    scores.push({
      eventId: r.event_id,
      eventDate: r.event_date,
      round: Number(r.round),
      layoutId: r.layout_id,
      pdgaNumber: r.pdga_number || undefined,
      playerRating: Number(r.player_rating),
      score: Number(r.score),
    });
    const wind = num(r.wind_mph);
    if (wind !== null) {
      csvWeather.set(`${r.event_id}|${r.round}`, {
        windMph: wind,
        gustMph: num(r.gust_mph) ?? wind,
        tempF: num(r.temp_f) ?? 70,
        precipInPerHr: num(r.precip_in_hr) ?? 0,
      });
    }
  }
  if (unknownLayouts.size) console.warn(`Skipped unknown layout ids: ${[...unknownLayouts].join(', ')}`);

  // Weather per round: CSV first, then cache, then Open-Meteo archive.
  const cache: Record<string, Weather | null> = existsSync(CACHE_PATH)
    ? JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
    : {};
  const weatherByRound = new Map(csvWeather);
  const roundKeys = new Map<string, SanctionedScore>();
  for (const s of scores) roundKeys.set(`${s.eventId}|${s.round}`, s);

  for (const [key, s] of roundKeys) {
    if (weatherByRound.has(key)) continue;
    const loc = findLayout(s.layoutId)!.course.location ?? TULSA_CENTER;
    // Assume morning rounds are odd-numbered and afternoon rounds even-numbered.
    const [from, to] = s.round % 2 === 1 ? [8, 12] : [12, 17];
    const cacheKey = `${loc.lat.toFixed(3)},${loc.lng.toFixed(3)}|${s.eventDate}|${from}-${to}`;
    if (!(cacheKey in cache)) {
      if (args['no-fetch']) continue;
      try {
        cache[cacheKey] = await fetchHistoricalWeather(loc, s.eventDate, from, to);
      } catch (e) {
        console.warn(`Weather fetch failed for ${key}: ${(e as Error).message}`);
        continue;
      }
    }
    const w = cache[cacheKey];
    if (w) weatherByRound.set(key, w);
  }
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');

  const result = rateLayouts({ layouts: ALL_LAYOUTS, scores, weatherByRound });
  const rated = result.ratings.filter((r) => !r.provisional);

  writeFileSync(
    args.out!,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: args.in,
        coefficients: result.coefficients,
        ratings: rated,
      },
      null,
      2,
    ) + '\n',
  );

  console.log(`Rounds rated: ${result.rounds.length} (${weatherByRound.size} with weather)`);
  console.log('Weather coefficients (strokes per 18 holes):', result.coefficients);
  for (const r of rated) {
    const { course, layout } = findLayout(r.layoutId)!;
    const par = layout.holes.reduce((s, h) => s + h.par, 0);
    const vsPar = r.courseRating - par;
    console.log(
      `${course.name} / ${layout.name}: CR ${r.courseRating} (${vsPar >= 0 ? '+' : ''}${vsPar.toFixed(1)} vs par ${par}), ` +
        `slope ${r.slope}, ${r.roundsUsed} rounds`,
    );
  }
  console.log(`Wrote ${args.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
