import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import type { ScrollViewInstance } from 'react-native';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { getGuides, getHoles, getPhotos, type GuidePhoto } from '../../db/repo.ts';
import { findLayout } from '../../data/tulsa.ts';
import type { HoleGuide } from '../../domain/guide.ts';
import type { Hole } from '../../domain/types.ts';
import { getThrowProfile, type ThrowProfile } from '../../lib/throwing.ts';
import { applyGuidePack, exportGuidePack, pickGuidePack } from '../../services/guideShare.ts';
import { HoleGuideView } from '../../ui/HoleGuideView.tsx';
import { ui } from '../../ui/theme.ts';

/**
 * Walk the course before you play it: one hole at a time, from the tee box's point of view.
 * Built for the player driving in Friday night for a tournament on a course they've never seen.
 */
export default function GuideScreen() {
  const { layoutId, hole: startHole } = useLocalSearchParams<{ layoutId: string; hole?: string }>();
  const db = useSQLiteContext();
  const found = findLayout(layoutId);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [guides, setGuides] = useState<Map<number, HoleGuide>>(new Map());
  const [photos, setPhotos] = useState<GuidePhoto[]>([]);
  const [profile, setProfile] = useState<ThrowProfile>({ hand: 'right', usual: 'backhand' });
  const [idx, setIdx] = useState(startHole ? Number(startHole) - 1 : 0);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ScrollViewInstance>(null);

  const reload = useCallback(() => {
    const l = findLayout(layoutId);
    if (!l) return;
    getHoles(db, l.layout).then(setHoles);
    getGuides(db, layoutId).then(setGuides);
    getPhotos(db, layoutId).then(setPhotos);
    getThrowProfile(db).then(setProfile);
  }, [db, layoutId]);
  useFocusEffect(reload);

  if (!found) return <Text style={ui.body}>Layout not found.</Text>;
  const hole = holes[idx];

  const go = (i: number) => {
    setIdx(i);
    scroller.current?.scrollTo({ y: 0, animated: false });
  };

  const share = async () => {
    setBusy(true);
    try {
      await exportGuidePack(db, layoutId);
    } catch (e) {
      Alert.alert('Could not share guide', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const importPack = async () => {
    try {
      const pack = await pickGuidePack();
      if (!pack) return;
      if (pack.layoutId !== layoutId) {
        const other = findLayout(pack.layoutId);
        Alert.alert(
          'Different course',
          `That guide is for ${other ? `${other.course.name} (${other.layout.name})` : pack.courseName}. Open that course to import it.`,
        );
        return;
      }
      const photoCount = pack.holes.reduce((s, h) => s + h.photos.length, 0);
      Alert.alert(
        'Import guide?',
        `${pack.holes.length} holes, ${photoCount} photos${pack.author ? ` from ${pack.author}` : ''}. ` +
          'This replaces your guide for those holes. Your personal yardage book notes are not touched.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: async () => {
              setBusy(true);
              try {
                await applyGuidePack(db, pack);
                reload();
              } catch (e) {
                Alert.alert('Import failed', (e as Error).message);
              } finally {
                setBusy(false);
              }
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert('Could not open guide', (e as Error).message);
    }
  };

  const covered = new Set([...guides.keys(), ...photos.map((p) => p.holeNumber)]).size;

  return (
    <ScrollView ref={scroller} style={ui.screen} contentContainerStyle={ui.pad}>
      <Stack.Screen options={{ title: `${found.course.name} guide` }} />
      <View style={ui.between}>
        <Text style={ui.muted}>
          {found.layout.name} · guide covers {covered}/{found.layout.holes.length} holes
        </Text>
      </View>
      <View style={ui.row}>
        <Pressable style={[ui.buttonGhost, { flex: 1 }]} onPress={share} disabled={busy}>
          <Text style={ui.buttonGhostText}>Share guide</Text>
        </Pressable>
        <Pressable style={[ui.buttonGhost, { flex: 1 }]} onPress={importPack} disabled={busy}>
          <Text style={ui.buttonGhostText}>Import guide</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {holes.map((h, i) => {
          const on = i === idx;
          const has = guides.has(h.number) || photos.some((p) => p.holeNumber === h.number);
          return (
            <Pressable key={h.number} onPress={() => go(i)} style={[ui.chip, on && ui.chipOn]}>
              <Text style={on ? ui.chipTextOn : ui.chipText}>
                {h.number}
                {has ? '' : ' ·'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {hole ? (
        <View style={ui.card}>
          <View style={ui.between}>
            <Text style={ui.h1}>Hole {hole.number}</Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/guide/edit/[layoutId]/[hole]',
                  params: { layoutId, hole: String(hole.number) },
                })
              }
            >
              <Text style={ui.buttonGhostText}>Edit</Text>
            </Pressable>
          </View>
          <HoleGuideView
            hole={hole}
            guide={guides.get(hole.number) ?? null}
            photos={photos.filter((p) => p.holeNumber === hole.number)}
            profile={profile}
          />
        </View>
      ) : null}

      <View style={ui.row}>
        <Pressable style={[ui.buttonGhost, { flex: 1 }]} disabled={idx === 0} onPress={() => go(idx - 1)}>
          <Text style={ui.buttonGhostText}>{idx > 0 ? `‹ Hole ${idx}` : '‹'}</Text>
        </Pressable>
        <Pressable style={[ui.button, { flex: 1 }]} disabled={idx >= holes.length - 1} onPress={() => go(idx + 1)}>
          <Text style={ui.buttonText}>{idx < holes.length - 1 ? `Hole ${idx + 2} ›` : 'Last hole'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
