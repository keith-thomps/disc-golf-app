// Generate a SYNTHETIC rounds CSV for exercising the rating pipeline end to end.
// The numbers are made up. Never ship ratings computed from this file.
//
//   npm run simulate && npm run rate -- --in data/pdga/rounds.sample.csv --out /tmp/ratings.json --no-fetch

import { writeFileSync } from 'node:fs';

// Deterministic PRNG so the sample is reproducible.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());

const layouts = [
  { id: 'chandler-park-black:main', trueCR: 53 },
  { id: 'chandler-park-moose-run:main', trueCR: 57 },
  { id: 'blackhawk:main', trueCR: 59 },
  { id: 'hunter-park:main', trueCR: 55 },
];

const lines = ['event_id,event_date,round,layout_id,pdga_number,player_rating,score,wind_mph,gust_mph,temp_f,precip_in_hr'];
let ev = 1000;
for (const l of layouts) {
  for (let e = 0; e < 12; e++) {
    const eventId = `SIM${ev++}`;
    const date = `2025-${String(1 + (e % 12)).padStart(2, '0')}-15`;
    for (const round of [1, 2]) {
      const wind = Math.round(3 + rand() * 20);
      const gust = Math.round(wind + rand() * 12);
      const temp = Math.round(35 + rand() * 60);
      const precip = rand() < 0.15 ? 0.05 : 0;
      const wx = 0.15 * Math.max(0, wind - 5) + 0.05 * Math.max(0, temp < 55 ? 55 - temp : 0) + (precip ? 1.2 : 0);
      for (let p = 0; p < 40; p++) {
        const rating = Math.round(820 + rand() * 210);
        const score = Math.round(l.trueCR + wx + (1000 - rating) / 10 + gauss() * 2.5);
        lines.push([eventId, date, round, l.id, 100000 + p, rating, score, wind, gust, temp, precip].join(','));
      }
    }
  }
}
writeFileSync('data/pdga/rounds.sample.csv', lines.join('\n') + '\n');
console.log(`Wrote data/pdga/rounds.sample.csv (${lines.length - 1} synthetic scores)`);
