import type { App } from '../app'
import { drawReview } from '../overlay'
import { rotatePath, horizontalDrift, pxToCm, type PathPoint } from '../geometry'
import { saveAnalysis, deleteAnalysis } from '../library'
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

  // If the user sized a plate on setup, show drift in real centimeters; else px.
  const plateDiameterPx = app.data.plateDiameterPx
  const calibrated = plateDiameterPx != null && plateDiameterPx > 0
  const unit = calibrated ? 'cm' : 'px'
  const fmt = (px: number) => calibrated ? pxToCm(px, plateDiameterPx!).toFixed(1) : px.toFixed(0)

  root.innerHTML = `
    <div class="min-h-screen flex flex-col gap-3 p-4 max-w-md mx-auto w-full rise">
      <div class="text-center">
        <p class="eyebrow">Step 3 — Review</p>
      </div>
      <div id="stage" class="frame"></div>

      <div class="flex items-center gap-3 justify-center">
        <button id="play" class="btn btn-amber btn-icon" aria-label="Play">▶</button>
        <button id="speed" class="chip" aria-label="Playback speed">1×</button>
        <button id="sound" class="chip" aria-label="Toggle sound" aria-pressed="false">🔇</button>
      </div>
      <input id="scrub" type="range" min="0" max="1000" value="1000" />

      <div class="card p-4 flex flex-col gap-3">
        <div class="flex items-start justify-between">
          <div class="flex flex-col gap-1">
            <span class="eyebrow flex items-center gap-1.5">
              Side-to-side travel
              <button id="drift-info" class="w-4 h-4 leading-none rounded-full text-[var(--faint)] active:text-[var(--amber)]" aria-label="What does this mean?" aria-expanded="false">ⓘ</button>
            </span>
            <span class="readout text-3xl font-semibold leading-none">${fmt(drift.range)}<span class="text-base text-[var(--muted)] ml-0.5">${unit}</span></span>
            <span class="text-xs text-[var(--muted)]">lower number = straighter path</span>
          </div>
          ${app.data.verticalAngleRad != null ? '<span class="eyebrow text-[var(--amber)]">Tilt-corrected</span>' : ''}
        </div>
        <div id="drift-explain" class="hidden text-xs text-[var(--muted)] leading-relaxed border-t border-[var(--line)] pt-3">
          The widest the bar drifted sideways — the gap between its <span class="text-[var(--chalk)]">farthest-left</span> and <span class="text-[var(--chalk)]">farthest-right</span> point over the whole rep (the extremes, not an average). That's the <span class="text-[var(--chalk)]">left + right</span> distances below, measured from the amber plumb line where the bar started. ${calibrated
            ? 'Shown in <span class="text-[var(--chalk)]">centimeters</span> using the plate you sized as a 45 cm ruler — real-world travel.'
            : 'Units are video pixels. <span class="text-[var(--chalk)]">Size a plate on the setup screen</span> to read this in cm.'}
        </div>
        <div class="gauge">
          <div class="gauge-fill left" style="width:${leftW}%"></div>
          <div class="gauge-fill right" style="width:${rightW}%"></div>
          <div class="gauge-center"></div>
        </div>
        <div class="flex justify-between readout text-xs text-[var(--muted)]">
          <span>◀ left ${fmt(drift.maxLeft)}${unit}</span>
          <span>plumb</span>
          <span>right ${fmt(drift.maxRight)}${unit} ▶</span>
        </div>
      </div>

      <div id="actions"></div>
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
  const soundBtn = root.querySelector<HTMLButtonElement>('#sound')!
  const scrub = root.querySelector<HTMLInputElement>('#scrub')!

  const speeds = [1, 0.5, 0.25]
  let speedIdx = 0
  let soundOn = false
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
    video.muted = !soundOn
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
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn
    soundBtn.textContent = soundOn ? '🔊' : '🔇'
    soundBtn.setAttribute('aria-pressed', String(soundOn))
    video.muted = !soundOn // applies live if already playing
  })
  root.querySelector('#drift-info')!.addEventListener('click', () => {
    const panel = root.querySelector<HTMLDivElement>('#drift-explain')!
    const open = panel.classList.toggle('hidden') === false
    root.querySelector('#drift-info')!.setAttribute('aria-expanded', String(open))
  })
  scrub.addEventListener('input', () => {
    if (!video.paused) pause()
    video.currentTime = startT + (Number(scrub.value) / 1000) * (endT - startT)
  })
  video.addEventListener('seeked', () => { if (video.paused && !exporting) render(video.currentTime) }, { signal: ac.signal })

  const savedMsg = root.querySelector<HTMLDivElement>('#saved-msg')!
  const actions = root.querySelector<HTMLDivElement>('#actions')!

  // Tear down playback + leave to another screen.
  const leave = (screen: 'upload' | 'library') => { ac.abort(); video.pause(); app.go(screen) }

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

  const doExport = async () => {
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
      if (btn.textContent !== 'Export failed') btn.textContent = 'Export'
      video.currentTime = endT; render(endT); setScrubFromTime(endT)
    }
  }

  const persist = async (name: string) => {
    const blob = await (await fetch(app.data.videoUrl!)).blob()
    const createdAt = Date.now()
    const record: SavedAnalysis = {
      id: crypto.randomUUID(),
      name: name || defaultName(createdAt),
      createdAt,
      video: blob,
      seed,
      startTime: startT,
      endTime: app.data.endTime,
      verticalAngleRad: app.data.verticalAngleRad,
      path: app.data.path,
      thumbnail: makeThumbnail(),
      driftRange: drift.range,
      plateDiameterPx: app.data.plateDiameterPx,
    }
    await saveAnalysis(record)
    app.data.savedId = record.id
  }

  // Tapping Save opens an inline, prefilled name field before persisting.
  const showNameEditor = () => {
    actions.innerHTML = `
      <div class="flex flex-col gap-2">
        <input id="name-input" class="w-full bg-[var(--surface-2)] border border-[var(--line-bright)] rounded-xl px-3 py-3 text-[var(--chalk)]" style="font-family:var(--font-display)" placeholder="Name this lift" />
        <div class="flex gap-2">
          <button id="confirm-save" class="btn btn-amber flex-1">Save to library</button>
          <button id="cancel-save" class="btn btn-quiet">Cancel</button>
        </div>
      </div>`
    const input = actions.querySelector<HTMLInputElement>('#name-input')!
    input.value = defaultName(Date.now())
    input.focus(); input.select()
    const confirmBtn = actions.querySelector<HTMLButtonElement>('#confirm-save')!
    const commit = async () => {
      confirmBtn.disabled = true; confirmBtn.textContent = 'Saving…'
      try {
        await persist(input.value.trim())
        savedMsg.textContent = 'Saved ✓'
        renderActions()
      } catch (err) {
        console.error(err)
        confirmBtn.disabled = false; confirmBtn.textContent = 'Save failed — retry'
      }
    }
    confirmBtn.addEventListener('click', commit)
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit() })
    actions.querySelector('#cancel-save')!.addEventListener('click', () => { savedMsg.textContent = ''; renderActions() })
  }

  // Actions depend on whether this lift is already in the library: a fresh track
  // can Save / start New; a saved one goes back to Library or Deletes.
  function renderActions() {
    if (app.data.savedId == null) {
      actions.innerHTML = `
        <div class="flex gap-2">
          <button id="save" class="btn btn-amber flex-1">Save</button>
          <button id="export" class="btn btn-ghost flex-1">Export</button>
          <button id="new" class="btn btn-quiet">New</button>
        </div>`
      actions.querySelector('#save')!.addEventListener('click', showNameEditor)
      actions.querySelector('#export')!.addEventListener('click', doExport)
      actions.querySelector('#new')!.addEventListener('click', () => { app.reset(); leave('upload') })
    } else {
      actions.innerHTML = `
        <div class="flex gap-2">
          <button id="library" class="btn btn-amber flex-1">Library</button>
          <button id="export" class="btn btn-ghost flex-1">Export</button>
          <button id="delete" class="btn btn-quiet">Delete</button>
        </div>`
      actions.querySelector('#library')!.addEventListener('click', () => leave('library'))
      actions.querySelector('#export')!.addEventListener('click', doExport)
      actions.querySelector('#delete')!.addEventListener('click', async () => {
        const btn = actions.querySelector<HTMLButtonElement>('#delete')!
        btn.disabled = true; btn.textContent = 'Deleting…'
        try { await deleteAnalysis(app.data.savedId!); leave('library') }
        catch (err) { console.error(err); btn.disabled = false; btn.textContent = 'Delete failed' }
      })
    }
  }
  renderActions()

  // rest at the end so the full (faded) path is visible; press play to watch it
  // redraw progressively from the start.
  video.currentTime = endT
  render(endT)
}
