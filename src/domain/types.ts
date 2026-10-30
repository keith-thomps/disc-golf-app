// Core domain types shared by the app, the rating pipeline scripts and tests.
// Keep this file free of React Native imports so Node can run it directly.

export type LatLng = { lat: number; lng: number };

/** How exposed a layout is to wind. Wind costs more strokes on open courses. */
export type WindExposure = 'wooded' | 'mixed' | 'open';

export type Hole = {
  number: number;
  par: number;
  lengthFt?: number;
  tee?: LatLng;
  basket?: LatLng;
};

export type Layout = {
  id: string;
  name: string;
  holes: Hole[];
  windExposure: WindExposure;
};

export type Course = {
  id: string;
  name: string;
  city: string;
  state: string;
  /** Approximate course location. Optional until the course is surveyed. */
  location?: LatLng;
  layouts: Layout[];
  /** Where the seed data came from and what still needs verification. */
  dataNotes?: string;
};

/** Conditions during a round, in US units (what players actually think in). */
export type Weather = {
  windMph: number;
  gustMph: number;
  tempF: number;
  /** Precipitation in inches per hour. 0 = dry. */
  precipInPerHr: number;
};

/** One player's score in one PDGA-sanctioned round. Input to course ratings. */
export type SanctionedScore = {
  eventId: string;
  eventDate: string; // YYYY-MM-DD
  round: number;
  layoutId: string;
  pdgaNumber?: string;
  playerRating: number;
  score: number;
};

/** The rating published for a layout, analogous to a golf Course Rating + Slope. */
export type LayoutRating = {
  layoutId: string;
  /** Expected score for a scratch (1000-rated) player in ideal conditions. */
  courseRating: number;
  /** 113 = average spread between scratch and bogey players. Range 55-155. */
  slope: number;
  roundsUsed: number;
  /** True when no sanctioned data exists and the rating falls back to par. */
  provisional: boolean;
};
