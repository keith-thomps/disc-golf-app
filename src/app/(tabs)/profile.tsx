import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { getDifferentials, getSetting, setSetting } from '../../db/repo.ts';
import { weatherCoefficients, weatherModelIsFitted } from '../../data/ratings.ts';
import { formatIndex, pdgaRatingFromIndex, udiscToPdga } from '../../domain/handicap.ts';
import { WEATHER_BUCKETS } from '../../domain/weather.ts';
import { getPlayerIndex, type PlayerIndex } from '../../lib/player.ts';
import { getThrowProfile, setThrowProfile, type ThrowProfile } from '../../lib/throwing.ts';
import { ChipRow } from '../../ui/Chips.tsx';
import { ui } from '../../ui/theme.ts';

export default function ProfileScreen() {
  const db = useSQLiteContext();
  const [player, setPlayer] = useState<PlayerIndex | null>(null);
  const [diffs, setDiffs] = useState<number[]>([]);
  const [ratingInput, setRatingInput] = useState('');
  const [udiscInput, setUdiscInput] = useState('');
  const [throwing, setThrowing] = useState<ThrowProfile>({ hand: 'right', usual: 'backhand' });
  const [name, setName] = useState('');

  const reload = useCallback(() => {
    getPlayerIndex(db).then((p) => {
      setPlayer(p);
      if (p.pdgaRating) setRatingInput(String(p.pdgaRating));
    });
    getDifferentials(db).then(setDiffs);
    getThrowProfile(db).then(setThrowing);
    getSetting(db, 'display_name').then((n) => setName(n ?? ''));
  }, [db]);

  const updateThrowing = (patch: Partial<ThrowProfile>) => {
    const next = { ...throwing, ...patch };
    setThrowing(next);
    setThrowProfile(db, next);
  };
  useFocusEffect(reload);

  const saveRating = async (value: string) => {
    const n = Number(value);
    await setSetting(db, 'pdga_rating', n > 0 ? String(Math.round(n)) : null);
    reload();
  };

  const counted = new Set([...diffs].sort((a, b) => a - b).slice(0, 8));

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.pad} keyboardShouldPersistTaps="handled">
      <View style={[ui.card, { alignItems: 'center' }]}>
        <Text style={ui.muted}>Handicap Index</Text>
        <Text style={{ fontSize: 56, fontWeight: '800' }}>
          {player?.index != null ? formatIndex(player.index) : '—'}
        </Text>
        <Text style={ui.muted}>
          {player?.source === 'rounds'
            ? `From ${player.roundsCounted} rounds · ≈ ${pdgaRatingFromIndex(player.index!)} PDGA`
            : player?.source === 'pdga'
              ? `Estimated from PDGA rating ${player.pdgaRating}. Play 3 rated rounds for a real index.`
              : 'Enter your PDGA rating or play 3 rounds to get an index.'}
        </Text>
        <Text style={ui.muted}>0.0 = scratch = 1000-rated. Lower is better; “+” means better than scratch.</Text>
      </View>

      <View style={ui.card}>
        <Text style={ui.h2}>Starting point</Text>
        <Text style={ui.muted}>PDGA rating</Text>
        <TextInput
          style={ui.input}
          keyboardType="number-pad"
          value={ratingInput}
          onChangeText={setRatingInput}
          onEndEditing={() => saveRating(ratingInput)}
          placeholder="e.g. 925"
        />
        <Text style={ui.muted}>No PDGA rating? Convert your UDisc rating (×2 + 500):</Text>
        <View style={ui.row}>
          <TextInput
            style={[ui.input, { flex: 1 }]}
            keyboardType="number-pad"
            value={udiscInput}
            onChangeText={setUdiscInput}
            placeholder="UDisc rating, e.g. 210"
          />
          <Pressable
            style={ui.button}
            onPress={() => {
              const n = Number(udiscInput);
              if (n > 0) {
                const r = String(udiscToPdga(n));
                setRatingInput(r);
                saveRating(r);
              }
            }}
          >
            <Text style={ui.buttonText}>Use</Text>
          </Pressable>
        </View>
      </View>

      <View style={ui.card}>
        <Text style={ui.h2}>How you throw</Text>
        <Text style={ui.muted}>Hole guides translate each line into the release you need (hyzer, flat, anhyzer).</Text>
        <ChipRow
          options={[['right', 'Right-handed'], ['left', 'Left-handed']] as const}
          value={throwing.hand}
          onChange={(hand) => updateThrowing({ hand })}
        />
        <ChipRow
          options={[['backhand', 'Mostly backhand'], ['forehand', 'Mostly forehand']] as const}
          value={throwing.usual}
          onChange={(usual) => updateThrowing({ usual })}
        />
        <Text style={ui.muted}>Your name on guides you share</Text>
        <TextInput
          style={ui.input}
          value={name}
          onChangeText={setName}
          onEndEditing={() => setSetting(db, 'display_name', name.trim() || null)}
          placeholder="e.g. Keith"
        />
      </View>

      <View style={ui.card}>
        <Text style={ui.h2}>Recent differentials</Text>
        <Text style={ui.muted}>Best 8 of your last 20 count (highlighted).</Text>
        {diffs.length === 0 ? <Text style={ui.muted}>None yet.</Text> : null}
        <View style={[ui.row, { flexWrap: 'wrap' }]}>
          {diffs.map((d, i) => (
            <View key={i} style={[ui.chip, counted.has(d) && diffs.length >= 3 && ui.chipOn]}>
              <Text style={counted.has(d) && diffs.length >= 3 ? ui.chipTextOn : ui.chipText}>{d.toFixed(1)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={ui.card}>
        <Text style={ui.h2}>Weather buckets</Text>
        <Text style={ui.muted}>
          Strokes subtracted from your score before computing a differential.{' '}
          {weatherModelIsFitted ? 'Fitted from sanctioned rounds.' : 'Using starting estimates until PDGA data is processed.'}
        </Text>
        {WEATHER_BUCKETS.map((b) => (
          <Text key={b.strokes} style={ui.body}>
            <Text style={{ fontWeight: '600' }}>+{b.strokes} {b.label}</Text> · {b.description}
          </Text>
        ))}
        <Text style={ui.muted}>
          Per 18 holes: {weatherCoefficients.wind.toFixed(2)}/mph wind over 5, {weatherCoefficients.cold.toFixed(2)}/°F below 55,
          rain {weatherCoefficients.rain.toFixed(1)}.
        </Text>
      </View>
    </ScrollView>
  );
}
