# Pose Spike — Design

**Date:** 2026-06-29
**Branch:** `spike/pose` (throwaway — delete after the verdict)
**Status:** approved, building

## Why

Before committing ~1 week to Phase 1 body cues (see `docs/body-analysis-exploration.md`),
de-risk the one assumption everything rests on: **does MediaPipe Pose Landmarker run fast
enough on JP's iPhone Safari, inside our actual video pipeline, to be usable?**

The report estimated ~15 FPS on a mid iPhone with single-thread WASM + WebGL and no
SharedArrayBuffer. That's an estimate. This spike replaces it with a measured number on
JP's real device and real footage.

## Definition of done

One number + one sight, on JP's iPhone Safari:

1. Load a real side-on deadlift clip.
2. See a **skeleton** (landmark dots + bone lines) drawn over the body through the rep.
3. Read a live **FPS** + per-frame-time readout.

**Go/no-go bar:** ≥ ~12–15 FPS with a stable, sensible skeleton on a side view = GO for
Phase 1. Slideshow speed or a garbage skeleton on side-on = fall back to TF.js MoveNet
Lightning, or rethink scope.

## Scope

In:
- `src/pose.ts` — lazy loader mirroring `src/opencv.ts`: on first call, load MediaPipe
  Tasks Vision + the Pose Landmarker model, return a `detect(video, timestampMs)` →
  landmarks. Lazy so it costs the main app nothing until opened.
- A **hidden** "Pose test" screen, reachable by URL hash `#pose` only — NOT wired into the
  normal upload → setup → process → result flow. It: reuses the upload control to get a
  clip, plays it through an rVFC loop (same shape as `capture.ts`), calls `pose.detect()`
  per frame, draws dots + bones on a transparent overlay canvas, and paints a running FPS +
  frame-time readout.

Out (explicitly NOT in this spike):
- No coaching, cues, cm conversion, body-type logic, or saving.
- No form claims of any kind. Feasibility measurement only.
- No vendoring — load MediaPipe from CDN for the spike. (If we go to Phase 1, vendor it
  same-origin like OpenCV, for offline + no third-party dependency.)

## Guardrails honored

Measures feasibility only; emits zero form judgments. The report's hard rules (body type
only *widens tolerances*, never generates verdicts; never claim spine/3D from 2D) apply to
Phase 1, not to this measurement-only spike — but nothing here violates them.

## Testing / verification

- This is integration code (loads WASM, runs on `<video>`), the same category as
  `opencv.ts` / `tracker.ts` which the project deliberately does NOT unit-test (jsdom can't
  run WASM/canvas/video). So no Vitest here.
- Verification is **on-device**: JP opens `#pose` on his iPhone Safari (Private tab) on the
  deployed branch, loads a clip, and reads the FPS + watches the skeleton.
- `npm run build` must stay green; `npm test` (existing 19 tests) must stay green.

## Risks / unknowns to surface while building

- iOS Safari WASM/WebGL init gotchas (analogous to the OpenCV threading/thenable traps).
- MediaPipe CDN model URL + version pinning.
- Whether the rVFC loop + MediaPipe per-frame inference cooperate or fight for the main
  thread. Flag anything that smells like the OpenCV main-thread-block problem.
