# PWA / Add to Home Screen — Design Spec (for unattended cloud build)

**Date:** 2026-06-24
**Status:** Approved by JP for an unattended build → open a PR (do NOT push to master).

## Goal
Make the app installable on a phone home screen (iOS Safari "Add to Home Screen" +
Android), launching full-screen/standalone with an app icon, and cache the app shell +
OpenCV engine so it loads fast and works after the first visit (offline-capable).

## Hard constraints
- Work on a NEW branch `feat/pwa-install`. Do NOT commit to `master`. Open a PR at the end.
- Do NOT break the existing flow (upload → setpoint → processing → result → export) or
  existing tests. Keep changes scoped to PWA wiring.
- Keep existing patterns: Vite + TS, `tsconfig` `noEmit:true` (only `.ts` files), Tailwind,
  Vite `base: './'` (everything must use RELATIVE paths so it works under the GitHub Pages
  subpath `/bar-path/`). ES2020 lib (no `Array.prototype.at`).
- Gate before opening the PR: `npm run build` exits 0 AND `npm test` passes (existing 8 +
  your new manifest test). If it can't go green, push the branch + open a DRAFT PR explaining why.

## Icons (ALREADY committed — just reference them)
`public/icons/`: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`.
Do not regenerate; reference these via relative paths.

## Files to create / change
- **Create `public/manifest.webmanifest`** (valid JSON):
  - `name`: "Bar Path Tracker", `short_name`: "Bar Path"
  - `start_url`: "./", `scope`: "./", `display`: "standalone", `orientation`: "portrait"
  - `background_color`: "#0a0a0a", `theme_color`: "#0a0a0a"
  - `icons`: 192 (purpose "any"), 512 (purpose "any"), 512 maskable (purpose "maskable"),
    all with relative `src` like `"icons/icon-192.png"`.
- **Create `public/sw.js`** — a small hand-rolled service worker (no build-tool plugin):
  - On `install`: pre-cache the app shell it can know statically — `"./"`, `"./index.html"`,
    `"./manifest.webmanifest"`, `"./opencv.js"`, and the icon files. `self.skipWaiting()`.
  - On `activate`: clean old caches; `clients.claim()`.
  - On `fetch` (GET, same-origin only): cache-first, fall back to network and runtime-cache
    the response (so the hashed Vite assets get cached on first load). Network fallback for
    misses. Don't touch cross-origin requests. Use a versioned cache name (e.g. `bp-v1`).
- **Modify `index.html`** (in `<head>`): add
  - `<link rel="manifest" href="./manifest.webmanifest">`
  - `<meta name="theme-color" content="#0a0a0a">`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
  - `<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">`
- **Modify `src/main.ts`** — register the SW (guarded), relative path, after app boot:
  `if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {})) }`

## Testing (the gate)
- Add `test/manifest.test.ts`: read `public/manifest.webmanifest`, `JSON.parse` it, assert
  `name`, `start_url === './'`, `display === 'standalone'`, and that `icons` includes a 512
  entry and a `maskable` entry. (Use Node `fs` to read the file; this runs in vitest.)
- Existing 8 tests must still pass; `npm run build` must succeed and copy `manifest.webmanifest`,
  `sw.js`, and `icons/` into `dist/`.

## Notes / caveats
- iOS service-worker support is partial, but `apple-mobile-web-app-capable` + `apple-touch-icon`
  give the standalone home-screen launch + icon, and the SW gives fast/offline shell + cached
  OpenCV where supported. That's the goal.
- Do NOT add `vite-plugin-pwa` or other heavy deps — keep the hand-rolled SW.

## Out of scope
Push notifications, background sync, install-prompt UI, app store packaging.

## PR
Title: `feat: PWA install (manifest, icons, service worker)`. Body: what was built, the
`npm test`/`npm run build` results, and a verification checklist for JP (open the live site
on iPhone Safari → Share → Add to Home Screen → launches full-screen with the icon; reload
offline still loads).
