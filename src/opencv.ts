let promise: Promise<any> | null = null

// Loads OpenCV.js on first call by injecting the (vendored, same-origin) script.
// Two gotchas with this build, both handled here:
//  1. It signals readiness via Module.onRuntimeInitialized (register BEFORE the
//     script runs) — its `window.cv` thenable never settles, so we don't await it.
//  2. `window.cv` carries a bogus `.then`; resolving a Promise WITH it would make
//     the Promise "adopt" that never-settling thenable and hang. So we strip
//     `.then` before resolving.
export function loadOpenCV(): Promise<any> {
  if (promise) return promise
  promise = new Promise((resolve, reject) => {
    const w = window as any
    const finish = () => {
      const cv = w.cv
      if (cv && typeof cv.then === 'function') {
        try { delete cv.then } catch { /* non-configurable */ }
        if (typeof cv.then === 'function') cv.then = undefined
      }
      resolve(cv)
    }
    if (w.cv && typeof w.cv.Mat === 'function') return finish()

    w.Module = w.Module || {}
    w.Module.onRuntimeInitialized = finish

    const s = document.createElement('script')
    s.async = true
    s.src = './opencv.js'
    s.onerror = () => reject(new Error('Failed to load OpenCV'))
    document.head.appendChild(s)

    setTimeout(() => {
      if (!(w.cv && typeof w.cv.Mat === 'function')) reject(new Error('OpenCV init timeout'))
    }, 120000)
  })
  return promise
}
