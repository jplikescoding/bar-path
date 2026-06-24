import './style.css'
import { App } from './app'
import { renderUpload } from './screens/upload'
import { renderSetPoint } from './screens/setpoint'
import { renderProcessing } from './screens/processing'
import { renderResult } from './screens/result'
import { renderLibrary } from './screens/library'

const root = document.querySelector<HTMLDivElement>('#app')!
const app = new App(root)

app.register('upload', renderUpload)
app.register('setpoint', renderSetPoint)
app.register('processing', renderProcessing)
app.register('result', renderResult)
app.register('library', renderLibrary)

app.go('upload')

// Register the service worker (PWA: offline app-shell + cached OpenCV engine).
// Guarded + relative path so it works under the GitHub Pages subpath.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
