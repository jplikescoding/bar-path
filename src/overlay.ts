import type { PathPoint } from './geometry'

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  path: PathPoint[],
  upToT: number,
  refX: number,
): void {
  const w = ctx.canvas.width, h = ctx.canvas.height
  ctx.drawImage(video, 0, 0, w, h)
  // vertical reference
  ctx.strokeStyle = 'rgba(255,180,0,0.6)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(refX, 0); ctx.lineTo(refX, h); ctx.stroke()
  // path up to current time
  const pts = path.filter((p) => p.t <= upToT)
  if (pts.length > 1) {
    ctx.strokeStyle = '#22ff55'; ctx.lineWidth = 4; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
    const last = pts[pts.length - 1]
    ctx.fillStyle = '#ff3344'; ctx.beginPath(); ctx.arc(last.x, last.y, 7, 0, Math.PI * 2); ctx.fill()
  }
}
