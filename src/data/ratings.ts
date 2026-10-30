import generated from './generated/ratings.json';
import { provisionalRating } from '../domain/courseRating.ts';
import type { Layout, LayoutRating } from '../domain/types.ts';
import { PRIOR_COEFFICIENTS, type WeatherCoefficients } from '../domain/weather.ts';

// Output of scripts/rate-courses.ts, bundled into the app.
type Generated = {
  generatedAt: string | null;
  coefficients: WeatherCoefficients | null;
  ratings: LayoutRating[];
};

const data = generated as Generated;
const byLayout = new Map(data.ratings.map((r) => [r.layoutId, r]));

export const weatherCoefficients: WeatherCoefficients = data.coefficients ?? PRIOR_COEFFICIENTS;
export const weatherModelIsFitted = data.coefficients !== null;

export function ratingFor(layout: Layout): LayoutRating {
  return byLayout.get(layout.id) ?? provisionalRating(layout);
}
