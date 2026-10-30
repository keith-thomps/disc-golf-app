import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { migrate } from '../db/schema.ts';
import { colors } from '../ui/theme.ts';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="discbook.db" onInit={migrate}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.primary,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="course/[id]" options={{ title: 'Course' }} />
        <Stack.Screen name="round/[id]" options={{ title: 'Round' }} />
        <Stack.Screen name="notes/[layoutId]/[hole]" options={{ title: 'Hole notes' }} />
        <Stack.Screen name="book/[layoutId]" options={{ title: 'Yardage book' }} />
        <Stack.Screen name="guide/[layoutId]" options={{ title: 'Hole guide' }} />
        <Stack.Screen name="guide/edit/[layoutId]/[hole]" options={{ title: 'Edit guide' }} />
      </Stack>
    </SQLiteProvider>
  );
}
