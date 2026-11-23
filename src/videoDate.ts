// Read when a video was RECORDED from its MP4/MOV (ISO-BMFF) metadata, so a lift
// files under the day it was filmed, not the day it was analyzed. Pure parser +
// a thin Blob reader. Never throws: any problem → null (caller falls back).

const MAC_EPOCH_OFFSET_S = 2082844800 // seconds from 1904-01-01 to 1970-01-01
const CHUNK = 4 * 1024 * 1024          // moov sits near the head or the tail
const dec = new TextDecoder()

const typeAt = (b: Uint8Array, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3])

// Child boxes of the container spanning [start, end).
function* children(b: Uint8Array, dv: DataView, start: number, end: number) {
  let i = start
  while (i + 8 <= end) {
    const size = dv.getUint32(i)
    if (size < 8 || i + size > end) return
    yield { type: typeAt(b, i + 4), start: i, end: i + size }
    i += size
  }
}

function fromMvhd(dv: DataView, start: number): number | null {
  const version = dv.getUint8(start + 8)
  const secs = version === 1 ? Number(dv.getBigUint64(start + 12)) : dv.getUint32(start + 12)
  return secs > MAC_EPOCH_OFFSET_S ? (secs - MAC_EPOCH_OFFSET_S) * 1000 : null
}

// Apple's `com.apple.quicktime.creationdate`, e.g. 2026-11-22T19:14:05-0800.
function fromAppleMeta(b: Uint8Array, dv: DataView, start: number, end: number): number | null {
  // QuickTime `meta` has no version/flags; ISO `meta` does. Tell them apart by
  // whether `hdlr` follows the header directly.
  const first = typeAt(b, start + 12) === 'hdlr' ? start + 8 : start + 12
  let keyIndex = -1
  for (const c of children(b, dv, first, end)) {
    if (c.type === 'keys') {
      const count = dv.getUint32(c.start + 12)
      let i = c.start + 16
      for (let k = 1; k <= count && i + 8 <= c.end; k++) {
        const size = dv.getUint32(i)
        if (size < 8) break
        if (dec.decode(b.subarray(i + 8, i + size)) === 'com.apple.quicktime.creationdate') keyIndex = k
        i += size
      }
    } else if (c.type === 'ilst' && keyIndex > 0) {
      for (const item of children(b, dv, c.start + 8, c.end)) {
        if (dv.getUint32(item.start + 4) !== keyIndex) continue
        for (const d of children(b, dv, item.start + 8, item.end)) {
          if (d.type !== 'data') continue
          const s = dec.decode(b.subarray(d.start + 16, d.end)).trim()
          const t = Date.parse(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
          return Number.isNaN(t) ? null : t
        }
      }
    }
  }
  return null
}

function fromMoov(b: Uint8Array, dv: DataView, start: number, end: number): number | null {
  let apple: number | null = null
  let mvhd: number | null = null
  for (const c of children(b, dv, start + 8, end)) {
    if (c.type === 'meta') apple = fromAppleMeta(b, dv, c.start, c.end)
    else if (c.type === 'mvhd') mvhd = fromMvhd(dv, c.start)
  }
  return apple ?? mvhd
}

// Scan the bytes (a whole file, or a head/tail slice) for a complete `moov` box.
export function parseRecordedAt(bytes: Uint8Array): number | null {
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let i = 4; i + 4 <= bytes.length; i++) {
      if (bytes[i] !== 0x6d || typeAt(bytes, i) !== 'moov') continue // 'm'
      const start = i - 4
      const size = dv.getUint32(start)
      if (size < 8 || start + size > bytes.length) continue
      const t = fromMoov(bytes, dv, start, start + size)
      if (t != null) return t
    }
  } catch { /* malformed → no date */ }
  return null
}

export async function readRecordedAt(file: Blob): Promise<number | null> {
  try {
    const head = new Uint8Array(await file.slice(0, CHUNK).arrayBuffer())
    const t = parseRecordedAt(head)
    if (t != null || file.size <= CHUNK) return t
    return parseRecordedAt(new Uint8Array(await file.slice(file.size - CHUNK).arrayBuffer()))
  } catch {
    return null
  }
}

// iOS often stamps lastModified with the pick time, so only trust it when it is
// clearly older than now.
export function pickRecordedAt(parsed: number | null, lastModified: number, now: number): number | null {
  return parsed ?? (lastModified < now - 60_000 ? lastModified : null)
}
