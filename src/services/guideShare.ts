import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  addPhoto,
  getGuides,
  getHoles,
  getPhotos,
  getSetting,
  saveGuide,
  setHolePar,
  setHolePoint,
} from '../db/repo.ts';
import { findLayout } from '../data/tulsa.ts';
import { PACK_FORMAT, PACK_VERSION, parsePack, type GuidePack, type PackHole } from '../domain/guidePack.ts';
import { readPhotoBase64, writePhotoBase64 } from './photos.ts';

/** Bundle a layout's guides, tee/basket GPS and photos into one file and open the share sheet. */
export async function exportGuidePack(db: SQLiteDatabase, layoutId: string): Promise<void> {
  const found = findLayout(layoutId);
  if (!found) throw new Error('Unknown layout');
  const [holes, guides, photos, author] = await Promise.all([
    getHoles(db, found.layout),
    getGuides(db, layoutId),
    getPhotos(db, layoutId),
    getSetting(db, 'display_name'),
  ]);

  const packHoles: PackHole[] = [];
  for (const h of holes) {
    const guide = guides.get(h.number);
    const mine = photos.filter((p) => p.holeNumber === h.number);
    if (!guide && mine.length === 0 && !h.basket) continue;
    packHoles.push({
      number: h.number,
      par: h.par,
      tee: h.tee ?? null,
      basket: h.basket ?? null,
      guide: guide ?? { shape: 'straight', elevation: 'flat', shots: [], ob: [], mandos: [], notes: '' },
      photos: await Promise.all(
        mine.map(async (p) => ({
          kind: p.kind,
          caption: p.caption,
          at: p.at,
          heading: p.heading,
          jpegBase64: await readPhotoBase64(p.fileName),
        })),
      ),
    });
  }
  if (packHoles.length === 0) throw new Error('Nothing to share yet. Add a guide or photos to at least one hole.');

  const pack: GuidePack = {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    layoutId,
    courseName: found.course.name,
    layoutName: found.layout.name,
    author: author ?? '',
    exportedAt: new Date().toISOString(),
    holes: packHoles,
  };
  const slug = layoutId.replace(/[^a-z0-9]+/gi, '-');
  const file = new File(Paths.cache, `${slug}.discbook.json`);
  if (file.exists) file.delete();
  file.create();
  await file.write(JSON.stringify(pack));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: `${found.course.name} guide` });
}

/** Let the player pick a guide file. Returns the parsed pack without saving anything yet. */
export async function pickGuidePack(): Promise<GuidePack | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  return parsePack(await new File(res.assets[0].uri).text());
}

/**
 * Save an imported pack. The pack's guide and photos replace the local ones for each hole
 * it covers. Tee/basket GPS and par are only filled in where the player has none, since
 * their own survey of the course is at least as good.
 */
export async function applyGuidePack(db: SQLiteDatabase, pack: GuidePack): Promise<number> {
  const found = findLayout(pack.layoutId);
  if (!found) throw new Error(`This guide is for a course DiscBook doesn't have yet (${pack.courseName}).`);
  const holes = await getHoles(db, found.layout);
  const existing = await getPhotos(db, pack.layoutId);

  // Write photo files before touching the DB so a failure leaves the DB unchanged.
  const written: { hole: number; photo: PackHole['photos'][number]; fileName: string }[] = [];
  for (const h of pack.holes) {
    for (const p of h.photos) written.push({ hole: h.number, photo: p, fileName: await writePhotoBase64(p.jpegBase64) });
  }

  await db.withTransactionAsync(async () => {
    for (const h of pack.holes) {
      const local = holes.find((x) => x.number === h.number);
      if (!local) continue;
      await saveGuide(db, pack.layoutId, h.number, h.guide);
      if (!local.tee && h.tee) await setHolePoint(db, pack.layoutId, h.number, 'tee', h.tee);
      if (!local.basket && h.basket) await setHolePoint(db, pack.layoutId, h.number, 'basket', h.basket);
      if (local.par !== h.par && !local.basket) await setHolePar(db, pack.layoutId, h.number, h.par);
      if (h.photos.length) {
        for (const old of existing.filter((p) => p.holeNumber === h.number)) {
          await db.runAsync('DELETE FROM guide_photos WHERE id = ?', old.id);
        }
      }
    }
    for (const w of written) {
      await addPhoto(db, {
        layoutId: pack.layoutId,
        holeNumber: w.hole,
        kind: w.photo.kind,
        fileName: w.fileName,
        caption: w.photo.caption,
        at: w.photo.at,
        heading: w.photo.heading,
      });
    }
  });
  return pack.holes.length;
}
