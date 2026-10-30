import type { LatLng, Weather } from '../domain/types.ts';

// Open-Meteo is free and keyless. The forecast API gives current conditions for a live
// round; the archive API (used by scripts/rate-courses.ts) gives history for PDGA events.

const UNITS = 'wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch';
const VARS = 'temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m';

export async function fetchCurrentWeather(at: LatLng): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${at.lat}&longitude=${at.lng}` +
    `&current=${VARS}&${UNITS}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  const json = await res.json();
  const c = json.current;
  return {
    windMph: c.wind_speed_10m,
    gustMph: c.wind_gusts_10m,
    tempF: c.temperature_2m,
    precipInPerHr: c.precipitation,
  };
}

/**
 * Average hourly conditions over a playing window on a past date.
 * Returns null if the archive has no data for that date.
 */
export async function fetchHistoricalWeather(
  at: LatLng,
  date: string,
  fromHour = 9,
  toHour = 16,
): Promise<Weather | null> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${at.lat}&longitude=${at.lng}` +
    `&start_date=${date}&end_date=${date}&hourly=${VARS}&${UNITS}&timezone=America%2FChicago`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather archive request failed (${res.status}): ${await res.text()}`);
  const h = (await res.json()).hourly;
  if (!h?.time?.length) return null;
  const idx = h.time
    .map((t: string, i: number) => [Number(t.slice(11, 13)), i] as const)
    .filter(([hour]: readonly [number, number]) => hour >= fromHour && hour <= toHour)
    .map(([, i]: readonly [number, number]) => i);
  const avg = (arr: (number | null)[]) => {
    const vals = idx.map((i: number) => arr[i]).filter((v: number | null): v is number => v !== null);
    return vals.length ? vals.reduce((s: number, v: number) => s + v, 0) / vals.length : 0;
  };
  return {
    windMph: avg(h.wind_speed_10m),
    gustMph: avg(h.wind_gusts_10m),
    tempF: avg(h.temperature_2m),
    precipInPerHr: avg(h.precipitation),
  };
}
