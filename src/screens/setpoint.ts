import type { App } from '../app'
import { angleFromVertical } from '../geometry'

export function renderSetPoint(app: App, root: HTMLElement): void {
  const video = app.data.videoEl!
  root.innerHTML = `
    <div class="min-h-screen flex flex-col gap-3 p-3">
      <p id="hint" class="text-sm text-center text-neutral-300">Scrub to where the lift starts, then tap the end of the bar.</p>
      <div id="stage" class="relative w-fit mx-auto"></div>
      <input id="scrub" type="range" min="0" max="1000" value="0" class="w-full" />
      <div class="flex flex-wrap gap-2 justify-center text-sm">
        <button id="vref" class="px-3 py-2 rounded bg-neutral-700">Set vertical reference</button>
        <button id="setend" class="px-3 py-2 rounded bg-neutral-700">Set end here</button>
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
  let vrefP1: { x: number; y: number } | null = null

  const dot = (x: number, y: number, color: string) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill()
  }
  const drawMarks = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (app.data.seed) dot(app.data.seed.x, app.data.seed.y, '#ef4444')
    if (vrefP1) dot(vrefP1.x, vrefP1.y, '#22d3ee')
  }
  const fmt = (s: number) => `${s.toFixed(1)}s`
  const updateTrim = () => {
    const s = app.data.seed ? fmt(app.data.startTime) : '—'
    const e = app.data.endTime != null ? fmt(app.data.endTime) : 'end of clip'
    trimEl.textContent = `Track from ${s} to ${e}`
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
      trackBtn.disabled = false
      drawMarks(); updateTrim()
    } else {
      if (!vrefP1) {
        vrefP1 = { x, y }
        hint.textContent = 'Tap a second point higher up the same vertical line.'
        drawMarks()
      } else {
        app.data.verticalAngleRad = angleFromVertical(vrefP1, { x, y })
        mode = 'seed'; vrefBtn.textContent = 'Vertical reference ✓'
        hint.textContent = 'Tap the end of the bar (or re-tap to adjust).'
        vrefP1 = null; drawMarks()
      }
    }
  })

  vrefBtn.addEventListener('click', () => {
    mode = 'vref'; vrefP1 = null
    hint.textContent = 'Tap the bottom of a true-vertical line (e.g. a rack upright).'
  })

  setEndBtn.addEventListener('click', () => {
    app.data.endTime = video.currentTime
    setEndBtn.textContent = `End set: ${fmt(video.currentTime)}`
    updateTrim()
  })

  trackBtn.addEventListener('click', () => app.go('processing'))

  // iOS: prime decoding with a muted play/pause so seeking updates the displayed
  // frame, then park at the first frame.
  video.muted = true
  video.play().then(() => { video.pause(); video.currentTime = 0 }).catch(() => { video.currentTime = 0 })
}
