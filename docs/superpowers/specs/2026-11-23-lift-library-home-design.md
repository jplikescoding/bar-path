# Lift Library as Home — Design

Date: 2026-11-23
Status: draft — awaiting JP approval (builder check done)

## Intent / why

JP films lifts on his phone and uses Bar Path to re-learn and check form (straight
reference line, bar path, cues). Today the app opens on an upload screen and the
Library is a flat, secondary list; lifts saved in a Safari tab were silently erased
(Safari's 7-day storage eviction) — JP's months-old lifts are gone.

Goal: Bar Path is *the place his lifts live*. Open the app → see every analyzed lift,
filter it like a Strava activity feed (by lift type, by day/month), tap one to review.
Saved lifts must not quietly disappear.

JP's words: "have it all from one place like the app… filter by lift or by day or by
month… just a clean UI so I can get all the lifts." Think Strava activity types, but
no pace-style stats.

## Goals

1. **Library is the home screen.** App opens to the lift feed, not the upload screen.
2. **Filter by lift type** (All / Deadlift / Squat chips) and **by month**; combinable.
3. **Grouped by day**, newest first, with a day header per group.
4. **Dates = when the video was recorded**, not when it was saved (fallback: save time).
   Date is editable by hand.
5. **Optional weight + note** per lift, captured at save, editable later.
6. **Lifts don't get evicted:** request persistent storage; steer Safari-tab users to
   the Home Screen app.
7. **Navigation fixes:** Library ↔ Review has a Back path; "New" is reachable from home.

## Non-goals

- Backup/restore file, cloud sync, accounts, servers (JP chose option 1: originals stay
  in Photos; revisit backup if he starts deleting clips from Photos).
- Strava-style stats: no pace, PRs, streaks, charts, volume totals.
- Lift types beyond deadlift/squat (the analysis only supports these two).
- Moving lifts from Safari-tab storage into the Home Screen app (no backup path exists
  in this scope; see Migration).
- Changes to analysis/coaching, the result screen's cards, or the tracking pipeline.

## Anti-goals (would be a failure even if it "works")

- Saving becomes a chore: weight/note must be optional and never block a one-tap save.
- Clutter: the feed must stay a clean list — no dashboards, badges, or stat walls.
- Any risk to existing saved lifts (data loss on upgrade, records failing to open).

## Constraints

- 100% client-side, GitHub Pages, vanilla TS + Tailwind, screens in `src/screens/*`
  rendered via `App.go()` (no router/history). IndexedDB store `bar-path/analyses`.
- Primary target iPhone Safari, Home Screen (standalone) mode.
- Design identity: "Precision Instrument" — color = data, amber = action. One amber
  primary action per screen.
- Existing records must keep working: new fields are optional; absent → fallbacks.

## Approaches considered

1. **Persistent storage + Home Screen nudge now, backup later — CHOSEN (JP).**
   Fixes the eviction JP actually hit; originals stay in Photos so loss is recoverable
   by re-analysis. Smallest scope.
2. Also ship backup/restore to a file now. Safer if JP deletes clips from Photos, but
   ~a third more work and screens he'd rarely use. Deferred.
3. (Rejected) Cloud sync — needs a server/accounts; violates the no-backend constraint.

## Design

### Navigation

- App start → **Library** (was Upload). The hidden `#pose` entry is unchanged.
- Library header: title + amber **+ New** → Upload screen.
- Upload screen gains a quiet **← Lifts** back link to Library (replaces its "Saved
  lifts" button). Picking a file still resets state (PR #10) and goes to setpoint.
- Result screen, saved lift: **Library** button → becomes **← Lifts** (back to the feed,
  restoring the active filters and scroll position within the session). Result screen,
  fresh unsaved lift: Save / Export / New unchanged; after saving, the back path to
  Lifts appears (as today's Library button does).
- Filters + scroll position live in memory on `App` for the session only (not persisted).

### Library feed

```
 Lifts                        [ + New ]
 [ All ] [ Deadlift ] [ Squat ]   Nov 2026 ▾
 ─ Sat, Nov 22 ───────────────────────
 [thumb] Deadlift · 315 lb              ✎ ✕
         drift 3.1 cm
 [thumb] Deadlift
         drift 6.0 cm · "back felt round"
 ─ Tue, Nov 18 ───────────────────────
 [thumb] Squat · below parallel
```

- Lift chips: All (default) / Deadlift / Squat — same chip style as setpoint.
- Month control: "All time" (default) plus each month that has lifts, newest first.
  Native `<select>` styled as a chip is acceptable (builder's call).
- Grouping: by local calendar day of `liftDate` (below), day header "Sat, Nov 22"
  (add year when not the current year).
- Row: thumbnail, title line (lift type, plus weight if set), subtitle (summary;
  note excerpt truncated to one line if set). Tap → review.
- Summary (Claude's call): deadlift → existing drift text; squat → depth readout
  ("below/at/above parallel", measurement wording, never a verdict) when `depthCue`
  exists, else drift. The "squat ·" prefix is dropped — the title line carries lift type.
  Rename (✎) and delete (✕) stay; delete keeps today's behavior.
- The user-given name stays on the record and in the edit sheet but is no longer the
  row's main line — lift type + date carry identity (Strava-like). (Builder may show
  the name when it differs from the auto default.)
- Empty states: no lifts at all → today's empty card with **+ New**; filters match
  nothing → "No lifts match" + "Clear filters".

### Data model (`SavedAnalysis`, all optional, back-compatible)

- `recordedAt?: number` — ms epoch the video was recorded.
- `weightLb?: number | null` — optional, in pounds (JP: lb, one fixed unit, no toggle).
  Stored exactly as entered — no conversion, so no rounding drift.
- `note?: string` — optional free text.
- `liftDate(rec) = rec.recordedAt ?? rec.createdAt`; feed sorts and groups by
  `liftDate` desc. Pure helpers in `librarySupport.ts`, unit-tested.
- No IndexedDB schema/version bump needed (fields ride on the same object store).

### Recording date

- On file pick, read the video's recorded date from its metadata: prefer the Apple
  QuickTime key `com.apple.quicktime.creationdate` (local time with offset), else the
  `mvhd` box `creation_time` (seconds since 1904-01-01 UTC, ignore 0), else
  `File.lastModified` only if it is earlier than "now − 1 minute" (iOS often stamps the
  pick time), else none → falls back to save time.
- Parse only the needed boxes from the File (read the first/last few MB with
  `Blob.slice`; `moov` can be at either end). Pure parser in its own module,
  unit-tested on fixture bytes. Must never block or fail the upload: any error → none.
- **Unverified on device:** whether the iOS Photos picker hands Safari a copy that keeps
  these fields. Device test decides; the editable date covers failure.
- Carried in `AppData` (`recordedAt`) and saved with the record.

### Save flow (result screen)

The existing inline name editor grows two optional fields:

```
 [ Lift — Nov 22, 7:14 PM            ]   name (prefilled, as today)
 [ Weight (lb)   ] [ Date: Nov 22 ▾  ]   optional; date prefilled from recordedAt
 [ Note (optional)                    ]
 [ Save to library ] [ Cancel ]
```

- All extra fields optional; Save with them empty behaves like today.
- `inputmode="decimal"` for weight. Date uses a native date input.
- Editing later: the library ✎ action opens the same fields (name/weight/date/note)
  instead of the name-only inline rename.

### Keeping lifts safe

- On startup, if `navigator.storage?.persist` exists and storage isn't already
  persisted, call it (fire-and-forget; no UI on denial).
- Detect Safari tab vs Home Screen app: standalone =
  `navigator.standalone === true || matchMedia('(display-mode: standalone)').matches`.
- In a Safari tab, the Library shows a slim, non-amber info banner:
  "Lifts saved in Safari can be erased after 7 days. Add Bar Path to your Home Screen
  to keep them: Share → Add to Home Screen." Dismissible for the session only.
- No banner in the Home Screen app.

### Migration

- Existing records open and list normally: missing `recordedAt` → `createdAt`;
  missing weight/note → not shown.
- Lifts in Safari-tab storage do NOT appear in the Home Screen app (separate storage).
  JP's path: re-analyze originals from Photos in the Home Screen app. Mention this in
  the banner copy? No — keep it short; it's in the handoff notes.

## Testing

- Unit (vitest): `liftDate`, grouping by day, filter by lift/month, month list
  derivation, legacy record defaults, metadata date parser (fixture bytes for each
  source + garbage input).
- Headless e2e (local `scripts/`, gitignored): app opens on Library; + New → upload →
  ← Lifts; filters narrow the list; save with weight/note shows in the row.
- JP device checklist: Home Screen app opens on Library; banner appears in Safari tab
  only; a clip filmed on a known day files under that day (recording date works or
  falls back); weight/note save + edit; old lifts still open.

## Left to the builder

- Exact component markup/styling within the design identity; month control widget.
- Module boundaries for the metadata parser and feed helpers.
- Whether scroll restoration uses saved `scrollY` or scrolling to the last-opened row.

## Decided with JP

- Weight unit: lb, fixed, no kg/lb toggle (2026-11-23).
