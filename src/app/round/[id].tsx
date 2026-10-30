import { Link, Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import {
  finishRound,
  getHoles,
  getGuide,
  getNotes,
  getPhotos,
  getRound,
  getScores,
  setHolePar,
  setHolePoint,
  setRoundWeather,
  setScore,
  type GuidePhoto,
  type HoleNote,
  type RoundRow,
} from '../../db/repo.ts';
import { ratingFor, weatherCoefficients } from '../../data/ratings.ts';
import { findLayout } from '../../data/tulsa.ts';
import { bearingDegrees, compassPoint, distanceFeet, surveyPoint } from '../../domain/geo.ts';
import type { HoleGuide } from '../../domain/guide.ts';
import { adjustedScore, courseHandicap, scoreDifferential } from '../../domain/handicap.ts';
import type { Hole, LatLng, Weather } from '../../domain/types.ts';
import { weatherBucket, weatherStrokes } from '../../domain/weather.ts';
import { useLiveLocation, type Fix } from '../../hooks/useLiveLocation.ts';
import { getPlayerIndex } from '../../lib/player.ts';
import { getThrowProfile, type ThrowProfile } from '../../lib/throwing.ts';
import { fetchCurrentWeather } from '../../services/openMeteo.ts';
import { HoleGuideView } from '../../ui/HoleGuideView.tsx';
import { Stepper } from '../../ui/Stepper.tsx';
import { colors, toPar, ui } from '../../ui/theme.ts';

type Target = { key: string; label: string; point: LatLng };

const SURVEY_WINDOW_MS = 8000;

export default function RoundScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const roundId = Number(id);
  const db = useSQLiteContext();

  const [round, setRound] = useState<RoundRow | null>(null);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [scores, setScores] = useState<Map<number, number>>(new Map());
  const [holeIdx, setHoleIdx] = useState(0);
  const [notes, setNotes] = useState<HoleNote[]>([]);
  const [targetKey, setTargetKey] = useState('basket');
  const [mark, setMark] = useState<LatLng | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [guide, setGuide] = useState<HoleGuide | null>(null);
  const [guidePhotos, setGuidePhotos] = useState<GuidePhoto[]>([]);
  const [profile, setProfile] = useState<ThrowProfile>({ hand: 'right', usual: 'backhand' });

  const { fix, error: gpsError } = useLiveLocation(!round?.finishedAt);
  // Recent fixes, so "Set basket here" averages several readings instead of trusting one.
  const recentFixes = useRef<Fix[]>([]);
  useEffect(() => {
    if (!fix) return;
    recentFixes.current = [...recentFixes.current, fix].filter((f) => fix.at - f.at <= SURVEY_WINDOW_MS).slice(-30);
  }, [fix]);

  const found = round ? findLayout(round.layoutId) : undefined;
  const layout = found?.layout;
  const hole = holes[holeIdx];

  useEffect(() => {
    (async () => {
      const r = await getRound(db, roundId);
      if (!r) return;
      const l = findLayout(r.layoutId);
      if (!l) return;
      setRound(r);
      setWeather(r.weather);
      setHoles(await getHoles(db, l.layout));
      setScores(await getScores(db, roundId));
    })();
  }, [db, roundId]);

  // Notes can be edited on another screen; reload whenever we come back.
  useFocusEffect(
    useCallback(() => {
      if (!layout || !hole) return;
      getNotes(db, layout.id, hole.number).then(setNotes);
      getGuide(db, layout.id, hole.number).then(setGuide);
      getPhotos(db, layout.id, hole.number).then(setGuidePhotos);
      getThrowProfile(db).then(setProfile);
    }, [db, layout, hole]),
  );

  // Pull current weather once we know where the player is.
  useEffect(() => {
    if (weather || !fix || round?.finishedAt) return;
    fetchCurrentWeather(fix.coord)
      .then(async (w) => {
        setWeather(w);
        await setRoundWeather(db, roundId, w);
      })
      .catch((e) => setWeatherError(String(e.message ?? e)));
  }, [fix, weather, round, db, roundId]);

  const targets: Target[] = useMemo(() => {
    const t: Target[] = [];
    if (hole?.basket) t.push({ key: 'basket', label: 'Basket', point: hole.basket });
    for (const n of notes) {
      if (n.pin) t.push({ key: `note-${n.id}`, label: n.body.slice(0, 18) || n.category, point: n.pin });
    }
    return t;
  }, [hole, notes]);
  const target = targets.find((t) => t.key === targetKey) ?? targets[0];

  if (!round || !layout || !hole) return <Text style={[ui.body, ui.pad]}>Loading…</Text>;

  const par = holes.reduce((s, h) => s + h.par, 0);
  const strokes = scores.get(hole.number);
  const playedPar = holes.filter((h) => scores.has(h.number)).reduce((s, h) => s + h.par, 0);
  const total = [...scores.values()].reduce((s, x) => s + x, 0);
  const rating = ratingFor(layout);
  const wxStrokes = weather ? weatherStrokes(weather, layout.windExposure, holes.length, weatherCoefficients) : 0;
  const bucket = weatherBucket(wxStrokes);

  const updateScore = async (next: number) => {
    const v = Math.max(1, next);
    await setScore(db, roundId, hole.number, v);
    setScores(new Map(scores).set(hole.number, v));
  };

  const updatePar = async (next: number) => {
    const v = Math.min(6, Math.max(2, next));
    await setHolePar(db, layout.id, hole.number, v);
    setHoles(holes.map((h) => (h.number === hole.number ? { ...h, par: v } : h)));
  };

  const survey = async (which: 'tee' | 'basket') => {
    const p = surveyPoint(recentFixes.current, Date.now());
    if (!p) {
      Alert.alert('No GPS yet', 'Wait for a GPS fix, then try again.');
      return;
    }
    await setHolePoint(db, layout.id, hole.number, which, p);
    setHoles(holes.map((h) => (h.number === hole.number ? { ...h, [which]: p } : h)));
  };

  const goHole = (i: number) => {
    setHoleIdx(i);
    setTargetKey('basket');
    setMark(null);
  };

  const finish = async () => {
    const missing = holes.filter((h) => !scores.has(h.number)).map((h) => h.number);
    if (missing.length) {
      Alert.alert('Round incomplete', `Enter scores for hole${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`);
      return;
    }
    const player = await getPlayerIndex(db);
    const ch = player.index !== null ? courseHandicap(player.index, rating, par, holes.length) : null;
    const adj = adjustedScore(
      holes.map((h) => ({ par: h.par, strokes: scores.get(h.number)! })),
      ch,
    );
    const diff =
      round.roundType === 'practice' ? null : scoreDifferential(adj, rating, bucket.strokes, holes.length);
    await finishRound(db, roundId, {
      weatherBucket: bucket.strokes,
      courseRating: rating.courseRating,
      slope: rating.slope,
      par,
      adjustedScore: adj,
      differential: diff,
    });
    Alert.alert(
      'Round saved',
      `${total} (${toPar(total - par)}) · ${bucket.label} conditions (+${bucket.strokes})` +
        (diff !== null ? `\nHandicap differential: ${diff}` : '\nPractice round, not counted toward handicap.'),
    );
    router.back();
  };

  const dist = fix && target ? distanceFeet(fix.coord, target.point) : null;
  const holeLength = hole.tee && hole.basket ? distanceFeet(hole.tee, hole.basket) : hole.lengthFt;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.pad}>
      <Stack.Screen options={{ title: `${found!.course.name} · ${layout.name}` }} />

      {/* Hole picker */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {holes.map((h, i) => {
          const s = scores.get(h.number);
          const on = i === holeIdx;
          return (
            <Pressable key={h.number} onPress={() => goHole(i)} style={[ui.chip, on && ui.chipOn]}>
              <Text style={on ? ui.chipTextOn : ui.chipText}>
                {h.number}
                {s !== undefined ? ` · ${s}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Always-on distance readout */}
      <View style={[ui.card, { alignItems: 'center', paddingVertical: 20 }]}>
        <Text style={ui.muted}>Hole {hole.number} · Par {hole.par}{holeLength ? ` · ${Math.round(holeLength)} ft` : ''}</Text>
        {target ? (
          <>
            <Text style={{ fontSize: 64, fontWeight: '800', color: colors.primary }}>
              {dist !== null ? Math.round(dist) : '—'}
              <Text style={{ fontSize: 24 }}> ft</Text>
            </Text>
            <Text style={ui.body}>
              to {target.label}
              {fix && dist !== null ? ` · ${compassPoint(bearingDegrees(fix.coord, target.point))}` : ''}
            </Text>
          </>
        ) : (
          <Text style={[ui.body, { textAlign: 'center', marginVertical: 12 }]}>
            Basket not mapped yet. Stand at the basket and tap "Set basket here".
          </Text>
        )}
        <Text style={ui.muted}>
          {gpsError ?? (fix ? `GPS ±${Math.round((fix.accuracyM ?? 0) * 3.28)} ft` : 'Waiting for GPS…')}
        </Text>
        {targets.length > 1 ? (
          <View style={[ui.row, { flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }]}>
            {targets.map((t) => (
              <Pressable key={t.key} onPress={() => setTargetKey(t.key)} style={[ui.chip, target?.key === t.key && ui.chipOn]}>
                <Text style={target?.key === t.key ? ui.chipTextOn : ui.chipText}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {/* Hole guide: how to play it, OB, tee view */}
      {guide || guidePhotos.length ? (
        <View style={ui.card}>
          <View style={ui.between}>
            <Text style={ui.h2}>Hole guide</Text>
            <Pressable
              onPress={() =>
                router.push({ pathname: '/guide/[layoutId]', params: { layoutId: layout.id, hole: String(hole.number) } })
              }
            >
              <Text style={ui.buttonGhostText}>Full guide ›</Text>
            </Pressable>
          </View>
          <HoleGuideView hole={hole} guide={guide} photos={guidePhotos} profile={profile} compact />
        </View>
      ) : null}

      {/* Measure a throw */}
      <View style={ui.between}>
        <Pressable style={[ui.buttonGhost, { flex: 1 }]} onPress={() => fix && setMark(fix.coord)}>
          <Text style={ui.buttonGhostText}>Mark lie</Text>
        </Pressable>
        <Text style={[ui.body, { flex: 1, textAlign: 'center' }]}>
          {mark && fix ? `Throw: ${Math.round(distanceFeet(mark, fix.coord))} ft` : 'Mark, walk to your disc'}
        </Text>
      </View>

      {/* Score */}
      <View style={[ui.card, { alignItems: 'center' }]}>
        <Stepper
          big
          label={`Hole ${hole.number} score`}
          value={strokes !== undefined ? String(strokes) : '–'}
          onMinus={() => updateScore((strokes ?? hole.par) - 1)}
          onPlus={() => updateScore(strokes === undefined ? hole.par : strokes + 1)}
        />
        <Text style={ui.body}>
          Total {total} ({toPar(total - playedPar)}) thru {scores.size}
        </Text>
        <View style={[ui.row, { marginTop: 8 }]}>
          <Pressable style={ui.buttonGhost} disabled={holeIdx === 0} onPress={() => goHole(holeIdx - 1)}>
            <Text style={ui.buttonGhostText}>‹ Prev</Text>
          </Pressable>
          <Pressable
            style={ui.button}
            onPress={() => (holeIdx < holes.length - 1 ? goHole(holeIdx + 1) : finish())}
          >
            <Text style={ui.buttonText}>{holeIdx < holes.length - 1 ? 'Next hole ›' : 'Finish round'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Yardage book for this hole */}
      <View style={ui.card}>
        <View style={ui.between}>
          <Text style={ui.h2}>Yardage book</Text>
          <Link
            href={{ pathname: '/notes/[layoutId]/[hole]', params: { layoutId: layout.id, hole: String(hole.number) } }}
            asChild
          >
            <Pressable>
              <Text style={ui.buttonGhostText}>{notes.length ? 'Edit' : '+ Add note'}</Text>
            </Pressable>
          </Link>
        </View>
        {notes.length === 0 ? <Text style={ui.muted}>No notes for this hole yet.</Text> : null}
        {notes.map((n) => (
          <Text key={n.id} style={ui.body}>
            <Text style={{ fontWeight: '600' }}>{n.category}: </Text>
            {n.body}
            {n.pin && fix ? <Text style={ui.muted}>{`  (${Math.round(distanceFeet(fix.coord, n.pin))} ft)`}</Text> : null}
          </Text>
        ))}
      </View>

      {/* Conditions */}
      <View style={ui.card}>
        <Text style={ui.h2}>
          Conditions: {bucket.label} (+{bucket.strokes})
        </Text>
        {weather ? (
          <>
            <Text style={ui.muted}>
              {bucket.description}. Model estimate {wxStrokes.toFixed(1)} strokes over {holes.length} holes.
            </Text>
            <View style={[ui.row, { flexWrap: 'wrap', justifyContent: 'space-around' }]}>
              {(
                [
                  ['Wind mph', 'windMph', 1],
                  ['Gust mph', 'gustMph', 1],
                  ['Temp °F', 'tempF', 5],
                ] as const
              ).map(([label, key, step]) => (
                <Stepper
                  key={key}
                  label={label}
                  value={String(Math.round(weather[key]))}
                  onMinus={() => editWeather({ ...weather, [key]: Math.max(0, weather[key] - step) })}
                  onPlus={() => editWeather({ ...weather, [key]: weather[key] + step })}
                />
              ))}
            </View>
            <Pressable
              style={[ui.chip, weather.precipInPerHr > 0 && ui.chipOn, { alignSelf: 'flex-start' }]}
              onPress={() => editWeather({ ...weather, precipInPerHr: weather.precipInPerHr > 0 ? 0 : 0.05 })}
            >
              <Text style={weather.precipInPerHr > 0 ? ui.chipTextOn : ui.chipText}>
                {weather.precipInPerHr > 0 ? 'Raining' : 'Dry'}
              </Text>
            </Pressable>
          </>
        ) : (
          <Text style={ui.muted}>{weatherError ? `Weather unavailable: ${weatherError}` : 'Fetching weather…'}</Text>
        )}
        {!weather && weatherError ? (
          <Pressable style={ui.buttonGhost} onPress={() => editWeather({ windMph: 5, gustMph: 8, tempF: 70, precipInPerHr: 0 })}>
            <Text style={ui.buttonGhostText}>Enter conditions manually</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Course mapping */}
      <View style={ui.card}>
        <Text style={ui.h2}>Map this hole</Text>
        <Text style={ui.muted}>Stand on the spot for a few seconds, then tap. Readings are averaged.</Text>
        <View style={ui.row}>
          <Pressable style={[ui.buttonGhost, { flex: 1 }]} onPress={() => survey('tee')}>
            <Text style={ui.buttonGhostText}>{hole.tee ? 'Reset tee' : 'Set tee here'}</Text>
          </Pressable>
          <Pressable style={[ui.buttonGhost, { flex: 1 }]} onPress={() => survey('basket')}>
            <Text style={ui.buttonGhostText}>{hole.basket ? 'Reset basket' : 'Set basket here'}</Text>
          </Pressable>
        </View>
        <Stepper label="Par" value={String(hole.par)} onMinus={() => updatePar(hole.par - 1)} onPlus={() => updatePar(hole.par + 1)} />
      </View>
    </ScrollView>
  );

  async function editWeather(w: Weather) {
    setWeather(w);
    setWeatherError(null);
    await setRoundWeather(db, roundId, w);
  }
}
