import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { startRound, type RoundType } from '../../db/repo.ts';
import { ratingFor } from '../../data/ratings.ts';
import { findCourse } from '../../data/tulsa.ts';
import { courseHandicap, formatIndex } from '../../domain/handicap.ts';
import { getPlayerIndex, type PlayerIndex } from '../../lib/player.ts';
import { toPar, ui } from '../../ui/theme.ts';

const ROUND_TYPES: { type: RoundType; label: string }[] = [
  { type: 'casual', label: 'Casual' },
  { type: 'league', label: 'League' },
  { type: 'practice', label: 'Practice' },
  { type: 'tournament', label: 'Tournament' },
];

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const course = findCourse(id);
  const [player, setPlayer] = useState<PlayerIndex | null>(null);
  const [roundType, setRoundType] = useState<RoundType>('casual');

  useFocusEffect(
    useCallback(() => {
      getPlayerIndex(db).then(setPlayer);
    }, [db]),
  );

  if (!course) return <Text style={ui.body}>Course not found.</Text>;

  const begin = async (layoutId: string) => {
    const roundId = await startRound(db, layoutId, roundType);
    router.push({ pathname: '/round/[id]', params: { id: String(roundId) } });
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.pad}>
      <Stack.Screen options={{ title: course.name }} />
      <Text style={ui.h1}>{course.name}</Text>
      <Text style={ui.muted}>
        {course.city}, {course.state}
      </Text>
      {course.dataNotes ? <Text style={ui.muted}>{course.dataNotes}</Text> : null}

      <Text style={ui.h2}>Round type</Text>
      <View style={[ui.row, { flexWrap: 'wrap' }]}>
        {ROUND_TYPES.map((r) => (
          <Pressable
            key={r.type}
            onPress={() => setRoundType(r.type)}
            style={[ui.chip, roundType === r.type && ui.chipOn]}
          >
            <Text style={roundType === r.type ? ui.chipTextOn : ui.chipText}>{r.label}</Text>
          </Pressable>
        ))}
      </View>
      {roundType === 'practice' ? (
        <Text style={ui.muted}>Practice rounds are for building your yardage book and don't count toward your handicap.</Text>
      ) : null}

      {course.layouts.map((layout) => {
        const par = layout.holes.reduce((s, h) => s + h.par, 0);
        const rating = ratingFor(layout);
        const ch =
          player?.index != null ? courseHandicap(player.index, rating, par, layout.holes.length) : null;
        return (
          <View key={layout.id} style={ui.card}>
            <Text style={ui.h2}>{layout.name}</Text>
            <Text style={ui.body}>
              {layout.holes.length} holes · Par {par}
            </Text>
            <Text style={ui.body}>
              Course Rating {rating.courseRating} ({toPar(rating.courseRating - par)} vs par) · Slope {rating.slope}
            </Text>
            <Text style={ui.muted}>
              {rating.provisional
                ? 'Provisional: no PDGA-sanctioned rounds processed for this layout yet, so it is rated at par.'
                : `From ${rating.roundsUsed} sanctioned rounds, weather-adjusted.`}
            </Text>
            {ch !== null && player?.index != null ? (
              <Text style={ui.body}>
                Your course handicap: {ch} (index {formatIndex(player.index)}) → target {par + ch}
              </Text>
            ) : null}
            <View style={[ui.row, { marginTop: 6 }]}>
              <Pressable style={[ui.button, { flex: 1 }]} onPress={() => begin(layout.id)}>
                <Text style={ui.buttonText}>Start round</Text>
              </Pressable>
              <Pressable
                style={[ui.buttonGhost, { flex: 1 }]}
                onPress={() => router.push({ pathname: '/book/[layoutId]', params: { layoutId: layout.id } })}
              >
                <Text style={ui.buttonGhostText}>Yardage book</Text>
              </Pressable>
            </View>
            <Pressable
              style={ui.buttonGhost}
              onPress={() => router.push({ pathname: '/guide/[layoutId]', params: { layoutId: layout.id } })}
            >
              <Text style={ui.buttonGhostText}>Hole guide: walk the course from the tee</Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}
