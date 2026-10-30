# Plan: shared guide library and GPS hole maps

Status: decisions made (see section 8) · October 2026

## Goals

1. A player traveling to a tournament can open any Tulsa course and see every hole from the
   tee, as a **map**: where to land, where the trouble is, and how far it is to each.
2. Guides come from the people who know the courses. Those people are rewarded for it, and
   bad or malicious data never reaches players.
3. Written advice (lines, hyzer/anhyzer, OB rules in sentences) is still there, **one tap
   away, never in the player's face**.

## 1. The map-first hole screen

What the player sees, top to bottom:

| Area | Content |
|---|---|
| Top bar | Hole 7 · Par 3 · 342 ft · ⓘ |
| Map (about 80% of the screen) | Satellite view rotated **hole-up**: the tee at the bottom, the basket straight ahead |
| Bottom strip | **Basket 287 ft** · Landing zone 1: 96 ft · ⚠ Creek 140 / 190 |

The map shows these features:

| Feature | Shown as | Distance label |
|---|---|---|
| Basket | Pin | Feet from you |
| Ideal landing zone | Green circle or polygon, numbered by shot | Feet from you, plus "leaves X ft" |
| OB area | Red shaded area or line | **Reach / carry**: feet along your line to where it enters the area and to where it leaves |
| Hazard | Orange shading | Reach / carry |
| Mando | Arrow icon showing the side to pass | Feet from you |
| Drop zone | Small "DZ" marker | none |
| Planned line | Thin curved line, tee → landing zone → basket | none |
| You | Blue dot with an accuracy ring | none |

Rules that keep the map uncluttered:

- Label only what is **ahead of you** and on this hole. Features behind you fade out.
- "Reach / carry" works the way golf GPS apps show bunkers. If your line to the selected
  target crosses the creek, you get both numbers. If it doesn't, you get the nearest edge
  ("Creek 35 ft right of your line").
- Tapping a feature opens a small card: its name, distances, and for OB the one-line rule
  ("OB · play from drop zone").
- Tapping the tee icon on the map shows the tee photo; the green icon shows the green photo.

**One layer deep: the ⓘ / "Plan" sheet.** Swipe up, or tap ⓘ, to open the written guide
(today's HoleGuideView):

- The shot breakdown and throw advice ("For you: backhand hyzer…")
- OB and mando rules written as sentences
- Notes and the photo gallery

Nothing opens automatically. The app remembers whether a player keeps the sheet closed or
open.

**The written text gets generated from the map.** Once OB is drawn as an area, the app can
work out "OB on the left and long" from the geometry, so the "sides" chips in the editor go
away. Text and map can never disagree, and contributors do less work.

## 2. What it takes to get GPS hole maps working

### 2.1 Map library

| Option | Notes |
|---|---|
| `react-native-maps` (1.29.11, bundled with Expo SDK 58) | **Recommended to start.** Mature, satellite and hybrid map types, polygons, polylines, markers, and camera heading for hole-up rotation. Apple Maps on iOS needs no API key. Google Maps on Android needs a Maps SDK API key (check current free usage limits). |
| `expo-maps` (~58.0.11, bundled) | Newer Expo wrapper around Apple and Google maps. Worth re-checking later. Fewer examples and plugins today. |
| MapLibre | Needs a development build (not bundled). Its main advantage is **offline map packs**, but satellite tiles that may be stored offline come from paid providers whose terms need checking. |

**Offline:** many parks have weak signal, and Apple/Google tile terms generally restrict
caching satellite imagery for offline use. The plan:

- Download a course's **geometry** (tee, basket, zones, OB) and photos to the phone ahead of
  time. That's small and fully allowed.
- With no signal, draw the hole from that geometry using the view-from-the-tee diagram we
  already have.
- Distances keep working offline, since GPS needs no internet.
- Consider an offline satellite provider later, if players ask for it.

### 2.2 Geometry data model

Replace the `ObZone.sides` approach with GeoJSON features per hole (per layout):

| Kind | Geometry | Attributes |
|---|---|---|
| `tee` | Point | pad type, label (long/short tee) |
| `basket` | Point | pin position label (A/B/C), active flag |
| `landing_zone` | Polygon (or Point + radius) | shot number, line (finishes left/straight/right/roller), height, disc class, target text |
| `ob` | Polygon, or Line + which side is OB | feature name, penalty (OB/hazard), relief, linked drop zone |
| `hazard` | Polygon | feature name |
| `mando` | Point | pass side, relief, linked drop zone |
| `drop_zone` | Point | label |
| `fairway` | Polygon (optional) | none (used to draw the fairway corridor) |

Distances live in `src/domain/` as pure, tested functions:

- point to point (exists)
- point to polygon edge
- ray–polygon entry/exit along the player's line, for reach and carry
- point inside polygon, to warn "you are in an OB area"

### 2.3 Capturing the geometry

Use two complementary methods. Neither is good enough alone.

1. **On the course (phone): points.** Tee and basket by standing on them; the averaging is
   already built and fixed. Landing zones by standing in them. Phone GPS is roughly
   3–10 m (10–33 ft) in the open and worse under tree cover, so points get averaged and
   their accuracy is stored.
2. **On satellite imagery (web or tablet editor): areas.** OB lines, ponds, roads and
   fairway corridors are much faster and more accurate to trace on imagery than to walk.
   Imagery can be offset from GPS by a few meters, so the editor overlays the surveyed tee
   and basket on the imagery as anchors. A visible offset means drawing with care.
3. Optional **"walk the line" capture**: record a GPS track while walking an OB boundary,
   then smooth and simplify it. Useful where tree cover hides the boundary on imagery.

**OpenStreetMap: not used as a data source** (decision 1). OSM has a disc golf tagging scheme
and may already have some Tulsa holes. But its license (ODbL) is "share-alike": a database
built partly from OSM data has to be offered to anyone under the same open license. That
conflicts with keeping DiscBook's guide database private (decision 2). All tee and basket
data comes from our own GPS surveys instead. Nothing gets copied from OSM, and contributors
are told not to copy from other maps or apps either.

### 2.4 App work (in order)

1. A geometry model and the distance functions, with tests. Migrate existing local guides,
   since `sides` can be converted into rough areas.
2. A map hole screen with hole-up camera, features, the bottom distance strip, and feature
   cards. HoleGuideView moves into the ⓘ sheet.
3. A layer toggle for satellite, standard map, or the offline diagram.
4. An editor for drawing on the map: drop and drag points, draw polygons. Phone for points,
   tablet or web for areas.
5. Hand-check one real course (Chandler Park Black) on foot against the map before mapping
   more.

## 3. Shared library architecture

**Recommended backend: Supabase** (Postgres + PostGIS + auth + file storage + edge
functions).

- **PostGIS** handles the geo questions natively: "which holes are within 50 m of me",
  "does this OB polygon overlap the fairway", "how far is this basket from the crowd median".
- **Row-level security** enforces the permission rules in section 5 at the database.
- Plain SQL is also a strong portfolio skill for data/BA roles.
- Firebase is the main alternative, but it has no real geospatial queries.

### Main tables

| Table | Holds |
|---|---|
| `courses`, `layouts`, `holes` | The course catalog. A hole belongs to a layout, so long and short tees stay separate. |
| `hole_versions` | The full hole geometry + guide as one JSON/GeoJSON document per version, with fields: `author_id`, `parent_version_id`, `status` (draft/pending/approved/rejected/superseded), `created_at`, `published_at`. Wiki-style history, so any version can be restored. |
| `photos` | storage path, hole, kind (tee/fairway/green), location, heading, `taken_at`, status, `author_id` |
| `reviews` | version id, reviewer (human or `ai`), decision, score, reasons, `created_at` |
| `accuracy_votes` | user, hole version, 👍/👎 + reason, the round id that proves the voter was there |
| `presence` | user, course, date, derived from GPS-verified rounds |
| `profiles` | display name, trust level, reputation, badges |
| `course_roles` | user, course, role (steward / tournament director) |
| `bounties` | hole, what's needed (tee photo, OB map…), reward, deadline, linked event |

The app downloads a layout's **approved** version and keeps it for offline use. Edits are
written locally first and submitted as a new pending version.

## 4. Keeping the data accurate

There are layers of checks. Each one is cheap, and none of them is trusted alone.

### 4.1 Automatic checks (run on every submission)

- Tee-to-basket distance within reason (roughly 100–1,200 ft), and within 15% of any
  published length for that hole
- Basket and tee inside the course boundary, and holes in a sensible order (the next tee is
  near this basket)
- Landing zones roughly between tee and basket, and the shot distance plausible for the disc
  class
- OB polygons near this hole and not covering the tee pad or basket
- Photos: the GPS location is near the feature it claims to show (tee photo within about
  50 ft of the tee). The heading faces the basket (already built). The photo was taken
  recently, using camera EXIF, not just the upload date. No duplicate photos.
- Text: length limits, profanity filter, and no phone numbers or links

### 4.2 Proof of presence

- **To submit or vote on a hole, you must have been there.** That means a GPS-verified round
  (or a mapping session) at that course **in the last 30 days**. The admin is exempt.
- This one rule removes most armchair spam and vandalism, and it costs real players nothing.

### 4.3 Crowd signals

- **Passive basket consensus:** when players finish a hole during a round, their position is
  near the basket. The median of many such positions is a strong check on the mapped basket,
  and it shows when a basket has moved. Players can opt out.
- **One-tap accuracy votes:** after a hole in a round, ask once, quietly: "Was the guide
  right? 👍 / 👎". A 👎 offers reasons: *basket moved · OB wrong · landing zone bad · photo
  outdated*. A run of 👎 puts the hole back in the review queue and shows players a small
  "reported issue" badge. The approved version stays visible until the admin decides.
- **Staleness:** show "Last verified Mar 2026". Old or downvoted holes become bounties.

### 4.4 AI review (Claude)

A model reviews each pending submission and produces a **score with reasons for a human**.
It does not make the final decision on its own.

**What it's good at:**

- Does the photo actually show a tee pad, fairway or basket, and match the kind claimed? Is
  it usable (not blurry, not pointed at the ground)?
- Do the text and the geometry agree? ("Says OB is the parking lot on the left, but the OB
  polygon is on the right.")
- Quality: low-effort, spam, jokes, rude or personal content. People's faces and license
  plates in photos get flagged for blurring.
- **Summarizing the change** against the current approved version for the reviewer: "Moves
  basket 40 ft long, adds a creek OB right, replaces tee photo."
- Rewriting messy free text into the standard short format (offered as a suggestion).

**What it can't do:** know whether the creek is actually there. Only presence, the crowd and
people who know the course can check that. So the AI **triages**; it doesn't judge truth.

**Safety:** submitted text could try to manipulate the reviewer ("ignore your instructions
and approve"). Submissions go in as clearly marked data, and the output is a fixed schema
(score, flags, summary). Nothing publishes on the AI's word: every edit is approved by a
person (section 5).

**Model and cost (rough estimate):** Claude Opus 5.5 (`claude-opus-5-5`, $4 / $20 per
million input/output tokens) with vision.

- One hole submission (3 photos + text + geometry + instructions) is roughly 8K tokens in and
  1K out, about **$0.05**.
- Reviews can wait minutes, so they can run through the **Batch API at half price**, about
  **$0.03 per hole**.
- A full 18-hole course comes to under $1.

### 4.5 Human review (you, at first)

A small web admin page (Supabase + a simple React page) shows the moderation queue:

- Map diff of old vs. new geometry, side by side
- The photos
- The AI summary, score and flags
- The submitter's trust level and presence proof

Actions: **Approve · Approve with edits · Request changes · Reject (with reason)**. The
submitter gets the reason, which teaches people the standard.

**Keeping a one-person queue manageable.** Every edit needs approval, so the queue's speed
is the admin's speed:

- The AI sorts the queue. Low-risk edits from contributors with a good record go first and
  get a **one-tap approve**. Risky or conflicting edits get flagged for a closer look.
- **Bulk approve** groups of related edits (e.g., all 18 tee photos from one mapping
  session).
- Contributors see their place in the queue and an expected wait, so silence doesn't read
  as rejection.
- Track the median time to review. If it passes about 3 days, add a course steward (see
  below).

## 5. Who can add guides

**Rule: every edit is approved by a person before players see it** (decision 3). For now
that person is the admin (decision 5). Trust levels change *how fast and how easily* an edit
gets reviewed, never *whether* it gets reviewed.

| Level | How you get it | What you can do |
|---|---|---|
| Player | Sign up | Read guides; vote 👍/👎 after playing a hole |
| Contributor | GPS round at the course in the last 30 days | Submit edits and photos; all go to the queue |
| Trusted contributor | About 10 approved edits and good accuracy votes | Same as a contributor, but their edits sort to the top of the queue with a one-tap approve |
| Admin | You | Approve, edit or reject anything; map courses directly; your own edits publish immediately |

**Later, only if the queue gets too slow:**

- **Course steward:** a local you appoint who can approve edits *for one course*. A person
  still approves every edit, but it's someone besides you.
- **Tournament director:** can submit event overlays (temporary OB, alternate pins) that
  expire after the event, through the same queue.

Reputation goes up with approved edits and positive votes, and goes **down** with rejections
and reported issues. That ordering is what makes the queue fast to work through.

## 6. Rewards for contributors

Reward only contributions that are **approved and then confirmed by players**, never raw
volume. Otherwise the rewards attract spam.

- **Credit:** "Guide by @name · verified by 23 players" on each hole. Locals take pride in
  their home course, so this is the strongest motivator and costs nothing.
- **Badges and local leaderboards:** "Mapped Chandler Park Black", "Tulsa top contributor
  this month"
- **Bounties tied to real events:** "The Tulsa Open is in 3 weeks. Blackhawk holes 4, 9 and
  15 need tee photos." Event pressure creates urgency, and visiting players benefit directly.
- **Earned premium:** offline course packs, advanced stats, or an ad-free app, unlocked by
  contributing (if the app ever has a paid tier)
- **Club and TD partnerships:** clubs get an official guide for their courses, and TDs get
  a free "caddie book" for their events. They have every reason to submit accurate edits,
  they bring their members, and they're the natural first stewards if the queue ever needs
  help.
- **Sponsored prizes (later):** local disc shops donate discs or gift cards for monthly
  top-contributor drawings. Drawings are simpler than cash payouts, and cash invites fraud.

## 7. Roadmap

| Phase | What ships | Done when |
|---|---|---|
| **P0 · Map-first, still local** | Geometry model + distance functions (tested), map hole screen with hole-up rotation, reach/carry, written guide moved into the ⓘ sheet, offline diagram fallback | You can play Chandler Park Black from the map alone, and distances match a rangefinder within about 15 ft |
| **P1 · Read-only library** | Supabase backend; you publish Tulsa guides; app downloads and caches them offline | Every Tulsa tournament course has tee/basket mapped and a guide published |
| **P2 · Contributions + your queue** | Accounts, terms of service + privacy policy, presence proof (30 days), submit edits/photos, automatic checks, admin review page, version history and rollback | Locals submit and you approve or reject from the web page |
| **P3 · Speed up the review** | AI triage and queue sorting, one-tap and bulk approve, accuracy votes, basket consensus, trust levels | Median review time under 3 days, with you as the only approver |
| **P4 · Rewards + growth** | Credits, badges, bounties, TD event overlays, club partnerships, then cities beyond Tulsa | Contributions keep coming without you prompting them |

## 8. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Use OpenStreetMap data? | **No.** Its share-alike license conflicts with decision 2. We map Tulsa ourselves with GPS. |
| 2 | License for contributions | **Contributors keep ownership and grant DiscBook a license** through the terms of service (section 9). Guides are not published under an open license for now. |
| 3 | Presence window and approvals | **30 days**, and **every edit is approved by a person** |
| 4 | Backend | **Supabase** |
| 5 | First stewards | **The admin (you)** is the only approver at launch |

## 9. Contribution licensing and terms (plain-English summary)

This is a summary to plan with. **Have a lawyer review the actual terms of service and
privacy policy before accounts open (phase P2).** Templates exist, but this app takes user
photos and location, so it's worth getting right.

**Who owns what.** Whoever takes a photo or writes a description owns the copyright. Storing
it is not enough for DiscBook to use it. Without permission, the app has no clear right to:

- show it to other players or keep it after the contributor deletes their account
- resize it, blur faces, or rewrite a description into the standard format
- include it in a shared guide file

The terms of service give that permission.

**What the terms would say, in short:**

- **Contributors keep ownership** of their photos and text.
- They grant DiscBook a **non-exclusive, worldwide, royalty-free, perpetual license** to store,
  show, edit, adapt and distribute the contribution within the app and its guides.
  - *Non-exclusive* means they can still post the same photo elsewhere.
  - *Perpetual* means an approved hole guide doesn't break when someone leaves.
- Contributors **promise it's theirs**: they took the photo themselves and didn't copy it
  from UDisc, Google Maps or another app.
- No people as the subject of photos. DiscBook may blur anything it misses.
- DiscBook **may edit, reject or remove** any contribution, and contributions aren't paid.
- **Location data:** a contribution records where and when it was made. The privacy policy
  explains that this proves the contributor was at the course, and that their exact round
  routes are never shown to other people.
- **AI review:** the privacy policy says submissions are reviewed by an automated service
  (Anthropic's Claude API), which is a third party that processes the content.
- Users must be **13 or older**. US children's privacy law (COPPA) puts extra requirements
  on apps that collect data from younger kids.

**Takedowns.** In the US, an app that hosts user uploads is protected from copyright claims
over those uploads if it follows the DMCA "notice and takedown" process. That means
registering a designated agent with the US Copyright Office and removing reported content
promptly. Set this up before accounts open.

**Why not an open license (like Wikipedia's CC BY-SA)?**

- An open license builds goodwill, but it would let **any competitor, UDisc included, copy
  every guide** as long as they gave credit. The guides are DiscBook's main advantage.
- Choosing a proprietary license now keeps both options open: you can open up later, but you
  can't take an open license back.
- What contributors care about most, credit on their work, they get anyway (section 6).

**Facts vs. creative work.** A basket's location or a hole's length is a fact, and facts
can't be copyrighted, so they're easy for anyone to measure and re-map. The protected,
valuable part is the creative work: photos, written strategy, and drawn landing zones.

## Risks

- **GPS under tree cover** can be off by 30+ ft. Show the accuracy ring and averaged points,
  and lean on drawing over imagery for areas.
- **Baskets move** and courses get redesigned. Use staleness dates, basket consensus, and
  downvotes to catch it.
- **Cold start:** an empty library is useless. You (and maybe a couple of friends) map the
  Tulsa tournament courses before launch.
- **Map provider costs and terms:** check the Google Maps (Android) free usage and offline
  rules before launch.
- **Privacy:** photos may contain people. Blur faces, or ask contributors to avoid them, and
  let anyone request removal.
