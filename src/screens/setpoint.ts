import type { App } from '../app'
import { angleFromVertical } from '../geometry'

export function renderSetPoint(app: App, root: HTMLElement): void {
  const video = app.data.videoEl!
  // NOTE: do NOT load OpenCV here — parsing the ~10MB engine blocks the main
  // thread and would freeze scrubbing/tapping. It loads on the processing
  // screen (a non-interactive progress view) instead.
  root.innerHTML = `
    <div class="min-h-screen flex flex-col gap-3 p-3">
      <p id="hint" class="text-sm text-center text-neutral-200 min-h-[2.5rem] flex items-center justify-center">
        Scrub to the start of your lift, then tap the weight plate to track it.
      </p>
      <div id="stage" class="relative w-fit mx-auto"></div>
      <input id="scrub" type="range" min="0" max="1000" value="0" class="w-full" />
      <div class="flex flex-wrap gap-2 justify-center text-sm">
        <button id="setend" disabled class="px-3 py-2 rounded bg-neutral-700 disabled:opacity-40">Set end here</button>
        <button id="vref" class="px-3 py-2 rounded bg-neutral-700">Vertical reference (optional)</button>
        <button id="track" disabled class="px-4 py-2 rounded bg-blue-600 disabled:opacity-40">Track</button>
      </div>
      <p id="trim" class="text-xs text-center text-neutral-500"></p>
    </div>`

  const stage = root.querySelector<HTMLDivElement>('#stage')!
  video.className = 'max-h-[60vh] w-auto block rounded-lg'
  stage.appendChild(video)
  const canvas = document.createElement('canvas')
  canvas.className = 'absolute inset-0 w-full h-full touch-none'
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  stage.appendChild(canvas)
  const ctx = canvas.getContext('2d')!

  const scrub = root.querySelector<HTMLInputElement>('#scrub')!
  const hint = root.querySelector<HTMLParagraphElement>('#hint')!
  const trimEl = root.querySelector<HTMLParagraphElement>('#trim')!
  const trackBtn = root.querySelector<HTMLButtonElement>('#track')!
  const vrefBtn = root.querySelector<HTMLButtonElement>('#vref')!
  const setEndBtn = root.querySelector<HTMLButtonElement>('#setend')!

  let mode: 'seed' | 'vref' = 'seed'
  let vrefA: { x: number; y: number } | null = null
  let vrefB: { x: number; y: number } | null = null

  const dot = (x: number, y: number, color: string) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill()
  }
  const drawMarks = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // vertical reference: draw the line through both points (extended), plus dots
    if (vrefA && vrefB) {
      const dx = vrefB.x - vrefA.x, dy = vrefB.y - vrefA.y
      const len = Math.hypot(dx, dy) || 1
      const ux = (dx / len) * canvas.height, uy = (dy / len) * canvas.height
      ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(vrefA.x - ux, vrefA.y - uy); ctx.lineTo(vrefA.x + ux, vrefA.y + uy); ctx.stroke()
    }
    if (vrefA) dot(vrefA.x, vrefA.y, '#22d3ee')
    if (vrefB) dot(vrefB.x, vrefB.y, '#22d3ee')
    // the tracked plate
    if (app.data.seed) dot(app.data.seed.x, app.data.seed.y, '#ef4444')
  }
  const fmt = (s: number) => `${s.toFixed(1)}s`
  const updateTrim = () => {
    const s = app.data.seed ? fmt(app.data.startTime) : '—'
    const e = app.data.endTime != null ? fmt(app.data.endTime) : 'end of clip'
    trimEl.textContent = `Tracking ${s} → ${e}`
  }
  updateTrim()

  scrub.addEventListener('input', () => {
    video.currentTime = (Number(scrub.value) / 1000) * video.duration
  })

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (canvas.width / rect.width)
    const y = (e.clientY - rect.top) * (canvas.height / rect.height)
    if (mode === 'seed') {
      app.data.seed = { x, y }
      app.data.startTime = video.currentTime
      // a previously-set end before the new start no longer makes sense
      if (app.data.endTime != null && app.data.endTime <= app.data.startTime) {
        app.data.endTime = null
        setEndBtn.textContent = 'Set end here'
      }
      trackBtn.disabled = false
      setEndBtn.disabled = false
      hint.textContent = 'Tracking that plate. Scrub to the end and tap "Set end here", or just hit Track.'
      drawMarks(); updateTrim()
    } else {
      if (!vrefA) {
        vrefA = { x, y }
        hint.textContent = 'Now tap a point higher up that same line.'
        drawMarks()
      } else {
        vrefB = { x, y }
        app.data.verticalAngleRad = angleFromVertical(vrefA, vrefB)
        mode = 'seed'; vrefBtn.textContent = 'Vertical reference ✓'
        hint.textContent = app.data.seed
          ? 'Vertical reference set ✓'
          : 'Vertical reference set ✓ — now tap the weight plate to track.'
        drawMarks()
      }
    }
  })

  vrefBtn.addEventListener('click', () => {
    mode = 'vref'; vrefA = null; vrefB = null
    hint.textContent = 'Tap the bottom of a true-vertical line (e.g. a squat-rack upright).'
    drawMarks()
  })

  setEndBtn.addEventListener('click', () => {
    if (video.currentTime <= app.data.startTime) {
      hint.textContent = 'Scrub forward past the start first, then tap "Set end here".'
      return
    }
    app.data.endTime = video.currentTime
    setEndBtn.textContent = `End: ${fmt(video.currentTime)}`
    updateTrim()
  })

  trackBtn.addEventListener('click', () => app.go('processing'))

  // iOS: prime decoding with a muted play/pause so seeking updates the displayed
  // frame, then park at the first frame.
  video.muted = true
  video.play().then(() => { video.pause(); video.currentTime = 0 }).catch(() => { video.currentTime = 0 })
}
