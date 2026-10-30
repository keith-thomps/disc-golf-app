import { Tabs } from 'expo-router/tabs';
import { Text } from 'react-native';
import { colors } from '../../ui/theme.ts';

const icon = (glyph: string) => ({ focused }: { focused: boolean }) => (
  <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{glyph}</Text>
);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.card },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Courses', tabBarIcon: icon('🥏') }} />
      <Tabs.Screen name="rounds" options={{ title: 'Rounds', tabBarIcon: icon('📋') }} />
      <Tabs.Screen name="profile" options={{ title: 'Handicap', tabBarIcon: icon('📈') }} />
    </Tabs>
  );
}
