# DiscBook

A disc golf scoring app built around three ideas UDisc doesn't have:

1. **Golf-style handicaps** instead of a player rating. Scratch (0.0) = a 1000-rated PDGA player.
2. **Course Ratings and Slopes from PDGA-sanctioned rounds**, adjusted for weather. A layout with
   Course Rating 57.2 on a par 54 plays about 3 strokes over par for a scratch player.
3. **A yardage book**: per-hole notes (landing zones, disc and line, green complexes, OB) that
   carry over from round to round, with optional GPS pins you can measure to.

4. **Hole guides for players who've never seen the course**: tee, fairway and green photos
   taken from where a player stands, a shot-by-shot breakdown (distance, landing zone, line),
   and out-of-bounds rules written in plain English. A local writes the guide once and shares
   it as a single file. Traveling players import it before a tournament weekend.

It also shows a live **distance in feet** to the selected hole's basket (or to any pinned
landing zone) during a round. The first release covers the 21 courses in Tulsa, OK.

Built with Expo (React Native + TypeScript), Expo Router, expo-location and expo-sqlite.
All data stays on the device.

## Running it

```bash
npm install
npm start          # then press i / a, or scan the QR code with Expo Go
npm test           # unit tests for the rating/handicap/weather math
npm run typecheck
```

## How the numbers work

All the math is in `src/domain/`: plain TypeScript with no React imports, unit-tested in
`src/domain/domain.test.ts`.

### Course Rating (`courseRating.ts`)

For each sanctioned round (event + round number + layout):

1. Regress score on player rating across the rated players in that round.
2. Read the line off at rating 1000. That is the round's **Scratch Scoring Average (SSA)**:
   what a scratch player would have shot that day.
3. The slope of the line (strokes per 100 rating points) measures how much the layout
   separates good players from average ones.

Then for each layout:

- **Course Rating** = mean over rounds of (SSA − weather strokes). This is what a scratch
  player should shoot in ideal conditions. Compare it to par to see how hard the layout plays.
- **Slope** = 113 × (strokes per 100 points ÷ 10), clamped to 55–155 like golf. 113 means
  roughly 10 rating points per stroke, the usual PDGA rule of thumb.

Layouts with no sanctioned data are shown as *provisional*: rated at par with slope 113.

### Weather model (`weather.ts`)

Weather strokes per 18 holes = Σ coefficient × feature, with these features:

| Feature | Definition |
|---|---|
| wind | mph of sustained wind above 5, × exposure factor (wooded 0.6 / mixed 1.0 / open 1.4) |
| gust | mph by which gusts exceed sustained wind by more than 5, × exposure |
| cold | °F below 55 |
| heat | °F above 90 |
| rain | 1 if precipitating |
| rainRate | inches per hour |

The coefficients are fitted from the same sanctioned rounds using a **fixed-effects
regression**. Each layout's average is subtracted out first, so harder courses don't get
mistaken for worse weather. Then **ridge regression shrinks the coefficients toward a prior**,
so they stay sensible while data is thin. Until the pipeline has run, the app uses the prior.

A round's estimate is snapped to a **weather bucket**:

| Bucket | Strokes |
|---|---|
| Ideal | 0 |
| Mild | +1 |
| Challenging | +2 |
| Tough | +3 |
| Severe | +4 |
| Extreme | +5 |

With this, −3 in Ideal conditions and +2 in Extreme give the same differential.

### Handicap (`handicap.ts`)

This follows golf's World Handicap System:

- **Adjusted score**: each hole is capped at net triple bogey, or par + 5 for a player
  without an index yet.
- **Score Differential** = (113 / Slope) × (Adjusted − Course Rating − Weather bucket),
  scaled to 18 holes. This lets 9-, 18- and 24-hole layouts mix.
- **Handicap Index** = the average of the best 8 of the last 20 differentials. Players with
  fewer than 20 rounds use the WHS table, and an index appears after 3 rounds.
- **Course Handicap** = Index × Slope / 113 + (Course Rating − Par).
- **Starting index from a PDGA rating**: (1000 − rating) / 10. A UDisc rating converts first
  using PDGA ≈ UDisc × 2 + 500.
- **Practice rounds** don't count toward the handicap. They're for building the yardage book.

## Hole guides (`src/domain/guide.ts`)

Guides are written in absolute terms, and each reader sees them translated for themselves:

- **Lines**: the author records which way the shot *finishes* as seen from the tee (left,
  straight, right, roller), plus height, disc class and a landing target. The reader's
  handedness and usual throw (set on the Handicap tab) turn that into a release.
  - A left-finishing line reads as "backhand hyzer, or forehand anhyzer" for a right-handed
    backhand player.
  - The same line reads as "forehand hyzer, or backhand anhyzer" for a left-handed forehand
    player.
  - A hyzer is ranked ahead of an anhyzer because it's the more reliable shot.
- **Distances**: if the author pins a landing zone with GPS, the shot length and the distance
  left to the basket are measured. Otherwise the entered distance is used.
- **Out of bounds**: the author picks the feature (water, road, fence, or their own words),
  the sides (left, right, short, long), OB or hazard, and the relief (last in bounds, drop
  zone, re-tee). The app writes the rule as a sentence: *"The creek is OB on the left and
  long, past the basket. If you go out, play from the drop zone (by the footbridge), +1
  stroke."* Mandatories work the same way.
- **Player's-eye photos**: tee, fairway and green photos record where they were taken and
  which way the phone was facing. The reader sees "120 ft to the basket" on a fairway shot,
  and a warning if a "tee view" doesn't actually face the basket.
- **View-from-the-tee diagram**: the hole is redrawn with the basket straight ahead and the
  reader's left on the left. It shows each planned flight, the landing zones and the OB sides.
  It's to scale once the tee and basket are mapped.

**Sharing**: *Share guide* writes one `.discbook.json` file with the guides, tee and basket
GPS, and the photos (base64 JPEG), then opens the share sheet. *Import guide* checks the file
(`src/domain/guidePack.ts`) and replaces the guide for the holes it covers. It never touches
the player's personal yardage book notes. There's no server yet, so sharing works by AirDrop,
text, or a tournament group chat.

## Feeding in PDGA data

`scripts/rate-courses.ts` turns round results into `src/data/generated/ratings.json`, which
gets bundled into the app.

```bash
npm run rate -- --in data/pdga/rounds.csv
```

The input is a CSV with these columns:

```
event_id,event_date,round,layout_id,pdga_number,player_rating,score[,wind_mph,gust_mph,temp_f,precip_in_hr]
```

`layout_id` matches the ids in `src/data/tulsa.ts`, for example `chandler-park-black:main`. If
the weather columns are blank, the script pulls historical conditions from the free
Open-Meteo archive and caches them in `data/pdga/weather-cache.json`.

To try the pipeline without real data:

```bash
npm run simulate                       # writes SYNTHETIC data/pdga/rounds.sample.csv
npm run rate -- --in data/pdga/rounds.sample.csv --out /tmp/ratings.json --no-fetch
```

On the simulated events, the pipeline recovers the planted course ratings within about 0.2
strokes. Don't ship ratings computed from the sample.

**Getting real results:** PDGA event results pages list each player's rating and round
scores. For bulk access, the PDGA has a members API (it requires approval). Check the PDGA's
terms before scraping.

## Course data status

Course names and hole counts come from UDisc's Tulsa listing (October 2026). **Per-hole
pars, distances and tee/basket GPS are not seeded yet.** They're filled in by playing: on the
round screen, *Set tee here* and *Set basket here* average a few seconds of GPS fixes and save
them on the device. Par is editable on the same screen.

## Layout

```
src/
  app/            Expo Router screens (tabs: Courses, Rounds, Handicap; plus course, round, notes, book)
  domain/         Pure TS: geo, course rating, weather model, handicap (+ tests)
  data/           Tulsa course seed + bundled ratings output
  services/       Open-Meteo weather, photo capture/storage, guide pack share/import
  ui/             Shared components (hole guide view, view-from-the-tee diagram, chips)
  db/             SQLite schema/migrations and queries
scripts/          Rating pipeline and synthetic data generator (run with Node 22+)
```

## Roadmap ideas

- A shared guide library on a server, so players can search "Blackhawk guide" instead of
  passing files around, with ratings and author credit
- Short video flyovers from the tee, and per-tournament layout guides (temporary OB, alternate pins)

- Real par, length and GPS for the Tulsa layouts, plus alternate layouts (short and long
  tees, pin positions)
- Hole stroke index, ranked by scoring average, so handicap strokes go on the hardest holes
- Ingest real PDGA results for Tulsa events
- Sync and accounts, sharing yardage books with doubles partners, and a map view with
  satellite imagery
- Fit the slope and points-per-stroke relationship from data, instead of the fixed 10
