# Bar Path Tracker — v1 Design Spec

**Date:** 2026-06-23
**Status:** Approved (design) — pending implementation plan
**Author:** JP + Claude

## Summary

A client-side web app that analyzes barbell lifting form by tracking the bar
path in a user-supplied video. The user taps the barbell plate on the starting
frame; the app tracks that point through the clip using optical flow, traces the
path over the video, and lets the user export the overlaid video.

This is a proof-of-concept. The goal is to validate that bar-path tracking is
accurate enough on JP's own squat/deadlift footage for him to replace the paid
apps he currently uses (WL Analysis, Iron Path).

## Goals (v1)

- Track the bar path for squats and deadlifts (OHP later, same mechanism).
- Tap-to-select the bar, then auto-track through the clip.
- Show the traced path overlaid on the video with a scrub control.
- Export the overlaid video as a downloadable file (replaces JP's current
  screen-record-then-delete workflow).
- Run entirely in the phone browser — no backend, no upload, no cost.

## Non-goals (v1 — explicitly deferred)

- Body / pose tracking (back angle, hip-vs-knee timing, bar-over-midfoot). This
  is the planned v2, paired with a metrics-focused output.
- Machine-learning-based detection/analysis. Planned as a later phase/project;
  the v1 architecture must not preclude it.
- Fully automatic bar detection (v2 enhancement).
- Rep counting / per-rep numeric breakdowns (comes with v2 metrics).
- Native iOS/Android app, app-store distribution. (PWA install is a possible
  later add.)

## Users & context

- Single user (JP) for the PoC; he lifts regularly and already analyzes form.
- Primary device: phone browser. Author/dev machine: Windows.
- Typical input: 20–30s clips containing 3–6 reps, filmed from a fixed side
  angle (the standard way these lifts are filmed for path analysis).

## Architecture

**Approach: fully client-side (in-browser computer vision).** Static website,
no server.

**Stack:**

- Vite + TypeScript
- OpenCV.js (WASM) — Lucas-Kanade optical flow for point tracking
- HTML `<canvas>` — frame capture and overlay rendering
- MediaRecorder API — render/export the overlaid video
- Tailwind CSS — clean, mobile-first UI

**Rationale:** zero hosting cost (static deploy on Vercel/Netlify/GitHub Pages),
no video upload (privacy + no bandwidth wait), fast iteration. The optical-flow
logic ports cleanly to a Python/OpenCV backend later if accuracy or performance
ever demands it.

## Tracking pipeline (core)

1. User loads a video (file picker, or capture from phone camera).
2. User scrubs to the frame where the bar starts moving and **taps the
   plate/collar center**. The app records that pixel coordinate.
3. The app plays the video once, muted, capturing every frame in order via
   `requestVideoFrameCallback`. This is chosen deliberately over frame-by-frame
   `seek` (which is flaky in mobile browsers) and comfortably handles the
   ~600–900 frames in a 20–30s clip.
4. For each captured frame, OpenCV.js Lucas-Kanade optical flow advances the
   tracked point from its previous position to the current one. The app stores
   `(x, y, timestamp)` per frame.
5. The ordered list of points is the bar path.

**Robustness:** when tracking confidence drops (bar leaves frame, heavy motion
blur), the app pauses and prompts the user to re-tap to re-acquire the point.
Reliable recovery beats brittle automation.

## UI flow

Single-screen app with four states:

1. **Upload** — choose/capture a video.
2. **Set start point** — scrub to the start frame, tap the plate.
3. **Processing** — progress indicator while frames are tracked.
4. **Result** — video with the bar path traced over it, a scrub slider, a
   vertical reference line at the start x-position, and a **Download video**
   button.

Mobile-first, uncluttered, Tailwind styling.

## Metrics (light for v1)

- **Horizontal drift** — how far the bar wandered forward/back from the vertical
  reference line (the primary squat/deadlift path tell).
- **Full path trace** — reps visually distinguishable in the overlay.

Optional (only if trivial): tap two points across a plate to set a pixel→cm
scale, so drift can read in centimeters. Not a v1 blocker.

Deeper numeric metrics are deferred to v2 alongside body tracking.

## Export

Render the overlaid video via `<canvas>` + MediaRecorder into a downloadable
file. Output format follows best phone-browser support (likely `.webm` or
`.mp4`).

## Known technical risks

- **Mobile MediaRecorder support** varies across iOS Safari / Android Chrome.
  Validate export early. Fallback: a clean in-browser overlay the user can
  screen-record — never worse than the current workflow.
- **Tracking accuracy across gyms/lighting/angles.** Mitigated by the re-tap
  recovery flow and by tuning against JP's real footage.

## Success criteria

On JP's own squat and deadlift clips:

- The traced path visibly matches the real bar movement.
- The exported overlaid video is usable.

Validation uses JP's actual footage. He will provide short raw clips (a squat
and a deadlift), plus at least one matched raw + app-annotated pair to serve as
a ground-truth reference for comparing tracker output.

## Future directions (not in scope)

- v2: body/pose tracking + metrics-focused output (back angle, bar-over-midfoot,
  hip/knee timing).
- Later: ML-based detection/analysis as its own phase or project.
- Possible PWA install, OHP support, automatic bar detection.
