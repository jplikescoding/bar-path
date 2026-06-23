import './style.css'
import { App } from './app'
import type { Screen } from './state'
import { renderUpload } from './screens/upload'

const root = document.querySelector<HTMLDivElement>('#app')!
const app = new App(root)

const stub = (name: Screen, next?: Screen): void =>
  app.register(name, (a, r) => {
    r.innerHTML = `<div class="min-h-screen grid place-items-center gap-4">
      <h1 class="text-xl">${name}</h1>
      ${next ? `<button id="next" class="px-4 py-2 rounded bg-blue-600">Next: ${next}</button>` : ''}
    </div>`
    if (next) r.querySelector('#next')!.addEventListener('click', () => a.go(next))
  })

app.register('upload', renderUpload)
stub('setpoint', 'processing')
stub('processing', 'result')
stub('result')

app.go('upload')
