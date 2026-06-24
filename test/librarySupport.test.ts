import { describe, it, expect } from 'vitest'
import { defaultName, sortByNewest, driftSubtitle, type SavedAnalysis } from '../src/librarySupport'

function make(id: string, createdAt: number): SavedAnalysis {
  return {
    id,
    name: `n-${id}`,
    createdAt,
    video: new Blob(['x']),
    seed: { x: 0, y: 0 },
    startTime: 0,
    endTime: null,
    verticalAngleRad: null,
    path: [],
    thumbnail: 'data:,',
    driftRange: 0,
  }
}

describe('defaultName', () => {
  it('formats a fixed timestamp stably', () => {
    // 2026-06-23 19:14 local time, built from explicit components.
    const ts = new Date(2026, 5, 23, 19, 14, 0).getTime()
    expect(defaultName(ts)).toBe('Lift — Jun 23, 7:14 PM')
  })
  it('uses 12-hour clock with AM and zero-padded minutes', () => {
    const ts = new Date(2026, 0, 5, 0, 3, 0).getTime()
    expect(defaultName(ts)).toBe('Lift — Jan 5, 12:03 AM')
  })
})

describe('sortByNewest', () => {
  it('orders by createdAt descending without mutating input', () => {
    const a = make('a', 100)
    const b = make('b', 300)
    const c = make('c', 200)
    const input = [a, b, c]
    const out = sortByNewest(input)
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'a'])
    expect(input.map((x) => x.id)).toEqual(['a', 'b', 'c']) // unchanged
  })
})

describe('driftSubtitle', () => {
  it('rounds and labels in pixels', () => {
    expect(driftSubtitle(95)).toBe('drift 95px')
    expect(driftSubtitle(94.6)).toBe('drift 95px')
  })
})
