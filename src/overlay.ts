import type { PathPoint } from './geometry'

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
    ctx.strokeStyle = '#22ff55'; ctx.lineWidth = 4; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
  }
  if (pts.length > 0) {
    const last = pts[pts.length - 1]
    ctx.fillStyle = '#ff3344'; ctx.beginPath(); ctx.arc(last.x, last.y, 7, 0, Math.PI * 2); ctx.fill()
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
  ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
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
    ctx.beginPath(); ctx.arc(lead.x, lead.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  }
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
