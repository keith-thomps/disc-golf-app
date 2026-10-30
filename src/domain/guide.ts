import { bearingDegrees, distanceFeet, FEET_PER_METER } from './geo.ts';
import type { LatLng } from './types.ts';

/**
 * Hole guides: what a player who has never seen the course needs to know, written once
 * by someone who has. Everything here is stored in absolute terms (which way the disc
 * curves, which side the water is on) and translated for the reader's hand and throw.
 *
 * Sides are always from the tee looking toward the basket.
 */

export type Hand = 'right' | 'left';
export type ThrowStyle = 'backhand' | 'forehand';

/** Which way the flight finishes, as seen from behind the thrower. */
export type Curve = 'left' | 'straight' | 'right' | 'roller';
export type Height = 'low' | 'normal' | 'high';
export type DiscClass = 'putter' | 'midrange' | 'fairway' | 'distance';
export type Side = 'left' | 'right' | 'long' | 'short';

export type Shot = {
  curve: Curve;
  height: Height;
  disc?: DiscClass;
  /** Where to land, in words: "the gap left of the big oak". */
  target: string;
  /** GPS of the landing zone, if pinned on the course. */
  pin?: LatLng;
  /** Used when there is no pin. */
  distanceFt?: number;
};

export type ObZone = {
  /** "water", "road", "the parking lot", "the fence"… */
  feature: string;
  sides: Side[];
  /** OB costs a stroke and moves you; a hazard costs a stroke and you play it as it lies. */
  penalty: 'ob' | 'hazard';
  relief: 'last-in' | 'drop-zone' | 're-tee';
  /** Where the drop zone is, if relief is drop-zone. */
  dropZone?: string;
};

export type Mando = {
  object: string;
  /** The disc must pass this side of the object. */
  passSide: 'left' | 'right';
  relief: 'drop-zone' | 're-tee';
  dropZone?: string;
};

export type HoleShape = 'straight' | 'dogleg-left' | 'dogleg-right';
export type Elevation = 'flat' | 'uphill' | 'downhill';

export type HoleGuide = {
  shape: HoleShape;
  elevation: Elevation;
  elevationFt?: number;
  shots: Shot[];
  ob: ObZone[];
  mandos: Mando[];
  /** Anything else: "Basket sits on a slope; misses roll 30 ft." */
  notes: string;
};

export const EMPTY_GUIDE: HoleGuide = {
  shape: 'straight',
  elevation: 'flat',
  shots: [],
  ob: [],
  mandos: [],
  notes: '',
};

// ---------- translating a line for the reader's hand and throw ----------

export type Release = 'hyzer' | 'flat' | 'anhyzer' | 'roller';

/** The direction a disc naturally fades for this hand and throw. */
export function fadeSide(hand: Hand, style: ThrowStyle): 'left' | 'right' {
  const rightHandBackhand = hand === 'right' && style === 'backhand';
  const leftHandForehand = hand === 'left' && style === 'forehand';
  return rightHandBackhand || leftHandForehand ? 'left' : 'right';
}

/**
 * Release angle needed to make the disc finish toward `curve`.
 * Finishing toward your natural fade side is a hyzer; away from it is an anhyzer.
 */
export function releaseFor(curve: Curve, hand: Hand, style: ThrowStyle): Release {
  if (curve === 'roller') return 'roller';
  if (curve === 'straight') return 'flat';
  return curve === fadeSide(hand, style) ? 'hyzer' : 'anhyzer';
}

export type ThrowAdvice = { style: ThrowStyle; release: Release; preferred: boolean };

/**
 * Both ways to throw the line for this player, preferred first. A hyzer is more
 * reliable than an anhyzer, so a throw that makes the line a hyzer wins.
 * For straight shots and rollers, the player's usual throw wins.
 */
export function throwOptions(curve: Curve, hand: Hand, usual: ThrowStyle): ThrowAdvice[] {
  const styles: ThrowStyle[] = ['backhand', 'forehand'];
  const opts = styles.map((style) => ({ style, release: releaseFor(curve, hand, style), preferred: false }));
  const rank = (a: ThrowAdvice) =>
    (a.release === 'hyzer' ? 0 : a.release === 'anhyzer' ? 2 : 1) + (a.style === usual ? 0 : 0.5);
  opts.sort((a, b) => rank(a) - rank(b));
  opts[0].preferred = true;
  return opts;
}

// ---------- distances ----------

export type ShotLeg = { shot: Shot; fromFt: number | null; remainingFt: number | null };

/**
 * Distance of each shot and what is left to the basket afterward. Pinned landing zones
 * are measured; unpinned ones use the author's entered distance.
 */
export function shotLegs(tee: LatLng | undefined, basket: LatLng | undefined, shots: Shot[]): ShotLeg[] {
  let from: LatLng | undefined = tee;
  let travelled = 0;
  const holeLength = tee && basket ? distanceFeet(tee, basket) : null;
  return shots.map((shot) => {
    let fromFt: number | null = null;
    let remainingFt: number | null = null;
    if (shot.pin && from) {
      fromFt = distanceFeet(from, shot.pin);
    } else if (shot.distanceFt) {
      fromFt = shot.distanceFt;
    }
    if (shot.pin && basket) {
      remainingFt = distanceFeet(shot.pin, basket);
    } else if (holeLength !== null && fromFt !== null) {
      travelled += fromFt;
      remainingFt = Math.max(0, holeLength - travelled);
    }
    from = shot.pin ?? undefined;
    return { shot, fromFt, remainingFt };
  });
}

// ---------- plain-language text ----------

const ft = (n: number) => `${Math.round(n)} ft`;

const CURVE_WORDS: Record<Curve, string> = {
  left: 'curving left',
  straight: 'straight',
  right: 'curving right',
  roller: 'on a roller',
};

const RELEASE_WORDS: Record<Release, string> = {
  hyzer: 'hyzer',
  flat: 'flat',
  anhyzer: 'anhyzer',
  roller: 'roller',
};

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function sidePhrase(sides: Side[]): string {
  const s = new Set(sides);
  if (s.has('left') && s.has('right') && s.has('long') && s.has('short')) return 'all around';
  const parts: string[] = [];
  if (s.has('left') && s.has('right')) parts.push('on both sides');
  else if (s.has('left')) parts.push('on the left');
  else if (s.has('right')) parts.push('on the right');
  if (s.has('short')) parts.push('short of the basket');
  if (s.has('long')) parts.push('long, past the basket');
  return joinList(parts);
}

function reliefPhrase(relief: ObZone['relief'] | Mando['relief'], dropZone?: string): string {
  switch (relief) {
    case 'last-in':
      return 'play from where the disc last crossed in bounds';
    case 'drop-zone':
      return dropZone ? `play from the drop zone (${dropZone})` : 'play from the drop zone';
    case 're-tee':
      return 're-throw from the tee';
  }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Water is OB on the left and long, past the basket. If you go out, play from the drop zone, +1 stroke." */
export function describeOb(zone: ObZone): string {
  const where = sidePhrase(zone.sides);
  if (zone.penalty === 'hazard') {
    return `${capitalize(zone.feature)} is a hazard ${where}: add 1 stroke and play from where the disc lies.`;
  }
  return `${capitalize(zone.feature)} is OB ${where}. If you go out, ${reliefPhrase(zone.relief, zone.dropZone)}, +1 stroke.`;
}

export function describeMando(m: Mando): string {
  return (
    `Mandatory: the disc must pass to the ${m.passSide} of ${m.object}. ` +
    `If you miss it, ${reliefPhrase(m.relief, m.dropZone)}, +1 stroke.`
  );
}

const SHAPE_WORDS: Record<HoleShape, string> = {
  straight: 'Straight fairway',
  'dogleg-left': 'Doglegs left',
  'dogleg-right': 'Doglegs right',
};

export function describeHoleSummary(guide: HoleGuide, par: number, lengthFt: number | null): string {
  const parts = [`Par ${par}`];
  if (lengthFt) parts.push(ft(lengthFt));
  let elev = '';
  if (guide.elevation !== 'flat') {
    elev = guide.elevationFt ? `${guide.elevation}, about ${guide.elevationFt} ft` : guide.elevation;
  }
  const shape = SHAPE_WORDS[guide.shape] + (elev ? `, ${elev}` : '');
  return `${parts.join(' · ')}. ${shape}.`;
}

/**
 * One line per shot, written for the reader:
 * "Drive 240 ft curving left to the gap left of the big oak (leaves 56 ft).
 *  For you: backhand hyzer, or forehand anhyzer. Midrange, low."
 */
export function describeShot(
  leg: ShotLeg,
  index: number,
  hand: Hand,
  usual: ThrowStyle,
): { headline: string; advice: string } {
  const { shot, fromFt, remainingFt } = leg;
  const verb = index === 0 ? 'Drive' : 'Then throw';
  const dist = fromFt !== null ? ` ${ft(fromFt)}` : '';
  const target = shot.target.trim() ? ` to ${shot.target.trim()}` : '';
  const left = remainingFt !== null ? (remainingFt < 15 ? ' (at the basket)' : ` (leaves ${ft(remainingFt)})`) : '';
  const headline = `${verb}${dist} ${CURVE_WORDS[shot.curve]}${target}${left}.`;

  const [best, alt] = throwOptions(shot.curve, hand, usual);
  let advice: string;
  if (shot.curve === 'straight') {
    advice = `For you: ${best.style} flat.`;
  } else if (shot.curve === 'roller') {
    // Rollers turn over toward the side opposite the natural fade.
    advice = `For you: ${best.style} roller.`;
  } else {
    advice = `For you: ${best.style} ${RELEASE_WORDS[best.release]}, or ${alt.style} ${RELEASE_WORDS[alt.release]}.`;
  }
  const extras = [shot.disc ? capitalize(shot.disc) : '', shot.height !== 'normal' ? `keep it ${shot.height}` : '']
    .filter(Boolean)
    .join(', ');
  if (extras) advice += ` ${extras}.`;
  return { headline, advice };
}

// ---------- player's-eye diagram geometry ----------

export type Point = { x: number; y: number };

/**
 * Project points into feet relative to the tee, rotated so the basket is straight up.
 * x grows to the right of the thrower, y grows toward the basket.
 */
export function teeFrame(tee: LatLng, basket: LatLng) {
  const heading = (bearingDegrees(tee, basket) * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((tee.lat * Math.PI) / 180);
  return (p: LatLng): Point => {
    const east = (p.lng - tee.lng) * mPerDegLng * FEET_PER_METER;
    const north = (p.lat - tee.lat) * mPerDegLat * FEET_PER_METER;
    // Rotate so `heading` points up: right-of-thrower is heading + 90°.
    return {
      x: east * Math.cos(heading) - north * Math.sin(heading),
      y: east * Math.sin(heading) + north * Math.cos(heading),
    };
  };
}

/**
 * Bezier control point for a flight from a to b that finishes toward `curve`.
 * A disc that finishes left starts out to the right, so the bow is on the right.
 */
export function flightControlPoint(a: Point, b: Point, curve: Curve): Point {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (curve === 'straight' || curve === 'roller') return mid;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Unit normal pointing to the thrower's right of the a->b direction.
  const right = { x: dy / len, y: -dx / len };
  const bow = 0.25 * len * (curve === 'left' ? 1 : -1);
  return { x: mid.x + right.x * bow, y: mid.y + right.y * bow };
}

/** Compass words for how far a photo's facing is from the line to the basket. */
export function facingCheck(photoHeading: number, from: LatLng, basket: LatLng): string | null {
  const toBasket = bearingDegrees(from, basket);
  const off = ((photoHeading - toBasket + 540) % 360) - 180;
  if (Math.abs(off) <= 30) return null;
  return `Photo faces ${Math.abs(Math.round(off))}° ${off > 0 ? 'right' : 'left'} of the basket.`;
}
