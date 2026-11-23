// Keeping saved lifts safe. Safari evicts a site's IndexedDB after 7 days without
// a visit; the Home Screen app is exempt, and persistent storage also protects
// against low-space cleanup.

export function isStandalone(
  nav: { standalone?: boolean },
  matchMedia: (q: string) => { matches: boolean },
): boolean {
  return nav.standalone === true || matchMedia('(display-mode: standalone)').matches
}

// Fire-and-forget: ask once if not already persisted; never throws.
export async function requestPersist(storage?: StorageManager): Promise<void> {
  try {
    if (!storage?.persist || !storage.persisted) return
    if (!(await storage.persisted())) await storage.persist()
  } catch { /* denied or unsupported — nothing to do */ }
}
