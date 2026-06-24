import type { App } from '../app'
import { drawReview } from '../overlay'
import { rotatePath, horizontalDrift, type PathPoint } from '../geometry'
import { saveAnalysis } from '../library'
import { defaultName, type SavedAnalysis } from '../librarySupport'

export function renderResult(app: App, root: HTMLElement): void {
  const video = app.data.videoEl!
  const seed = app.data.seed!
  let path: PathPoint[] = app.data.path
  if (app.data.verticalAngleRad != null) path = rotatePath(path, app.data.verticalAngleRad, seed)
  const refX = seed.x
  const drift = horizontalDrift(path, refX)
  const startT = app.data.startTime
  const endT = Math.max(startT + 0.1, path[path.length - 1]?.t ?? app.data.endTime ?? video.duration)

  // Deviation gauge geometry: scale each side against the larger of the two so
  // the worse direction fills its half of the track.
  const maxAbs = Math.max(drift.maxLeft, drift.maxRight, 1)
  const leftW = (drift.maxLeft / maxAbs) * 50
  const rightW = (drift.maxRight / maxAbs) * 50

  root.innerHTML = `
    <div class="min-h-screen flex flex-col gap-3 p-4 max-w-md mx-auto w-full rise">
      <div class="text-center">
        <p class="eyebrow">Step 3 — Review</p>
      </div>
      <div id="stage" class="frame"></div>

      <div class="flex items-center gap-3 justify-center">
        <button id="play" class="btn btn-amber btn-icon" aria-label="Play">▶</button>
        <button id="speed" class="chip" aria-label="Playback speed">1×</button>
      </div>
      <input id="scrub" type="range" min="0" max="1000" value="1000" />

      <div class="card p-4 flex flex-col gap-3">
        <div class="flex items-end justify-between">
          <div class="flex flex-col gap-1">
            <span class="eyebrow">Drift from plumb</span>
            <span class="readout text-3xl font-semibold leading-none">${drift.range.toFixed(0)}<span class="text-base text-[var(--muted)] ml-0.5">px</span></span>
          </div>
          ${app.data.verticalAngleRad != null ? '<span class="eyebrow text-[var(--amber)]">Tilt-corrected</span>' : ''}
        </div>
        <div class="gauge">
          <div class="gauge-fill left" style="width:${leftW}%"></div>
          <div class="gauge-fill right" style="width:${rightW}%"></div>
          <div class="gauge-center"></div>
        </div>
        <div class="flex justify-between readout text-xs text-[var(--muted)]">
          <span>◀ left ${drift.maxLeft.toFixed(0)}px</span>
          <span>plumb</span>
          <span>right ${drift.maxRight.toFixed(0)}px ▶</span>
        </div>
      </div>

      <div class="flex gap-2">
        <button id="save" class="btn btn-amber flex-1">Save</button>
        <button id="export" class="btn btn-ghost flex-1">Export</button>
        <button id="new" class="btn btn-quiet">New</button>
      </div>
      <div id="saved-msg" class="text-center text-sm text-[var(--amber)] h-5"></div>
    </div>`

  const stage = root.querySelector<HTMLDivElement>('#stage')!
  video.className = 'max-h-[54vh] w-auto block'
  stage.appendChild(video)
  const canvas = document.createElement('canvas')
  canvas.className = 'absolute inset-0 w-full h-full pointer-events-none'
  canvas.width = video.videoWidth; canvas.height = video.videoHeight
  stage.appendChild(canvas)
  const ctx = canvas.getContext('2d')!

  const playBtn = root.querySelector<HTMLButtonElement>('#play')!
  const speedBtn = root.querySelector<HTMLButtonElement>('#speed')!
  const scrub = root.querySelector<HTMLInputElement>('#scrub')!

  const speeds = [1, 0.5, 0.25]
  let speedIdx = 0
  let exporting = false
  const ac = new AbortController()

  const render = (t: number) => drawReview(ctx, path, t, refX)
  const setScrubFromTime = (t: number) => { scrub.value = String(Math.round(((t - startT) / (endT - startT)) * 1000)) }

  const tick = () => {
    render(video.currentTime); setScrubFromTime(video.currentTime)
    if (video.paused) return
    if (video.currentTime >= endT) { video.pause(); playBtn.textContent = '▶'; render(endT); return }
    video.requestVideoFrameCallback(tick)
  }
  const play = () => {
    if (video.currentTime >= endT - 0.05) video.currentTime = startT
    video.muted = true
    video.playbackRate = speeds[speedIdx]
    video.play().then(() => { playBtn.textContent = '⏸'; video.requestVideoFrameCallback(tick) }).catch(() => {})
  }
  const pause = () => { video.pause(); playBtn.textContent = '▶' }

  playBtn.addEventListener('click', () => { video.paused ? play() : pause() })
  speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % speeds.length
    speedBtn.textContent = `${speeds[speedIdx]}×`
    if (!video.paused) video.playbackRate = speeds[speedIdx]
  })
  scrub.addEventListener('input', () => {
    if (!video.paused) pause()
    video.currentTime = startT + (Number(scrub.value) / 1000) * (endT - startT)
  })
  video.addEventListener('seeked', () => { if (video.paused && !exporting) render(video.currentTime) }, { signal: ac.signal })

  root.querySelector('#new')!.addEventListener('click', () => { ac.abort(); video.pause(); app.reset(); app.go('upload') })
  root.querySelector('#export')!.addEventListener('click', async () => {
    const btn = root.querySelector<HTMLButtonElement>('#export')!
    pause(); btn.disabled = true; btn.textContent = 'Exporting…'; exporting = true
    try {
      const { exportOverlay } = await import('../exportVideo')
      const blob = await exportOverlay({ video, path, refX, startTime: startT, endTime: endT,
        onProgress: (f) => { btn.textContent = `Exporting… ${Math.round(f * 100)}%` } })
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = `bar-path.${ext}`; a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) { btn.textContent = 'Export failed'; console.error(err) }
    finally {
      exporting = false; btn.disabled = false
      if (btn.textContent !== 'Export failed') btn.textContent = 'Export video'
      video.currentTime = endT; render(endT); setScrubFromTime(endT)
    }
  })

  // Draw the end frame + full path to a small offscreen canvas → JPEG data URL.
  const makeThumbnail = (): string => {
    const maxW = 240
    const scale = video.videoWidth > 0 ? Math.min(1, maxW / video.videoWidth) : 1
    const tw = Math.max(1, Math.round(video.videoWidth * scale))
    const th = Math.max(1, Math.round(video.videoHeight * scale))
    const off = document.createElement('canvas')
    off.width = tw; off.height = th
    const octx = off.getContext('2d')!
    try { octx.drawImage(video, 0, 0, tw, th) } catch { /* frame not ready */ }
    octx.save()
    octx.scale(scale, scale)
    drawReview(octx, path, endT, refX)
    octx.restore()
    return off.toDataURL('image/jpeg', 0.6)
  }

  const saveBtn = root.querySelector<HTMLButtonElement>('#save')!
  const savedMsg = root.querySelector<HTMLDivElement>('#saved-msg')!
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…'
    try {
      const blob = await (await fetch(app.data.videoUrl!)).blob()
      const createdAt = Date.now()
      const record: SavedAnalysis = {
        id: crypto.randomUUID(),
        name: defaultName(createdAt),
        createdAt,
        video: blob,
        seed,
        startTime: startT,
        endTime: app.data.endTime,
        verticalAngleRad: app.data.verticalAngleRad,
        path: app.data.path,
        thumbnail: makeThumbnail(),
        driftRange: drift.range,
      }
      await saveAnalysis(record)
      saveBtn.textContent = 'Saved ✓'
      savedMsg.innerHTML = '<button id="go-library" class="underline">View in library</button>'
      savedMsg.querySelector('#go-library')!.addEventListener('click', () => {
        ac.abort(); video.pause(); app.go('library')
      })
    } catch (err) {
      console.error(err)
      saveBtn.disabled = false; saveBtn.textContent = 'Save failed — retry'
    }
  })

  // rest at the end so the full (faded) path is visible; press play to watch it
  // redraw progressively from the start.
  video.currentTime = endT
  render(endT)
}
