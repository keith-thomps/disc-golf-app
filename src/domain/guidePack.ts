import { EMPTY_GUIDE, type HoleGuide } from './guide.ts';
import type { LatLng } from './types.ts';

/**
 * A guide pack is one self-contained JSON file holding a layout's hole guides and
 * photos (base64 JPEG). It is what a local shares with players traveling in for a
 * tournament: AirDrop it, text it, or post it in the event's group chat.
 */

export const PACK_FORMAT = 'discbook-guide';
export const PACK_VERSION = 1;

export type PhotoKind = 'tee' | 'fairway' | 'green';

export type PackPhoto = {
  kind: PhotoKind;
  caption: string;
  at: LatLng | null;
  heading: number | null;
  jpegBase64: string;
};

export type PackHole = {
  number: number;
  par: number;
  tee: LatLng | null;
  basket: LatLng | null;
  guide: HoleGuide;
  photos: PackPhoto[];
};

export type GuidePack = {
  format: typeof PACK_FORMAT;
  version: number;
  layoutId: string;
  courseName: string;
  layoutName: string;
  author: string;
  exportedAt: string;
  holes: PackHole[];
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isLatLng = (v: unknown): v is LatLng =>
  isObj(v) && typeof v.lat === 'number' && typeof v.lng === 'number';

/** Validate an untrusted file. Throws a readable error instead of importing junk. */
export function parsePack(text: string): GuidePack {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a DiscBook guide (not valid JSON).');
  }
  if (!isObj(data) || data.format !== PACK_FORMAT) throw new Error('This file is not a DiscBook guide.');
  if (typeof data.version !== 'number' || data.version > PACK_VERSION) {
    throw new Error('This guide was made with a newer version of DiscBook. Update the app to open it.');
  }
  if (typeof data.layoutId !== 'string' || !Array.isArray(data.holes)) throw new Error('Guide file is damaged.');

  const holes: PackHole[] = data.holes.filter(isObj).map((h) => {
    if (typeof h.number !== 'number') throw new Error('Guide file is damaged (hole number).');
    const g = isObj(h.guide) ? h.guide : {};
    return {
      number: h.number,
      par: typeof h.par === 'number' ? h.par : 3,
      tee: isLatLng(h.tee) ? h.tee : null,
      basket: isLatLng(h.basket) ? h.basket : null,
      guide: {
        ...EMPTY_GUIDE,
        ...g,
        shots: Array.isArray(g.shots) ? g.shots : [],
        ob: Array.isArray(g.ob) ? g.ob : [],
        mandos: Array.isArray(g.mandos) ? g.mandos : [],
        notes: typeof g.notes === 'string' ? g.notes : '',
      } as HoleGuide,
      photos: (Array.isArray(h.photos) ? h.photos : [])
        .filter(isObj)
        .filter((p) => typeof p.jpegBase64 === 'string' && ['tee', 'fairway', 'green'].includes(p.kind as string))
        .map((p) => ({
          kind: p.kind as PhotoKind,
          caption: typeof p.caption === 'string' ? p.caption : '',
          at: isLatLng(p.at) ? p.at : null,
          heading: typeof p.heading === 'number' ? p.heading : null,
          jpegBase64: p.jpegBase64 as string,
        })),
    };
  });

  return {
    format: PACK_FORMAT,
    version: data.version,
    layoutId: data.layoutId,
    courseName: String(data.courseName ?? ''),
    layoutName: String(data.layoutName ?? ''),
    author: String(data.author ?? ''),
    exportedAt: String(data.exportedAt ?? ''),
    holes,
  };
}
