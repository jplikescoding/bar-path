import type { Screen } from './state'
import { initialData, type AppData } from './state'
import type { LiftFilter } from './librarySupport'

export type RenderFn = (app: App, root: HTMLElement) => void

export class App {
  data: AppData = initialData()
  // Library filters + scroll, kept for the session so <- Lifts returns to the same view.
  libraryView: { lift: LiftFilter; month: 'all' | string; scrollY: number } = { lift: 'all', month: 'all', scrollY: 0 }
  // Safari-tab storage banner dismissed (session only).
  bannerDismissed = false
  private screens = new Map<Screen, RenderFn>()
  constructor(private root: HTMLElement) {}

  register(screen: Screen, fn: RenderFn) {
    this.screens.set(screen, fn)
  }

  go(screen: Screen) {
    const fn = this.screens.get(screen)
    if (!fn) throw new Error(`No screen registered: ${screen}`)
    this.root.innerHTML = ''
    fn(this, this.root)
  }

  reset() {
    if (this.data.videoUrl) URL.revokeObjectURL(this.data.videoUrl)
    if (this.data.videoEl) { this.data.videoEl.removeAttribute('src'); this.data.videoEl.load() }
    this.data = initialData()
  }
}
