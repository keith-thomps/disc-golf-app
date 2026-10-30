import type { SQLiteDatabase } from 'expo-sqlite';
import { getDifferentials, getSetting } from '../db/repo.ts';
import { handicapIndex, indexFromPdgaRating } from '../domain/handicap.ts';

export type PlayerIndex = {
  index: number | null;
  source: 'rounds' | 'pdga' | 'none';
  roundsCounted: number;
  pdgaRating: number | null;
};

/**
 * The player's current Handicap Index. Uses their own rounds once there are 3,
 * otherwise falls back to an estimate from their PDGA rating.
 */
export async function getPlayerIndex(db: SQLiteDatabase): Promise<PlayerIndex> {
  const diffs = await getDifferentials(db);
  const ratingStr = await getSetting(db, 'pdga_rating');
  const pdgaRating = ratingStr ? Number(ratingStr) : null;
  const fromRounds = handicapIndex(diffs);
  if (fromRounds !== null) {
    return { index: fromRounds, source: 'rounds', roundsCounted: diffs.length, pdgaRating };
  }
  if (pdgaRating) {
    return { index: indexFromPdgaRating(pdgaRating), source: 'pdga', roundsCounted: diffs.length, pdgaRating };
  }
  return { index: null, source: 'none', roundsCounted: diffs.length, pdgaRating };
}
