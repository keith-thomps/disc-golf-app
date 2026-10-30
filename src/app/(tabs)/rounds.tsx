import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { deleteRound, listRounds, type RoundRow } from '../../db/repo.ts';
import { findLayout } from '../../data/tulsa.ts';
import { WEATHER_BUCKETS } from '../../domain/weather.ts';
import { toPar, ui } from '../../ui/theme.ts';

export default function RoundsScreen() {
  const db = useSQLiteContext();
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const reload = useCallback(() => {
    listRounds(db).then(setRounds);
  }, [db]);
  useFocusEffect(reload);

  const confirmDelete = (r: RoundRow) =>
    Alert.alert('Delete round?', 'This also removes it from your handicap.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteRound(db, r.id); reload(); } },
    ]);

  return (
    <View style={ui.screen}>
      <FlatList
        contentContainerStyle={ui.pad}
        data={rounds}
        keyExtractor={(r) => String(r.id)}
        ListEmptyComponent={<Text style={ui.muted}>No rounds yet. Pick a course to start one.</Text>}
        renderItem={({ item }) => {
          const found = findLayout(item.layoutId);
          const bucket = item.weatherBucket !== null ? WEATHER_BUCKETS[item.weatherBucket] : null;
          const total = item.adjustedScore;
          return (
            <Link href={{ pathname: '/round/[id]', params: { id: String(item.id) } }} asChild>
              <Pressable style={ui.card} onLongPress={() => confirmDelete(item)}>
                <View style={ui.between}>
                  <Text style={ui.h2}>{found?.course.name ?? item.layoutId}</Text>
                  <Text style={ui.muted}>{new Date(item.startedAt).toLocaleDateString()}</Text>
                </View>
                <Text style={ui.muted}>
                  {found?.layout.name} · {item.roundType}
                  {item.finishedAt ? '' : ' · in progress'}
                </Text>
                {item.finishedAt && total !== null && item.par !== null ? (
                  <Text style={ui.body}>
                    Adj. {total} ({toPar(total - item.par)}) · {bucket ? `${bucket.label} +${bucket.strokes}` : ''}
                    {item.differential !== null ? ` · Diff ${item.differential}` : ' · not counted'}
                  </Text>
                ) : null}
              </Pressable>
            </Link>
          );
        }}
      />
    </View>
  );
}
