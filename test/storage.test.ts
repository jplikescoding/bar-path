import { describe, it, expect } from 'vitest'
import { isStandalone, requestPersist } from '../src/storage'

const mm = (match: string | null) => (q: string) => ({ matches: q === match })

describe('isStandalone', () => {
  it('true for iOS Home Screen (navigator.standalone)', () => {
    expect(isStandalone({ standalone: true }, mm(null))).toBe(true)
  })
  it('true for display-mode standalone', () => {
    expect(isStandalone({}, mm('(display-mode: standalone)'))).toBe(true)
  })
  it('false in a browser tab', () => {
    expect(isStandalone({}, mm(null))).toBe(false)
  })
})

function fakeStorage(persisted: boolean, persist: () => Promise<boolean>) {
  let calls = 0
  return {
    get calls() { return calls },
    persisted: async () => persisted,
    persist: () => { calls++; return persist() },
  }
}

describe('requestPersist', () => {
  it('asks once when not yet persisted', async () => {
    const s = fakeStorage(false, async () => true)
    await requestPersist(s as unknown as StorageManager)
    expect(s.calls).toBe(1)
  })
  it('does not ask when already persisted', async () => {
    const s = fakeStorage(true, async () => true)
    await requestPersist(s as unknown as StorageManager)
    expect(s.calls).toBe(0)
  })
  it('swallows a rejected persist and a missing API', async () => {
    const s = fakeStorage(false, () => Promise.reject(new Error('no')))
    await expect(requestPersist(s as unknown as StorageManager)).resolves.toBeUndefined()
    await expect(requestPersist(undefined)).resolves.toBeUndefined()
    await expect(requestPersist({} as StorageManager)).resolves.toBeUndefined()
  })
})
