import './style.css'
import { App } from './app'
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

app.go('upload')
