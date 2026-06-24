import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { saveAnalysis, listAnalyses, getAnalysis, deleteAnalysis } from '../src/library'
import type { SavedAnalysis } from '../src/librarySupport'

function make(id: string, createdAt: number): SavedAnalysis {
  return {
    id,
    name: `n-${id}`,
    createdAt,
    video: new Blob(['x']),
    seed: { x: 1, y: 2 },
    startTime: 0,
    endTime: null,
    verticalAngleRad: null,
    path: [{ x: 1, y: 2, t: 0 }],
    thumbnail: 'data:,',
    driftRange: 42,
  }
}

describe('library IndexedDB CRUD', () => {
  it('saves, lists newest-first, gets, and deletes', async () => {
    const older = make('older', 1000)
    const newer = make('newer', 2000)
    await saveAnalysis(older)
    await saveAnalysis(newer)

    const listed = await listAnalyses()
    expect(listed.map((a) => a.id)).toEqual(['newer', 'older']) // newest first

    const got = await getAnalysis('older')
    expect(got?.id).toBe('older')
    expect(got?.driftRange).toBe(42)

    await deleteAnalysis('older')
    const after = await listAnalyses()
    expect(after.map((a) => a.id)).toEqual(['newer'])
    expect(await getAnalysis('older')).toBeUndefined()
  })
})
