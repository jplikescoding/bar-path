import type { App } from '../app'
import { loadOpenCV } from '../opencv'
import { createTracker } from '../tracker'
import { playAndProcess } from '../capture'
import { smoothPath, type PathPoint } from '../geometry'

export function renderProcessing(app: App, root: HTMLElement): void {
  root.innerHTML = `
    <div class="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <p class="text-neutral-300">Tracking bar path…</p>
      <div class="w-64 h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div id="bar" class="h-full bg-blue-600" style="width:0%"></div>
      </div>
      <p id="pct" class="text-sm text-neutral-500">0%</p>
    </div>`
  const barEl = root.querySelector<HTMLDivElement>('#bar')!
  const pctEl = root.querySelector<HTMLParagraphElement>('#pct')!

  const run = async () => {
    const cv = await loadOpenCV()
    const video = app.data.videoEl!
    const seed = app.data.seed!
    const tracker = createTracker(cv)
    const raw: PathPoint[] = []
    let first = true
    await playAndProcess(video, app.data.startTime, (gray, t) => {
      if (first) { tracker.seedFromGray(gray, seed); raw.push({ x: seed.x, y: seed.y, t }); first = false }
      else { const r = tracker.step(gray); raw.push({ x: r.x, y: r.y, t }) }
    }, (f) => {
      const p = Math.round(f * 100)
      barEl.style.width = `${p}%`; pctEl.textContent = `${p}%`
    })
    tracker.delete()
    app.data.path = smoothPath(raw, 5)
    app.go('result')
  }
  run().catch((err) => {
    root.innerHTML = `<div class="min-h-screen grid place-items-center p-6 text-center">
      <div><p class="text-red-400 mb-2">Tracking failed.</p>
      <p class="text-sm text-neutral-500">${String(err)}</p></div></div>`
  })
}
