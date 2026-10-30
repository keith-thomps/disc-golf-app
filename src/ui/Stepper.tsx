import { Pressable, Text, View } from 'react-native';
import { colors, ui } from './theme.ts';

type Props = {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  big?: boolean;
};

export function Stepper({ label, value, onMinus, onPlus, big }: Props) {
  const size = big ? 56 : 36;
  const btn = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Text style={ui.muted}>{label}</Text>
      <View style={ui.row}>
        <Pressable style={btn} onPress={onMinus} accessibilityLabel={`Decrease ${label}`}>
          <Text style={[ui.buttonText, { fontSize: big ? 28 : 18 }]}>−</Text>
        </Pressable>
        <Text style={{ fontSize: big ? 40 : 18, fontWeight: '700', minWidth: big ? 64 : 48, textAlign: 'center', color: colors.text }}>
          {value}
        </Text>
        <Pressable style={btn} onPress={onPlus} accessibilityLabel={`Increase ${label}`}>
          <Text style={[ui.buttonText, { fontSize: big ? 28 : 18 }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}
