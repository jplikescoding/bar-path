// THROWAWAY SPIKE screen (branch spike/pose). Reachable ONLY via the URL hash
// `#pose` — not wired into the normal app flow. Goal: load a real clip, draw the
// pose skeleton over it, and show a live FPS + inference-time readout so JP can
// read a go/no-go number on his actual iPhone. No coaching, no form claims.
import type { App } from '../app'
import { loadPose, type Landmark, type PoseApi } from '../pose'

export function renderPoseTest(app: App, root: HTMLElement): void {
  root.innerHTML = `
    <div class="min-h-screen flex flex-col gap-3 p-4 max-w-md mx-auto w-full">
      <div class="text-center">
        <p class="eyebrow">Spike — Pose feasibility</p>
        <p class="text-xs text-[var(--muted)] mt-1">Pick a side-on lift. Watch the skeleton, read the FPS.</p>
      </div>

      <label class="btn btn-amber cursor-pointer text-center">
        Choose a lift video
        <input id="file" type="file" accept="video/*" class="hidden" />
      </label>

      <!-- sized in JS to the clip's exact dimensions so the box ratio == the video
           ratio (no letterbox) and the normalized overlay sits true on the body. -->
      <div id="stage" class="relative hidden mx-auto rounded-xl overflow-hidden border border-[var(--line-bright)]"
           style="background:#000">
        <video id="vid" playsinline webkit-playsinline muted
               class="absolute inset-0 w-full h-full object-contain"></video>
        <canvas id="ov" class="absolute inset-0 w-full h-full"></canvas>
      </div>

      <div id="status" class="card p-4 readout text-sm leading-relaxed hidden">
        <div>status: <span id="st" class="text-[var(--amber)]">idle</span></div>
        <div>inference: <span id="ms" class="text-[var(--chalk)]">—</span> ms/frame (median)</div>
        <div>processed: <span id="fps" class="text-[var(--chalk)]">—</span> fps</div>
        <div>poses found: <span id="hit" class="text-[var(--chalk)]">—</span></div>
      </div>

      <button id="again" class="btn btn-quiet text-sm hidden">Run again</button>
      <p class="readout text-xs text-center text-[var(--faint)]">go/no-go: ≥ ~12–15 fps + a stable skeleton on a side view</p>
    </div>`

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!
  const file = $<HTMLInputElement>('#file')
  const stage = $('#stage')
  const status = $('#status')
  const again = $<HTMLButtonElement>('#again')
  const video = $<HTMLVideoElement>('#vid')
  const canvas = $<HTMLCanvasElement>('#ov')
  const st = $('#st'), msEl = $('#ms'), fpsEl = $('#fps'), hitEl = $('#hit')

  let pose: PoseApi | null = null

  file.addEventListener('change', async () => {
    const f = file.files?.[0]
    if (!f) return
    stage.classList.remove('hidden')
    status.classList.remove('hidden')
    st.textContent = 'loading MediaPipe…'

    video.src = URL.createObjectURL(f)
    await new Promise<void>((r) => video.addEventListener('loadedmetadata', () => r(), { once: true }))
    // Fit the clip into the available width / 60vh, keeping its exact ratio, so the
    // overlay aligns with the body and a tall portrait clip can't run off-screen.
    const maxW = stage.parentElement!.clientWidth
    const maxH = window.innerHeight * 0.6
    const r = video.videoWidth / video.videoHeight
    let w = maxW, h = w / r
    if (h > maxH) { h = maxH; w = h * r }
    stage.style.width = `${Math.round(w)}px`
    stage.style.height = `${Math.round(h)}px`

    try {
      pose = pose ?? (await loadPose())
    } catch (e) {
      st.textContent = 'FAILED to load: ' + (e as Error).message
      return
    }
    run()
  })

  again.addEventListener('click', () => {
    video.currentTime = 0
    run()
  })

  function run(): void {
    if (!pose) return
    again.classList.add('hidden')
    const ctx = canvas.getContext('2d')!
    // size the overlay to the box the video is actually rendered into
    canvas.width = stage.clientWidth
    canvas.height = stage.clientHeight

    const inferTimes: number[] = []
    let processed = 0
    let lastPoses = 0
    const t0 = performance.now()
    st.textContent = 'running…'

    const tick = (_now: number, _meta: any) => {
      const ts = performance.now()
      const landmarks = pose!.detect(video, ts)
      inferTimes.push(performance.now() - ts)
      processed++
      lastPoses = landmarks.length
      draw(ctx, landmarks)

      // throttle DOM writes to ~every 5 frames
      if (processed % 5 === 0 || video.ended) {
        const med = median(inferTimes.slice(-30))
        const fps = processed / ((performance.now() - t0) / 1000)
        msEl.textContent = med.toFixed(1)
        fpsEl.textContent = fps.toFixed(1)
        hitEl.textContent = String(lastPoses)
      }

      if (!video.ended) video.requestVideoFrameCallback(tick)
      else {
        st.textContent = 'done'
        again.classList.remove('hidden')
      }
    }
    video.requestVideoFrameCallback(tick)
    video.play().catch(() => { st.textContent = 'play blocked — tap the video' })
  }

  function draw(ctx: CanvasRenderingContext2D, poses: Landmark[][]): void {
    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)
    if (!poses.length || !pose) return
    const pts = poses[0]
    const vis = (l: Landmark) => (l.visibility ?? 1) > 0.5

    // bones
    ctx.strokeStyle = '#22ff55'; ctx.lineWidth = 3; ctx.lineCap = 'round'
    for (const c of pose.connections) {
      const a = pts[c.start], b = pts[c.end]
      if (!a || !b || !vis(a) || !vis(b)) continue
      ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke()
    }
    // joints
    ctx.fillStyle = '#ffb020'
    for (const l of pts) {
      if (!vis(l)) continue
      ctx.beginPath(); ctx.arc(l.x * w, l.y * h, 4, 0, Math.PI * 2); ctx.fill()
    }
  }

  function median(xs: number[]): number {
    if (!xs.length) return 0
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }

  // unused params kept for signature clarity in this throwaway screen
  void app
}
