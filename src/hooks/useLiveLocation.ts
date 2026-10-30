import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import type { LatLng } from '../domain/types.ts';

export type Fix = { coord: LatLng; accuracyM: number | null; at: number };

/**
 * Streams high-accuracy GPS while the round screen is open.
 * distanceInterval 1m keeps the "feet to target" readout updating as you walk.
 */
export function useLiveLocation(enabled = true) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setError('Location permission denied. Distances need GPS.');
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 1, timeInterval: 1000 },
        (loc) => {
          if (cancelled) return;
          setFix({
            coord: { lat: loc.coords.latitude, lng: loc.coords.longitude },
            accuracyM: loc.coords.accuracy,
            at: loc.timestamp,
          });
        },
        (reason) => setError(reason),
      );
      if (cancelled) sub.remove();
    })().catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);

  return { fix, error };
}
