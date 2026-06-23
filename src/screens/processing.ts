import type { App } from '../app'
import { loadOpenCV } from '../opencv'
import { createTracker } from '../tracker'
import { playAndProcess } from '../capture'
import { smoothPath, type PathPoint } from '../geometry'

export function renderProcessing(app: App, root: HTMLElement): void {
  const renderProgressShell = () => {
    root.innerHTML = `
      <div class="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <p class="text-neutral-300">Tracking bar path…</p>
        <div class="w-64 h-2 bg-neutral-800 rounded-full overflow-hidden">
          <div id="bar" class="h-full bg-blue-600" style="width:0%"></div>
        </div>
        <p id="pct" class="text-sm text-neutral-500">0%</p>
      </div>`
  }
  renderProgressShell()

  const run = async () => {
    const cv = await loadOpenCV()
    const video = app.data.videoEl!
    let seed = app.data.seed!
    const tracker = createTracker(cv)

    const reTap = (): Promise<{ x: number; y: number }> => new Promise((resolve) => {
      video.pause()
      const c = document.createElement('canvas')
      c.width = video.videoWidth; c.height = video.videoHeight
      c.className = 'max-h-[70vh] w-auto mx-auto rounded-lg touch-none'
      c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height)
      root.innerHTML = `<div class="min-h-screen flex flex-col items-center justify-center gap-3 p-4">
        <p class="text-amber-400">Lost the bar — tap it again to continue.</p></div>`
      root.firstElementChild!.appendChild(c)
      c.addEventListener('pointerdown', (e) => {
        const rect = c.getBoundingClientRect()
        resolve({ x: (e.clientX - rect.left) * (c.width / rect.width),
                  y: (e.clientY - rect.top) * (c.height / rect.height) })
      }, { once: true })
    })

    try {
      const raw: PathPoint[] = []
      let first = true
      await playAndProcess(video, app.data.startTime, async (gray, t) => {
        if (first) { tracker.seedFromGray(gray, seed); raw.push({ x: seed.x, y: seed.y, t }); first = false; return }
        const r = tracker.step(gray)
        // On tracking loss we pause for a re-tap; frames during the loss are not
        // recorded (the path resumes from the re-seeded point).
        if (r.lost) {
          seed = await reTap()
          tracker.seedFromGray(gray, seed)
          raw.push({ x: seed.x, y: seed.y, t })
          renderProgressShell()
          video.play()
        } else raw.push({ x: r.x, y: r.y, t })
      }, (f) => {
        const p = Math.round(f * 100)
        const barEl = root.querySelector<HTMLDivElement>('#bar'); if (barEl) barEl.style.width = `${p}%`
        const pctEl = root.querySelector<HTMLParagraphElement>('#pct'); if (pctEl) pctEl.textContent = `${p}%`
      })
      app.data.path = smoothPath(raw, 5)
      app.go('result')
    } finally {
      tracker.delete()
    }
  }
  run().catch((err) => {
    root.innerHTML = `<div class="min-h-screen grid place-items-center p-6 text-center">
      <div><p class="text-red-400 mb-2">Tracking failed.</p>
      <p class="text-sm text-neutral-500">${String(err)}</p></div></div>`
  })
}
