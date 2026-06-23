import './style.css'
import { App } from './app'
import { loadOpenCV } from './opencv'
import { renderUpload } from './screens/upload'
import { renderSetPoint } from './screens/setpoint'
import { renderProcessing } from './screens/processing'
import { renderResult } from './screens/result'

const root = document.querySelector<HTMLDivElement>('#app')!
const app = new App(root)

app.register('upload', renderUpload)
app.register('setpoint', renderSetPoint)
app.register('processing', renderProcessing)
app.register('result', renderResult)

// Start downloading + initializing OpenCV in the background so it's ready by the
// time the user finishes setting up and taps Track. Ignore errors here; the
// processing screen surfaces them if tracking is actually attempted.
loadOpenCV().catch(() => {})

app.go('upload')
