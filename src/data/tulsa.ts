import type { Course, Hole, Layout, WindExposure } from '../domain/types.ts';

/**
 * Tulsa, OK courses. Names, cities and hole counts are from UDisc's Tulsa listing
 * (fetched 2026-10-30). Per-hole par, length and tee/basket GPS are NOT seeded yet:
 * holes default to par 3 and get surveyed in the app ("Set tee" / "Set basket"),
 * which saves real coordinates on the device. Wind exposure defaults to "mixed"
 * until someone who knows the course sets it.
 */

const SOURCE = 'Name/holes from UDisc Tulsa listing. Pars and GPS need survey.';

function holes(count: number, par = 3): Hole[] {
  return Array.from({ length: count }, (_, i) => ({ number: i + 1, par }));
}

function layout(courseId: string, name: string, count: number, windExposure: WindExposure = 'mixed'): Layout {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return { id: `${courseId}:${slug}`, name, holes: holes(count), windExposure };
}

/** Extra layouts (alternate tees/pins) are added here as they get surveyed. */
function course(id: string, name: string, holeCount: number, extraLayouts: [string, number][] = []): Course {
  return {
    id,
    name,
    city: 'Tulsa',
    state: 'OK',
    layouts: [layout(id, 'Main', holeCount), ...extraLayouts.map(([n, c]) => layout(id, n, c))],
    dataNotes: SOURCE,
  };
}

export const TULSA_COURSES: Course[] = [
  course('postoak-lodge', 'POSTOAK Lodge', 19),
  course('blackhawk', 'Blackhawk', 18),
  course('chandler-park-black', 'Chandler Park Black (Bears Lair)', 18),
  course('chandler-park-moose-run', 'Chandler Park – Moose Run', 18),
  course('riverside-park', 'Riverside Park', 18),
  course('hunter-park', 'Hunter Park', 18),
  course('oral-roberts', 'Oral Roberts University', 9),
  course('obrien-park', "O'Brien Park DGC", 18),
  course('redhawk', 'Redhawk DGC', 24),
  course('mcclure-park', 'McClure Park DGC', 18),
  course('reed-park', 'Reed Park DGC', 9),
  course('course-dovillio', 'Course Dovillio', 18),
  course('southwood', 'Southwood DGC', 9),
  course('ou-schusterman', 'OU Schusterman', 9),
  course('park-church-of-christ', 'Park Church of Christ', 9),
  course('zeigler-park', 'Zeigler Park', 9),
  course('maxwell-park', 'Maxwell Park', 9),
  course('hk-ymca-aceplace', 'H & K YMCA Aceplace', 9),
  course('stonebrook', 'Stonebrook DGC', 6),
  course('waterside-apartments', 'Waterside Apartments', 9),
  course('tcc-northeast', 'TCC Northeast', 9),
];

export const ALL_LAYOUTS: Layout[] = TULSA_COURSES.flatMap((c) => c.layouts);

export function findCourse(id: string): Course | undefined {
  return TULSA_COURSES.find((c) => c.id === id);
}

export function findLayout(layoutId: string): { course: Course; layout: Layout } | undefined {
  for (const c of TULSA_COURSES) {
    const l = c.layouts.find((x) => x.id === layoutId);
    if (l) return { course: c, layout: l };
  }
  return undefined;
}
