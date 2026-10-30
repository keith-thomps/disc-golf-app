import { Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { flightControlPoint, shotLegs, teeFrame, type HoleGuide, type Point } from '../domain/guide.ts';
import type { LatLng } from '../domain/types.ts';
import { colors, ui } from './theme.ts';

type Props = { guide: HoleGuide; tee?: LatLng; basket?: LatLng; width?: number };

const OB_COLOR = '#D64545';
const HAZARD_COLOR = '#E9A23B';

/**
 * The hole as you see it standing on the tee: basket straight ahead, your left is left.
 * With surveyed GPS everything is to scale; otherwise it is laid out from the entered
 * distances and marked "not to scale".
 */
export function HoleDiagram({ guide, tee, basket, width = 320 }: Props) {
  const height = Math.round(width * 1.25);
  const legs = shotLegs(tee, basket, guide.shots);
  const toScale = Boolean(tee && basket);

  // Positions in feet: x = right of thrower, y = toward the basket.
  let basketPt: Point;
  let landing: (Point | null)[];
  if (tee && basket) {
    const f = teeFrame(tee, basket);
    basketPt = f(basket);
    landing = guide.shots.map((s) => (s.pin ? f(s.pin) : null));
  } else {
    let y = 0;
    landing = legs.map((l) => {
      if (l.fromFt === null) return null;
      y += l.fromFt;
      return { x: 0, y };
    });
    const last = legs[legs.length - 1];
    basketPt = { x: 0, y: Math.max(y + (last?.remainingFt ?? 60), 150) };
  }
  // Unpinned landing zones without a distance sit evenly along the line.
  landing = landing.map(
    (p, i) => p ?? { x: 0, y: (basketPt.y * (i + 1)) / (guide.shots.length + 1) },
  );

  // Fit everything into the view with room for OB bands and labels.
  const pts = [{ x: 0, y: 0 }, basketPt, ...(landing as Point[])];
  const spanX = Math.max(120, ...pts.map((p) => Math.abs(p.x) * 2 + 80));
  const minY = Math.min(0, ...pts.map((p) => p.y)) - 40;
  const maxY = Math.max(...pts.map((p) => p.y)) + 50;
  const scale = Math.min(width / spanX, height / (maxY - minY));
  const sx = (p: Point) => width / 2 + p.x * scale;
  const sy = (p: Point) => height - (p.y - minY) * scale;
  const sp = (p: Point) => `${sx(p).toFixed(1)} ${sy(p).toFixed(1)}`;

  const flights: { d: string; label: string; at: Point }[] = [];
  let from: Point = { x: 0, y: 0 };
  legs.forEach((leg, i) => {
    const to = landing[i] as Point;
    const c = flightControlPoint(from, to, leg.shot.curve);
    flights.push({
      d: `M ${sp(from)} Q ${sp(c)} ${sp(to)}`,
      label: leg.fromFt !== null ? `${Math.round(leg.fromFt)}'` : '',
      at: to,
    });
    from = to;
  });

  const band = 14;
  const bands: { x: number; y: number; w: number; h: number; color: string; label: string }[] = [];
  for (const z of guide.ob) {
    const color = z.penalty === 'hazard' ? HAZARD_COLOR : OB_COLOR;
    const label = z.penalty === 'hazard' ? 'HAZARD' : 'OB';
    if (z.sides.includes('left')) bands.push({ x: 0, y: 0, w: band, h: height, color, label });
    if (z.sides.includes('right')) bands.push({ x: width - band, y: 0, w: band, h: height, color, label });
    if (z.sides.includes('long')) bands.push({ x: 0, y: 0, w: width, h: Math.max(band, sy(basketPt) - 24), color, label });
    if (z.sides.includes('short')) {
      const top = sy(basketPt) + 22;
      bands.push({ x: band, y: top, w: width - 2 * band, h: band, color, label });
    }
  }

  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Svg width={width} height={height} style={{ backgroundColor: '#E7F0E3', borderRadius: 12 }}>
        {bands.map((b, i) => (
          <G key={`band-${i}`}>
            <Rect x={b.x} y={b.y} width={b.w} height={b.h} fill={b.color} opacity={0.35} />
          </G>
        ))}
        {/* Straight line to the basket, for reference */}
        <Line x1={sx({ x: 0, y: 0 })} y1={sy({ x: 0, y: 0 })} x2={sx(basketPt)} y2={sy(basketPt)} stroke="#9DB59A" strokeDasharray="4 6" />
        {flights.map((f, i) => (
          <G key={`flight-${i}`}>
            <Path d={f.d} stroke={colors.primary} strokeWidth={3} fill="none" />
            <Circle cx={sx(f.at)} cy={sy(f.at)} r={9} fill="#FFFFFF" stroke={colors.primary} strokeWidth={2} />
            <SvgText x={sx(f.at)} y={sy(f.at) + 4} fontSize={10} fontWeight="bold" fill={colors.primary} textAnchor="middle">
              {i + 1}
            </SvgText>
            {f.label ? (
              <SvgText x={sx(f.at) + 14} y={sy(f.at) + 4} fontSize={11} fill={colors.text}>
                {f.label}
              </SvgText>
            ) : null}
          </G>
        ))}
        {legs.length > 0 ? (
          <Line
            x1={sx(landing[landing.length - 1] as Point)}
            y1={sy(landing[landing.length - 1] as Point)}
            x2={sx(basketPt)}
            y2={sy(basketPt)}
            stroke={colors.primary}
            strokeDasharray="3 4"
          />
        ) : null}
        {/* Basket */}
        <Circle cx={sx(basketPt)} cy={sy(basketPt)} r={10} fill="#FFD84D" stroke="#555" strokeWidth={2} />
        <Line x1={sx(basketPt) - 6} y1={sy(basketPt)} x2={sx(basketPt) + 6} y2={sy(basketPt)} stroke="#555" strokeWidth={2} />
        {/* Tee pad */}
        <Rect x={sx({ x: 0, y: 0 }) - 10} y={sy({ x: 0, y: 0 }) - 16} width={20} height={30} rx={3} fill="#B9B4A8" />
        {bands
          .filter((b, i) => bands.findIndex((x) => x.label === b.label) === i)
          .map((b, i) => (
            <SvgText key={`lbl-${i}`} x={8 + i * 70} y={height - 8} fontSize={11} fontWeight="bold" fill={b.color}>
              ■ {b.label}
            </SvgText>
          ))}
      </Svg>
      <Text style={ui.muted}>
        View from the tee{toScale ? '' : ' · not to scale (tee/basket not mapped yet)'}
      </Text>
    </View>
  );
}
