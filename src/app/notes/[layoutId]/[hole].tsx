import * as Location from 'expo-location';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  NOTE_CATEGORIES,
  deleteNote,
  getNotes,
  saveNote,
  type HoleNote,
  type NoteCategory,
} from '../../../db/repo.ts';
import { findLayout } from '../../../data/tulsa.ts';
import type { LatLng } from '../../../domain/types.ts';
import { ui } from '../../../ui/theme.ts';

type Draft = { id?: number; category: NoteCategory; body: string; pin: LatLng | null };
const EMPTY: Draft = { category: 'Landing zone', body: '', pin: null };

const PLACEHOLDERS: Record<NoteCategory, string> = {
  'Landing zone': 'e.g. Aim left of the big oak, flat spot ~280 ft. Pin it while standing there.',
  'Disc & line': 'e.g. Buzz flat, hyzer flip. Into headwind: Destroyer low.',
  'Green / circle': 'e.g. Basket on a ridge. Long putts roll away downhill on the left.',
  'Hazard / OB': 'e.g. Creek OB right, plays as a hazard after rain.',
  Wind: 'e.g. Tunnels wind from the south; feels calmer than it is.',
  General: '',
};

export default function HoleNotesScreen() {
  const { layoutId, hole } = useLocalSearchParams<{ layoutId: string; hole: string }>();
  const holeNumber = Number(hole);
  const db = useSQLiteContext();
  const found = findLayout(layoutId);
  const [notes, setNotes] = useState<HoleNote[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pinning, setPinning] = useState(false);

  const reload = useCallback(() => {
    getNotes(db, layoutId, holeNumber).then(setNotes);
  }, [db, layoutId, holeNumber]);
  useFocusEffect(reload);

  const pinHere = async () => {
    setPinning(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') throw new Error('Location permission denied');
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      setDraft({ ...draft, pin: { lat: loc.coords.latitude, lng: loc.coords.longitude } });
    } catch (e) {
      Alert.alert('Could not get location', String(e));
    } finally {
      setPinning(false);
    }
  };

  const save = async () => {
    if (!draft.body.trim()) return;
    await saveNote(db, { ...draft, body: draft.body.trim(), layoutId, holeNumber });
    setDraft(EMPTY);
    reload();
  };

  const remove = (n: HoleNote) =>
    Alert.alert('Delete note?', n.body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteNote(db, n.id); reload(); } },
    ]);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Hole ${holeNumber} notes` }} />
      {found ? (
        <Text style={ui.muted}>
          {found.course.name} · {found.layout.name}
        </Text>
      ) : null}

      <View style={ui.card}>
        <Text style={ui.h2}>{draft.id ? 'Edit note' : 'New note'}</Text>
        <View style={[ui.row, { flexWrap: 'wrap' }]}>
          {NOTE_CATEGORIES.map((c) => (
            <Pressable key={c} onPress={() => setDraft({ ...draft, category: c })} style={[ui.chip, draft.category === c && ui.chipOn]}>
              <Text style={draft.category === c ? ui.chipTextOn : ui.chipText}>{c}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={[ui.input, { minHeight: 90, textAlignVertical: 'top' }]}
          multiline
          placeholder={PLACEHOLDERS[draft.category]}
          value={draft.body}
          onChangeText={(body) => setDraft({ ...draft, body })}
        />
        <View style={ui.row}>
          <Pressable style={[ui.buttonGhost, { flex: 1 }]} onPress={pinHere} disabled={pinning}>
            <Text style={ui.buttonGhostText}>
              {pinning ? 'Locating…' : draft.pin ? 'Re-pin to my spot' : 'Pin my spot'}
            </Text>
          </Pressable>
          {draft.pin ? (
            <Pressable style={[ui.buttonGhost, { flex: 1 }]} onPress={() => setDraft({ ...draft, pin: null })}>
              <Text style={ui.buttonGhostText}>Remove pin</Text>
            </Pressable>
          ) : null}
        </View>
        {draft.pin ? <Text style={ui.muted}>Pinned. Distance to this spot shows on the round screen.</Text> : null}
        <View style={ui.row}>
          <Pressable style={[ui.button, { flex: 1 }]} onPress={save}>
            <Text style={ui.buttonText}>Save note</Text>
          </Pressable>
          {draft.id ? (
            <Pressable style={[ui.buttonGhost, { flex: 1 }]} onPress={() => setDraft(EMPTY)}>
              <Text style={ui.buttonGhostText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {notes.map((n) => (
        <Pressable
          key={n.id}
          style={ui.card}
          onPress={() => setDraft({ id: n.id, category: n.category, body: n.body, pin: n.pin })}
          onLongPress={() => remove(n)}
        >
          <Text style={{ fontWeight: '600' }}>
            {n.category}
            {n.pin ? ' 📍' : ''}
          </Text>
          <Text style={ui.body}>{n.body}</Text>
          <Text style={ui.muted}>Updated {new Date(n.updatedAt).toLocaleDateString()} · tap to edit, hold to delete</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
