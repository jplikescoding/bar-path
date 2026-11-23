import { describe, it, expect } from 'vitest'
import {
  defaultName, sortByNewest, driftSubtitle, liftDate, monthKey, monthOptions, filterLifts, groupByDay,
  liftSummary, liftTitle, parseWeightLb, toDateInput, withDate, escapeHtml, type SavedAnalysis,
} from '../src/librarySupport'
import { pxToCm } from '../src/geometry'

function make(id: string, createdAt: number, o: Partial<SavedAnalysis> = {}): SavedAnalysis {
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
    ...o,
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
  it('prefixes squat records; deadlift and legacy records stay unchanged', () => {
    expect(driftSubtitle(95, null, 'squat')).toBe('squat · drift 95px')
    expect(driftSubtitle(90, 90, 'squat')).toBe('squat · drift 45.0cm')
    expect(driftSubtitle(95, null, 'deadlift')).toBe('drift 95px')
    expect(driftSubtitle(95)).toBe('drift 95px')
  })
})

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m, d, h, min).getTime()

describe('liftDate', () => {
  it('prefers recordedAt, falls back to createdAt when missing or null', () => {
    expect(liftDate(make('a', 100, { recordedAt: 50 }))).toBe(50)
    expect(liftDate(make('a', 100))).toBe(100)
    expect(liftDate(make('a', 100, { recordedAt: null }))).toBe(100)
  })
  it('sortByNewest sorts by lift date, not save date', () => {
    const a = make('a', 3, { recordedAt: 1 })
    const b = make('b', 2)
    expect(sortByNewest([a, b]).map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('monthOptions / filterLifts', () => {
  const nov1 = make('n1', at(2026, 10, 22), { liftType: 'squat' })
  const nov2 = make('n2', at(2026, 10, 3))
  const oct = make('o', at(2026, 9, 9), { liftType: 'deadlift' })
  const list = [nov1, nov2, oct]
  it('lists distinct months newest first', () => {
    expect(monthKey(at(2026, 10, 3))).toBe('2026-11')
    expect(monthOptions(list)).toEqual([
      { key: '2026-11', label: 'Nov 2026' },
      { key: '2026-10', label: 'Oct 2026' },
    ])
  })
  it('filters by lift (legacy = deadlift) and month, combinable', () => {
    expect(filterLifts(list, 'all', 'all')).toEqual(list)
    expect(filterLifts(list, 'deadlift', 'all').map((x) => x.id)).toEqual(['n2', 'o'])
    expect(filterLifts(list, 'squat', '2026-11').map((x) => x.id)).toEqual(['n1'])
    expect(filterLifts(list, 'squat', '2026-10')).toEqual([])
  })
})

describe('groupByDay', () => {
  const now = at(2026, 10, 23)
  it('groups by local day, preserving order, with weekday labels', () => {
    const g = groupByDay([
      make('a', at(2026, 10, 22, 19)), make('b', at(2026, 10, 22, 8)), make('c', at(2026, 10, 18)),
    ], now)
    expect(g.map((x) => x.label)).toEqual(['Sun, Nov 22', 'Wed, Nov 18'])
    expect(g.map((x) => x.items.map((i) => i.id))).toEqual([['a', 'b'], ['c']])
  })
  it('adds the year for other years', () => {
    expect(groupByDay([make('a', at(2025, 11, 31))], now)[0].label).toBe('Wed, Dec 31, 2025')
  })
})

describe('liftSummary / liftTitle', () => {
  const depth = (where: 'below' | 'level' | 'above') => ({ dropPx: 1, dropCm: null, where, frameT: 0 })
  it('squat shows depth as a measurement when measured', () => {
    expect(liftSummary(make('a', 1, { liftType: 'squat', depthCue: depth('below') }))).toBe('below parallel')
    expect(liftSummary(make('a', 1, { liftType: 'squat', depthCue: depth('level') }))).toBe('at parallel')
    expect(liftSummary(make('a', 1, { liftType: 'squat', depthCue: depth('above') }))).toBe('above parallel')
  })
  it('falls back to drift in px or cm', () => {
    expect(liftSummary(make('a', 1, { liftType: 'squat', driftRange: 95 }))).toBe('drift 95 px')
    expect(liftSummary(make('a', 1, { driftRange: 40, plateDiameterPx: 90 })))
      .toBe(`drift ${pxToCm(40, 90).toFixed(1)} cm`)
  })
  it('titles by lift type with optional weight', () => {
    expect(liftTitle(make('a', 1))).toBe('Deadlift')
    expect(liftTitle(make('a', 1, { liftType: 'squat', weightLb: 225 }))).toBe('Squat · 225 lb')
  })
})

describe('parseWeightLb', () => {
  it('accepts positive numbers only', () => {
    expect(['', 'abc', '0', '-5', '312.5', ' 315 '].map(parseWeightLb)).toEqual([null, null, null, null, 312.5, 315])
  })
})

describe('toDateInput / withDate', () => {
  const ts = at(2026, 10, 3, 19, 14)
  it('formats local YYYY-MM-DD', () => { expect(toDateInput(ts)).toBe('2026-11-03') })
  it('moves to a new local date keeping time of day, across DST', () => {
    expect(withDate(ts, '2026-03-08')).toBe(at(2026, 2, 8, 19, 14))
  })
  it('returns ts unchanged for an invalid date string', () => { expect(withDate(ts, '')).toBe(ts) })
})

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<b>"a"&'</b>`)).toBe('&lt;b&gt;&quot;a&quot;&amp;&#39;&lt;/b&gt;')
  })
})
