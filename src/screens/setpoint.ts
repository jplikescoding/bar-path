import type { App } from '../app'

export function renderSetPoint(app: App, root: HTMLElement): void {
  const video = app.data.videoEl!
  root.innerHTML = `
    <div class="min-h-screen flex flex-col gap-3 p-3">
      <p id="hint" class="text-sm text-center text-neutral-200 min-h-[2.5rem] flex items-center justify-center">
        Scrub to the start of your lift, then tap the weight plate to track it.
      </p>
      <div id="stage" class="relative w-fit mx-auto"></div>
      <input id="scrub" type="range" min="0" max="1000" value="0" class="w-full" />
      <div class="flex flex-wrap gap-2 justify-center text-sm">
        <button id="setend" class="px-3 py-2 rounded bg-neutral-700">Set end here</button>
        <button id="reset" class="px-3 py-2 rounded bg-neutral-800 text-neutral-400">Reset</button>
        <button id="track" disabled class="px-4 py-2 rounded bg-blue-600 disabled:opacity-40">Track</button>
      </div>
      <p id="trim" class="text-xs text-center text-neutral-500"></p>
    </div>`

  const stage = root.querySelector<HTMLDivElement>('#stage')!
  video.className = 'max-h-[58vh] w-auto block rounded-lg'
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

  const drawMarks = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (app.data.seed) {
      ctx.fillStyle = '#ef4444'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(app.data.seed.x, app.data.seed.y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
  }
  const fmt = (s: number) => `${s.toFixed(1)}s`
  const updateTrim = () => {
    const s = app.data.seed ? fmt(app.data.startTime) : '—'
    const e = app.data.endTime != null ? fmt(app.data.endTime) : 'end of clip'
    trimEl.textContent = `Tracking ${s} → ${e}`
  }
  updateTrim()

  scrub.addEventListener('input', () => { video.currentTime = (Number(scrub.value) / 1000) * video.duration })

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect()
    app.data.seed = {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
    app.data.startTime = video.currentTime
    if (app.data.endTime != null && app.data.endTime <= app.data.startTime) {
      app.data.endTime = null; setEndBtn.textContent = 'Set end here'
    }
    trackBtn.disabled = false
    hint.textContent = 'Tracking that plate. Scrub to the end and tap "Set end here", or just hit Track.'
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
    trackBtn.disabled = true
    setEndBtn.textContent = 'Set end here'
    hint.textContent = 'Scrub to the start of your lift, then tap the weight plate to track it.'
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
