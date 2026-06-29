import type { App } from '../app'
import { loadOpenCV } from '../opencv'
import { createTracker } from '../tracker'
import { playAndProcess, playFrames } from '../capture'
import { loadPose } from '../pose'
import { midfootXFromFrame, robustMidfoot, analyzeBarDrift } from '../coach'
import { smoothPath, type PathPoint } from '../geometry'

export function renderProcessing(app: App, root: HTMLElement): void {
  const video = app.data.videoEl!
  root.innerHTML = `
    <div class="min-h-screen flex flex-col items-center justify-center gap-5 p-4">
      <p class="eyebrow">Step 2 — Tracking the bar</p>
      <div id="stage" class="frame">
        <div id="retap" class="hidden absolute inset-0 bg-black/55 backdrop-blur-sm flex-col items-center justify-center gap-2 p-4 z-10">
          <p class="text-[var(--amber)] text-center font-medium">Lost the bar — tap it again.</p>
        </div>
      </div>
      <div class="w-64 h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden border border-[var(--line)]">
        <div id="bar" class="h-full bg-[var(--amber)] transition-[width] duration-150" style="width:0%"></div>
      </div>
      <p id="pct" class="readout text-sm text-[var(--muted)]">Tracking… 0%</p>
    </div>`

  // Mount the persistent video (visible + playing) so iOS decodes frames that
  // the capture loop's drawImage can read.
  const stage = root.querySelector<HTMLDivElement>('#stage')!
  video.className = 'max-h-[60vh] w-auto block'
  stage.insertBefore(video, stage.firstChild)
  // transparent canvas over the video to capture the re-tap coordinate
  const tapCanvas = document.createElement('canvas')
  tapCanvas.className = 'hidden absolute inset-0 w-full h-full touch-none z-20'
  tapCanvas.width = video.videoWidth
  tapCanvas.height = video.videoHeight
  stage.appendChild(tapCanvas)

  const barEl = root.querySelector<HTMLDivElement>('#bar')!
  const pctEl = root.querySelector<HTMLParagraphElement>('#pct')!
  const retapEl = root.querySelector<HTMLDivElement>('#retap')!

  const reTap = (): Promise<{ x: number; y: number }> => new Promise((resolve) => {
    video.pause()
    retapEl.classList.remove('hidden'); retapEl.classList.add('flex')
    tapCanvas.classList.remove('hidden')
    tapCanvas.addEventListener('pointerdown', (e) => {
      const rect = tapCanvas.getBoundingClientRect()
      retapEl.classList.add('hidden'); retapEl.classList.remove('flex')
      tapCanvas.classList.add('hidden')
      resolve({
        x: (e.clientX - rect.left) * (tapCanvas.width / rect.width),
        y: (e.clientY - rect.top) * (tapCanvas.height / rect.height),
      })
    }, { once: true })
  })

  const run = async () => {
    pctEl.textContent = 'Loading vision engine…'
    const cv = await loadOpenCV()
    let seed = app.data.seed!
    const start = app.data.startTime
    const end = app.data.endTime != null && app.data.endTime > start ? app.data.endTime : null
    const tracker = createTracker(cv)
    try {
      const raw: PathPoint[] = []
      let first = true
      await playAndProcess(video, start, end, async (gray, t) => {
        if (first) { tracker.seedFromGray(gray, seed); raw.push({ x: seed.x, y: seed.y, t }); first = false; return }
        const r = tracker.step(gray)
        // On tracking loss we pause for a re-tap; the path resumes from the
        // re-seeded point (frames during the loss are not recorded).
        if (r.lost) {
          seed = await reTap()
          tracker.seedFromGray(gray, seed)
          raw.push({ x: seed.x, y: seed.y, t })
          video.play()
        } else {
          raw.push({ x: r.x, y: r.y, t })
        }
      }, (f) => {
        const p = Math.round(f * 100)
        barEl.style.width = `${p}%`; pctEl.textContent = `Tracking… ${p}%`
      })
      app.data.path = smoothPath(raw, 5)

      // Pass 2 (pose): a SECOND decode pass — pose alone (~37 ms/frame on iPhone)
      // won't fit alongside OpenCV in one real-time loop. Strictly additive: any
      // failure falls back to the plate-tap line (seed.x), then to no cue.
      try {
        pctEl.textContent = 'Reading body position…'
        barEl.style.width = '0%'
        const pose = await loadPose()
        const xs: (number | null)[] = []
        await playFrames(video, start, end, (v, tMs) => {
          const lm = pose.detect(v, tMs)[0]
          xs.push(lm ? midfootXFromFrame(lm, v.videoWidth) : null)
        }, (f) => {
          const p = Math.round(f * 100)
          barEl.style.width = `${p}%`; pctEl.textContent = `Reading body position… ${p}%`
        })
        app.data.poseMidfoot = robustMidfoot(xs)
      } catch (err) {
        console.error('pose pass failed; cue falls back to the plate-tap line', err)
        app.data.poseMidfoot = null
      }
      app.data.cue = analyzeBarDrift(
        app.data.path, app.data.poseMidfoot, app.data.plateDiameterPx, app.data.seed!.x,
      )
      app.go('result')
    } finally {
      tracker.delete()
    }
  }
  run().catch((err) => {
    root.innerHTML = `<div class="min-h-screen grid place-items-center p-6 text-center">
      <div><p class="text-[var(--mark)] mb-2 font-medium">Tracking failed.</p>
      <p class="readout text-sm text-[var(--faint)]">${String(err)}</p></div></div>`
  })
}
