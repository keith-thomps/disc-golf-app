import { mean, ridgeTowardPrior } from './linalg.ts';
import type { Weather, WindExposure } from './types.ts';

/**
 * Weather model: how many strokes (per 18 holes) the conditions add for a scratch player,
 * relative to ideal conditions (calm, dry, 55-90°F).
 *
 * strokes = sum_i coef_i * feature_i(weather, exposure)
 *
 * Coefficients start from the PRIOR below and are re-estimated from sanctioned rounds
 * by scripts/rate-courses.ts (see fitWeatherCoefficients).
 */

export const FEATURES = ['wind', 'gust', 'cold', 'heat', 'rain', 'rainRate'] as const;
export type FeatureName = (typeof FEATURES)[number];
export type WeatherCoefficients = Record<FeatureName, number>;

/** Starting guesses, in strokes per 18 holes per unit of each feature. Replaced by the fitted model. */
export const PRIOR_COEFFICIENTS: WeatherCoefficients = {
  wind: 0.15, // per mph of sustained wind above 5 mph
  gust: 0.05, // per mph that gusts exceed sustained wind by more than 5 mph
  cold: 0.05, // per °F below 55
  heat: 0.04, // per °F above 90
  rain: 1.0, // flat cost of wet conditions (grip, footing)
  rainRate: 4.0, // per inch/hour of precipitation
};

/** Wind matters more when there are no trees to block it. */
export const WIND_EXPOSURE_FACTOR: Record<WindExposure, number> = {
  wooded: 0.6,
  mixed: 1.0,
  open: 1.4,
};

export function weatherFeatures(w: Weather, exposure: WindExposure): Record<FeatureName, number> {
  const k = WIND_EXPOSURE_FACTOR[exposure];
  return {
    wind: Math.max(0, w.windMph - 5) * k,
    gust: Math.max(0, w.gustMph - w.windMph - 5) * k,
    cold: Math.max(0, 55 - w.tempF),
    heat: Math.max(0, w.tempF - 90),
    rain: w.precipInPerHr >= 0.01 ? 1 : 0,
    rainRate: w.precipInPerHr,
  };
}

export function featureVector(w: Weather, exposure: WindExposure): number[] {
  const f = weatherFeatures(w, exposure);
  return FEATURES.map((name) => f[name]);
}

/** Expected extra strokes from weather for a round of `holes` holes. */
export function weatherStrokes(
  w: Weather,
  exposure: WindExposure,
  holes: number,
  coef: WeatherCoefficients = PRIOR_COEFFICIENTS,
): number {
  const f = weatherFeatures(w, exposure);
  const per18 = FEATURES.reduce((s, name) => s + coef[name] * f[name], 0);
  return per18 * (holes / 18);
}

export type WeatherBucket = { strokes: number; label: string; description: string };

export const WEATHER_BUCKETS: WeatherBucket[] = [
  { strokes: 0, label: 'Ideal', description: 'Calm, dry, comfortable' },
  { strokes: 1, label: 'Mild', description: 'Light breeze or a bit cool' },
  { strokes: 2, label: 'Challenging', description: 'Steady wind or light rain' },
  { strokes: 3, label: 'Tough', description: 'Strong wind, cold, or wet' },
  { strokes: 4, label: 'Severe', description: 'Gusty and wet, or bitter cold' },
  { strokes: 5, label: 'Extreme', description: 'Barely playable' },
];

/**
 * Snap a continuous weather-strokes estimate into a bucket. Handicap differentials use
 * the bucket, not the raw estimate, so a round's adjustment is stable and easy to explain:
 * "-3 in Ideal is the same performance as +2 in Extreme."
 */
export function weatherBucket(strokes: number): WeatherBucket {
  const i = Math.min(WEATHER_BUCKETS.length - 1, Math.max(0, Math.round(strokes)));
  return WEATHER_BUCKETS[i];
}

export type WeatherObservation = {
  layoutId: string;
  /** Scratch scoring average for the round, scaled to 18 holes. */
  ssa18: number;
  weather: Weather;
  exposure: WindExposure;
};

/**
 * Estimate weather coefficients from many rated rounds across many layouts.
 *
 * Each layout has its own difficulty, so we use a fixed-effects (within) estimator:
 * subtract each layout's mean SSA and mean features, then regress what is left.
 * That isolates "same course, worse weather -> higher SSA" from "harder course".
 * Ridge shrinkage toward the prior keeps estimates sane while data is thin.
 */
export function fitWeatherCoefficients(
  obs: WeatherObservation[],
  lambda = 20,
): WeatherCoefficients {
  const byLayout = new Map<string, WeatherObservation[]>();
  for (const o of obs) {
    const list = byLayout.get(o.layoutId) ?? [];
    list.push(o);
    byLayout.set(o.layoutId, list);
  }
  const X: number[][] = [];
  const y: number[] = [];
  for (const list of byLayout.values()) {
    if (list.length < 2) continue; // a single round has no within-layout variation
    const feats = list.map((o) => featureVector(o.weather, o.exposure));
    const meanFeat = FEATURES.map((_, j) => mean(feats.map((f) => f[j])));
    const meanY = mean(list.map((o) => o.ssa18));
    list.forEach((o, i) => {
      X.push(feats[i].map((v, j) => v - meanFeat[j]));
      y.push(o.ssa18 - meanY);
    });
  }
  const prior = FEATURES.map((n) => PRIOR_COEFFICIENTS[n]);
  if (X.length === 0) return { ...PRIOR_COEFFICIENTS };
  const beta = ridgeTowardPrior(X, y, prior, lambda);
  // Bad weather never makes the course easier; clamp sign-flipped noise to zero.
  return Object.fromEntries(FEATURES.map((n, j) => [n, Math.max(0, beta[j])])) as WeatherCoefficients;
}
