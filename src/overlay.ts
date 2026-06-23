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
