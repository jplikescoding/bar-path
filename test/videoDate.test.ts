import { describe, it, expect } from 'vitest'
import { parseRecordedAt, pickRecordedAt } from '../src/videoDate'

// ISO-BMFF box builder: 4-byte big-endian size + 4-char type + payload.
const enc = new TextEncoder()
function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const len = 8 + parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(len)
  new DataView(out.buffer).setUint32(0, len)
  out.set(enc.encode(type), 4)
  let o = 8
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b }
const cat = (...parts: Uint8Array[]) => box('xxxx', ...parts).slice(8)

const MAC_EPOCH_OFFSET = 2082844800
function mvhd(unixSeconds: number): Uint8Array {
  // version 0 + flags, creation_time, modification_time, timescale, duration, rest zero
  return box('mvhd', u32(0), u32(unixSeconds === 0 ? 0 : unixSeconds + MAC_EPOCH_OFFSET), u32(0), u32(600), u32(0), new Uint8Array(80))
}
function appleMeta(value: string): Uint8Array {
  const hdlr = box('hdlr', u32(0), u32(0), enc.encode('mdta'), new Uint8Array(12), new Uint8Array(1))
  const keyName = enc.encode('com.apple.quicktime.creationdate')
  const other = enc.encode('com.apple.quicktime.make')
  const keys = box('keys', u32(0), u32(2),
    u32(8 + other.length), enc.encode('mdta'), other,
    u32(8 + keyName.length), enc.encode('mdta'), keyName)
  const data = (s: string) => box('data', u32(1), u32(0), enc.encode(s))
  const ilst = box('ilst',
    box('\0\0\0\u0001', data('Apple')),
    box('\0\0\0\u0002', data(value)))
  return box('meta', hdlr, keys, ilst)
}

const T = Date.UTC(2026, 10, 22, 3, 14, 5)

describe('parseRecordedAt', () => {
  it('reads mvhd creation_time', () => {
    expect(parseRecordedAt(box('moov', mvhd(T / 1000)))).toBe(T)
  })
  it('ignores a zero mvhd creation_time', () => {
    expect(parseRecordedAt(box('moov', mvhd(0)))).toBeNull()
  })
  it('prefers the Apple creationdate over mvhd (offset without colon)', () => {
    const bytes = cat(box('ftyp', enc.encode('qt  ')), box('moov', mvhd(T / 1000 + 9999), appleMeta('2026-11-22T19:14:05-0800')))
    expect(parseRecordedAt(bytes)).toBe(Date.parse('2026-11-22T19:14:05-08:00'))
  })
  it('accepts the Apple offset with a colon', () => {
    expect(parseRecordedAt(box('moov', appleMeta('2026-11-22T19:14:05-08:00'))))
      .toBe(Date.parse('2026-11-22T19:14:05-08:00'))
  })
  it('finds moov in a tail slice that starts mid-mdat', () => {
    const file = cat(box('ftyp', enc.encode('isom')), box('mdat', new Uint8Array(1024).fill(7)), box('moov', mvhd(T / 1000)))
    expect(parseRecordedAt(file.slice(500))).toBe(T)
  })
  it('returns null for garbage, empty, or truncated input without throwing', () => {
    expect(parseRecordedAt(new Uint8Array(0))).toBeNull()
    expect(parseRecordedAt(Uint8Array.from({ length: 300 }, (_, i) => (i * 37) % 256))).toBeNull()
    const moov = box('moov', mvhd(T / 1000))
    expect(parseRecordedAt(moov.slice(0, 20))).toBeNull()
  })
})

describe('pickRecordedAt', () => {
  const now = 1_800_000_000_000
  it('uses the parsed date first', () => { expect(pickRecordedAt(5, now - 120_000, now)).toBe(5) })
  it('falls back to lastModified only when clearly older than the pick', () => {
    expect(pickRecordedAt(null, now - 120_000, now)).toBe(now - 120_000)
    expect(pickRecordedAt(null, now - 5_000, now)).toBeNull()
  })
})
