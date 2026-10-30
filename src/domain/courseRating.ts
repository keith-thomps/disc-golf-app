import { mean, simpleRegression } from './linalg.ts';
import type { Layout, LayoutRating, SanctionedScore, Weather } from './types.ts';
import {
  fitWeatherCoefficients,
  weatherStrokes,
  type WeatherCoefficients,
  type WeatherObservation,
} from './weather.ts';

/** A scratch disc golfer is 1000-rated, like a scratch golfer is a 0 handicap. */
export const SCRATCH_RATING = 1000;

/**
 * On a "standard" course (slope 113) a player 100 rating points worse than scratch
 * shoots about 10 more strokes per 18 holes, i.e. ~10 rating points per stroke,
 * which is the commonly cited PDGA rule of thumb.
 */
export const STANDARD_STROKES_PER_100_POINTS = 10;
export const STANDARD_SLOPE = 113;

/** Ignore players far outside the range we are extrapolating to. */
const MIN_PROPAGATOR_RATING = 700;
const MIN_PROPAGATORS = 5;

export type RoundSsa = {
  eventId: string;
  eventDate: string;
  round: number;
  layoutId: string;
  /** Expected score for a 1000-rated player in this round (actual conditions). */
  ssa: number;
  /** Extra strokes per 18 holes for every 100 rating points below scratch. */
  strokesPer100: number;
  players: number;
};

/**
 * Scratch Scoring Average for one round: regress score on player rating across everyone
 * who played that layout in that round and read the line off at 1000.
 * Outliers more than 3 standard deviations off the line (DNFs, injuries) are dropped once.
 */
export function roundSsa(scores: SanctionedScore[], holes: number): RoundSsa | null {
  let pts = scores.filter((s) => s.playerRating >= MIN_PROPAGATOR_RATING && s.score > 0);
  if (pts.length < MIN_PROPAGATORS) return null;

  let fit = simpleRegression(pts.map((p) => p.playerRating), pts.map((p) => p.score));
  const resid = pts.map((p) => p.score - (fit.intercept + fit.slope * p.playerRating));
  const sd = Math.sqrt(mean(resid.map((r) => r * r)));
  if (sd > 0) {
    const kept = pts.filter((_, i) => Math.abs(resid[i]) <= 3 * sd);
    if (kept.length >= MIN_PROPAGATORS && kept.length < pts.length) {
      pts = kept;
      fit = simpleRegression(pts.map((p) => p.playerRating), pts.map((p) => p.score));
    }
  }
  const first = scores[0];
  return {
    eventId: first.eventId,
    eventDate: first.eventDate,
    round: first.round,
    layoutId: first.layoutId,
    ssa: fit.intercept + fit.slope * SCRATCH_RATING,
    // slope is strokes per rating point (negative). Normalize to an 18-hole round.
    strokesPer100: -fit.slope * 100 * (18 / holes),
    players: pts.length,
  };
}

/** Group raw scores into rounds (event + round number + layout). */
export function groupRounds(scores: SanctionedScore[]): SanctionedScore[][] {
  const groups = new Map<string, SanctionedScore[]>();
  for (const s of scores) {
    const key = `${s.eventId}|${s.round}|${s.layoutId}`;
    const g = groups.get(key) ?? [];
    g.push(s);
    groups.set(key, g);
  }
  return [...groups.values()];
}

export function slopeFromSpread(strokesPer100: number): number {
  const raw = (STANDARD_SLOPE * strokesPer100) / STANDARD_STROKES_PER_100_POINTS;
  return Math.round(Math.min(155, Math.max(55, raw)));
}

export type RatingInput = {
  layouts: Layout[];
  scores: SanctionedScore[];
  /** Weather for each round, keyed `${eventId}|${round}`. */
  weatherByRound: Map<string, Weather>;
};

export type RatingOutput = {
  ratings: LayoutRating[];
  coefficients: WeatherCoefficients;
  rounds: (RoundSsa & { weatherStrokes: number })[];
};

/**
 * Full pipeline: sanctioned scores + weather -> per-layout Course Rating and Slope,
 * plus a weather model fitted on the same rounds.
 *
 * Course Rating = average over rounds of (SSA - weather strokes), i.e. what a scratch
 * player should shoot in ideal conditions. Compare to par to see if a layout plays hard.
 */
export function rateLayouts({ layouts, scores, weatherByRound }: RatingInput): RatingOutput {
  const layoutById = new Map(layouts.map((l) => [l.id, l]));
  const rounds: RoundSsa[] = [];
  for (const group of groupRounds(scores)) {
    const layout = layoutById.get(group[0].layoutId);
    if (!layout) continue;
    const r = roundSsa(group, layout.holes.length);
    if (r) rounds.push(r);
  }

  const obs: WeatherObservation[] = [];
  for (const r of rounds) {
    const w = weatherByRound.get(`${r.eventId}|${r.round}`);
    const layout = layoutById.get(r.layoutId)!;
    if (w) {
      obs.push({
        layoutId: r.layoutId,
        ssa18: r.ssa * (18 / layout.holes.length),
        weather: w,
        exposure: layout.windExposure,
      });
    }
  }
  const coefficients = fitWeatherCoefficients(obs);

  const withWeather = rounds.map((r) => {
    const layout = layoutById.get(r.layoutId)!;
    const w = weatherByRound.get(`${r.eventId}|${r.round}`);
    const ws = w ? weatherStrokes(w, layout.windExposure, layout.holes.length, coefficients) : 0;
    return { ...r, weatherStrokes: ws };
  });

  const ratings: LayoutRating[] = layouts.map((layout) => {
    const mine = withWeather.filter((r) => r.layoutId === layout.id);
    if (mine.length === 0) return provisionalRating(layout);
    return {
      layoutId: layout.id,
      courseRating: round1(mean(mine.map((r) => r.ssa - r.weatherStrokes))),
      slope: slopeFromSpread(mean(mine.map((r) => r.strokesPer100))),
      roundsUsed: mine.length,
      provisional: false,
    };
  });

  return { ratings, coefficients, rounds: withWeather };
}

/** Until a layout has sanctioned data, assume it plays to par with average slope. */
export function provisionalRating(layout: Layout): LayoutRating {
  return {
    layoutId: layout.id,
    courseRating: layout.holes.reduce((s, h) => s + h.par, 0),
    slope: STANDARD_SLOPE,
    roundsUsed: 0,
    provisional: true,
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;
