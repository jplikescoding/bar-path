let promise: Promise<any> | null = null

// Loads OpenCV.js on first call by injecting the (vendored, same-origin) script.
// Deferring injection until this is called keeps the ~10MB download + WASM compile
// off the initial page load, so the upload screen stays responsive.
export function loadOpenCV(): Promise<any> {
  if (promise) return promise
  promise = new Promise((resolve, reject) => {
    const ready = (m: any) => {
      if (m && typeof m.Mat === 'function') return resolve(m)
      m.onRuntimeInitialized = () => resolve(m)
    }
    const existing = (window as any).cv
    if (existing) { ready(existing); return }

    const s = document.createElement('script')
    s.async = true
    s.src = './opencv.js'
    s.onerror = () => reject(new Error('Failed to load OpenCV'))
    s.onload = () => {
      const check = () => {
        const g = (window as any).cv
        if (g) ready(g)
        else setTimeout(check, 50)
      }
      check()
    }
    document.head.appendChild(s)
    setTimeout(() => reject(new Error('OpenCV load timeout')), 120000)
  })
  return promise
}
