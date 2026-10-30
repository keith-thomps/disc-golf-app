import { Image, Text, View, useWindowDimensions } from 'react-native';
import type { GuidePhoto } from '../db/repo.ts';
import { distanceFeet } from '../domain/geo.ts';
import {
  describeHoleSummary,
  describeMando,
  describeOb,
  describeShot,
  facingCheck,
  shotLegs,
  type HoleGuide,
} from '../domain/guide.ts';
import type { Hole } from '../domain/types.ts';
import type { ThrowProfile } from '../lib/throwing.ts';
import { photoUri } from '../services/photos.ts';
import { HoleDiagram } from './HoleDiagram.tsx';
import { colors, ui } from './theme.ts';

type Props = {
  hole: Hole;
  guide: HoleGuide | null;
  photos: GuidePhoto[];
  profile: ThrowProfile;
  /** Compact mode for the round screen: tee photo and text, no diagram. */
  compact?: boolean;
};

const KIND_LABEL = { tee: 'From the tee', fairway: 'From the fairway', green: 'At the green' } as const;

function PhotoBlock({ photo, hole }: { photo: GuidePhoto; hole: Hole }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width - 32, 600);
  const warn = photo.heading !== null && photo.at && hole.basket ? facingCheck(photo.heading, photo.at, hole.basket) : null;
  const toBasket = photo.at && hole.basket ? Math.round(distanceFeet(photo.at, hole.basket)) : null;
  return (
    <View style={{ gap: 4 }}>
      <Image source={{ uri: photoUri(photo.fileName) }} style={{ width: w, height: w * 0.75, borderRadius: 10, backgroundColor: colors.border }} />
      <Text style={ui.muted}>
        {KIND_LABEL[photo.kind]}
        {toBasket !== null && photo.kind !== 'tee' ? ` · ${toBasket} ft to the basket` : ''}
        {photo.caption ? ` · ${photo.caption}` : ''}
      </Text>
      {warn ? <Text style={[ui.muted, { color: colors.accent }]}>{warn}</Text> : null}
    </View>
  );
}

export function HoleGuideView({ hole, guide, photos, profile, compact }: Props) {
  const { width } = useWindowDimensions();
  const lengthFt = hole.tee && hole.basket ? distanceFeet(hole.tee, hole.basket) : hole.lengthFt ?? null;
  const teePhotos = photos.filter((p) => p.kind === 'tee');
  const otherPhotos = photos.filter((p) => p.kind !== 'tee');

  if (!guide && photos.length === 0) {
    return <Text style={ui.muted}>No guide for this hole yet.</Text>;
  }

  const legs = guide ? shotLegs(hole.tee, hole.basket, guide.shots) : [];
  const hand = `${profile.hand === 'right' ? 'RH' : 'LH'}${profile.usual === 'backhand' ? 'BH' : 'FH'}`;

  return (
    <View style={{ gap: 12 }}>
      {teePhotos.slice(0, compact ? 1 : undefined).map((p) => (
        <PhotoBlock key={p.id} photo={p} hole={hole} />
      ))}

      {guide ? (
        <>
          <Text style={ui.h2}>{describeHoleSummary(guide, hole.par, lengthFt)}</Text>

          {legs.length ? (
            <View style={{ gap: 8 }}>
              {legs.map((leg, i) => {
                const t = describeShot(leg, i, profile.hand, profile.usual);
                return (
                  <View key={i} style={{ gap: 2 }}>
                    <Text style={ui.body}>
                      <Text style={{ fontWeight: '700' }}>{i + 1}. </Text>
                      {t.headline}
                    </Text>
                    <Text style={[ui.body, { color: colors.primary }]}>{t.advice}</Text>
                  </View>
                );
              })}
              <Text style={ui.muted}>Throw advice is written for you ({hand}). Change it on the Handicap tab.</Text>
            </View>
          ) : null}

          {guide.ob.length || guide.mandos.length ? (
            <View style={{ gap: 4, borderLeftWidth: 4, borderLeftColor: '#D64545', paddingLeft: 10 }}>
              <Text style={[ui.body, { fontWeight: '700' }]}>Out of bounds & rules</Text>
              {guide.ob.map((z, i) => (
                <Text key={`ob-${i}`} style={ui.body}>
                  {describeOb(z)}
                </Text>
              ))}
              {guide.mandos.map((m, i) => (
                <Text key={`m-${i}`} style={ui.body}>
                  {describeMando(m)}
                </Text>
              ))}
            </View>
          ) : null}

          {guide.notes.trim() ? <Text style={ui.body}>{guide.notes.trim()}</Text> : null}

          {!compact && (legs.length || guide.ob.length) ? (
            <HoleDiagram guide={guide} tee={hole.tee} basket={hole.basket} width={Math.min(width - 64, 360)} />
          ) : null}
        </>
      ) : null}

      {!compact ? otherPhotos.map((p) => <PhotoBlock key={p.id} photo={p} hole={hole} />) : null}
    </View>
  );
}
