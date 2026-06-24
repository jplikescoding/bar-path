import type { PathPoint } from './geometry'

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
}

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

// Newest first by createdAt. Returns a new array; does not mutate the input.
export function sortByNewest(list: SavedAnalysis[]): SavedAnalysis[] {
  return list.slice().sort((a, b) => b.createdAt - a.createdAt)
}

// e.g. "drift 95px". Rounds to a whole pixel.
export function driftSubtitle(range: number): string {
  return `drift ${Math.round(range)}px`
}
