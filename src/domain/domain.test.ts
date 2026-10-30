import { describe, expect, it } from 'vitest';
import { rateLayouts, roundSsa, slopeFromSpread } from './courseRating.ts';
import { distanceFeet } from './geo.ts';
import {
  adjustedScore,
  courseHandicap,
  formatIndex,
  handicapIndex,
  indexFromPdgaRating,
  scoreDifferential,
  udiscToPdga,
} from './handicap.ts';
import type { Layout, SanctionedScore, Weather } from './types.ts';
import { PRIOR_COEFFICIENTS, weatherBucket, weatherStrokes } from './weather.ts';

const layout = (id: string, holes = 18, par = 3): Layout => ({
  id,
  name: id,
  windExposure: 'mixed',
  holes: Array.from({ length: holes }, (_, i) => ({ number: i + 1, par })),
});

describe('geo', () => {
  it('measures ~364 ft per 0.001° of latitude', () => {
    const d = distanceFeet({ lat: 36.15, lng: -95.99 }, { lat: 36.151, lng: -95.99 });
    expect(d).toBeGreaterThan(362);
    expect(d).toBeLessThan(366);
  });
});

describe('round SSA', () => {
  it('reads the expected score of a 1000-rated player off the regression line', () => {
    // 10 points per stroke; a 1000-rated player shoots 54.
    const scores: SanctionedScore[] = [850, 900, 925, 950, 975, 1000, 1025].map((r, i) => ({
      eventId: 'e',
      eventDate: '2025-05-01',
      round: 1,
      layoutId: 'L',
      pdgaNumber: String(i),
      playerRating: r,
      score: 54 + (1000 - r) / 10,
    }));
    const r = roundSsa(scores, 18)!;
    expect(r.ssa).toBeCloseTo(54, 5);
    expect(r.strokesPer100).toBeCloseTo(10, 5);
    expect(slopeFromSpread(r.strokesPer100)).toBe(113);
  });

  it('needs at least 5 propagators', () => {
    const s: SanctionedScore = { eventId: 'e', eventDate: 'd', round: 1, layoutId: 'L', playerRating: 950, score: 55 };
    expect(roundSsa([s, s, s], 18)).toBeNull();
  });
});

describe('weather', () => {
  const calm: Weather = { windMph: 3, gustMph: 5, tempF: 72, precipInPerHr: 0 };
  const nasty: Weather = { windMph: 22, gustMph: 32, tempF: 40, precipInPerHr: 0.1 };

  it('costs nothing in ideal conditions', () => {
    expect(weatherStrokes(calm, 'mixed', 18)).toBe(0);
    expect(weatherBucket(0).label).toBe('Ideal');
  });

  it('puts windy, cold, wet rounds in a high bucket, more so on open courses', () => {
    const mixed = weatherStrokes(nasty, 'mixed', 18);
    const open = weatherStrokes(nasty, 'open', 18);
    expect(open).toBeGreaterThan(mixed);
    expect(weatherBucket(mixed).strokes).toBeGreaterThanOrEqual(4);
  });

  it('scales with holes played', () => {
    expect(weatherStrokes(nasty, 'mixed', 9)).toBeCloseTo(weatherStrokes(nasty, 'mixed', 18) / 2);
  });
});

describe('handicap', () => {
  it('maps PDGA ratings to index around scratch = 1000', () => {
    expect(indexFromPdgaRating(1000)).toBe(0);
    expect(indexFromPdgaRating(900)).toBe(10);
    expect(formatIndex(indexFromPdgaRating(1020))).toBe('+2.0');
    expect(udiscToPdga(220)).toBe(940);
  });

  it('treats -3 in ideal weather the same as +2 in a +5 bucket', () => {
    const rating = { layoutId: 'L', courseRating: 54, slope: 113, roundsUsed: 10, provisional: false };
    const ideal = scoreDifferential(54 - 3, rating, 0, 18);
    const windy = scoreDifferential(54 + 2, rating, 5, 18);
    expect(ideal).toBe(windy);
  });

  it('caps blow-up holes at net triple bogey', () => {
    const holes = [{ par: 3, strokes: 11 }, { par: 3, strokes: 3 }];
    expect(adjustedScore(holes, 0)).toBe(6 + 3);
    expect(adjustedScore(holes, null)).toBe(8 + 3);
  });

  it('averages the best 8 of the last 20 differentials', () => {
    const diffs = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 1, 2, 3, 4, 5, 6, 7, 8, 30, 30, 0];
    // Only the 20 most recent count, so the trailing 0 is ignored: best 8 = 1..8.
    expect(handicapIndex(diffs)).toBe(4.5);
    expect(handicapIndex([5, 6])).toBeNull();
    expect(handicapIndex([5, 6, 7])).toBe(3);
  });

  it('gives more strokes on harder (higher slope, higher rating) layouts', () => {
    const easy = { layoutId: 'a', courseRating: 52, slope: 100, roundsUsed: 1, provisional: false };
    const hard = { layoutId: 'b', courseRating: 58, slope: 130, roundsUsed: 1, provisional: false };
    expect(courseHandicap(10, hard, 54, 18)).toBeGreaterThan(courseHandicap(10, easy, 54, 18));
  });
});

describe('rateLayouts', () => {
  it('recovers course difficulty and the wind effect from simulated events', () => {
    const layouts = [layout('easy'), layout('hard')];
    const trueCR: Record<string, number> = { easy: 52, hard: 60 };
    const windPerMph = 0.2; // true effect per mph above 5, per 18 holes
    const scores: SanctionedScore[] = [];
    const weatherByRound = new Map<string, Weather>();
    let e = 0;
    for (const l of layouts) {
      for (const wind of [3, 8, 12, 16, 20, 5, 10, 14]) {
        const eventId = `ev${e++}`;
        weatherByRound.set(`${eventId}|1`, { windMph: wind, gustMph: wind, tempF: 70, precipInPerHr: 0 });
        const ssa = trueCR[l.id] + windPerMph * Math.max(0, wind - 5);
        for (let r = 850; r <= 1030; r += 15) {
          scores.push({ eventId, eventDate: '2025-06-01', round: 1, layoutId: l.id, playerRating: r, score: ssa + (1000 - r) / 10 });
        }
      }
    }
    const out = rateLayouts({ layouts, scores, weatherByRound });
    const byId = Object.fromEntries(out.ratings.map((r) => [r.layoutId, r]));
    expect(byId.easy.courseRating).toBeCloseTo(52, 0);
    expect(byId.hard.courseRating).toBeCloseTo(60, 0);
    expect(out.coefficients.wind).toBeGreaterThan(PRIOR_COEFFICIENTS.wind);
    expect(out.coefficients.wind).toBeCloseTo(windPerMph, 1);
  });
});
