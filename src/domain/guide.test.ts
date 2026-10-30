import { describe, expect, it } from 'vitest';
import {
  describeMando,
  describeOb,
  describeShot,
  facingCheck,
  flightControlPoint,
  releaseFor,
  shotLegs,
  teeFrame,
  throwOptions,
} from './guide.ts';
import { PACK_FORMAT, parsePack } from './guidePack.ts';

const tee = { lat: 36.1371, lng: -96.0642 };
const north300 = { lat: 36.1371 + 300 / 364000, lng: -96.0642 }; // ~300 ft north
const east300 = { lat: 36.1371, lng: -96.0642 + 0.001 }; // ~295 ft east

describe('throw translation', () => {
  it('maps a left-finishing line to each hand and throw', () => {
    expect(releaseFor('left', 'right', 'backhand')).toBe('hyzer');
    expect(releaseFor('left', 'right', 'forehand')).toBe('anhyzer');
    expect(releaseFor('left', 'left', 'backhand')).toBe('anhyzer');
    expect(releaseFor('left', 'left', 'forehand')).toBe('hyzer');
    expect(releaseFor('straight', 'left', 'forehand')).toBe('flat');
  });

  it('prefers the throw that makes the line a hyzer', () => {
    expect(throwOptions('right', 'right', 'backhand')[0]).toMatchObject({ style: 'forehand', release: 'hyzer' });
    expect(throwOptions('left', 'right', 'forehand')[0]).toMatchObject({ style: 'backhand', release: 'hyzer' });
    expect(throwOptions('straight', 'right', 'forehand')[0].style).toBe('forehand');
  });
});

describe('shot breakdown', () => {
  it('measures pinned landing zones and what is left', () => {
    const lz = { lat: 36.1371 + 240 / 364000, lng: -96.0642 };
    const legs = shotLegs(tee, north300, [{ curve: 'left', height: 'normal', target: 'the gap', pin: lz }]);
    expect(legs[0].fromFt).toBeCloseTo(240, -1);
    expect(legs[0].remainingFt).toBeCloseTo(60, -1);
    const text = describeShot(legs[0], 0, 'right', 'backhand');
    expect(text.headline).toMatch(/^Drive 2\d\d ft curving left to the gap \(leaves \d+ ft\)\.$/);
    expect(text.advice).toBe('For you: backhand hyzer, or forehand anhyzer.');
  });

  it('uses entered distances when nothing is pinned', () => {
    const legs = shotLegs(undefined, undefined, [{ curve: 'right', height: 'low', disc: 'fairway', target: '', distanceFt: 320 }]);
    const text = describeShot(legs[0], 0, 'left', 'backhand');
    expect(text.headline).toBe('Drive 320 ft curving right.');
    expect(text.advice).toBe('For you: backhand hyzer, or forehand anhyzer. Fairway, keep it low.');
  });
});

describe('OB language', () => {
  it('writes OB, hazards and mandos in plain English', () => {
    expect(describeOb({ feature: 'the creek', sides: ['left', 'long'], penalty: 'ob', relief: 'drop-zone', dropZone: 'by the bridge' }))
      .toBe('The creek is OB on the left and long, past the basket. If you go out, play from the drop zone (by the bridge), +1 stroke.');
    expect(describeOb({ feature: 'water', sides: ['left', 'right', 'long', 'short'], penalty: 'ob', relief: 'last-in' }))
      .toBe('Water is OB all around. If you go out, play from where the disc last crossed in bounds, +1 stroke.');
    expect(describeOb({ feature: 'the pond', sides: ['right'], penalty: 'hazard', relief: 'last-in' }))
      .toBe('The pond is a hazard on the right: add 1 stroke and play from where the disc lies.');
    expect(describeMando({ object: 'the tall pine', passSide: 'right', relief: 'drop-zone' }))
      .toBe('Mandatory: the disc must pass to the right of the tall pine. If you miss it, play from the drop zone, +1 stroke.');
  });
});

describe("player's-eye geometry", () => {
  it('puts the basket straight up regardless of compass direction', () => {
    const f = teeFrame(tee, east300);
    const b = f(east300);
    expect(b.x).toBeCloseTo(0, 0);
    expect(b.y).toBeCloseTo(295, -1);
    // Something north of the tee is to the LEFT when facing east.
    expect(f(north300).x).toBeLessThan(-250);
  });

  it('bows a left-finishing flight out to the right', () => {
    expect(flightControlPoint({ x: 0, y: 0 }, { x: 0, y: 300 }, 'left').x).toBeGreaterThan(0);
    expect(flightControlPoint({ x: 0, y: 0 }, { x: 0, y: 300 }, 'right').x).toBeLessThan(0);
  });

  it('flags photos not facing the basket', () => {
    expect(facingCheck(5, tee, north300)).toBeNull();
    expect(facingCheck(90, tee, north300)).toBe('Photo faces 90° right of the basket.');
  });
});

describe('guide packs', () => {
  it('round-trips and rejects foreign files', () => {
    const pack = {
      format: PACK_FORMAT,
      version: 1,
      layoutId: 'blackhawk:main',
      courseName: 'Blackhawk',
      layoutName: 'Main',
      author: 'local',
      exportedAt: '2026-10-30',
      holes: [{ number: 1, par: 3, tee, basket: north300, guide: { shape: 'straight' }, photos: [{ kind: 'tee', jpegBase64: 'AAAA' }, { kind: 'bogus', jpegBase64: 'x' }] }],
    };
    const parsed = parsePack(JSON.stringify(pack));
    expect(parsed.holes[0].guide.shots).toEqual([]);
    expect(parsed.holes[0].photos).toHaveLength(1);
    expect(() => parsePack('{"hello":1}')).toThrow(/not a DiscBook guide/);
    expect(() => parsePack(JSON.stringify({ ...pack, version: 99 }))).toThrow(/newer version/);
  });
});
