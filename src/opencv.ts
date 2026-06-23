let promise: Promise<any> | null = null

export function loadOpenCV(): Promise<any> {
  if (promise) return promise
  promise = new Promise((resolve, reject) => {
    const cv = (window as any).cv
    const ready = (m: any) => {
      // when loaded via CDN, cv may be a module with onRuntimeInitialized,
      // or already-initialized depending on build. Handle both.
      if (m && typeof m.Mat === 'function') return resolve(m)
      m.onRuntimeInitialized = () => resolve(m)
    }
    const check = () => {
      const g = (window as any).cv
      if (g) ready(g)
      else setTimeout(check, 50)
    }
    if (cv) ready(cv); else { check(); setTimeout(() => reject(new Error('OpenCV load timeout')), 30000) }
  })
  return promise
}
