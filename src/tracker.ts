// Lucas-Kanade cluster tracker. Mirrors prototype/track_lk.py.
export interface Tracker {
  seedFromGray(gray: any, seed: { x: number; y: number }): void
  step(gray: any): { x: number; y: number; lost: boolean }
  delete(): void
}

export function createTracker(cv: any): Tracker {
  const winSize = new cv.Size(31, 31)
  const criteria = new cv.TermCriteria(cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 30, 0.01)
  let prevGray: any = null
  let p0: any = null               // CV_32FC2 Nx1 feature points
  let offsets: { dx: number; dy: number }[] = []  // each feature's offset from bar point
  let bar = { x: 0, y: 0 }

  function readPoints(mat: any): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = []
    for (let i = 0; i < mat.rows; i++) out.push({ x: mat.data32F[i * 2], y: mat.data32F[i * 2 + 1] })
    return out
  }
  function writePoints(points: { x: number; y: number }[]): any {
    const mat = new cv.Mat(points.length, 1, cv.CV_32FC2)
    points.forEach((p, i) => { mat.data32F[i * 2] = p.x; mat.data32F[i * 2 + 1] = p.y })
    return mat
  }

  return {
    seedFromGray(gray, seed) {
      bar = { ...seed }
      const mask = new cv.Mat.zeros(gray.rows, gray.cols, cv.CV_8UC1)
      cv.circle(mask, new cv.Point(Math.round(seed.x), Math.round(seed.y)), 45,
        new cv.Scalar(255), -1)
      const corners = new cv.Mat()
      cv.goodFeaturesToTrack(gray, corners, 40, 0.01, 4, mask, 3)
      mask.delete()
      let points = corners.rows > 0 ? readPoints(corners) : [seed]
      corners.delete()
      offsets = points.map((p) => ({ dx: p.x - seed.x, dy: p.y - seed.y }))
      if (p0) p0.delete()
      p0 = writePoints(points)
      if (prevGray) prevGray.delete()
      prevGray = gray.clone()
    },

    step(gray) {
      if (!prevGray || !p0) return { ...bar, lost: true }
      const p1 = new cv.Mat(), st = new cv.Mat(), err = new cv.Mat()
      cv.calcOpticalFlowPyrLK(prevGray, gray, p0, p1, st, err, winSize, 3, criteria)
      const pts = readPoints(p1)
      const good: { x: number; y: number; dx: number; dy: number }[] = []
      for (let i = 0; i < pts.length; i++) {
        if (st.data[i] === 1) good.push({ ...pts[i], dx: offsets[i].dx, dy: offsets[i].dy })
      }
      p1.delete(); st.delete(); err.delete()
      if (good.length < 3) return { ...bar, lost: true }
      const xs = good.map((g) => g.x - g.dx).sort((a, b) => a - b)
      const ys = good.map((g) => g.y - g.dy).sort((a, b) => a - b)
      bar = { x: xs[xs.length >> 1], y: ys[ys.length >> 1] }
      // refresh anchor so it adapts to rotation/scale
      offsets = good.map((g) => ({ dx: g.x - bar.x, dy: g.y - bar.y }))
      p0.delete(); p0 = writePoints(good.map((g) => ({ x: g.x, y: g.y })))
      prevGray.delete(); prevGray = gray.clone()
      return { ...bar, lost: false }
    },

    delete() {
      if (prevGray) prevGray.delete()
      if (p0) p0.delete()
      prevGray = null; p0 = null
    },
  }
}
