import { describe, it, expect } from 'vitest'
import { initialData } from '../src/state'

describe('initialData', () => {
  it('starts empty', () => {
    const d = initialData()
    expect(d.videoUrl).toBeNull()
    expect(d.seed).toBeNull()
    expect(d.verticalAngleRad).toBeNull()
    expect(d.startTime).toBe(0)
    expect(d.path).toEqual([])
  })
  it('defaults to a deadlift with the side-on question unasked (Phase 3)', () => {
    const d = initialData()
    expect(d.liftType).toBe('deadlift')
    expect(d.sideOn).toBeNull()
    expect(d.depthCue).toBeNull()
  })
})
