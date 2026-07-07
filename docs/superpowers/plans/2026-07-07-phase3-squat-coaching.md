# Phase 3 — Side-On Squat Coaching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Squat support behind an unobtrusive side-on prompt: lift-type chips on setup; when a squat is confirmed side-on, run the pose pass and emit squat-worded midfoot + hip-timing cues plus a neutral depth readout; when not side-on, gate all pose coaching off with a quiet note. Facing-detection from heel/toe upgrades drift copy to "forward/backward off midfoot" (spec: `docs/superpowers/specs/2026-07-07-phase3-squat-coaching-design.md`).

**Architecture:** All new decision math is pure and lives in `coach.ts` (TDD, Vitest): `detectFacing`, `analyzeSquatDepth`, a `lift` option on `analyzeHipRise`, a `facing` option on `analyzeBarDrift`. Screens only collect the prompt answer (`setpoint.ts`), gate/wire (`processing.ts`), and word the cards (`result.ts`). New per-lift fields thread `state.ts` → `result.ts` persist → `librarySupport.ts` → `library.ts` reopen, exactly like `hipCue`/`poseFrames`.

**Tech Stack:** Vite + TypeScript strict, Vitest for pure logic only (screens are NOT unit-tested — jsdom can't do video/canvas). Design language: color = data, amber = action; at most ONE amber cue per review.

## Global Constraints

- HARD RULES (report): lift setup only gates/widens, never generates verdicts; no spine/safety claims; no 3D from 2D; depth card is measurement-only and never amber.
- Deadlift flow must be byte-for-byte unchanged (default `liftType: 'deadlift'`, no new questions, same cues/copy).
- Tuning knobs are named consts in `coach.ts` with comments (like `POSE_WARMUP_S`).
- Every commit: `npm test` + `npm run build` green.

---

### Task 1: Pure coach logic (TDD)

**Files:**
- Modify: `test/coach.test.ts` (failing tests first)
- Modify: `src/coach.ts`

- [ ] **Step 1:** Failing tests for `detectFacing(poseFrames)`: toes right of heels → `'right'`; left → `'left'`; delta under `FACING_MARGIN` (end-on) → null; too few visible frames → null.
- [ ] **Step 2:** Failing tests for `analyzeBarDrift` `opts.facing`: pose-midfoot ref + peak drift toward the toes → `direction: 'forward'`; toward the heels → `'backward'`; plate-tap ref or no facing → no direction.
- [ ] **Step 3:** Failing tests for `analyzeHipRise` `opts.lift: 'squat'`: squat-shaped path (start high → descend → hole → ascend) judged from the hole exit; good rep not fired; good-morning rep fired with `frameT` in window; pause-in-the-hole anchors at the exit; deadlift default behavior untouched (existing tests stay green).
- [ ] **Step 4:** Failing tests for `analyzeSquatDepth`: hips below knee at the deepest bar point → `where:'below'` + `dropCm` when calibrated; above → `'above'`; inside the level band → `'level'`; null when hip/knee landmarks are missing near the bottom; null on empty path.
- [ ] **Step 5:** Implement all four in `coach.ts` (consts: `FACING_MARGIN`, `DEPTH_WINDOW_S`, `DEPTH_LEVEL_BAND_FRAC`, with tuning comments). `npm test` green.
- [ ] **Step 6:** Commit: `feat(coach): facing detection, squat hip-rise anchoring, measurement-only squat depth`.

### Task 2: State + persistence threading (TDD)

**Files:**
- Modify: `test/state.test.ts`, `test/librarySupport.test.ts` (failing first)
- Modify: `src/state.ts`, `src/librarySupport.ts`, `src/screens/library.ts`

- [ ] **Step 1:** Failing tests: `initialData()` has `liftType:'deadlift'`, `sideOn:null`, `depthCue:null`; `driftSubtitle` prefixes `squat · ` for squat records and stays unchanged for deadlift/legacy.
- [ ] **Step 2:** Implement: `LiftType` in `coach.ts`; `AppData` + `initialData` fields; `SavedAnalysis` optional `liftType`/`sideOn`/`depthCue`; `library.ts` reopen defaults (`?? 'deadlift'`, `?? null`) and subtitle call.
- [ ] **Step 3:** `npm test` + `npm run build` green. Commit: `feat(state): lift type + side-on answer + depth cue persisted with saved lifts`.

### Task 3: Setup prompt (screen — no unit tests)

**Files:**
- Modify: `src/screens/setpoint.ts`

- [ ] **Step 1:** Chip row `Deadlift · Squat` (deadlift active by default, amber border/color when active — same pattern as the skeleton chip). Tapping Squat reveals the inline side-on question chips (`Side-on` / `Not side-on`) in the same row area; answers set `app.data.sideOn`. Switching back to Deadlift clears the question (sideOn → null).
- [ ] **Step 2:** Build green; commit: `feat(setpoint): unobtrusive lift-type + side-on prompt (deadlift default, zero-tap unchanged)`.

### Task 4: Processing gate + wiring (screen)

**Files:**
- Modify: `src/screens/processing.ts`

- [ ] **Step 1:** `const gated = liftType==='squat' && sideOn !== true` → skip the entire pose pass and leave `cue`/`hipCue`/`depthCue`/`poseFrames` null when gated. Otherwise: existing pass, then `detectFacing(poseFrames)` → `analyzeBarDrift(..., { facing })`; `analyzeHipRise(..., { lift: liftType })`; `analyzeSquatDepth(...)` for squats only.
- [ ] **Step 2:** Tests + build green; commit: `feat(processing): side-on gate skips pose for unconfirmed squats; facing + squat cues wired`.

### Task 5: Result cards (screen)

**Files:**
- Modify: `src/screens/result.ts`

- [ ] **Step 1:** Lift-aware copy: squat drift body ("out of the hole" / balance framing), squat hip card wording; drift headline gains `forward/backward` when `cue.direction` is set.
- [ ] **Step 2:** Depth card (squat only): neutral eyebrow "Depth", chalk readout (below/level/above knee height, cm when calibrated), tap seeks the deepest bar moment, never amber. Placed after the hip card.
- [ ] **Step 3:** Gated-squat quiet note card in place of cue cards: "Film from the side to unlock squat coaching…". Persist `liftType`/`sideOn`/`depthCue` in `persist()`.
- [ ] **Step 4:** Tests + build green; commit: `feat(result): squat cue copy, forward/backward drift wording, neutral depth readout, side-on gate note`.

### Task 6: Docs + PR

- [ ] **Step 1:** HANDOFF.md: Phase 3 section, device-test checklist (side-on squat clip: prompt → cues; end-on squat: gate note; deadlift unchanged; save/reopen), move item 3 out of "Next build cycle".
- [ ] **Step 2:** Push branch; open PR against master titled `feat(coach): Phase 3 — side-on squat coaching behind angle prompt`; body: scope, decisions, cuts, on-device validation list. DO NOT merge.
