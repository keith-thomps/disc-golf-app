import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting, setSetting } from '../db/repo.ts';
import type { Hand, ThrowStyle } from '../domain/guide.ts';

export type ThrowProfile = { hand: Hand; usual: ThrowStyle };

/** How the player throws, so guide lines read as "backhand hyzer" for them specifically. */
export async function getThrowProfile(db: SQLiteDatabase): Promise<ThrowProfile> {
  const [hand, usual] = await Promise.all([getSetting(db, 'hand'), getSetting(db, 'usual_throw')]);
  return {
    hand: hand === 'left' ? 'left' : 'right',
    usual: usual === 'forehand' ? 'forehand' : 'backhand',
  };
}

export async function setThrowProfile(db: SQLiteDatabase, p: ThrowProfile): Promise<void> {
  await setSetting(db, 'hand', p.hand);
  await setSetting(db, 'usual_throw', p.usual);
}
