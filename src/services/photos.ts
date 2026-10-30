import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import type { LatLng } from '../domain/types.ts';

// Guide photos live in <documents>/guide-photos. The DB stores only the file name.

function photoDir(): Directory {
  const dir = new Directory(Paths.document, 'guide-photos');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

const newName = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

export function photoUri(fileName: string): string {
  return new File(photoDir(), fileName).uri;
}

export async function readPhotoBase64(fileName: string): Promise<string> {
  return new File(photoDir(), fileName).base64();
}

export async function writePhotoBase64(base64: string): Promise<string> {
  const name = newName();
  const file = new File(photoDir(), name);
  file.create();
  await file.write(base64, { encoding: 'base64' });
  return name;
}

export function deletePhotoFile(fileName: string): void {
  const f = new File(photoDir(), fileName);
  if (f.exists) f.delete();
}

export type Captured = { fileName: string; at: LatLng | null; heading: number | null };

/**
 * Take (or pick) a photo and record where it was taken and which way the phone faced.
 * The position and compass heading let readers check that a "tee view" really looks
 * down the fairway, and let us order fairway photos by distance from the tee.
 */
export async function capturePhoto(source: 'camera' | 'library'): Promise<Captured | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission denied.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled || !result.assets?.length) return null;

  // Read heading right away, while the phone still points the way the photo was taken.
  let heading: number | null = null;
  let at: LatLng | null = null;
  if (source === 'camera') {
    try {
      const h = await Location.getHeadingAsync();
      heading = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
    } catch {
      heading = null; // no compass (web, some tablets)
    }
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      at = null;
    }
  }

  const name = newName();
  await new File(result.assets[0].uri).copy(new File(photoDir(), name));
  return { fileName: name, at, heading };
}
