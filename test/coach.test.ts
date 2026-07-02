import { describe, it, expect } from 'vitest'
import { midfootXFromFrame, robustMidfoot, analyzeBarDrift, slimFrame, type PoseLm } from '../src/coach'
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
