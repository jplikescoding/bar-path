import type { App } from '../app'
import { listAnalyses, getAnalysis, deleteAnalysis, saveAnalysis } from '../library'
import {
  defaultName, escapeHtml, filterLifts, groupByDay, liftDate, liftSummary, liftTitle, monthOptions,
  type LiftFilter, type SavedAnalysis,
} from '../librarySupport'
import { liftFieldsHtml, readLiftFields } from './liftFields'

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
    savedId: saved.id,
    plateDiameterPx: saved.plateDiameterPx ?? null,
    poseMidfoot: saved.poseMidfoot ?? null,
    // Records saved before tone existed only persisted FIRED cues → normalize to
    // 'nudge' here (once), so every consumer downstream can trust cue.tone.
    cue: saved.cue ? { ...saved.cue, tone: saved.cue.tone ?? 'nudge' } : null,
    poseFrames: saved.poseFrames ?? null,
    hipCue: saved.hipCue ?? null,
    liftType: saved.liftType ?? 'deadlift',
    sideOn: saved.sideOn ?? null,
    depthCue: saved.depthCue ?? null,
    recordedAt: saved.recordedAt ?? null,
    weightLb: saved.weightLb ?? null,
    note: saved.note ?? '',
  }
  app.go('result')
}

const LIFT_CHIPS: { id: LiftFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'deadlift', label: 'Deadlift' }, { id: 'squat', label: 'Squat' },
]

// The app's home: every saved lift, filterable by lift type and month, grouped
// by the day it was recorded (Strava-style feed, no stats).
export function renderLibrary(app: App, root: HTMLElement): void {
  const view = app.libraryView
  root.innerHTML = `
    <div class="min-h-screen flex flex-col gap-4 p-4 max-w-md mx-auto w-full rise">
      <div class="flex items-end justify-between">
        <h1 class="text-2xl font-bold leading-none">Lifts</h1>
        <button id="new" class="btn btn-amber text-sm">+ New</button>
      </div>
      <div id="banner"></div>
      <div class="flex items-center gap-2 flex-wrap">
        ${LIFT_CHIPS.map((c) => `<button id="f-${c.id}" class="chip text-sm" aria-pressed="${view.lift === c.id}">${c.label}</button>`).join('')}
        <select id="f-month" class="chip text-sm ml-auto" aria-label="Month"></select>
      </div>
      <div id="list" class="flex flex-col gap-2"></div>
    </div>`

  root.querySelector('#new')!.addEventListener('click', () => app.go('upload'))
  const list = root.querySelector<HTMLDivElement>('#list')!
  const monthSel = root.querySelector<HTMLSelectElement>('#f-month')!
  let all: SavedAnalysis[] = []

  const setLift = (lift: LiftFilter) => {
    view.lift = lift
    for (const c of LIFT_CHIPS) root.querySelector(`#f-${c.id}`)!.setAttribute('aria-pressed', String(c.id === lift))
  }
  for (const c of LIFT_CHIPS) {
    root.querySelector(`#f-${c.id}`)!.addEventListener('click', () => { setLift(c.id); renderRows() })
  }
  monthSel.addEventListener('change', () => { view.month = monthSel.value; renderRows() })

  // Month options come from all lifts; a month that no longer has lifts (after a
  // delete or date edit) falls back to All time.
  const renderMonths = () => {
    const opts = monthOptions(all)
    if (view.month !== 'all' && !opts.some((o) => o.key === view.month)) view.month = 'all'
    monthSel.innerHTML = `<option value="all">All time</option>` +
      opts.map((o) => `<option value="${o.key}">${o.label}</option>`).join('')
    monthSel.value = view.month
  }

  const renderRows = () => {
    if (all.length === 0) {
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
    const groups = groupByDay(filterLifts(all, view.lift, view.month), Date.now())
    if (groups.length === 0) {
      list.innerHTML = `
        <div class="card text-center text-[var(--muted)] py-10 px-6 flex flex-col items-center gap-3">
          <p class="text-sm">No lifts match</p>
          <button id="clear-filters" class="btn btn-quiet text-sm">Clear filters</button>
        </div>`
      list.querySelector('#clear-filters')!.addEventListener('click', () => {
        setLift('all')
        view.month = 'all'
        monthSel.value = 'all'
        renderRows()
      })
      return
    }
    list.innerHTML = ''
    for (const g of groups) {
      const header = document.createElement('div')
      header.className = 'day-label eyebrow text-[var(--muted)] pt-2 pb-1 border-b border-[var(--line)]'
      header.textContent = g.label
      list.appendChild(header)
      for (const item of g.items) list.appendChild(makeRow(item))
    }
  }

  const makeRow = (item: SavedAnalysis): HTMLDivElement => {
    const row = document.createElement('div')
    row.className = 'lift-row card flex items-center gap-3 p-2.5 active:bg-[var(--surface-2)] transition-colors'
    const note = item.note ? ` · “${escapeHtml(item.note)}”` : ''
    // Lift type + date carry identity; a custom name shows only when JP gave one.
    const customName = item.name && item.name !== defaultName(item.createdAt)
      ? `<div class="truncate text-xs text-[var(--faint)] mt-0.5">${escapeHtml(item.name)}</div>` : ''
    row.innerHTML = `
      <img src="${item.thumbnail}" alt="" class="w-16 h-16 object-cover rounded-lg bg-black shrink-0 border border-[var(--line)]" />
      <button class="open flex-1 text-left min-w-0">
        <div class="truncate font-medium" style="font-family:var(--font-display)">${escapeHtml(liftTitle(item))}</div>
        <div class="truncate readout text-xs text-[var(--muted)] mt-1">${escapeHtml(liftSummary(item))}${note}</div>
        ${customName}
      </button>
      <button class="rename w-10 h-10 rounded-lg bg-[var(--surface-2)] border border-[var(--line)] text-[var(--muted)] active:bg-[var(--surface)] shrink-0" aria-label="Edit">✎</button>
      <button class="del w-10 h-10 rounded-lg bg-[var(--surface-2)] border border-[var(--line)] text-[var(--muted)] active:bg-[var(--mark)] active:text-white shrink-0" aria-label="Delete">✕</button>`

    row.querySelector('.open')!.addEventListener('click', async () => {
      view.scrollY = window.scrollY
      const saved = await getAnalysis(item.id)
      if (saved) await reopen(app, saved)
    })
    row.querySelector('.rename')!.addEventListener('click', (e) => {
      e.stopPropagation()
      startEdit(item, row)
    })
    row.querySelector('.del')!.addEventListener('click', async (e) => {
      e.stopPropagation()
      await deleteAnalysis(item.id)
      await renderList()
    })
    return row
  }

  const renderList = async () => {
    all = await listAnalyses()
    renderMonths()
    renderRows()
  }

  // Swap a row into an inline editor for name / weight / date / note.
  // listAnalyses() returns full records (incl. the video Blob), so we can mutate
  // and persist the same object.
  const startEdit = (item: SavedAnalysis, row: HTMLDivElement) => {
    const baseDate = liftDate(item)
    row.className = 'card flex flex-col gap-2 p-2.5'
    row.innerHTML = `
      ${liftFieldsHtml({ name: item.name || defaultName(item.createdAt), date: baseDate, weightLb: item.weightLb ?? null, note: item.note ?? '' })}
      <div class="flex gap-2">
        <button class="edit-ok btn btn-amber flex-1">Save</button>
        <button class="edit-cancel btn btn-quiet">Cancel</button>
      </div>`
    const commit = async () => {
      const f = readLiftFields(row, baseDate)
      if (f.name) item.name = f.name
      item.weightLb = f.weightLb
      item.note = f.note
      item.recordedAt = f.date
      await saveAnalysis(item)
      await renderList()
    }
    row.querySelector('.edit-ok')!.addEventListener('click', commit)
    row.querySelector('.edit-cancel')!.addEventListener('click', () => { renderList() })
  }

  renderList().then(() => window.scrollTo(0, view.scrollY))
}
