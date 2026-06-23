import type { Screen } from './state'
import { initialData, type AppData } from './state'

export type RenderFn = (app: App, root: HTMLElement) => void

export class App {
  data: AppData = initialData()
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
    this.data = initialData()
  }
}
