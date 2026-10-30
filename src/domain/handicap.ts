import { SCRATCH_RATING, STANDARD_SLOPE, STANDARD_STROKES_PER_100_POINTS } from './courseRating.ts';
import type { LayoutRating } from './types.ts';

/**
 * Handicaps modeled on golf's World Handicap System, with disc golf numbers:
 *  - Scratch (0.0) = a 1000-rated PDGA player.
 *  - Score Differential = (113 / Slope) x (Adjusted Score - Course Rating - Weather Bucket)
 *    The weather bucket plays the role of golf's Playing Conditions Calculation.
 *  - Handicap Index = average of the best 8 of the last 20 differentials (18-hole basis).
 */

export const MAX_HANDICAP_INDEX = 54;

/** The rule of thumb from the user: UDisc rating x 2 + 500 ≈ PDGA rating. */
export function udiscToPdga(udiscRating: number): number {
  return Math.round(udiscRating * 2 + 500);
}

/** A starting handicap index for someone with a PDGA rating. Positive = strokes over scratch. */
export function indexFromPdgaRating(rating: number): number {
  const idx = ((SCRATCH_RATING - rating) * STANDARD_STROKES_PER_100_POINTS) / 100;
  return clampIndex(round1(idx));
}

/** The PDGA rating a handicap index roughly corresponds to. */
export function pdgaRatingFromIndex(index: number): number {
  return Math.round(SCRATCH_RATING - (index * 100) / STANDARD_STROKES_PER_100_POINTS);
}

/** Golf shows better-than-scratch handicaps with a plus sign: -2.1 internally is "+2.1". */
export function formatIndex(index: number): string {
  if (index < 0) return `+${Math.abs(index).toFixed(1)}`;
  return index.toFixed(1);
}

/** Strokes a player gets on this layout (can be negative for plus handicaps). */
export function courseHandicap(index: number, rating: LayoutRating, par: number, holes: number): number {
  const scaled = index * (holes / 18);
  return Math.round(scaled * (rating.slope / STANDARD_SLOPE) + (rating.courseRating - par));
}

/**
 * Cap each hole at "net triple bogey" so one blow-up hole (OB into the pond three times)
 * does not wreck a handicap. Players without an index get par + 5, as in golf.
 */
export function adjustedScore(
  holes: { par: number; strokes: number }[],
  courseHcp: number | null,
): number {
  const n = holes.length;
  return holes.reduce((sum, h, i) => {
    let cap: number;
    if (courseHcp === null) {
      cap = h.par + 5;
    } else {
      // Spread handicap strokes across holes. Without hole difficulty rankings yet,
      // give the extra strokes to the first holes.
      const base = Math.floor(Math.max(0, courseHcp) / n);
      const extra = i < Math.max(0, courseHcp) % n ? 1 : 0;
      cap = h.par + 3 + base + extra;
    }
    return sum + Math.min(h.strokes, cap);
  }, 0);
}

/** Differential on an 18-hole basis so 9-, 18- and 24-hole layouts can be mixed. */
export function scoreDifferential(
  adjusted: number,
  rating: LayoutRating,
  weatherBucketStrokes: number,
  holes: number,
): number {
  const diff = (STANDARD_SLOPE / rating.slope) * (adjusted - rating.courseRating - weatherBucketStrokes);
  return round1(diff * (18 / holes));
}

/** WHS table: how many of the best differentials count, plus an adjustment, by rounds on file. */
function countingRule(n: number): { count: number; adjust: number } | null {
  if (n < 3) return null;
  if (n === 3) return { count: 1, adjust: -2 };
  if (n === 4) return { count: 1, adjust: -1 };
  if (n === 5) return { count: 1, adjust: 0 };
  if (n === 6) return { count: 2, adjust: -1 };
  if (n <= 8) return { count: 2, adjust: 0 };
  if (n <= 11) return { count: 3, adjust: 0 };
  if (n <= 14) return { count: 4, adjust: 0 };
  if (n <= 16) return { count: 5, adjust: 0 };
  if (n <= 18) return { count: 6, adjust: 0 };
  if (n === 19) return { count: 7, adjust: 0 };
  return { count: 8, adjust: 0 };
}

/**
 * Handicap Index from differentials, most recent first. Returns null until 3 rounds exist.
 */
export function handicapIndex(differentialsNewestFirst: number[]): number | null {
  const recent = differentialsNewestFirst.slice(0, 20);
  const rule = countingRule(recent.length);
  if (!rule) return null;
  const best = [...recent].sort((a, b) => a - b).slice(0, rule.count);
  const avg = best.reduce((s, d) => s + d, 0) / best.length;
  return clampIndex(round1(avg + rule.adjust));
}

const clampIndex = (x: number) => Math.min(MAX_HANDICAP_INDEX, x);
const round1 = (x: number) => Math.round(x * 10) / 10;
