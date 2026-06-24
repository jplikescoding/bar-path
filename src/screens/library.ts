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
    <div class="min-h-screen flex flex-col gap-3 p-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Saved lifts</h1>
        <button id="new" class="px-3 py-2 rounded bg-blue-600 text-sm">New video</button>
      </div>
      <div id="list" class="flex flex-col gap-2"></div>
    </div>`

  root.querySelector('#new')!.addEventListener('click', () => app.go('upload'))
  const list = root.querySelector<HTMLDivElement>('#list')!

  const renderList = async () => {
    const items = await listAnalyses()
    if (items.length === 0) {
      list.innerHTML = `
        <div class="text-center text-neutral-400 py-16 flex flex-col items-center gap-4">
          <p>No saved lifts yet.</p>
          <button id="upload" class="px-6 py-3 rounded-xl bg-blue-600">Upload a video</button>
        </div>`
      list.querySelector('#upload')!.addEventListener('click', () => app.go('upload'))
      return
    }

    list.innerHTML = ''
    for (const item of items) {
      const row = document.createElement('div')
      row.className = 'flex items-center gap-3 p-2 rounded-lg bg-neutral-800 active:bg-neutral-700'
      row.innerHTML = `
        <img src="${item.thumbnail}" alt="" class="w-16 h-16 object-cover rounded bg-neutral-900 shrink-0" />
        <button class="open flex-1 text-left min-w-0">
          <div class="truncate">${item.name || defaultName(item.createdAt)}</div>
          <div class="text-sm text-neutral-400">${driftSubtitle(item.driftRange)}</div>
        </button>
        <button class="del w-10 h-10 rounded bg-neutral-700 active:bg-red-700 shrink-0" aria-label="Delete">✕</button>`

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
