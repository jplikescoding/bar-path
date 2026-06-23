# Tracking prototype (validation)

A throwaway Python reference that validates the v1 tracking approach on JP's real
footage before building the web app. The algorithm (Lucas-Kanade pyramidal
optical flow) ports directly to OpenCV.js `calcOpticalFlowPyrLK` in the browser.

## Run

```
python -m pip install opencv-python numpy
python track_lk.py
```

Edit the paths at the bottom of `track_lk.py` to point at your clips. Outputs
overlay + path-plot images and prints stats.

## Method

- Seed point = the bar end the user would tap (auto-detected via the red plate
  hub for the deadlift; manual coordinate for the squat).
- Track a cluster of ~40 features in a 45px radius around the seed; the bar
  point each frame = median of the cluster (rigid-body robust).
- Forward-backward error check (<2px) drops bad points; anchor refreshes each
  frame so it adapts.
- LK params: `winSize=(31,31)`, `maxLevel=3`, 30 iters / eps 0.01.

## Findings (2026-06-23)

| Clip | Angle | Frames | Result |
|------|-------|--------|--------|
| Squat (brown, raw) | level, side-on | 305 | Clean near-vertical path, 2 reps consistent, ~5% horizontal drift. No tracking loss. |
| Deadlift (dl10, raw) | low / solo | 284 | Clean multi-rep tracking, ~3-4 reps consistent, no loss. Path is strongly diagonal — pure low-angle perspective slant, not real bar drift. |

**Conclusions:**

1. Optical flow tracks JP's real lifts cleanly and stably across full multi-rep
   sets — no drift-away. Core approach is de-risked.
2. The low-angle slant is real and large, confirming the v1 tap-a-vertical-
   reference tilt correction. See the design spec's "Camera angle & geometry".

Note: the magenta clip was not used — it has a commercial app's path line baked
into the pixels, which would contaminate optical flow. Use raw clips only.
