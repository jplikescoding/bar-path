import type { App } from '../app'

export function renderUpload(app: App, root: HTMLElement): void {
  root.innerHTML = `
    <div class="min-h-screen flex flex-col items-center justify-center gap-7 px-6 py-10 text-center rise">
      <div class="flex flex-col items-center gap-5">
        <!-- Signature: an ideal plumb line (amber) with a real bar path (green) drifting around it. -->
        <svg width="86" height="116" viewBox="0 0 86 116" fill="none" aria-hidden="true">
          <line x1="43" y1="6" x2="43" y2="110" stroke="#ffb020" stroke-width="2"
                stroke-dasharray="2 6" stroke-linecap="round" opacity="0.85" />
          <path d="M43 108 C 30 92, 24 74, 33 56 C 40 42, 58 34, 50 20 C 46 13, 43 10, 43 8"
                stroke="#22ff55" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          <circle cx="43" cy="8" r="6" fill="#ff3344" stroke="#0b0e11" stroke-width="2" />
        </svg>
        <div class="flex flex-col items-center gap-2">
          <p class="eyebrow">Barbell tracking</p>
          <h1 class="text-3xl font-bold tracking-tight">Bar Path</h1>
          <p class="text-sm text-[var(--muted)] max-w-[16rem] leading-relaxed">
            Trace the bar, measure the drift, see how plumb your lift really is.
          </p>
        </div>
      </div>

      <div class="flex flex-col items-stretch gap-3 w-full max-w-[17rem]">
        <label class="btn btn-amber cursor-pointer">
          Choose a lift video
          <input id="file" type="file" accept="video/*" class="hidden" />
        </label>
        <button id="library" class="btn btn-ghost">Saved lifts</button>
      </div>

      <div class="card max-w-sm w-full text-left p-4 mt-1">
        <p class="eyebrow mb-2">For best results</p>
        <p class="text-sm text-[var(--muted)] leading-relaxed">
          Film <span class="text-[var(--chalk)]">side-on</span>, camera at roughly
          <span class="text-[var(--chalk)]">bar / hip height</span>, perpendicular to the bar,
          far enough back to keep the whole lift in frame. Low or angled shots still track
          fine &mdash; you can straighten the path on the next screen.
        </p>
      </div>
    </div>`

  root.querySelector('#library')!.addEventListener('click', () => app.go('library'))

  const input = root.querySelector<HTMLInputElement>('#file')!
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')        // iOS: render inline, don't fullscreen
    video.setAttribute('webkit-playsinline', '') // older iOS Safari
    video.preload = 'auto'
    video.addEventListener('loadedmetadata', () => {
      app.data.videoUrl = url
      app.data.videoEl = video
      app.go('setpoint')
    }, { once: true })
  })
}
