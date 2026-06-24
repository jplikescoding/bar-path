import type { App } from '../app'
import { listAnalyses, getAnalysis, deleteAnalysis } from '../library'
import { defaultName, driftSubtitle, type SavedAnalysis } from '../librarySupport'

// Recreate a live <video> element from a saved Blob so the result screen — which
// renders from a live videoEl — can replay a persisted analysis.
function loadVideoEl(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.preload = 'auto'
    video.addEventListener('loadedmetadata', () => resolve(video), { once: true })
    video.src = url
  })
}

async function reopen(app: App, saved: SavedAnalysis): Promise<void> {
  app.reset()
  const url = URL.createObjectURL(saved.video)
  const video = await loadVideoEl(url)
  app.data = {
    videoUrl: url,
    videoEl: video,
    seed: saved.seed,
    verticalAngleRad: saved.verticalAngleRad,
    startTime: saved.startTime,
    endTime: saved.endTime,
    path: saved.path,
  }
  app.go('result')
}

export function renderLibrary(app: App, root: HTMLElement): void {
  root.innerHTML = `
    <div class="min-h-screen flex flex-col gap-4 p-4 max-w-md mx-auto w-full rise">
      <div class="flex items-end justify-between">
        <div class="flex flex-col gap-1">
          <span class="eyebrow">Library</span>
          <h1 class="text-2xl font-bold leading-none">Saved lifts</h1>
        </div>
        <button id="new" class="btn btn-amber text-sm">New video</button>
      </div>
      <div id="list" class="flex flex-col gap-2"></div>
    </div>`

  root.querySelector('#new')!.addEventListener('click', () => app.go('upload'))
  const list = root.querySelector<HTMLDivElement>('#list')!

  const renderList = async () => {
    const items = await listAnalyses()
    if (items.length === 0) {
      list.innerHTML = `
        <div class="card text-center text-[var(--muted)] py-16 px-6 flex flex-col items-center gap-4 mt-2">
          <svg width="40" height="52" viewBox="0 0 86 116" fill="none" aria-hidden="true">
            <line x1="43" y1="6" x2="43" y2="110" stroke="#ffb020" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round" opacity="0.7" />
            <path d="M43 108 C 30 92, 24 74, 33 56 C 40 42, 58 34, 50 20 C 46 13, 43 10, 43 8" stroke="#22ff55" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.7" />
          </svg>
          <p class="text-sm">No saved lifts yet. Track a lift and tap <span class="text-[var(--chalk)]">Save</span> to keep it here.</p>
          <button id="upload" class="btn btn-amber">Upload a video</button>
        </div>`
      list.querySelector('#upload')!.addEventListener('click', () => app.go('upload'))
      return
    }

    list.innerHTML = ''
    for (const item of items) {
      const row = document.createElement('div')
      row.className = 'card flex items-center gap-3 p-2.5 active:bg-[var(--surface-2)] transition-colors'
      row.innerHTML = `
        <img src="${item.thumbnail}" alt="" class="w-16 h-16 object-cover rounded-lg bg-black shrink-0 border border-[var(--line)]" />
        <button class="open flex-1 text-left min-w-0">
          <div class="truncate font-medium" style="font-family:var(--font-display)">${item.name || defaultName(item.createdAt)}</div>
          <div class="readout text-xs text-[var(--muted)] mt-1">${driftSubtitle(item.driftRange)}</div>
        </button>
        <button class="del w-10 h-10 rounded-lg bg-[var(--surface-2)] border border-[var(--line)] text-[var(--muted)] active:bg-[var(--mark)] active:text-white shrink-0" aria-label="Delete">✕</button>`

      row.querySelector('.open')!.addEventListener('click', async () => {
        const saved = await getAnalysis(item.id)
        if (saved) await reopen(app, saved)
      })
      row.querySelector('.del')!.addEventListener('click', async (e) => {
        e.stopPropagation()
        await deleteAnalysis(item.id)
        await renderList()
      })
      list.appendChild(row)
    }
  }

  renderList()
}
