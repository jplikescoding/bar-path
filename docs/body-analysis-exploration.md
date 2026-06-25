# Body Analysis & Body-Type-Aware Coaching — Feasibility & Design

*Decision-grade research + design brief for "Bar Path" — a 100% client-side, GitHub-Pages-hosted PWA (Vite + TypeScript strict, Tailwind), primary target iPhone Safari. No backend, no server inference. This document proposes nothing that requires a server.*

---

> ## ⬛ VERDICT — GO (reduced scope)
>
> | | |
> |---|---|
> | **Decision** | **GO** — for an on-device, 100%-client-side build, in reduced form. |
> | **Why (one sentence)** | The pose tech clears the no-SharedArrayBuffer constraint on iPhone Safari (MediaPipe Tasks Vision, WebGL, ~15 FPS, Apache-2.0), and the most reliable 2D fault — bar drift off midfoot — is already half-built from the existing bar path; the squat is *not* viable at the current end-on angle, so scope to the side-on deadlift. |
> | **Build this ONE feature first** | **Side-on DEADLIFT "bar drifted N cm off midfoot" cue** (INPUT→COMPUTATION→OUTPUT spec in §5.3 / §7 Phase 0–1). It reuses the existing bar path + plate scale, is build-independent (zero mis-coaching risk), and is the highest-confidence 2D fault in the app. |
> | **Pose pick** | MediaPipe Tasks Vision `@mediapipe/tasks-vision` **v0.10.x**, Pose Landmarker **Lite**. Runs on iPhone Safari with NO SAB: **yes**. ~3 MB runtime + ~3 MB model. ~15 FPS mid iPhone (sourced, not measured here — see §2.2). Fallback: TF.js MoveNet Lightning (2D-only, faster). |
> | **Do NOT ship** | Squat coaching at the current end-on angle; any lumbar-rounding "safe/unsafe" verdict; any "you can't squat this deep" claim; auto body-type measurement as the silent default. |
> | **Needs a code spike (UNKNOWN)** | Real FPS + processing-pass duration for Lite vs Full on a specific mid iPhone (12/13/SE-class); whether pose can ride the existing single decode pass or must be a 2nd pass; midfoot-landmark survival under shoes + plate occlusion. |

---

## 1. Executive summary & recommendation

**Yes — a useful, on-device, body-type-aware coach is shippable, but only in a deliberately reduced form, and the biggest unlock is a camera-angle change, not the pose model.**

The enabling technology exists and clears the hard constraints. **MediaPipe Tasks Vision "Pose Landmarker"** runs on iPhone Safari with **no SharedArrayBuffer** — it uses single-thread WASM plus a **WebGL** GPU delegate (not WebGPU, not threads), so it works under GitHub Pages' missing COOP/COEP headers. It is Apache-2.0 (commercial OK), adds roughly **6–9 MB** on top of the existing ~10 MB OpenCV, and runs at a realistic **~15 FPS on a mid-range iPhone**. That is enough for an *offline analysis pass over a trimmed clip* — which is exactly the app's existing model — even though it is not enough for a slick live preview.

The harder truth is **biomechanical, not technical**. Two facts dominate everything:

1. **The app currently films squats END-ON, which is the wrong angle for almost every squat fault worth coaching.** Depth, forward lean, bar-over-midfoot, and hips-shoot-first are all *sagittal* (side-on) measurements; end-on filming projects them onto the camera's invisible depth axis. The one squat fault that genuinely needs a front view — knee valgus — is the *only* one the current angle can see, and even that is confounded. **The deadlift, filmed side-on, is far more tractable** and should be where the body-analysis feature debuts.

2. **Forward lean, wide stance, "good morning" appearance, sub-parallel depth, and a higher deadlift hip start are NORMAL for many builds** (long femurs, short torso, stiff ankles). A naive coach that flags them is not just annoying — it is *wrong*, and tells long-limbed lifters to make their squat less safe. Auto-generated body-type cues are where this product can actively harm people if over-claimed.

**Recommendation:** Build pose as a **second, lazy-loaded analysis pass** (mirroring how OpenCV is already lazy-loaded), debut it on the **side-on DEADLIFT** with a single high-confidence cue — **bar drift away from the shins/midfoot**, which the existing bar path already measures and which a 450 mm plate can calibrate to centimeters. Layer a **toggleable skeleton-and-callout overlay** synced to the existing scrub control. Treat all body-type personalization as *raising the threshold for flagging* normal variation — never as generating prescriptive "fix your form" verdicts from pixels. Defer squat coaching until the app prompts a side-on angle. The honest reduced form is: **a side-on deadlift bar-and-tempo coach with a few build-aware guardrails, not a general "AI form checker."**

---

## 2. Can it run on-device in iOS Safari? (pose-tech verdict + fallback + the no-SAB reality)

### 2.1 The no-SAB reality (the constraint that eliminates most options)

GitHub Pages cannot emit `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers, so the page is **not cross-origin isolated**, so **`SharedArrayBuffer` is unavailable**, so **multi-threaded WASM does not work**. Any pose engine that *requires* threads is dead on arrival here. Usable execution backends are therefore: **single-thread WASM, WebGL, or WebGPU only.**

WebGPU is now shipping in iOS Safari, but **only from iOS/Safari 26** (it was flagged-off on iOS 17/18) ([web.dev](https://web.dev/blog/webgpu-supported-major-browsers), [App Developer Magazine](https://appdevelopermagazine.com/webgpu-in-ios-26/)). Worse, there is a **severe 2026 regression in ONNX Runtime Web's WebGPU/JSEP path on WebKit 26** — CPU pegs and memory balloons to multiple GB after inference, eventually crashing, on macOS Safari 26.2 and the iOS 26 simulator ([onnxruntime#26827](https://github.com/microsoft/onnxruntime/issues/26827)). **Conclusion: do not build the baseline on WebGPU.** Treat it as an optional future accelerator gated behind feature detection. The baseline must be WebGL/WASM, which covers iOS 17/18 mid-range phones too.

Critically, **MediaPipe Tasks Vision does NOT need SAB**: its `FilesetResolver` ships a *single-threaded* WASM runtime (SIMD / no-SIMD auto-selected) and its browser GPU delegate uses **WebGL with OffscreenCanvas, not WebGPU and not threads** ([fileset_resolver source](https://fossies.org/linux/mediapipe/mediapipe/tasks/web/core/fileset_resolver.ts.template), [MediaPipe #5826](https://github.com/google-ai-edge/mediapipe/issues/5826), [tasks-vision npm](https://www.npmjs.com/package/@mediapipe/tasks-vision)). This is precisely the GitHub-Pages-safe profile required.

### 2.2 Option-by-option evaluation

| Engine | Needs SAB/threads? | iOS backend | Added size (on top of ~10 MB OpenCV) | Mid-iPhone FPS | Landmarks | Loaded-bar / occlusion behavior | License |
|---|---|---|---|---|---|---|---|
| **MediaPipe Tasks Vision — Pose Landmarker** | **No** | single-thread WASM + **WebGL** delegate | ~3 MB runtime + model (Lite ≈3 / Full ≈6 / Heavy ≈26 MB) → **~6–9 MB** | **~15 FPS** (Lite higher, Full lower) | **33 kpts, 2D + soft 3D** (BlazePose-GHUM) | Best of the realtime options; occlusion-augmented training; still degrades on plate-occluded hips/bar-side wrist | **Apache-2.0 (commercial OK)** |
| **TF.js BlazePose (tfjs runtime)** | No | WebGL / WASM | ~5–8 MB | ~15 FPS — Google notes the **tfjs runtime is faster on iPhone/iPad** than MediaPipe runtime | 33 kpts, 2D + soft 3D | Same model family as above | Apache-2.0 |
| **TF.js MoveNet (Lightning/Thunder)** | No | WebGL / WASM | ~4–8 MB | **30–50+ FPS** (fastest, lightest) | **17 kpts, 2D only** | Fewer joints, no depth → weaker under bar occlusion; Thunder > Lightning | Apache-2.0 |
| **rtmlib-ts (RTMPose, WASM mode)** | No (WASM path) | WASM (WebGPU is Chrome-only here) | heavier | ~12–16 FPS WASM | 2D (RTMPose) | Higher top-end accuracy, more integration work | Apache-2.0 |
| **ONNX Runtime Web (raw)** | No if `numThreads=1` | single-thread WASM (slow); WebGL deprecated; **WebGPU crashes on WebKit 26** | runtime + bring-your-own model | **<10 FPS** single-thread WASM | depends on model | depends on model | runtime Apache-2.0; model varies |
| **YOLO11/12-pose (onnx-web)** | No | WASM/WebGPU | large | slow single-thread | 2D | accurate | **AGPL-3.0 → commercial blocked** without paid license |

Sources: model sizes/3D and FPS ([TF BlazePose-GHUM blog](https://blog.tensorflow.org/2021/08/3d-pose-detection-with-mediapipe-blazepose-ghum-tfjs.html), [pose_landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)); MoveNet specs/FPS/license ([TF MoveNet blog](https://blog.tensorflow.org/2021/05/next-generation-pose-detection-with-movenet-and-tensorflowjs.html), [MoveNet README](https://github.com/tensorflow/tfjs-models/blob/master/pose-detection/src/movenet/README.md)); ORT single-thread + WebKit-26 crash ([onnxruntime#26827](https://github.com/microsoft/onnxruntime/issues/26827)); rtmlib-ts ([dev.to](https://dev.to/gohdev_1/rtmlib-ts-real-time-pose-estimation-object-detection-in-browser-with-typescript-yolo12-48ep)); barbell-fitness accuracy ([JMIR 2026 e82412](https://mhealth.jmir.org/2026/1/e82412), [arXiv 2411.11548](https://arxiv.org/pdf/2411.11548)).

### 2.3 Ranked verdict + fallback

1. **MediaPipe Tasks Vision Pose Landmarker (Full for accuracy, Lite for FPS).** Best fit: SAB-free, WebGL on iOS across versions (not just 26), 33 keypoints with 2D + soft 3D, occlusion-trained, Apache-2.0. **Primary recommendation.**
2. **TF.js BlazePose (tfjs runtime)** — essentially the same model, documented as *faster on iPhone/iPad*. Strong alternative, especially if a tfjs stack is preferred.
3. **TF.js MoveNet Thunder/Lightning** — smallest, fastest, bulletproof on iOS, but **2D-only / 17 joints**. The right pick if maximum FPS / smallest payload matters more than depth.
4. rtmlib-ts (RTMPose WASM) — accuracy headroom, more work.
5. Raw ONNX Runtime Web — only for a custom model; WebGPU path unsafe today.
6. YOLO-pose — AGPL blocks commercial use; avoid.

**Fallback ladder:**
- *Tier 1 (robustness):* if the WebGL context fails to create on a given iPhone (a real, documented WKWebView failure mode — [MediaPipe #4499](https://github.com/google-ai-edge/mediapipe/issues/4499), [#5970](https://github.com/google-ai-edge/mediapipe/issues/5970)), drop the delegate to **CPU**, or switch to the **Lite** model to keep FPS up.
- *Tier 2 (engine):* if you need maximum FPS / minimum payload and can accept **2D-only**, fall back to **MoveNet Lightning** on WebGL.
- *Tier 3 (graceful degradation):* if pose fails entirely, the app still works — it already produces a bar path without pose. Body analysis is strictly *additive*.

> **The black-frame gotcha applies here too.** WebKit returns a black frame from `drawImage()` on a `<video>` that has never played. Pose inference must read from the **native, played `<video>` element during the processing pass** (or from frames already decoded by the existing `requestVideoFrameCallback` loop), exactly as the current tracker does — never from a paused, never-played video.

---

## 3. What's actually detectable (squat & deadlift)

The deciding factor is geometry, not model quality. A single camera is a perspective projection: the depth axis (toward/away from the lens) is collapsed, so **motion along the camera axis is nearly invisible**, **true 3D joint angles are unrecoverable** (monocular 3D pose is formally ill-posed — [ScienceDirect review](https://www.sciencedirect.com/science/article/pii/S0925231225019812), [PMC12589393](https://pmc.ncbi.nlm.nih.gov/articles/PMC12589393/)), out-of-plane limbs **foreshorten**, and far-side joints are **occluded** (far-side joint error ~1.5–2× near-side — [Drazan et al., PMC10635560](https://pmc.ncbi.nlm.nih.gov/articles/PMC10635560/)). When the camera *is* aligned to the plane of motion, sagittal hip/knee angles are genuinely usable (2D-vs-3D r ≈ 0.51–0.93, ICC ≈ 0.79–0.99; OpenCap smartphone RMSE 2–10° — [PMC10899431](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10899431/), [PubMed 21568816](https://pubmed.ncbi.nlm.nih.gov/21568816/), [metric.coach](https://www.metric.coach/articles/validation-of-a-commercially-available-mobile-application)).

**The 450 mm Olympic plate as scale:** filmed *side-on with its face to the camera*, it converts pixels→cm at its depth plane — fixing bar-path displacement, drift, ROM, and velocity in real units ([barbell-velocity autocalibration, PMC7866505](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7866505/)). It does **not** fix depth, does **not** add a 3D viewpoint for joint angles, and **degrades end-on** where the plate is seen edge-on/elliptical.

### 3.1 Squat (app currently films END-ON → most faults are on the invisible depth axis)

| Fault | Detectable? | Camera angle | Confidence | Needs body-type context? | 2D failure mode |
|---|---|---|---|---|---|
| Depth (hip crease below knee) | With caveats | **Side-on** (not end-on) | High side / Low end | **Yes** — femur/hip anthropometry shift the crease-knee relationship | Sagittal is the good case; hip-crease landmark soft under clothing; far-leg occluded; **end-on = depth axis = invisible** |
| Knee valgus (caving in) | With caveats | **Front/end-on** | Medium–High | Yes — stance width, hip width, toe-out; some valgus normal | Frontal valgus reliable in-plane but **visual neutral/valgus calls agree poorly with 3D**; confounded by hip/foot rotation ([PMC8805110](https://pmc.ncbi.nlm.nih.gov/articles/PMC8805110/)) |
| Hips shoot up first / "good morning" | With caveats | **Side-on** | High side / **invisible end-on** | Mild | Vertical in-plane side-on (good): compare hip vs shoulder/bar vertical velocity |
| Bar over midfoot | With caveats | **Side-on** | High side / **invisible end-on** | No (geometric) | Horizontal bar-vs-midfoot offset is sagittal; **end-on = pure depth = invisible**; existing bar path already gives it side-on |
| Forward lean (and when normal) | With caveats | **Side-on** | High side / **invisible end-on** | **Yes, strongly** — lean is anthropometry/load dependent; no fixed "normal" | Trunk-to-vertical is sagittal; **end-on it is depth motion = invisible** (the app's biggest current blind spot) |
| Heel rise | Not reliably | Side-on, low/tight on foot | Low | No | Small, gradual, occluded by plate/foot; resembles a phase not an event ([PMC11260980](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11260980/)) |

### 3.2 Deadlift (naturally side-on → the tractable lift)

| Fault | Detectable? | Camera angle | Confidence | Needs body-type context? | 2D failure mode |
|---|---|---|---|---|---|
| **Bar drifting away from body/shins** | **Reliably** | **Side-on** | **High** | No | In-plane horizontal bar-to-shin distance; comes straight from existing bar path; plate gives cm. **Strongest case in the app.** |
| **Hips rising too early** | **Reliably** | **Side-on** | **High** | Mild | Relative hip-vs-bar vertical velocity — both in-plane side-on |
| Bar over midfoot | With caveats | Side-on | High | No | Same as squat midfoot; invisible end-on |
| Full lockout achieved | With caveats | Side-on | Medium–High | Yes — end-range/hyperextension varies | Bar-top + hip-near-straight in-plane; "leaning back" can fake bar height; far leg occluded |
| Starting hip height too high/low | With caveats | Side-on | Medium | **Yes, strongly** — optimal start set by limb ratios | Hip height measurable in-plane, but the *judgment* is meaningless without anthropometry |
| Lumbar flexion / lower-back rounding | **Not reliably** | Side-on | Low–Medium | **Yes** | No discrete spine joints (hip→neck is one segment); shirt/arm occlusion; markerless spine RMSD large; **18–22° of lumbar motion occurs even while "holding neutral"** — the signal is smaller than the error ([Frontiers](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2025.1682991/full), [spine markerless study](https://www.sciencedirect.com/science/article/pii/S2405844024036272)) |

### 3.3 What 2D monocular fundamentally cannot do

- Recover **true 3D joint angles** (only the *projected* angle in the image plane).
- See motion **along the camera axis** (depth) — fatal for end-on squats.
- Beat **self-occlusion**: far hip/knee/ankle and the foot behind a plate are guesses.
- Detect **lumbar rounding safely** — pose models have no spine segments and the normal-vs-unsafe difference is below measurement error.
- Provide **metric joint angles or absolute depth** even with a scale plate (the plate only scales in-plane bar displacement).

> **Headline:** the app films the *one* squat fault that needs a front view (valgus, and even that imperfectly) while losing *all five* squat faults that need side-on. Deadlift, already side-on, is where to build.

---

## 4. Body-type coaching model

### 4.1 The unifying principle

Almost every "body-type" effect reduces to one constraint: **the bar (and combined center of mass) must stay over the midfoot or the lifter falls.** Torso angle, knee travel, stance, and depth are *downstream consequences* of satisfying that constraint with a given skeleton ([baysfitness](https://www.baysfitness.com/insights/squat-mechanics-long-femur-vs-short-femur), [crossfit science of squatting](https://www.crossfit.com/essentials/science-of-squatting)). There is therefore **no single ideal posture** — only a universal endpoint reached by different geometries.

### 4.2 What anatomy changes (evidence-grounded)

- **Femur length / femur:torso ratio — the dominant driver.** Longer femurs push the hips farther back to clear the knees, dragging the center of mass backward; the torso *must* lean forward to keep the bar over midfoot. This is geometric necessity, not preference ([Contreras](https://bretcontreras.com/how-femur-length-effects-squat-mechanics/), [Stronger By Science](https://www.strongerbyscience.com/how-to-squat/)). Taller/longer-limbed lifters adopt a smaller hip angle (more lean) to stay balanced (McKean & Burkett 2012, via [The Barbell Physio](https://thebarbellphysio.com/femur-length-squat-technique-individual-differences-impact-squat-performance/)).
- **Wider stance compensates for long femurs.** Widening + knees-out shortens the femur's front-to-back projection, so less forward lean is needed and spinal demand drops ([Stronger By Science](https://www.strongerbyscience.com/how-to-squat/), Demers et al. 2018 via [The Barbell Physio](https://thebarbellphysio.com/squat-anthropometry/)).
- **Ankle dorsiflexion.** Limited dorsiflexion has a real kinematic signature — more trunk lean, anterior pelvic tilt, more hip/lumbar flexion ([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0161475425000843)) — and **mimics long femurs**, so an app *cannot infer "long femurs" from forward lean alone*.
- **Hip socket / femoral version (fixed bone).** Acetabular orientation varies 30°+ between people; femoral version >20° even between a person's own legs ([Contreras](https://bretcontreras.com/no-two-hips-are-the-same-how-anatomical-variance-can-affect-your-range-of-motion/)). Lower anteversion is associated with needing more toe-out (0.34° vs 10.14°, p<0.001 — [Lee 2024, PMC11155599](https://pmc.ncbi.nlm.nih.gov/articles/PMC11155599/); single study, unreplicated).
- **Conventional vs sumo deadlift.** Conventional has ~25–40% greater bar travel/work and a more-leaned torso ([Escamilla 2000, PubMed 10912892](https://pubmed.ncbi.nlm.nih.gov/10912892/)). Heuristic selection: long femurs + short torso / short arms / wide-comfortable hips → sumo; long arms + long torso → conventional ([Stronger By Science](https://www.strongerbyscience.com/should-you-deadlift-conventional-or-sumo/)). **Neither is superior; the validated advice is "train both, keep the stronger/comfier one."**
- **Depth is anatomy-bound, and you cannot diagnose a depth ceiling from video.** Asymptomatic people with cam/pincer bone shapes squat to *equivalent* depth as controls ([Bagwell 2018, PMC6050869](https://pmc.ncbi.nlm.nih.gov/articles/PMC6050869/)); FAI depth findings *conflict* across studies ([Lamontagne 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2635464/) vs [Catelli/Malloy 2017](https://pubmed.ncbi.nlm.nih.gov/28709152/)); cam morphology is present in ~37% of asymptomatic people ([Frank 2015](https://pubmed.ncbi.nlm.nih.gov/25636988/)). **Do not assert a user "can't" hit depth.**

### 4.3 The "do-not-correct" list (normal variation a naive app would wrongly flag)

| Flagged "fault" | Reality |
|---|---|
| **Forward torso lean (squat)** | Required for long femurs / short torso / low-bar / stiff ankles. **The #1 false positive.** Never push toward "upright." |
| "Good morning" / hip-dominant look | Low-bar squats *require* more lean by physics; hip-dominant loading is anatomical, not an error |
| Knees passing toes | Usually *required* to reach depth and balance; the "never past toes" rule traces to discredited 1960s work and restricting it spikes hip/low-back torque (+~970%) ([Fry 2003 / Illmeier 2023, PMC10143703](https://pmc.ncbi.nlm.nih.gov/articles/PMC10143703/)). *Exception:* short-term knee-rehab. |
| Not hitting parallel/ATG | Depth is anatomy-bound; no universal target |
| Wide stance / lots of toe-out | Legitimate accommodation for long femurs / low anteversion |
| Higher deadlift hip start | Correct for long arms + short torso + long femurs |
| "Needs" heel elevation | Valid mechanical accommodation (~2–5° less dorsiflexion demand), not a weakness |

### 4.4 The genuinely flaggable, build-independent faults

1. **Bar drifting off the midfoot line** (forward/back) — squat or deadlift. *The leaned torso is fine; the bar leaving midfoot is not.*
2. **Hips rising faster than shoulders** out of the bottom (a rate/timing error).
3. **Deadlift hips shooting up before the bar breaks the floor** (timing, not a naturally high hip).
4. **Unintended knee valgus under load** (distinct from intentional knees-out).
5. **Shoulders set behind the bar at deadlift start** (a setup error).

> **Design rule:** the model's job is to *raise the bar for flagging*, not to generate prescriptions. Body type widens the "normal" envelope; it never produces a confident "fix this" from pixels. (Full biomechanics brief with citations lives in §9.)

---

## 5. UX integration (body-type capture, the in-rep cue overlay, the MVP cue, tone)

The existing flow is **upload → tap plate / set range → track → review**, in the "Precision Instrument" language (graphite ground, chalk text, amber as the single action color, mono numeric readouts). Body analysis must *slot in*, not bolt on.

### 5.1 Body-type capture — lowest-friction wins

Two candidate sources:

- **Manual input** (height; femur/torso via a 2–3 stop "build" slider or one guided side-photo tap of hip and knee). *Pro:* trivial, deterministic, no inference error, one-time. *Con:* user effort; self-rating is noisy.
- **Estimate proportions from the video** using the 450 mm plate as scale + pose landmarks (femur = hip→knee, torso = hip→shoulder). *Pro:* zero extra user input. *Con:* requires a clean side-on frame, foreshortening corrupts the ratio if the lifter isn't square to the camera, hip-crease landmark is soft, and **a wrong auto-estimate silently mis-tunes every cue** — the worst failure mode.

**Recommendation — minimal manual, optional auto:** a single **one-time, skippable "About your build"** step with **height + a 3-position femur:torso slider** ("shorter-legged / average / longer-legged"), with a tiny illustration. This is enough to *widen tolerances* (its only job) without pretending to measure anatomy. Offer video-based estimation only as an *optional confirmation* ("Looks like a longer-legged build — sound right?") the user can accept or override, never as a silent default. Persist it on `AppData` and in the saved-library record so it travels with each lift. Body type sets **thresholds**, not verdicts.

### 5.2 The in-rep cue overlay (skeleton + fault callouts synced to scrub)

The result screen already has a transparent `<canvas>` over the native `<video>` and a scrub slider driving `drawReview()`. The overlay extends that **exact** mechanism:

- A **toggle chip** ("Skeleton" / amber when active) next to the existing speed/sound chips. Off by default — the bar path stays the hero.
- When on, `drawReview()` also draws the **pose skeleton for the current frame** (landmarks already computed in the pose pass, stored per-frame). Lines in muted chalk/graphite so they read as *instrument scaffolding*, not a video-game avatar; only the **flagged segment** (e.g. the bar-to-shin gap, or the hip/shoulder pair during an early-hip-rise) is drawn in **amber**.
- **Callouts** appear as small mono labels pinned to the relevant landmark and to the moment on the scrub track — e.g. a thin amber tick on the scrub bar at the frame of peak bar drift, so scrubbing *to the fault* is one gesture. Tapping the tick seeks there.
- Confidence is honest: low-confidence frames (occlusion, lost landmarks) **dim the skeleton** rather than drawing a confident wrong pose.

This adds no new screen and reuses the scrub/seek/`requestVideoFrameCallback` plumbing verbatim.

### 5.3 The single most valuable MVP cue — precise spec

**Deadlift: "bar drifted N cm forward off your midfoot."** The most reliably 2D-detectable fault in the app, computed largely from the bar path it *already produces*, calibratable to centimeters by the 450 mm plate, and **build-independent** (zero risk of mis-coaching a long-limbed lifter). Implementable spec:

- **INPUT (what's tracked):**
  1. `path: PathPoint[]` — the bar's per-frame (x, y, t), already produced by `tracker.ts` (no new tracking).
  2. `midfootX` (pixels) — x of the foot/ankle landmark from the pose pass (MediaPipe landmark for the camera-side ankle/heel-toe midpoint). *v1 fallback if pose midfoot is unreliable:* use the plate-tap x at the start frame as the reference line (the app already captures a tap), i.e. degrade to "drift off start line" with no pose dependency.
  3. `cmPerPx` — from the 450 mm plate: `450 / plateDiameterPx`, where `plateDiameterPx` is measured at the plate tap on a side-on clip.
- **COMPUTATION (geometry + threshold):**
  - `driftPx = max over rep of |path[i].x − midfootX|` (the existing `horizontalDrift` already computes left/right extremes against a reference x — reuse it with `refX = midfootX`).
  - `driftCm = driftPx × cmPerPx`.
  - Threshold (tunable, build-independent): flag if `driftCm ≥ 5 cm` (≈2 in) — a coaching-meaningful forward drift, well above landmark noise. Record `frameT` of the peak for the scrub tick.
  - Confidence gate: only emit if the clip is side-on (plate face roughly circular, not edge-on) and the ankle landmark confidence is high across the rep; otherwise stay silent (no false cue).
- **OUTPUT (exactly what the user sees):**
  - A single cue card on the result screen, Precision-Instrument style: mono readout **"Bar drifted 6 cm forward off midfoot"** + one encouraging line *"Keeping it over midfoot will feel stronger off the floor."*
  - An **amber tick on the scrub track** at `frameT`; tapping it seeks to the peak-drift frame.
  - When the skeleton overlay is on, the **bar-to-midfoot horizontal gap is drawn in amber** at that frame; everything else stays muted chalk.
  - If the cue can't be computed (end-on clip / low confidence): show nothing, or a quiet *"Film side-on to check bar drift"* — never a wrong number.

It is the perfect first slice: highest 2D confidence, build-independent, minimal new code (mostly reuse of `horizontalDrift` + plate scale), and pose is optional in v1 (plate-tap fallback).

### 5.4 Tone — encouraging, body-type-aware, never medical

- Frame relative to the lifter, not an ideal: *"Your bar drifted ~5 cm forward near the top — keeping it over midfoot will feel stronger."* Not *"FAULT: bar path error."*
- Pre-empt normal variation: *"A forward torso lean is normal for longer-legged lifters — we're not flagging that."*
- Never diagnose or warn medically (no "you have impingement," no "you'll hurt your back"). Uncertainty is shown, not hidden: *"Can't see your spine clearly enough to judge rounding — film side-on for that."*
- Always one positive anchor + at most one cue per review. No wall of red.

### 5.5 Onboarding / calibration

- A one-time **angle coach**: "For deadlifts, film from the **side**." A tiny diagram. This single nudge unlocks most of the feature's value.
- The plate tap the app already collects *is* the scale calibration — reuse it; no new calibration step.
- Build capture (§5.1) is one optional screen, skippable, editable later.

---

## 6. Architecture & file-level integration sketch

### 6.1 Where pose slots in

The app already has a clean processing pass: `screens/processing.ts` drives `capture.ts`'s `playAndProcess()`, which plays the native `<video>`, grabs each decoded frame via `requestVideoFrameCallback`, converts to an OpenCV gray `Mat`, and calls back per-frame; `tracker.ts` (LK optical flow) produces the bar path; `geometry.ts` is pure math; `result.ts` renders the scrubbable review; `overlay.ts` draws; `state.ts` holds `AppData`.

Pose inference should run **in the same single processing pass**, alongside the optical-flow tracker, so the video is decoded once. `capture.ts` already hands each frame to a callback — feed that same frame (as an `ImageBitmap`/canvas, MediaPipe's expected input) to the pose landmarker right after the gray `Mat` is made for the tracker. Two consumers, one decode loop.

> **Performance caveat that may force a split pass:** MoveNet-class 2D is fast enough to ride alongside the tracker, but MediaPipe Pose at ~15 FPS plus OpenCV LK plus per-frame RGBA→gray on a mid iPhone may push frame time past the playback frame interval, stretching the processing pass. If profiling shows that, run pose as a **second pass over the same trimmed clip** (re-play once for the tracker, once for pose) — slower wall-clock but keeps each pass within budget and avoids main-thread overrun. Decide by measurement, not guess. (Either way, MediaPipe's own guidance is to run inference in a **plain Web Worker** — message passing, not SAB — to keep the UI responsive; [worker pattern](https://ankdev.me/blog/how-to-run-mediapipe-task-vision-in-a-web-worker).)

### 6.2 New files / changed files

```
src/pose.ts            NEW  lazy-loads MediaPipe (mirrors opencv.ts), exposes
                            detectForVideo(frame, tMs) → Landmark[]; CPU/Lite
                            fallback ladder; feature-detects WebGL context.
src/coach.ts           NEW  PURE math (like geometry.ts): takes per-frame
                            landmarks + bar path + body-type → Fault[] with
                            {kind, frameT, confidence, severity, message}.
                            Body type only widens thresholds. Fully unit-testable.
src/bodytype.ts        NEW  build capture model + (optional) video estimation
                            from landmarks + 450mm plate scale.
src/state.ts           EDIT AppData += poseFrames?: PoseFrame[];
                            bodyType?: BodyType; faults?: Fault[].
src/capture.ts         EDIT optionally pass an ImageBitmap/canvas frame to a
                            second per-frame consumer (pose), or expose a hook.
src/screens/processing.ts EDIT lazy-load pose like loadOpenCV(); run pose pass;
                            store poseFrames + faults on AppData.
src/overlay.ts         EDIT drawReview() gains an optional skeleton + amber
                            flagged-segment + callout layer, gated by a toggle.
src/screens/result.ts  EDIT "Skeleton" toggle chip; fault ticks on scrub;
                            cue card in Precision-Instrument style.
src/librarySupport.ts  EDIT persist bodyType + faults (+ poseFrames if small)
                            so saved lifts reopen with coaching intact.
```

`pose.ts` mirrors `opencv.ts`'s lazy single-load + `window`-global handling pattern, so the model is **only fetched on the processing screen**, never on first paint — keeping the landing bundle small and the ~6–9 MB download off the critical path. `coach.ts` stays pure like `geometry.ts`, so faults are deterministically unit-tested without a browser.

### 6.3 Combining landmarks with the optical-flow bar path

The LK tracker remains the **source of truth for the bar** (it is tuned, robust, and already shipping). Pose supplies the **body reference frame**: midfoot x (from ankle/foot landmarks + plate scale), hip and shoulder positions for the hip-vs-shoulder rate cue, shin line for deadlift drift. `coach.ts` fuses them: e.g. *bar-to-midfoot offset* = (bar.x from tracker − midfoot.x from pose) × (cm per pixel from plate). Time alignment is trivial since both are keyed by the same `mediaTime` the capture loop already stamps.

### 6.4 iOS Safari constraints, memory, bundle

- **No SAB:** MediaPipe single-thread + WebGL satisfies this (see §2.1).
- **Black-frame gotcha:** read pose from the **played native video** during processing (the existing loop already does), never a never-played paused frame.
- **Memory:** OpenCV `Mat`s are already `.delete()`-ed per frame; do the same for any pose input bitmaps. Store landmarks as plain numbers, not retained `ImageData`. iOS aggressively kills high-memory tabs, so do not retain all decoded frames; keep only landmark arrays.
- **Bundle:** lazy-load the model (as above); ship Lite by default, offer Full as an opt-in "higher accuracy (slower, +3 MB)" toggle. Never block first paint on it.

### 6.5 PWA precache note

The service worker currently precaches the app shell. The ~6–9 MB model should be **lazily cached on first use**, not added to the install precache, or it bloats install and first-load on cellular. (Same reasoning that keeps OpenCV off the landing path.)

---

## 7. Phased plan (smallest first valuable slice → v1 → v2)

**Phase 0 — Side-on prompt + cm scale (no pose at all). ~1–2 days.**
Add the deadlift "film from the side" onboarding nudge and use the existing plate tap to compute **cm-per-pixel** from the 450 mm plate. Report **bar drift in centimeters** (the app already has the pixel drift). *Smallest valuable slice — ships real coaching value with zero new model and zero risk.* Verify: a side-on deadlift clip reports a sensible cm drift.

**Phase 1 — Pose pass + the MVP cue (deadlift bar-off-midfoot). ~1 week.**
Add `pose.ts` (lazy MediaPipe Lite, WebGL + CPU fallback), run it in the processing pass, store landmarks. Add `coach.ts` computing **bar-to-midfoot drift** (bar from tracker, midfoot from pose). Show the single cue card on `result.ts`. No skeleton overlay yet. Verify: cue fires on a forward-drift rep, stays silent on a clean one; pose loads only on the processing screen; works on a real mid iPhone within budget.

**Phase 2 — Skeleton overlay + early-hip-rise cue + build capture. ~1 week.**
Add the toggleable skeleton + amber flagged-segment + scrub-tick callouts in `overlay.ts`/`result.ts`. Add the **deadlift early-hip-rise** cue (hip-vs-bar vertical rate). Add the one-time **build slider** (`bodytype.ts`) that *widens* thresholds. Verify: overlay toggles cleanly, dims on low confidence; build slider visibly changes nothing it shouldn't (no false "fix lean" cues).

**Phase 3 (v2) — Side-on squat coaching. ~1–2 weeks.**
Only after a side-on *squat* angle is prompted: add depth, bar-over-midfoot, and hips-shoot-first cues (all side-on, build-aware). Explicitly **exclude** lumbar-rounding verdicts and any "you can't squat deep" claims. Keep knee-valgus as a *separate, optional front-on* capture, clearly labeled lower-confidence.

**Deferred / maybe-never:** lumbar-rounding safety verdicts, true 3D joint angles, live real-time coaching preview, automatic body-type measurement as the default path. All either unsafe to claim or out of on-device budget.

---

## 8. Risks & open questions (fatal / mitigable)

Synthesized from an adversarial pass wearing two hats: **(A)** a senior iOS-Safari mobile-web engineer, and **(B)** an experienced strength coach.

1. **(Coach) Auto-generated body-type cues that "correct" normal variation. — FATAL if shipped naively; MITIGABLE by design.** Forward lean, wide stance, sub-parallel depth, higher deadlift hip start are *normal* for many builds. A confident "fix your lean" is wrong and makes a long-limbed lifter's squat *less* safe. **Mitigation:** ship only the build-independent flaggable faults first (§4.4); body type only *widens* tolerances; never emit prescriptions; never diagnose. This is the single most important guardrail in the document.

2. **(Coach) End-on squat filming makes the coaching nearly meaningless for squats. — FATAL for squat coaching as currently filmed; MITIGABLE by angle change.** Five of six squat faults are sagittal and invisible end-on. **Mitigation:** debut on the side-on *deadlift*; gate squat coaching behind a side-on prompt; do not pretend to coach squat lean/depth from the current angle.

3. **(Coach) Over-claiming lumbar/spine safety from 2D. — FATAL if claimed; MITIGABLE by omission.** Pose models have no spine joints, and ~18–22° of lumbar motion happens even while "holding neutral" — the unsafe-vs-normal signal is below measurement error. **Mitigation:** never output a back-rounding safety verdict; say the camera can't judge it.

4. **(Engineer) Performance on a mid iPhone already running ~10 MB OpenCV. — MITIGABLE.** ~15 FPS MediaPipe + LK + per-frame conversion may overrun the processing pass; the model download is ~6–9 MB on cellular; main-thread parsing/inference can jank. **Mitigation:** lazy-load the model (off critical path, cached on first use); run inference in a plain Web Worker; if profiling shows overrun, split into a second pass; offer Lite by default; CPU/Lite fallback ladder; the feature is strictly additive so failure degrades to today's bar-path-only app.

5. **(Engineer) WebGPU instability and iOS version spread. — MITIGABLE.** WebGPU is iOS-26-only and the main WebGPU runtime crashes on WebKit 26 today. **Mitigation:** baseline on WebGL/WASM (covers iOS 17/18); treat WebGPU as an optional, feature-detected accelerator only. WebGL context-creation can still fail in some WKWebViews → CPU-delegate fallback.

6. **(Engineer) Silent mis-calibration from a wrong auto body-type estimate or off-axis camera. — MITIGABLE.** A foreshortened off-square clip corrupts the femur:torso estimate and every threshold derived from it; the plate scale is only valid in its depth plane. **Mitigation:** manual build slider as the default (auto only as confirmable suggestion); validate the plate is roughly face-on before trusting cm scale; show confidence and dim/skip when geometry is bad.

**Thermal / battery / memory:** a one-shot offline pass over a trimmed clip (a few seconds of video) is far gentler than continuous live inference — this architecture is the right one for iOS. Keep only landmark arrays in memory, delete frame bitmaps promptly.

**Open questions:** real measured FPS and pass duration for Full vs Lite on a specific mid iPhone (e.g. iPhone 12/13/SE-class); whether a single combined pass stays in budget or must split; how reliably foot/midfoot landmarks survive shoes + plate occlusion; minimum acceptable clip resolution; whether the build slider meaningfully improves cue acceptance vs. just shipping build-independent cues.

**One-line overall verdict:** **Viable — as a side-on DEADLIFT bar-and-tempo coach with a few build-aware guardrails and a calibrated centimeter bar-drift cue, lazy-loaded on the processing screen; NOT viable as a general "AI form checker," and squat coaching must wait for a side-on camera prompt.**

---

## 9. References (URLs)

**Pose-tech / browser ML**
- WebGPU in major browsers / iOS 26: https://web.dev/blog/webgpu-supported-major-browsers · https://appdevelopermagazine.com/webgpu-in-ios-26/ · https://www.webgpu.com/news/webgpu-hits-critical-mass-all-major-browsers/
- MediaPipe uses WebGL not WebGPU / no SAB: https://github.com/google-ai-edge/mediapipe/issues/5826 · https://fossies.org/linux/mediapipe/mediapipe/tasks/web/core/fileset_resolver.ts.template · https://www.npmjs.com/package/@mediapipe/tasks-vision
- MediaPipe Pose Landmarker guide / sizes / 3D: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker · https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js · https://blog.tensorflow.org/2021/08/3d-pose-detection-with-mediapipe-blazepose-ghum-tfjs.html
- iOS WebGL context-creation failures: https://github.com/google-ai-edge/mediapipe/issues/4499 · https://github.com/google-ai-edge/mediapipe/issues/5970
- MoveNet specs / FPS / license: https://blog.tensorflow.org/2021/05/next-generation-pose-detection-with-movenet-and-tensorflowjs.html · https://github.com/tensorflow/tfjs-models/blob/master/pose-detection/src/movenet/README.md
- ONNX Runtime Web single-thread flags / WebKit-26 crash: https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html · https://github.com/microsoft/onnxruntime/issues/26827
- rtmlib-ts (RTMPose, WASM/iOS): https://dev.to/gohdev_1/rtmlib-ts-real-time-pose-estimation-object-detection-in-browser-with-typescript-yolo12-48ep
- Web-worker pattern for tasks-vision: https://ankdev.me/blog/how-to-run-mediapipe-task-vision-in-a-web-worker
- Barbell/fitness pose accuracy: https://mhealth.jmir.org/2026/1/e82412 · https://arxiv.org/pdf/2411.11548 · https://www.researchgate.net/publication/389929761
- iOS Safari WASM memory/threading pitfalls: https://github.com/emscripten-core/emscripten/issues/19374 · https://bugs.webkit.org/show_bug.cgi?id=221530

**2D monocular detectability**
- Monocular 3D ill-posed / depth ambiguity / occlusion: https://www.sciencedirect.com/science/article/pii/S0925231225019812 · https://pmc.ncbi.nlm.nih.gov/articles/PMC12589393/
- 2D plane/occlusion joint-angle error (Drazan): https://pmc.ncbi.nlm.nih.gov/articles/PMC10635560/
- Kinovea perspective/angle error + guidelines: https://pmc.ncbi.nlm.nih.gov/articles/PMC8544843/ · https://www.kinovea.org/help/en/measurement/guidelines.html
- 2D vs 3D knee valgus validity/reliability: https://pmc.ncbi.nlm.nih.gov/articles/PMC8805110/ · https://pmc.ncbi.nlm.nih.gov/articles/PMC4890697/
- Sagittal 2D validity (squat/lift): https://pubmed.ncbi.nlm.nih.gov/21568816/ · https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10899431/ · https://www.metric.coach/articles/validation-of-a-commercially-available-mobile-application · https://www.nature.com/articles/s41598-021-00212-x
- Spine/lumbar markerless + deadlift kyphosis: https://www.sciencedirect.com/science/article/pii/S2405844024036272 · https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2025.1682991/full
- Heel-rise / foot-contact detection difficulty: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11260980/ · https://arxiv.org/pdf/2007.11678
- Plate-scale / barbell velocity autocalibration: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7866505/ · https://arxiv.org/pdf/1905.02693

**Anthropometry & biomechanics**
- Femur length → lean / stance: https://bretcontreras.com/how-femur-length-effects-squat-mechanics/ · https://www.strongerbyscience.com/how-to-squat/ · https://thebarbellphysio.com/femur-length-squat-technique-individual-differences-impact-squat-performance/ · https://thebarbellphysio.com/squat-anthropometry/ · https://www.baysfitness.com/insights/squat-mechanics-long-femur-vs-short-femur · https://www.crossfit.com/essentials/science-of-squatting
- Ankle dorsiflexion kinematics: https://www.sciencedirect.com/science/article/abs/pii/S0161475425000843 · https://pmc.ncbi.nlm.nih.gov/articles/PMC10987311/
- Hip socket / femoral version / toe-out: https://bretcontreras.com/no-two-hips-are-the-same-how-anatomical-variance-can-affect-your-range-of-motion/ · https://pmc.ncbi.nlm.nih.gov/articles/PMC11155599/ · https://squatuniversity.com/2016/03/25/how-hip-anatomy-affects-squat-mechanics/
- Sumo vs conventional: https://pubmed.ncbi.nlm.nih.gov/10912892/ · https://www.strongerbyscience.com/should-you-deadlift-conventional-or-sumo/ · https://pmc.ncbi.nlm.nih.gov/articles/PMC12148905/
- Depth / FAI / hip impingement nuance: https://pmc.ncbi.nlm.nih.gov/articles/PMC6050869/ · https://pmc.ncbi.nlm.nih.gov/articles/PMC2635464/ · https://pubmed.ncbi.nlm.nih.gov/28709152/ · https://pubmed.ncbi.nlm.nih.gov/25636988/
- Knees-over-toes myth + torque trade-off: https://pmc.ncbi.nlm.nih.gov/articles/PMC10143703/ · https://www.physio-network.com/blog/knees-shouldnt-pass-toes-during-the-squat-myth-or-truth/ · https://physicalculturestudy.com/2018/04/23/the-harmful-squats-myth-dr-klein-klein-and-the-back-squat/
- Barbell Medicine / Squat University general: https://www.barbellmedicine.com/blog/how-to-squat/ · https://squatuniversity.com/2016/01/29/can-the-knees-go-over-the-toes-debunking-squat-myths/

---

*Prepared as a research/design deliverable. No application code was changed. All on-device claims assume the GitHub-Pages no-SAB constraint and an iPhone-Safari mid-range target.*
