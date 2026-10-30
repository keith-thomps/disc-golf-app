import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { ratingFor } from '../../data/ratings.ts';
import { TULSA_COURSES } from '../../data/tulsa.ts';
import { toPar, ui } from '../../ui/theme.ts';

export default function CoursesScreen() {
  const [q, setQ] = useState('');
  const courses = useMemo(
    () => TULSA_COURSES.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())),
    [q],
  );

  return (
    <View style={ui.screen}>
      <FlatList
        contentContainerStyle={ui.pad}
        data={courses}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <Text style={ui.muted}>Tulsa, OK · {TULSA_COURSES.length} courses</Text>
            <TextInput style={ui.input} placeholder="Search courses" value={q} onChangeText={setQ} />
          </View>
        }
        renderItem={({ item }) => {
          const main = item.layouts[0];
          const par = main.holes.reduce((s, h) => s + h.par, 0);
          const rating = ratingFor(main);
          return (
            <Link href={{ pathname: '/course/[id]', params: { id: item.id } }} asChild>
              <Pressable style={ui.card}>
                <Text style={ui.h2}>{item.name}</Text>
                <Text style={ui.muted}>
                  {item.layouts.length} layout{item.layouts.length > 1 ? 's' : ''} · {main.holes.length} holes
                  {rating.provisional
                    ? ' · unrated'
                    : ` · CR ${rating.courseRating} (${toPar(rating.courseRating - par)}) / ${rating.slope}`}
                </Text>
              </Pressable>
            </Link>
          );
        }}
      />
    </View>
  );
}
