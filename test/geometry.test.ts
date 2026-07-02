import { describe, it, expect } from 'vitest'
import { smoothPath, angleFromVertical, rotatePath, horizontalDrift, pxToCm, PLATE_DIAMETER_CM, verticalVelocity } from '../src/geometry'

describe('verticalVelocity', () => {
  it('reads a constant rise as constant positive vy (px/s)', () => {
    // y decreases 10px per 0.1s → rising at 100 px/s
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: 0, y: 1000 - i * 10, t: i * 0.1 }))
    const v = verticalVelocity(pts)
    expect(v).toHaveLength(20)
    for (const p of v) expect(p.vy).toBeCloseTo(100, 0)
    expect(v[0].t).toBe(0)
  })
  it('reads a descent as negative vy', () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ x: 0, y: 100 + i * 20, t: i * 0.1 }))
    const v = verticalVelocity(pts)
    for (const p of v) expect(p.vy).toBeCloseTo(-200, 0)
  })
  it('returns [] for paths shorter than 2 points', () => {
    expect(verticalVelocity([])).toEqual([])
    expect(verticalVelocity([{ x: 0, y: 0, t: 0 }])).toEqual([])
  })
  it('never produces NaN/Infinity on duplicate timestamps', () => {
    const pts = [
      { x: 0, y: 100, t: 0 }, { x: 0, y: 90, t: 0 }, { x: 0, y: 80, t: 0.1 }, { x: 0, y: 70, t: 0.2 },
    ]
    for (const p of verticalVelocity(pts)) expect(Number.isFinite(p.vy)).toBe(true)
  })
})

describe('smoothPath', () => {
  it('returns a copy when window <= 1', () => {
    const pts = [{ x: 0, y: 0, t: 0 }, { x: 10, y: 5, t: 1 }]
    const out = smoothPath(pts, 1)
    expect(out).toEqual(pts)
    expect(out).not.toBe(pts)
  })
  it('averages neighbours and preserves t', () => {
    const pts = [
      { x: 0, y: 0, t: 0 }, { x: 10, y: 0, t: 1 }, { x: 20, y: 0, t: 2 },
    ]
    const out = smoothPath(pts, 3)
    expect(out[1].x).toBeCloseTo(10)   // (0+10+20)/3
    expect(out[1].t).toBe(1)
  })
})

describe('angleFromVertical', () => {
  it('is 0 for a vertical line', () => {
    expect(angleFromVertical({ x: 5, y: 100 }, { x: 5, y: 0 })).toBeCloseTo(0)
  })
  it('is positive when the top leans toward +x', () => {
    // bottom (0,100) -> top (10,0): top is to the right
    expect(angleFromVertical({ x: 0, y: 100 }, { x: 10, y: 0 })).toBeGreaterThan(0)
  })
})

describe('rotatePath', () => {
  it('straightens a tilted path', () => {
    const pivot = { x: 0, y: 0 }
    const angle = angleFromVertical({ x: 0, y: 10 }, { x: 10, y: 0 })
    const tilted = [{ x: 0, y: 10, t: 0 }, { x: 10, y: 0, t: 1 }]
    const out = rotatePath(tilted, angle, pivot)
    expect(out[0].x).toBeCloseTo(out[1].x, 1)   // both x now ~equal => vertical
  })
})

describe('horizontalDrift', () => {
  it('measures spread around refX', () => {
    const pts = [{ x: 8, y: 0, t: 0 }, { x: 14, y: 1, t: 1 }, { x: 6, y: 2, t: 2 }]
    const d = horizontalDrift(pts, 10)
    expect(d.maxRight).toBeCloseTo(4)   // 14-10
    expect(d.maxLeft).toBeCloseTo(4)    // 10-6
    expect(d.range).toBeCloseTo(8)      // 14-6
    expect(d.meanAbs).toBeCloseTo((2 + 4 + 4) / 3) // mean |x-10| = 3.333
  })
  it('clamps maxLeft to 0 when all points are right of refX', () => {
    const pts = [{ x: 12, y: 0, t: 0 }, { x: 18, y: 1, t: 1 }]
    const d = horizontalDrift(pts, 10)
    expect(d.maxLeft).toBe(0)
    expect(d.maxRight).toBeCloseTo(8)
    expect(d.range).toBeCloseTo(6)
  })
})

describe('pxToCm', () => {
  it('a full plate-diameter of pixels equals the plate diameter in cm', () => {
    expect(pxToCm(200, 200)).toBeCloseTo(PLATE_DIAMETER_CM)
  })
  it('scales linearly against the plate pixel diameter', () => {
    // plate is 200px wide → 45cm; a 100px drift is half a plate = 22.5cm
    expect(pxToCm(100, 200)).toBeCloseTo(22.5)
  })
})
