import { Pressable, Text, View } from 'react-native';
import { ui } from './theme.ts';

type Option<T extends string> = readonly [T, string];

/** A row of single-choice chips. */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly Option<T>[];
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  return (
    <View style={[ui.row, { flexWrap: 'wrap' }]}>
      {options.map(([v, label]) => (
        <Pressable key={v} onPress={() => onChange(v)} style={[ui.chip, value === v && ui.chipOn]}>
          <Text style={value === v ? ui.chipTextOn : ui.chipText}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** A row of multi-select chips. */
export function MultiChipRow<T extends string>({
  options,
  values,
  onChange,
}: {
  options: readonly Option<T>[];
  values: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <View style={[ui.row, { flexWrap: 'wrap' }]}>
      {options.map(([v, label]) => {
        const on = values.includes(v);
        return (
          <Pressable
            key={v}
            onPress={() => onChange(on ? values.filter((x) => x !== v) : [...values, v])}
            style={[ui.chip, on && ui.chipOn]}
          >
            <Text style={on ? ui.chipTextOn : ui.chipText}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
