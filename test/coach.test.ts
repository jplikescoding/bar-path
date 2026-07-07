import { describe, it, expect } from 'vitest'
import {
  midfootXFromFrame, robustMidfoot, analyzeBarDrift, slimFrame, analyzeHipRise,
  detectFacing, analyzeSquatDepth,
  type PoseLm, type PoseFrame,
} from '../src/coach'
import type { Landmark } from '../src/pose'
import type { PathPoint } from '../src/geometry'

describe('slimFrame', () => {
  it('rounds x/y to 4dp, vis to 2dp, and drops z', () => {
    const lms: Landmark[] = [{ x: 0.123456, y: 0.654321, z: 9, visibility: 0.876 }]
    expect(slimFrame(lms, 1.5)).toEqual({ t: 1.5, lm: [{ x: 0.1235, y: 0.6543, vis: 0.88 }] })
  })
  it('omits vis when the landmark has no visibility', () => {
    const f = slimFrame([{ x: 0.5, y: 0.5, z: 0 }], 0)
    expect(f.lm[0]).toEqual({ x: 0.5, y: 0.5 })
    expect('vis' in f.lm[0]).toBe(false)
  })
})

// 33-landmark frame with foot landmarks (indices 27..32) set to a given normalized x.
function frameWithFootX(x: number, vis = 0.9): PoseLm[] {
  const lm: PoseLm[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, vis: 0 }))
  for (const i of [27, 28, 29, 30, 31, 32]) lm[i] = { x, y: 0.8, vis }
  return lm
}

describe('midfootXFromFrame', () => {
  it('returns the foot landmark x scaled to pixels', () => {
    expect(midfootXFromFrame(frameWithFootX(0.5), 1000)).toBeCloseTo(500)
  })
  it('returns null when foot landmarks are below the visibility floor', () => {
    expect(midfootXFromFrame(frameWithFootX(0.5, 0.1), 1000)).toBeNull()
  })
  it('is the heel↔toe midpoint — the ankle does not pull the result', () => {
    const lm: PoseLm[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, vis: 0 }))
    lm[27] = { x: 0.10, y: 0.8, vis: 1 } // ankle far left — must be ignored
    lm[29] = { x: 0.40, y: 0.8, vis: 1 } // heel
    lm[31] = { x: 0.60, y: 0.8, vis: 1 } // toe
    expect(midfootXFromFrame(lm, 1000)).toBeCloseTo(500) // (0.4+0.6)/2 × 1000
  })
  it('returns null when no heel is visible (toe alone is not a midfoot)', () => {
    const lm: PoseLm[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, vis: 0 }))
    lm[27] = { x: 0.4, y: 0.8, vis: 1 } // ankle
    lm[31] = { x: 0.6, y: 0.8, vis: 1 } // toe
    expect(midfootXFromFrame(lm, 1000)).toBeNull()
  })
  it('returns null when no toe is visible', () => {
    const lm: PoseLm[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, vis: 0 }))
    lm[29] = { x: 0.4, y: 0.8, vis: 1 } // heel only
    expect(midfootXFromFrame(lm, 1000)).toBeNull()
  })
})

describe('robustMidfoot', () => {
  it('takes the median of contributing frames and reports confidence', () => {
    const est = robustMidfoot([100, 102, 98, null, 101, 99])
    expect(est).not.toBeNull()
    expect(est!.x).toBeCloseTo(100)        // median of [98,99,100,101,102]
    expect(est!.frames).toBe(5)
    expect(est!.conf).toBeCloseTo(5 / 6)
  })
  it('returns null when too few frames contributed', () => {
    expect(robustMidfoot([100, null, null, null], 5)).toBeNull()
  })
})

describe('analyzeBarDrift', () => {
  const path: PathPoint[] = [
    { x: 100, y: 200, t: 0 },
    { x: 110, y: 150, t: 0.5 },   // peak: 10 px from refX 100
    { x: 104, y: 100, t: 1.0 },
  ]
  // plate: 90 px = 45 cm → 0.5 cm/px. 10 px = 5 cm.
  const plate = 90

  it('nudges off the pose midfoot when drift >= 5 cm, with frameT at the peak', () => {
    const cue = analyzeBarDrift(path, { x: 100, frames: 30, conf: 0.95 }, plate, 100)
    expect(cue).not.toBeNull()
    expect(cue!.refSource).toBe('pose-midfoot')
    expect(cue!.tone).toBe('nudge')
    expect(cue!.driftCm).toBeCloseTo(5)
    expect(cue!.driftPx).toBeCloseTo(10)
    expect(cue!.frameT).toBe(0.5)
    expect(cue!.confidence).toBe('ok')
  })

  it('below the 5 cm threshold a calibrated clip gets a GOOD-tone cue (visible, positive)', () => {
    const flat: PathPoint[] = [{ x: 100, y: 0, t: 0 }, { x: 104, y: 0, t: 1 }] // 4 px = 2 cm
    const cue = analyzeBarDrift(flat, { x: 100, frames: 30, conf: 0.95 }, plate, 100)
    expect(cue).not.toBeNull()
    expect(cue!.tone).toBe('good')
    expect(cue!.driftCm).toBeCloseTo(2)
    expect(cue!.frameT).toBe(1) // peak |x−refX| is still reported
  })

  it('falls back to the plate-tap line when pose midfoot is null/weak', () => {
    const cue = analyzeBarDrift(path, null, plate, 100)
    expect(cue).not.toBeNull()
    expect(cue!.refSource).toBe('plate-tap')
    expect(cue!.confidence).toBe('low')
  })

  it('stays silent when uncalibrated by default (px drift is not actionable)', () => {
    expect(analyzeBarDrift(path, { x: 100, frames: 30, conf: 0.95 }, null, 100)).toBeNull()
  })

  it('reports px (driftCm null) when uncalibrated firing is explicitly opted in', () => {
    const cue = analyzeBarDrift(path, { x: 100, frames: 30, conf: 0.95 }, null, 100, { flagPx: 5 })
    expect(cue).not.toBeNull()
    expect(cue!.driftCm).toBeNull()
    expect(cue!.driftPx).toBeCloseTo(10)
    expect(cue!.tone).toBe('nudge')
  })

  it('uncalibrated px opt-in stays silent BELOW flagPx (no good tone without a real number)', () => {
    expect(analyzeBarDrift(path, { x: 100, frames: 30, conf: 0.95 }, null, 100, { flagPx: 50 })).toBeNull()
  })

  it('returns null on empty input (total & safe)', () => {
    expect(analyzeBarDrift([], null, plate, 100)).toBeNull()
  })
})

describe('detectFacing', () => {
  // Frames with heels at one normalized x and toes at another (both feet).
  const feetFrames = (heelX: number, toeX: number, n = 10, vis = 0.9): PoseFrame[] =>
    Array.from({ length: n }, (_, i) => {
      const lm: PoseLm[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, vis: 0 }))
      for (const h of [29, 30]) lm[h] = { x: heelX, y: 0.9, vis }
      for (const t of [31, 32]) lm[t] = { x: toeX, y: 0.9, vis }
      return { t: i / 10, lm }
    })

  it('toes right of heels → facing right', () => {
    expect(detectFacing(feetFrames(0.40, 0.48))).toBe('right')
  })
  it('toes left of heels → facing left', () => {
    expect(detectFacing(feetFrames(0.48, 0.40))).toBe('left')
  })
  it('null when the heel↔toe spread is inside the margin (end-on feet point at the camera)', () => {
    expect(detectFacing(feetFrames(0.44, 0.45))).toBeNull()
  })
  it('null when too few frames have visible feet', () => {
    expect(detectFacing(feetFrames(0.40, 0.48, 3))).toBeNull()
    expect(detectFacing(feetFrames(0.40, 0.48, 10, 0.1))).toBeNull()
    expect(detectFacing(null)).toBeNull()
  })
})

describe('analyzeBarDrift direction (facing-aware copy upgrade)', () => {
  const path: PathPoint[] = [
    { x: 100, y: 200, t: 0 },
    { x: 110, y: 150, t: 0.5 },   // peak: 10 px to the RIGHT of refX 100
    { x: 104, y: 100, t: 1.0 },
  ]
  const plate = 90
  const midfoot = { x: 100, frames: 30, conf: 0.95 }

  it('peak drift toward the toes reads as forward', () => {
    const cue = analyzeBarDrift(path, midfoot, plate, 100, { facing: 'right' })
    expect(cue!.direction).toBe('forward')
  })
  it('peak drift toward the heels reads as backward', () => {
    const cue = analyzeBarDrift(path, midfoot, plate, 100, { facing: 'left' })
    expect(cue!.direction).toBe('backward')
  })
  it('no direction without facing, or off the plate-tap fallback line', () => {
    expect(analyzeBarDrift(path, midfoot, plate, 100)!.direction).toBeUndefined()
    expect(analyzeBarDrift(path, null, plate, 100, { facing: 'right' })!.direction).toBeUndefined()
  })
})

describe('analyzeHipRise — squat anchoring (opts.lift)', () => {
  const H = 1000
  // Squat-shaped bar path: standing y=300 (t 0..1) → descend to 900 (t 1..3) →
  // hole (t 3..holeEnd) → ascend back to 300 over 3s.
  const squatPath = (holeEnd = 4): PathPoint[] => {
    const pts: PathPoint[] = []
    for (let t = 0; t <= 1.001; t += 0.1) pts.push({ x: 100, y: 300, t: +t.toFixed(2) })
    for (let t = 1.1; t <= 3.001; t += 0.1) pts.push({ x: 100, y: 300 + 600 * ((t - 1) / 2), t: +t.toFixed(2) })
    for (let t = 3.1; t <= holeEnd + 0.001; t += 0.1) pts.push({ x: 100, y: 900, t: +t.toFixed(2) })
    for (let t = holeEnd + 0.1; t <= holeEnd + 3.001; t += 0.1) pts.push({ x: 100, y: 900 - 600 * ((t - holeEnd) / 3), t: +t.toFixed(2) })
    return pts
  }
  const framesWithHip = (hipYAt: (t: number) => number, tEnd = 7): PoseFrame[] => {
    const fs: PoseFrame[] = []
    for (let t = 0; t <= tEnd + 0.001; t += 0.1) {
      const lm: PoseLm[] = []
      lm[23] = { x: 0.5, y: hipYAt(t), vis: 1 }
      lm[24] = { x: 0.5, y: hipYAt(t), vis: 1 }
      fs.push({ t: +t.toFixed(2), lm })
    }
    return fs
  }

  it('good squat — hips ride up with the bar out of the hole → present, not fired', () => {
    // hips: 0.60 standing → 0.75 in the hole → rise back proportionally with the bar.
    const hip = (t: number) => {
      if (t <= 1) return 0.60
      if (t <= 3) return 0.60 + 0.15 * ((t - 1) / 2)
      if (t <= 4) return 0.75
      return 0.75 - 0.15 * Math.min(1, (t - 4) / 3)
    }
    const cue = analyzeHipRise(squatPath(), framesWithHip(hip), H, { lift: 'squat' })
    expect(cue).not.toBeNull()
    expect(cue!.fired).toBe(false)
    expect(cue!.startT).toBeGreaterThan(3.5) // judged from the hole exit, not standing
  })

  it('good-morning squat — hips shoot out of the hole ahead of the bar → fired', () => {
    const hip = (t: number) => {
      if (t <= 1) return 0.60
      if (t <= 3) return 0.60 + 0.15 * ((t - 1) / 2)
      if (t <= 4) return 0.75
      return 0.75 - 0.30 * Math.min(1, (t - 4) / 0.75) // 300 px in the first 0.75 s
    }
    const cue = analyzeHipRise(squatPath(), framesWithHip(hip), H, { lift: 'squat' })
    expect(cue).not.toBeNull()
    expect(cue!.fired).toBe(true)
    expect(cue!.ratio).toBeGreaterThanOrEqual(1.5)
    expect(cue!.frameT).toBeGreaterThanOrEqual(cue!.startT)
    expect(cue!.frameT).toBeLessThanOrEqual(cue!.endT + 0.101)
  })

  it('a pause in the hole anchors the window at the exit, not the arrival', () => {
    const holeEnd = 5 // 2 s in the hole (t 3..5), ascent 5..8
    const hip = (t: number) => {
      if (t <= 1) return 0.60
      if (t <= 3) return 0.60 + 0.15 * ((t - 1) / 2)
      if (t <= holeEnd) return 0.75
      return 0.75 - 0.30 * Math.min(1, (t - holeEnd) / 0.75)
    }
    const cue = analyzeHipRise(squatPath(holeEnd), framesWithHip(hip, 8), H, { lift: 'squat' })
    expect(cue).not.toBeNull()
    expect(cue!.startT).toBeGreaterThan(4.5) // ≈5, the hole exit
  })

  it('null when the clip ends in the hole (no ascent to judge)', () => {
    const down = squatPath().filter((p) => p.t <= 3.5)
    expect(analyzeHipRise(down, framesWithHip(() => 0.7, 3.5), H, { lift: 'squat' })).toBeNull()
  })
})

describe('analyzeSquatDepth', () => {
  const H = 1000
  // Bar: descend to a deepest point y=900 at t=3, then ascend.
  const path: PathPoint[] = []
  for (let t = 0; t <= 3.001; t += 0.1) path.push({ x: 100, y: 300 + 600 * (t / 3), t: +t.toFixed(2) })
  for (let t = 3.1; t <= 6.001; t += 0.1) path.push({ x: 100, y: 900 - 600 * ((t - 3) / 3), t: +t.toFixed(2) })

  // Frames every 0.1s with hip/knee at fixed normalized ys around the bottom.
  const frames = (hipY: number, kneeY: number, vis = 0.9): PoseFrame[] =>
    Array.from({ length: 61 }, (_, i) => {
      const lm: PoseLm[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, vis: 0 }))
      for (const h of [23, 24]) lm[h] = { x: 0.5, y: hipY, vis }
      for (const k of [25, 26]) lm[k] = { x: 0.5, y: kneeY, vis }
      return { t: +(i / 10).toFixed(2), lm }
    })

  it('hips below knee level at the deepest bar point → below, with cm when calibrated', () => {
    // hip 0.70, knee 0.68 → +20 px below; plate 90 px → 0.5 cm/px → 10 cm.
    const d = analyzeSquatDepth(path, frames(0.70, 0.68), H, 90)
    expect(d).not.toBeNull()
    expect(d!.where).toBe('below')
    expect(d!.dropPx).toBeCloseTo(20)
    expect(d!.dropCm).toBeCloseTo(10)
    expect(d!.frameT).toBeCloseTo(3)
  })
  it('hips above knee level → above; dropCm null when uncalibrated', () => {
    const d = analyzeSquatDepth(path, frames(0.66, 0.68), H, null)
    expect(d).not.toBeNull()
    expect(d!.where).toBe('above')
    expect(d!.dropPx).toBeCloseTo(-20)
    expect(d!.dropCm).toBeNull()
  })
  it('inside the level band → level (landmark noise is not a verdict)', () => {
    expect(analyzeSquatDepth(path, frames(0.681, 0.68), H, 90)!.where).toBe('level')
  })
  it('null when hip/knee landmarks are not visible near the bottom', () => {
    expect(analyzeSquatDepth(path, frames(0.70, 0.68, 0.1), H, 90)).toBeNull()
    expect(analyzeSquatDepth(path, null, H, 90)).toBeNull()
  })
  it('null when too few frames land inside the bottom window', () => {
    const sparse = frames(0.70, 0.68).filter((f) => f.t < 2.95) // none within ±0.15 s of t=3 except 2.9
    expect(analyzeSquatDepth(path, sparse, H, 90)).toBeNull()
  })
  it('null on empty path (total & safe)', () => {
    expect(analyzeSquatDepth([], frames(0.70, 0.68), H, 90)).toBeNull()
  })
})

describe('analyzeHipRise', () => {
  const H = 1000 // videoHeight px

  // Bar sits at y=900 until t=1, then rises linearly to y=300 by t=4 (ROM 600px).
  const rising = (): PathPoint[] => {
    const pts: PathPoint[] = []
    for (let t = 0; t <= 1.001; t += 0.1) pts.push({ x: 100, y: 900, t: +t.toFixed(2) })
    for (let t = 1.1; t <= 4.001; t += 0.1) pts.push({ x: 100, y: 900 - 600 * ((t - 1) / 3), t: +t.toFixed(2) })
    return pts
  }
  // Pose frames every 0.1s with both hips at a given normalized y.
  const framesWithHip = (hipYAt: (t: number) => number): PoseFrame[] => {
    const fs: PoseFrame[] = []
    for (let t = 0; t <= 4.001; t += 0.1) {
      const lm: PoseLm[] = []
      lm[23] = { x: 0.5, y: hipYAt(t), vis: 1 }
      lm[24] = { x: 0.5, y: hipYAt(t), vis: 1 }
      fs.push({ t: +t.toFixed(2), lm })
    }
    return fs
  }

  it('good rep — hips rise with the bar (no shooting up) → cue present, not fired', () => {
    // hips rise steadily at ~25% of the bar's rate (long-limbed pulls sit here):
    // over the early window that is well under the 1.5× fire ratio.
    const hip = (t: number) => t <= 1 ? 0.60 : 0.60 - 0.15 * Math.min(1, (t - 1) / 3)
    const cue = analyzeHipRise(rising(), framesWithHip(hip), H)
    expect(cue).not.toBeNull()
    expect(cue!.fired).toBe(false)
    expect(cue!.ratio).toBeGreaterThan(0.05)
    expect(cue!.ratio).toBeLessThan(1.5)
  })

  it('early hip rise — hips far outrun the bar in the window → fired, frameT inside window', () => {
    // hip rise FRONT-LOADED: hips drop 350px of slack in the first 0.75s of the
    // pull while the bar makes only its first ~120px — the classic shoot-up.
    const hip = (t: number) => t <= 1 ? 0.80 : 0.80 - 0.35 * Math.min(1, (t - 1) / 0.75)
    const cue = analyzeHipRise(rising(), framesWithHip(hip), H)
    expect(cue).not.toBeNull()
    expect(cue!.fired).toBe(true)
    expect(cue!.ratio).toBeGreaterThanOrEqual(1.5)
    expect(cue!.frameT).toBeGreaterThanOrEqual(cue!.startT)
    expect(cue!.frameT).toBeLessThanOrEqual(cue!.endT + 0.101)
  })

  it('null when pose frames are missing or hips are below the visibility floor', () => {
    expect(analyzeHipRise(rising(), null, H)).toBeNull()
    const blind = framesWithHip(() => 0.5).map((f) => ({
      ...f, lm: f.lm.map((l) => ({ ...l, vis: 0.1 })),
    }))
    expect(analyzeHipRise(rising(), blind, H)).toBeNull()
  })

  it('judges the ASCENT even when the clip ends with the bar set back down lower', () => {
    // rise 900→300 by t=4, then lower to 905 by t=7 (set-down slightly below start —
    // typical real clip). The pull start must be the pre-ascent bottom, not the set-down.
    const pts = rising()
    for (let t = 4.1; t <= 7.001; t += 0.1) pts.push({ x: 100, y: 300 + 605 * ((t - 4) / 3), t: +t.toFixed(2) })
    const hip = (t: number) => t <= 1 ? 0.80 : 0.80 - 0.35 * Math.min(1, (t - 1) / 0.75)
    const cue = analyzeHipRise(pts, framesWithHip(hip), H)
    expect(cue).not.toBeNull()
    expect(cue!.startT).toBeLessThan(1.2) // pull start ≈ t=1, not the t=7 set-down
    expect(cue!.fired).toBe(true)
  })

  it('anchors the pull start where the bar LEAVES the floor, not the first bottom frame', () => {
    // Real clip shape: bar sits on the floor t=0..5 (setup), pull 5..8; pose only
    // detects the lifter from t=3 on. The window must start at ~t=5, inside pose
    // coverage — anchoring at t=0 would put the start slice in the pose gap → null.
    const pts: PathPoint[] = []
    for (let t = 0; t <= 5.001; t += 0.1) pts.push({ x: 100, y: 900, t: +t.toFixed(2) })
    for (let t = 5.1; t <= 8.001; t += 0.1) pts.push({ x: 100, y: 900 - 600 * ((t - 5) / 3), t: +t.toFixed(2) })
    const fs: PoseFrame[] = []
    for (let t = 3; t <= 8.001; t += 0.1) {
      const lm: PoseLm[] = []
      lm[23] = { x: 0.5, y: 0.6, vis: 1 }; lm[24] = { x: 0.5, y: 0.6, vis: 1 }
      fs.push({ t: +t.toFixed(2), lm })
    }
    const cue = analyzeHipRise(pts, fs, H)
    expect(cue).not.toBeNull()
    expect(cue!.startT).toBeGreaterThan(4.5)
  })

  it('null when the bar never really rises (no pull to judge)', () => {
    const flat: PathPoint[] = Array.from({ length: 40 }, (_, i) => ({ x: 100, y: 900 - i, t: i / 10 }))
    expect(analyzeHipRise(flat, framesWithHip(() => 0.5), H)).toBeNull()
  })

  it('null on empty path (total & safe)', () => {
    expect(analyzeHipRise([], framesWithHip(() => 0.5), H)).toBeNull()
  })
})
