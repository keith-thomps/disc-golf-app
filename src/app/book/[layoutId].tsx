import { Link, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { getHoles, getNotes, type HoleNote } from '../../db/repo.ts';
import { findLayout } from '../../data/tulsa.ts';
import { distanceFeet } from '../../domain/geo.ts';
import type { Hole } from '../../domain/types.ts';
import { ui } from '../../ui/theme.ts';

/** The whole yardage book for a layout: read it the night before a tournament. */
export default function YardageBookScreen() {
  const { layoutId } = useLocalSearchParams<{ layoutId: string }>();
  const db = useSQLiteContext();
  const found = findLayout(layoutId);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [notes, setNotes] = useState<HoleNote[]>([]);

  useFocusEffect(
    useCallback(() => {
      const l = findLayout(layoutId);
      if (!l) return;
      getHoles(db, l.layout).then(setHoles);
      getNotes(db, layoutId).then(setNotes);
    }, [db, layoutId]),
  );

  if (!found) return <Text style={ui.body}>Layout not found.</Text>;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.pad}>
      <Stack.Screen options={{ title: `${found.course.name} book` }} />
      <Text style={ui.muted}>
        {found.layout.name} · {notes.length} notes across {new Set(notes.map((n) => n.holeNumber)).size} holes
      </Text>
      {holes.map((h) => {
        const mine = notes.filter((n) => n.holeNumber === h.number);
        const len = h.tee && h.basket ? Math.round(distanceFeet(h.tee, h.basket)) : null;
        return (
          <Link
            key={h.number}
            href={{ pathname: '/notes/[layoutId]/[hole]', params: { layoutId, hole: String(h.number) } }}
            asChild
          >
            <Pressable style={ui.card}>
              <View style={ui.between}>
                <Text style={ui.h2}>Hole {h.number}</Text>
                <Text style={ui.muted}>
                  Par {h.par}
                  {len ? ` · ${len} ft` : ''}
                </Text>
              </View>
              {mine.length === 0 ? <Text style={ui.muted}>No notes</Text> : null}
              {mine.map((n) => (
                <Text key={n.id} style={ui.body}>
                  <Text style={{ fontWeight: '600' }}>{n.category}: </Text>
                  {n.body}
                </Text>
              ))}
            </Pressable>
          </Link>
        );
      })}
    </ScrollView>
  );
}
