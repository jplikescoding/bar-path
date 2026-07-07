# Phase 3 — Side-On Squat Coaching Behind an Angle Prompt — Design

Date: 2026-07-07
Status: approved for build (HANDOFF "Next build cycle" item 3; report §7 Phase 3)

## Problem

The app coaches deadlifts only. The design report (`docs/body-analysis-exploration.md`)
is explicit about why squats were deferred: JP's squat clips are filmed END-ON, and
five of six squat faults are sagittal — invisible end-on (report §3.1, risk #2:
"do not pretend to coach squat lean/depth from the current angle"). Report §7 Phase 3
unlocks squat coaching **only behind a side-on angle prompt**: depth, bar-over-midfoot,
and hips-shoot-first cues, all side-on. It also explicitly excludes lumbar-rounding
verdicts and any "you can't squat deep" claims.

HANDOFF item 3 adds: facing-detection from heel/toe landmark geometry may upgrade cue
copy (e.g. "forward off midfoot" instead of generic drift) — the report's own MVP cue
wording (§5.3) is "bar drifted N cm **forward** off your midfoot".

## Decision

**One unobtrusive prompt on the setup screen; squat pose-coaching only when the user
confirms the clip is side-on.** Deadlift stays the default and its flow is byte-for-byte
today's behavior — a deadlift user never sees a new question.

- **Prompt (setpoint.ts):** a chip row `Deadlift · Squat` under the existing hint.
  Tapping **Squat** reveals the angle question inline (same hint area, one more tap):
  *"Squat coaching reads a side-on view — filmed from the side?"* with chips
  `Side-on` / `Not side-on`. The answer is stored, persists with the lift, and gates
  everything below. Unanswered = not confirmed = gated (silence over a wrong number).
- **Gate (processing.ts):** `squat && sideOn !== true` → the pose pass and all pose
  cues are **skipped entirely** (no midfoot cue, no hip cue, no depth, no skeleton).
  Bar path, side-to-side gauge, and velocity remain — they are honest end-on data.
  The result screen shows one quiet note: *"Film from the side to unlock squat
  coaching"* — never a wrong number (report §5.3 output rule).
- **Side-on squat analysis** (all pure, in `coach.ts`, unit-tested):
  1. **Bar-over-midfoot** — reuse `analyzeBarDrift` unchanged; squat-specific card
     copy on the result screen ("out of the hole" / balance framing instead of
     "off the floor").
  2. **Hips-shoot-first out of the bottom** — `analyzeHipRise` gains
     `opts.lift: 'deadlift' | 'squat'` (default `'deadlift'`, existing behavior
     untouched). Squat anchoring differs: the judged ascent starts at the **deepest
     bar point** (the hole; last near-bottom point before the rise, so a pause in
     the hole anchors at the exit) and ends at the bar's highest point **after** it.
     The deadlift anchoring (global top, last bottom before it) misreads a squat
     clip, which starts at standing height. Same ratio math, same 1.5× default
     (a heuristic awaiting JP's clip library, like the rest).
  3. **Depth — a measurement, not a verdict.** New `analyzeSquatDepth`: at the
     deepest bar moment, the median hip-vs-knee vertical gap over a small window
     (`DEPTH_WINDOW_S`), from visible hip (23/24) and knee (25/26) landmarks.
     Output: hips **below / level / above** knee height plus cm when
     plate-calibrated. Rendered as a **neutral chalk readout card — never amber,
     never fired, no prescriptions** ("hit depth!" is exactly the report's
     false-positive trap, §4.3: sub-parallel depth is normal for many builds).
     Landmark-honest copy: "knee level", measured at the deepest bar point.
  4. **Facing detection** — `detectFacing(poseFrames)`: median of per-frame
     toe-minus-heel normalized x (landmarks 29–32, already in `poseFrames`).
     Toes right of heels = facing right. Needs a minimum frame count and a margin
     (`FACING_MARGIN`) or returns null — end-on feet point at the camera and the
     delta collapses, so this self-gates. When known AND the drift reference is the
     pose midfoot, `analyzeBarDrift` labels the peak drift `forward`/`backward`
     and the card copy upgrades: "Bar drifted 6.2 cm **forward** off midfoot".
     Applies to deadlifts too (the report words the MVP cue this way).

## Hard rules honored (report §4.4/§5.4/§8 — non-negotiable)

- Lift type / setup only **gates or widens** — it never generates verdicts. Depth is
  a measurement card in data colors; no "fix" language anywhere new.
- NO spine-rounding or safety claims; NO 3D joint angles from 2D video (facing uses
  x-ordering only; z stays dropped).
- At most ONE amber cue per review: the existing hip-demotes-if-drift-nudged pattern
  is untouched; the depth card is never amber by construction.
- Silence is a valid output: every new function returns null on weak pose data.

## Persistence

`AppData` += `liftType: 'deadlift' | 'squat'` (default `'deadlift'`),
`sideOn: boolean | null` (null = never asked), `depthCue: SquatDepthCue | null`.
`SavedAnalysis` gains the same as optional fields (older records lack them → reopen
defaults to deadlift/null, exactly today's behavior). Library subtitle prefixes
squat records ("squat · drift 8.4cm") so saved lifts are tellable apart.

## Out of scope (cut, with reasons)

- **Knee valgus** (report keeps it a *separate, optional front-on* capture) — a whole
  second capture flow; not in this slice.
- **Build slider** — still deferred pending JP's UX call (HANDOFF item 2); squat
  thresholds ship build-independent, tunable via `coach.ts` consts.
- **Forward-lean / trunk-angle anything** — the report's #1 false positive; excluded.
- **Auto side-on detection** (plate-face circularity) — the manual prompt is the
  report's own Phase 3 mechanism; auto-detection is a later refinement.

## Verification

- TDD in `test/coach.test.ts` (+ state/librarySupport tests): failing test first for
  `detectFacing`, drift direction, squat hip-rise anchoring, `analyzeSquatDepth`,
  new state fields, subtitle. `npm test` + `npm run build` green every commit.
- Screens are not unit-tested (project convention); final validation is JP on iPhone
  Safari (Private tab) with a real **side-on squat** clip — checklist in HANDOFF.
