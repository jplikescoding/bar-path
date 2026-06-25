import type { App } from '../app'

export function renderSetPoint(app: App, root: HTMLElement): void {
  const video = app.data.videoEl!
  root.innerHTML = `
    <div class="min-h-screen flex flex-col gap-3 p-4 max-w-md mx-auto w-full rise">
      <div class="text-center">
        <p class="eyebrow">Step 1 — Mark the bar</p>
      </div>
      <p id="hint" class="text-sm text-center text-[var(--muted)] min-h-[2.5rem] flex items-center justify-center leading-relaxed">
        Scrub to the start, then tap the bar plate to track it. <span class="text-[var(--faint)]">(Drag to its rim to measure drift in cm.)</span>
      </p>
      <div id="stage" class="frame"></div>
      <input id="scrub" type="range" min="0" max="1000" value="0" />
      <div class="flex gap-2">
        <button id="setend" class="btn btn-ghost flex-1 text-sm">Set end here</button>
        <button id="reset" class="btn btn-quiet text-sm">Reset</button>
      </div>
      <button id="track" disabled class="btn btn-amber w-full">Track the bar path</button>
      <p id="trim" class="readout text-xs text-center text-[var(--faint)]"></p>
    </div>`

  const stage = root.querySelector<HTMLDivElement>('#stage')!
  video.className = 'max-h-[56vh] w-auto block'
  stage.appendChild(video)
  const canvas = document.createElement('canvas')
  canvas.className = 'absolute inset-0 w-full h-full touch-none'
  canvas.width = video.videoWidth; canvas.height = video.videoHeight
  stage.appendChild(canvas)
  const ctx = canvas.getContext('2d')!

  const scrub = root.querySelector<HTMLInputElement>('#scrub')!
  const hint = root.querySelector<HTMLParagraphElement>('#hint')!
  const trimEl = root.querySelector<HTMLParagraphElement>('#trim')!
  const trackBtn = root.querySelector<HTMLButtonElement>('#track')!
  const setEndBtn = root.querySelector<HTMLButtonElement>('#setend')!
  const resetBtn = root.querySelector<HTMLButtonElement>('#reset')!

  // Draw the tracking seed (red dot) plus, when sizing or already sized, the
  // amber plate circle. `liveRadius` is the in-progress drag radius (video px).
  const drawMarks = (liveRadius?: number) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const seed = app.data.seed
    if (!seed) return
    const r = liveRadius ?? (app.data.plateDiameterPx != null ? app.data.plateDiameterPx / 2 : null)
    if (r != null && r > 0) {
      ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 3; ctx.setLineDash([8, 8])
      ctx.beginPath(); ctx.arc(seed.x, seed.y, r, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.fillStyle = '#ef4444'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(seed.x, seed.y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  }
  const fmt = (s: number) => `${s.toFixed(1)}s`
  const updateTrim = () => {
    const s = app.data.seed ? fmt(app.data.startTime) : '—'
    const e = app.data.endTime != null ? fmt(app.data.endTime) : 'end of clip'
    trimEl.textContent = `Tracking ${s} → ${e}`
  }
  updateTrim()

  scrub.addEventListener('input', () => { video.currentTime = (Number(scrub.value) / 1000) * video.duration })

  const toCanvas = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  // Tap = set the tracking point (the bar). Tap-and-drag to the plate's rim =
  // also measure the plate diameter, so drift can read in cm. A plain tap leaves
  // any previously set scale untouched.
  let dragging = false
  let downClient = { x: 0, y: 0 }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId)
    app.data.seed = toCanvas(e.clientX, e.clientY)
    app.data.startTime = video.currentTime
    if (app.data.endTime != null && app.data.endTime <= app.data.startTime) {
      app.data.endTime = null; setEndBtn.textContent = 'Set end here'
    }
    trackBtn.disabled = false
    dragging = true
    downClient = { x: e.clientX, y: e.clientY }
    drawMarks(); updateTrim()
  })

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || !app.data.seed) return
    const p = toCanvas(e.clientX, e.clientY)
    const r = Math.hypot(p.x - app.data.seed.x, p.y - app.data.seed.y)
    hint.textContent = 'Sizing the plate — release on its rim.'
    drawMarks(r)
  })

  canvas.addEventListener('pointerup', (e) => {
    if (!dragging || !app.data.seed) return
    dragging = false
    const movedScreen = Math.hypot(e.clientX - downClient.x, e.clientY - downClient.y)
    if (movedScreen > 10) {
      const p = toCanvas(e.clientX, e.clientY)
      app.data.plateDiameterPx = 2 * Math.hypot(p.x - app.data.seed.x, p.y - app.data.seed.y)
      hint.textContent = 'Scale set ✓ — drift will show in cm. Scrub to the end and "Set end here", or hit Track.'
    } else {
      hint.textContent = app.data.plateDiameterPx != null
        ? 'Tracking that plate (scale set). Scrub to the end and "Set end here", or hit Track.'
        : 'Tracking that plate. Drag from the bar to the plate’s rim to show drift in cm — or just hit Track.'
    }
    drawMarks(); updateTrim()
  })

  setEndBtn.addEventListener('click', () => {
    if (video.currentTime <= app.data.startTime) {
      hint.textContent = 'Scrub forward (past the start) first, then tap "Set end here".'
      return
    }
    app.data.endTime = video.currentTime
    setEndBtn.textContent = `End: ${fmt(video.currentTime)}`
    updateTrim()
  })

  resetBtn.addEventListener('click', () => {
    app.data.seed = null; app.data.startTime = 0; app.data.endTime = null
    app.data.plateDiameterPx = null
    trackBtn.disabled = true
    setEndBtn.textContent = 'Set end here'
    hint.innerHTML = 'Scrub to the start, then tap the bar plate to track it. <span class="text-[var(--faint)]">(Drag to its rim to measure drift in cm.)</span>'
    drawMarks(); updateTrim()
  })

  trackBtn.addEventListener('click', () => app.go('processing'))

  // iOS prime: nudge playback so seeking shows frames, then pause immediately on
  // the first frame (avoids the video visibly auto-playing).
  video.muted = true
  const stopPrime = () => { video.pause(); video.removeEventListener('timeupdate', stopPrime) }
  video.addEventListener('timeupdate', stopPrime)
  video.play().catch(() => {})
}
