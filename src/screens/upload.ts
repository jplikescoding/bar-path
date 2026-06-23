import type { App } from '../app'

export function renderUpload(app: App, root: HTMLElement): void {
  root.innerHTML = `
    <div class="min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 class="text-2xl font-semibold">Bar Path Tracker</h1>
      <label class="px-6 py-3 rounded-xl bg-blue-600 cursor-pointer active:bg-blue-700">
        Choose a lift video
        <input id="file" type="file" accept="video/*" class="hidden" />
      </label>
      <div class="max-w-sm text-sm text-neutral-400 leading-relaxed">
        <p class="font-medium text-neutral-300 mb-1">For best results</p>
        Film <span class="text-neutral-200">side-on</span>, camera at roughly
        <span class="text-neutral-200">bar / hip height</span>, perpendicular to the bar,
        far enough back to keep the whole lift in frame. Low or angled shots still track
        fine but the path will look slanted — you can correct that on the next screen.
      </div>
    </div>`

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
