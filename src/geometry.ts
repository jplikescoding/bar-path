export interface PathPoint { x: number; y: number; t: number }

export function smoothPath(pts: PathPoint[], window: number): PathPoint[] {
  if (window <= 1) return pts.map((p) => ({ ...p }))
  const half = Math.floor(window / 2)
  return pts.map((p, i) => {
    let sx = 0, sy = 0, n = 0
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= pts.length) continue
      sx += pts[j].x; sy += pts[j].y; n++
    }
    return { x: sx / n, y: sy / n, t: p.t }
  })
}

export function angleFromVertical(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  // vector pointing "up" the line (toward smaller y, i.e. top)
  const top = a.y >= b.y ? b : a
  const bot = a.y >= b.y ? a : b
  const dx = top.x - bot.x
  const dy = bot.y - top.y // positive (screen y grows downward)
  return Math.atan2(dx, dy) // 0 when dx=0 (vertical); + when top is right
}

export function rotatePath(
  pts: PathPoint[],
  angleRad: number,
  pivot: { x: number; y: number },
): PathPoint[] {
  const c = Math.cos(-angleRad), s = Math.sin(-angleRad)
  return pts.map((p) => {
    const x = p.x - pivot.x, y = p.y - pivot.y
    return { x: pivot.x + x * c - y * s, y: pivot.y + x * s + y * c, t: p.t }
  })
}

// Standard Olympic / bumper plate face diameter (450 mm). Used as the on-screen
// ruler to convert pixel distances to centimeters when the user has sized a plate.
export const PLATE_DIAMETER_CM = 45

// Convert a pixel distance to centimeters given the bar plate's pixel diameter.
// Only valid in the plate's depth plane (a side-on clip where the plate faces the camera).
export function pxToCm(px: number, plateDiameterPx: number): number {
  return px * (PLATE_DIAMETER_CM / plateDiameterPx)
}

export interface Drift { refX: number; maxLeft: number; maxRight: number; range: number }

export function horizontalDrift(pts: PathPoint[], refX: number): Drift {
  let minX = Infinity, maxX = -Infinity
  for (const p of pts) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x }
  return {
    refX,
    maxLeft: Math.max(0, refX - minX),
    maxRight: Math.max(0, maxX - refX),
    range: maxX - minX,
  }
}
