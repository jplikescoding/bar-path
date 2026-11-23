import { pxToCm, type PathPoint } from './geometry'
import type { BarDriftCue, HipRiseCue, LiftType, MidfootEstimate, PoseFrame, SquatDepthCue } from './coach'

// A persisted, completed bar-path analysis. Mirrors AppData plus the bits we need
// to render a library list (name/date/thumbnail/drift) and to reopen later.
export interface SavedAnalysis {
  id: string
  name: string
  createdAt: number // ms epoch
  video: Blob
  seed: { x: number; y: number }
  startTime: number
  endTime: number | null
  verticalAngleRad: number | null
  path: PathPoint[]
  thumbnail: string // data: URL JPEG
  driftRange: number
  plateDiameterPx?: number | null // bar-plate diameter in px; enables cm readout. Optional: older records lack it.
  cue?: BarDriftCue | null            // bar-off-midfoot cue; optional — older records lack it
  poseMidfoot?: MidfootEstimate | null
  poseFrames?: PoseFrame[] | null     // slim per-frame pose (skeleton overlay); optional — older records lack it
  hipCue?: HipRiseCue | null          // early-hip-rise timing cue; optional — older records lack it
  liftType?: LiftType                 // Phase 3; optional — older records are deadlifts
  sideOn?: boolean | null             // squat angle answer; optional — older records lack it
  depthCue?: SquatDepthCue | null     // squat depth readout; optional — older records lack it
  recordedAt?: number | null          // when the video was recorded (ms epoch); optional
  weightLb?: number | null            // optional, pounds, stored as entered
  note?: string                       // optional free text
}

export type LiftFilter = 'all' | LiftType

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// e.g. "Lift — Jun 23, 7:14 PM". Uses new Date(createdAt) (allowed with an arg).
export function defaultName(createdAt: number): string {
  const d = new Date(createdAt)
  const month = MONTHS[d.getMonth()]
  const day = d.getDate()
  let hours = d.getHours()
  const minutes = d.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  if (hours === 0) hours = 12
  const mm = minutes < 10 ? `0${minutes}` : String(minutes)
  return `Lift — ${month} ${day}, ${hours}:${mm} ${ampm}`
}

// The date a lift is filed under: when it was recorded, else when it was saved.
export function liftDate(a: SavedAnalysis): number {
  return a.recordedAt ?? a.createdAt
}

// Newest first by lift date. Returns a new array; does not mutate the input.
export function sortByNewest(list: SavedAnalysis[]): SavedAnalysis[] {
  return list.slice().sort((a, b) => liftDate(b) - liftDate(a))
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

// 'YYYY-MM' in local time.
export function monthKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

// Distinct months that have lifts, newest first, e.g. { key: '2026-11', label: 'Nov 2026' }.
export function monthOptions(list: SavedAnalysis[]): { key: string; label: string }[] {
  const keys = [...new Set(list.map((a) => monthKey(liftDate(a))))].sort().reverse()
  return keys.map((key) => {
    const [y, m] = key.split('-').map(Number)
    return { key, label: `${MONTHS[m - 1]} ${y}` }
  })
}

// Legacy records without liftType are deadlifts.
export function filterLifts(list: SavedAnalysis[], lift: LiftFilter, month: 'all' | string): SavedAnalysis[] {
  return list.filter((a) =>
    (lift === 'all' || (a.liftType ?? 'deadlift') === lift) &&
    (month === 'all' || monthKey(liftDate(a)) === month))
}

// Consecutive grouping by local calendar day (input should already be sorted).
// Label 'Sun, Nov 22', plus ', 2025' when not the year of `now`.
export function groupByDay(list: SavedAnalysis[], now: number): { label: string; items: SavedAnalysis[] }[] {
  const thisYear = new Date(now).getFullYear()
  const groups: { key: string; label: string; items: SavedAnalysis[] }[] = []
  for (const a of list) {
    const d = new Date(liftDate(a))
    const key = d.toDateString()
    const last = groups[groups.length - 1]
    if (last && last.key === key) { last.items.push(a); continue }
    const year = d.getFullYear() === thisYear ? '' : `, ${d.getFullYear()}`
    groups.push({ key, label: `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}${year}`, items: [a] })
  }
  return groups.map(({ label, items }) => ({ label, items }))
}

const DEPTH_WORDS = { below: 'below parallel', level: 'at parallel', above: 'above parallel' } as const

// Row summary: squat depth (a measurement, never a verdict) when measured, else drift.
export function liftSummary(a: SavedAnalysis): string {
  if (a.liftType === 'squat' && a.depthCue) return DEPTH_WORDS[a.depthCue.where]
  if (a.plateDiameterPx) return `drift ${pxToCm(a.driftRange, a.plateDiameterPx).toFixed(1)} cm`
  return `drift ${Math.round(a.driftRange)} px`
}

export function liftTitle(a: SavedAnalysis): string {
  const type = a.liftType === 'squat' ? 'Squat' : 'Deadlift'
  return a.weightLb ? `${type} · ${a.weightLb} lb` : type
}

// Positive finite number, else null.
export function parseWeightLb(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

// Local 'YYYY-MM-DD' for <input type="date">.
export function toDateInput(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// Same local time of day on a new local date; invalid ymd → ts unchanged.
export function withDate(ts: number, ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ts
  const d = new Date(ts)
  d.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.getTime()
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
