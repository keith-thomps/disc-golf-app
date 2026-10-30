import * as Location from 'expo-location';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  addPhoto,
  deletePhotoRow,
  getGuide,
  getHoles,
  getPhotos,
  saveGuide,
  updatePhotoCaption,
  type GuidePhoto,
} from '../../../../db/repo.ts';
import { findLayout } from '../../../../data/tulsa.ts';
import {
  EMPTY_GUIDE,
  type Curve,
  type DiscClass,
  type Elevation,
  type Height,
  type HoleGuide,
  type HoleShape,
  type Mando,
  type ObZone,
  type Shot,
  type Side,
} from '../../../../domain/guide.ts';
import type { PhotoKind } from '../../../../domain/guidePack.ts';
import type { Hole, LatLng } from '../../../../domain/types.ts';
import { getThrowProfile, type ThrowProfile } from '../../../../lib/throwing.ts';
import { capturePhoto, deletePhotoFile, photoUri } from '../../../../services/photos.ts';
import { ChipRow, MultiChipRow } from '../../../../ui/Chips.tsx';
import { HoleGuideView } from '../../../../ui/HoleGuideView.tsx';
import { colors, ui } from '../../../../ui/theme.ts';

const SHAPES = [['straight', 'Straight'], ['dogleg-left', 'Dogleg left'], ['dogleg-right', 'Dogleg right']] as const;
const ELEVATIONS = [['flat', 'Flat'], ['uphill', 'Uphill'], ['downhill', 'Downhill']] as const;
const CURVES = [['left', 'Finishes left'], ['straight', 'Straight'], ['right', 'Finishes right'], ['roller', 'Roller']] as const;
const HEIGHTS = [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']] as const;
const DISCS = [['putter', 'Putter'], ['midrange', 'Mid'], ['fairway', 'Fairway'], ['distance', 'Driver']] as const;
const SIDES = [['left', 'Left'], ['right', 'Right'], ['short', 'Short'], ['long', 'Long']] as const;
const PENALTIES = [['ob', 'OB'], ['hazard', 'Hazard']] as const;
const RELIEFS = [['last-in', 'Last in bounds'], ['drop-zone', 'Drop zone'], ['re-tee', 'Re-tee']] as const;
const MANDO_RELIEFS = [['drop-zone', 'Drop zone'], ['re-tee', 'Re-tee']] as const;
const PASS = [['left', 'Pass left of it'], ['right', 'Pass right of it']] as const;
const FEATURES = ['water', 'the creek', 'the road', 'the parking lot', 'the fence', 'the path', 'the rope line', 'private property'];

const PHOTO_PROMPTS: Record<PhotoKind, string> = {
  tee: 'Stand on the tee pad and face the basket',
  fairway: 'Stand at the landing zone, face the basket',
  green: 'Stand where approaches land, face the basket',
};

async function hereNow(): Promise<LatLng> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('Location permission denied');
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
  return { lat: loc.coords.latitude, lng: loc.coords.longitude };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={ui.card}>
      <Text style={ui.h2}>{title}</Text>
      {hint ? <Text style={ui.muted}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function RemoveLink({ onPress, label = 'Remove' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} style={{ alignSelf: 'flex-end' }}>
      <Text style={{ color: colors.danger, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export default function GuideEditScreen() {
  const { layoutId, hole: holeParam } = useLocalSearchParams<{ layoutId: string; hole: string }>();
  const holeNumber = Number(holeParam);
  const db = useSQLiteContext();
  const found = findLayout(layoutId);
  const [hole, setHole] = useState<Hole | null>(null);
  const [guide, setGuide] = useState<HoleGuide>(EMPTY_GUIDE);
  const [photos, setPhotos] = useState<GuidePhoto[]>([]);
  const [profile, setProfile] = useState<ThrowProfile>({ hand: 'right', usual: 'backhand' });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const l = findLayout(layoutId);
    if (!l) return;
    getHoles(db, l.layout).then((hs) => setHole(hs.find((h) => h.number === holeNumber) ?? null));
    getGuide(db, layoutId, holeNumber).then((g) => g && setGuide(g));
    getPhotos(db, layoutId, holeNumber).then(setPhotos);
    getThrowProfile(db).then(setProfile);
  }, [db, layoutId, holeNumber]);

  if (!found || !hole) return <Text style={[ui.body, ui.pad]}>Loading…</Text>;

  const edit = (patch: Partial<HoleGuide>) => {
    setGuide({ ...guide, ...patch });
    setDirty(true);
  };
  const editShot = (i: number, patch: Partial<Shot>) =>
    edit({ shots: guide.shots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const editOb = (i: number, patch: Partial<ObZone>) =>
    edit({ ob: guide.ob.map((z, j) => (j === i ? { ...z, ...patch } : z)) });
  const editMando = (i: number, patch: Partial<Mando>) =>
    edit({ mandos: guide.mandos.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  const save = async () => {
    await saveGuide(db, layoutId, holeNumber, guide);
    setDirty(false);
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/guide/[layoutId]', params: { layoutId, hole: String(holeNumber) } });
  };

  const addPhotoOf = async (kind: PhotoKind, source: 'camera' | 'library') => {
    try {
      const shot = await capturePhoto(source);
      if (!shot) return;
      await addPhoto(db, { layoutId, holeNumber, kind, caption: '', ...shot });
      setPhotos(await getPhotos(db, layoutId, holeNumber));
    } catch (e) {
      Alert.alert('Photo failed', (e as Error).message);
    }
  };

  const removePhoto = (p: GuidePhoto) =>
    Alert.alert('Delete photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePhotoRow(db, p.id);
          deletePhotoFile(p.fileName);
          setPhotos(photos.filter((x) => x.id !== p.id));
        },
      },
    ]);

  const pinShot = async (i: number) => {
    try {
      editShot(i, { pin: await hereNow() });
    } catch (e) {
      Alert.alert('Could not get location', (e as Error).message);
    }
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Edit hole ${holeNumber} guide` }} />
      <Text style={ui.muted}>
        {found.course.name} · {found.layout.name} · Par {hole.par}
      </Text>

      <Section
        title="Player's-eye photos"
        hint="Take them standing where a player would be, facing the basket. Location and compass direction are saved with each photo."
      >
        {(['tee', 'fairway', 'green'] as const).map((kind) => (
          <View key={kind} style={{ gap: 6 }}>
            <Text style={[ui.body, { fontWeight: '600' }]}>
              {kind === 'tee' ? 'Tee view' : kind === 'fairway' ? 'Fairway / landing zone view' : 'Green view'}
            </Text>
            <Text style={ui.muted}>{PHOTO_PROMPTS[kind]}</Text>
            {photos
              .filter((p) => p.kind === kind)
              .map((p) => (
                <View key={p.id} style={{ gap: 4 }}>
                  <Image source={{ uri: photoUri(p.fileName) }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 8 }} />
                  <TextInput
                    style={ui.input}
                    placeholder="Caption, e.g. Gap is between the two leaning oaks"
                    defaultValue={p.caption}
                    onEndEditing={(e) => updatePhotoCaption(db, p.id, e.nativeEvent.text)}
                  />
                  <RemoveLink label="Delete photo" onPress={() => removePhoto(p)} />
                </View>
              ))}
            <View style={ui.row}>
              {Platform.OS !== 'web' ? (
                <Pressable style={[ui.buttonGhost, { flex: 1 }]} onPress={() => addPhotoOf(kind, 'camera')}>
                  <Text style={ui.buttonGhostText}>Take photo</Text>
                </Pressable>
              ) : null}
              <Pressable style={[ui.buttonGhost, { flex: 1 }]} onPress={() => addPhotoOf(kind, 'library')}>
                <Text style={ui.buttonGhostText}>From library</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </Section>

      <Section title="The hole">
        <ChipRow options={SHAPES} value={guide.shape} onChange={(shape: HoleShape) => edit({ shape })} />
        <ChipRow options={ELEVATIONS} value={guide.elevation} onChange={(elevation: Elevation) => edit({ elevation })} />
        {guide.elevation !== 'flat' ? (
          <TextInput
            style={ui.input}
            keyboardType="number-pad"
            placeholder="Elevation change in feet (optional)"
            value={guide.elevationFt ? String(guide.elevationFt) : ''}
            onChangeText={(t) => edit({ elevationFt: Number(t) || undefined })}
          />
        ) : null}
      </Section>

      <Section
        title="How to play it"
        hint="Describe each shot by where the disc should finish, as seen from the tee. Readers get it translated for their own hand and throw."
      >
        {guide.shots.map((s, i) => (
          <View key={i} style={{ gap: 6, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, paddingTop: i ? 10 : 0 }}>
            <Text style={[ui.body, { fontWeight: '700' }]}>{i === 0 ? 'Tee shot' : `Shot ${i + 1}`}</Text>
            <ChipRow options={CURVES} value={s.curve} onChange={(curve: Curve) => editShot(i, { curve })} />
            <ChipRow options={HEIGHTS} value={s.height} onChange={(height: Height) => editShot(i, { height })} />
            <ChipRow options={DISCS} value={s.disc} onChange={(disc: DiscClass) => editShot(i, { disc })} />
            <TextInput
              style={ui.input}
              placeholder="Where to land, e.g. the flat spot left of the big oak"
              value={s.target}
              onChangeText={(target) => editShot(i, { target })}
            />
            <View style={ui.row}>
              <Pressable style={[ui.buttonGhost, { flex: 1 }]} onPress={() => pinShot(i)}>
                <Text style={ui.buttonGhostText}>{s.pin ? 'Re-pin landing zone' : 'Pin landing zone here'}</Text>
              </Pressable>
              {!s.pin ? (
                <TextInput
                  style={[ui.input, { flex: 1 }]}
                  keyboardType="number-pad"
                  placeholder="or distance ft"
                  value={s.distanceFt ? String(s.distanceFt) : ''}
                  onChangeText={(t) => editShot(i, { distanceFt: Number(t) || undefined })}
                />
              ) : (
                <Pressable style={[ui.buttonGhost, { flex: 1 }]} onPress={() => editShot(i, { pin: undefined })}>
                  <Text style={ui.buttonGhostText}>Remove pin</Text>
                </Pressable>
              )}
            </View>
            <RemoveLink onPress={() => edit({ shots: guide.shots.filter((_, j) => j !== i) })} />
          </View>
        ))}
        <Pressable
          style={ui.buttonGhost}
          onPress={() => edit({ shots: [...guide.shots, { curve: 'straight', height: 'normal', target: '' }] })}
        >
          <Text style={ui.buttonGhostText}>+ Add {guide.shots.length ? 'next shot' : 'tee shot'}</Text>
        </Pressable>
      </Section>

      <Section title="Out of bounds" hint="Sides are from the tee looking at the basket.">
        {guide.ob.map((z, i) => (
          <View key={i} style={{ gap: 6, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, paddingTop: i ? 10 : 0 }}>
            <ChipRow
              options={FEATURES.map((f) => [f, f] as const)}
              value={FEATURES.includes(z.feature) ? z.feature : undefined}
              onChange={(feature: string) => editOb(i, { feature })}
            />
            <TextInput
              style={ui.input}
              placeholder="or describe it: the mulch line, the tennis courts…"
              value={z.feature}
              onChangeText={(feature) => editOb(i, { feature })}
            />
            <MultiChipRow options={SIDES} values={z.sides} onChange={(sides: Side[]) => editOb(i, { sides })} />
            <ChipRow options={PENALTIES} value={z.penalty} onChange={(penalty) => editOb(i, { penalty })} />
            {z.penalty === 'ob' ? (
              <ChipRow options={RELIEFS} value={z.relief} onChange={(relief) => editOb(i, { relief })} />
            ) : null}
            {z.penalty === 'ob' && z.relief === 'drop-zone' ? (
              <TextInput
                style={ui.input}
                placeholder="Where is the drop zone? e.g. by the bridge"
                value={z.dropZone ?? ''}
                onChangeText={(dropZone) => editOb(i, { dropZone })}
              />
            ) : null}
            <RemoveLink onPress={() => edit({ ob: guide.ob.filter((_, j) => j !== i) })} />
          </View>
        ))}
        <Pressable
          style={ui.buttonGhost}
          onPress={() => edit({ ob: [...guide.ob, { feature: 'water', sides: [], penalty: 'ob', relief: 'last-in' }] })}
        >
          <Text style={ui.buttonGhostText}>+ Add OB area</Text>
        </Pressable>
      </Section>

      <Section title="Mandatories">
        {guide.mandos.map((m, i) => (
          <View key={i} style={{ gap: 6 }}>
            <TextInput
              style={ui.input}
              placeholder="What object? e.g. the tall pine"
              value={m.object}
              onChangeText={(object) => editMando(i, { object })}
            />
            <ChipRow options={PASS} value={m.passSide} onChange={(passSide) => editMando(i, { passSide })} />
            <ChipRow options={MANDO_RELIEFS} value={m.relief} onChange={(relief) => editMando(i, { relief })} />
            {m.relief === 'drop-zone' ? (
              <TextInput
                style={ui.input}
                placeholder="Where is the drop zone?"
                value={m.dropZone ?? ''}
                onChangeText={(dropZone) => editMando(i, { dropZone })}
              />
            ) : null}
            <RemoveLink onPress={() => edit({ mandos: guide.mandos.filter((_, j) => j !== i) })} />
          </View>
        ))}
        <Pressable
          style={ui.buttonGhost}
          onPress={() => edit({ mandos: [...guide.mandos, { object: '', passSide: 'right', relief: 'drop-zone' }] })}
        >
          <Text style={ui.buttonGhostText}>+ Add mando</Text>
        </Pressable>
      </Section>

      <Section title="Anything else">
        <TextInput
          style={[ui.input, { minHeight: 80, textAlignVertical: 'top' }]}
          multiline
          placeholder="e.g. Basket sits on a slope; missed putts roll 30 ft into the rough."
          value={guide.notes}
          onChangeText={(notes) => edit({ notes })}
        />
      </Section>

      <Section title="Preview" hint="What a first-time player will read.">
        <HoleGuideView hole={hole} guide={guide} photos={[]} profile={profile} />
      </Section>

      <Pressable style={ui.button} onPress={save}>
        <Text style={ui.buttonText}>{dirty ? 'Save guide' : 'Done'}</Text>
      </Pressable>
    </ScrollView>
  );
}
