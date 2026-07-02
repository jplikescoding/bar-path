import type { PathPoint } from './geometry'
import type { PoseFrame } from './coach'

// Body-only BlazePose topology (face omitted — clutter with no coaching value).
// Hardcoded so drawing a saved lift's skeleton never needs the MediaPipe bundle.
const POSE_BODY_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],             // shoulders + arms
  [11, 23], [12, 24], [23, 24],                                 // torso
  [23, 25], [24, 26], [25, 27], [26, 28],                       // legs
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],   // feet
]
const BODY_LANDMARKS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]

// Draw one pose frame as instrument scaffolding: muted chalk bones + joints,
// skipping any segment whose end is below the visibility floor. When most of
// the body is uncertain the whole skeleton dims further (honest, not confident-
// wrong). highlightHips paints the hip segment amber (a fired hip-rise moment).
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame,
  highlightHips: boolean,
  minVis = 0.5,
): void {
  const w = ctx.canvas.width, h = ctx.canvas.height
  const vis = (i: number) => {
    const l = frame.lm[i]
    return l != null && (l.vis == null || l.vis >= minVis)
  }
  const visibleCount = BODY_LANDMARKS.filter(vis).length
  const alpha = visibleCount >= BODY_LANDMARKS.length * 0.6 ? 0.5 : 0.25
  ctx.save()
  ctx.strokeStyle = `rgba(226,232,240,${alpha})`
  ctx.fillStyle = `rgba(226,232,240,${alpha})`
  ctx.lineWidth = 3; ctx.lineCap = 'round'
  for (const [a, b] of POSE_BODY_CONNECTIONS) {
    if (!vis(a) || !vis(b)) continue
    ctx.beginPath()
    ctx.moveTo(frame.lm[a].x * w, frame.lm[a].y * h)
    ctx.lineTo(frame.lm[b].x * w, frame.lm[b].y * h)
    ctx.stroke()
  }
  for (const i of BODY_LANDMARKS) {
    if (!vis(i)) continue
    ctx.beginPath(); ctx.arc(frame.lm[i].x * w, frame.lm[i].y * h, 4, 0, Math.PI * 2); ctx.fill()
  }
  if (highlightHips && vis(23) && vis(24)) {
    ctx.strokeStyle = '#FFB020'; ctx.fillStyle = '#FFB020'; ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(frame.lm[23].x * w, frame.lm[23].y * h)
    ctx.lineTo(frame.lm[24].x * w, frame.lm[24].y * h)
    ctx.stroke()
    for (const i of [23, 24]) {
      ctx.beginPath(); ctx.arc(frame.lm[i].x * w, frame.lm[i].y * h, 5, 0, Math.PI * 2); ctx.fill()
    }
  }
  ctx.restore()
}

// Draw ONLY the path overlay (vertical reference + polyline + latest dot) onto a
// transparent canvas positioned over a live <video> element. The video renders
// the frame natively (works on iOS, unlike drawImage on an undecoded video).
export function drawPath(
  ctx: CanvasRenderingContext2D,
  path: PathPoint[],
  upToT: number,
  refX: number,
): void {
  const h = ctx.canvas.height
  ctx.strokeStyle = 'rgba(255,180,0,0.6)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(refX, 0); ctx.lineTo(refX, h); ctx.stroke()
  const pts = path.filter((p) => p.t <= upToT)
  if (pts.length > 1) {
    ctx.strokeStyle = '#22ff55'; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
  }
  if (pts.length > 0) {
    const last = pts[pts.length - 1]
    ctx.fillStyle = '#ff3344'; ctx.beginPath(); ctx.arc(last.x, last.y, 11, 0, Math.PI * 2); ctx.fill()
  }
}

// Review drawing: the FULL path is always visible, with a marker at the bar's
// position for the current time — so scrubbing/playing shows where you are along
// the path. Used on the result screen (transparent canvas over the native video).
export function drawReview(
  ctx: CanvasRenderingContext2D,
  path: PathPoint[],
  currentT: number,
  refX: number,
): void {
  const w = ctx.canvas.width, h = ctx.canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(255,180,0,0.6)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(refX, 0); ctx.lineTo(refX, h); ctx.stroke()

  // Progressive trail: only draw the path up to the current time, with the
  // freshest segment bright green fading to gray over FADE seconds behind it.
  const FADE = 1.2
  ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  let lead: PathPoint | null = path.length ? path[0] : null
  for (let i = 1; i < path.length; i++) {
    if (path[i].t > currentT) break
    const k = Math.min(1, Math.max(0, (currentT - path[i].t) / FADE)) // 0 fresh, 1 old
    const r = Math.round(34 + (120 - 34) * k)
    const g = Math.round(255 + (120 - 255) * k)
    const b = Math.round(85 + (120 - 85) * k)
    ctx.strokeStyle = `rgb(${r},${g},${b})`
    ctx.beginPath(); ctx.moveTo(path[i - 1].x, path[i - 1].y); ctx.lineTo(path[i].x, path[i].y); ctx.stroke()
    lead = path[i]
  }
  // red marker at the leading edge (the bar's position "now")
  if (lead) {
    ctx.fillStyle = '#ff3344'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(lead.x, lead.y, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  }
}

// Draw the bar-off-midfoot evidence at the peak-drift frame: a dashed midfoot
// reference line + the horizontal bar-to-midfoot gap at the bar's height.
// Called by the result screen AFTER drawReview (which clears the canvas), only
// when the current time is at the cue's peak frame. Amber for a nudge; a good-tone
// cue passes muted chalk (amber stays action-only).
export function drawDriftMarker(
  ctx: CanvasRenderingContext2D,
  path: PathPoint[],
  cue: { refX: number; frameT: number; color?: string },
): void {
  if (!path.length) return
  const color = cue.color ?? '#FFB020'
  // Bar position at the peak frame = the path point nearest cue.frameT.
  let bar = path[0], best = Infinity
  for (const p of path) {
    const d = Math.abs(p.t - cue.frameT)
    if (d < best) { best = d; bar = p }
  }
  const h = ctx.canvas.height
  ctx.save()
  // Midfoot reference line (dashed — distinct from the muted plumb line).
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([6, 5])
  ctx.beginPath(); ctx.moveTo(cue.refX, 0); ctx.lineTo(cue.refX, h); ctx.stroke()
  // The drift itself: a solid gap from midfoot to the bar at the bar's height.
  ctx.setLineDash([]); ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(cue.refX, bar.y); ctx.lineTo(bar.x, bar.y); ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(bar.x, bar.y, 5, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

// Composite the current video frame + path overlay onto a canvas. Used for
// EXPORT, where we draw during playback (drawImage works while the video plays).
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  path: PathPoint[],
  upToT: number,
  refX: number,
): void {
  ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height)
  drawPath(ctx, path, upToT, refX)
}
