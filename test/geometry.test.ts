import { describe, it, expect } from 'vitest'
import { smoothPath, angleFromVertical, rotatePath, horizontalDrift } from '../src/geometry'

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
  })
  it('clamps maxLeft to 0 when all points are right of refX', () => {
    const pts = [{ x: 12, y: 0, t: 0 }, { x: 18, y: 1, t: 1 }]
    const d = horizontalDrift(pts, 10)
    expect(d.maxLeft).toBe(0)
    expect(d.maxRight).toBeCloseTo(8)
    expect(d.range).toBeCloseTo(6)
  })
})
