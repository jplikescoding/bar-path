import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

describe('manifest.webmanifest', () => {
  const path = fileURLToPath(new URL('../public/manifest.webmanifest', import.meta.url))
  const manifest = JSON.parse(readFileSync(path, 'utf-8'))

  it('has a name', () => {
    expect(manifest.name).toBe('Bar Path Tracker')
  })

  it('uses a relative start_url', () => {
    expect(manifest.start_url).toBe('./')
  })

  it('launches standalone', () => {
    expect(manifest.display).toBe('standalone')
  })

  it('includes a 512 icon and a maskable icon', () => {
    const icons = manifest.icons as Array<{ sizes: string; purpose: string }>
    expect(icons.some((i) => i.sizes === '512x512')).toBe(true)
    expect(icons.some((i) => i.purpose.split(' ').includes('maskable'))).toBe(true)
  })
})
