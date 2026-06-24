# Saved Library — Design Spec (for overnight autonomous build)

**Date:** 2026-06-23
**Status:** Approved by JP for an unattended build → open a PR (do NOT push to master).

## Goal

Persist completed bar-path analyses locally so they survive closing Safari, and add
a Library screen to browse, reopen, and delete them. Models Iron Path's saved-clip list.

## Hard constraints (read carefully)

- Work on a NEW branch `feat/saved-library`. Do NOT commit to `master`. Open a PR at the end.
- Do NOT break the existing flow (upload → setpoint → processing → result → export).
- Keep the existing architecture/patterns: plain TS, the `App`/`RenderFn` screen router
  in `src/app.ts`, screens in `src/screens/`, Tailwind, `tsconfig` has `noEmit:true`
  (create only `.ts` files; Vite bundles), ES2020 lib (NO `Array.prototype.at` — use
  `arr[arr.length-1]`).
- Fully client-side. No new runtime network calls. Storage = IndexedDB (videos are large;
  localStorage is too small).
- The gate before opening the PR: `npm test` (all tests pass, including NEW ones) AND
  `npm run build` (exit 0). If either fails, keep fixing — do not open a PR with a red gate.
- Verification limitation: this build runs in the cloud without a phone or the Playwright
  harness, so verify via unit tests + build only. Keep DOM/canvas glue thin; put logic in
  pure, tested functions.

## Data model

```ts
interface SavedAnalysis {
  id: string                       // crypto.randomUUID()
  name: string                     // default e.g. "Lift — Jun 23, 7:14 PM" (see naming)
  createdAt: number                // ms epoch (pass via Date.now() at save time)
  video: Blob                      // the original uploaded video file
  seed: { x: number; y: number }
  startTime: number
  endTime: number | null
  verticalAngleRad: number | null
  path: PathPoint[]                // from src/geometry
  thumbnail: string                // a data: URL JPEG of one frame with the path (small)
  driftRange: number               // horizontalDrift(...).range, for the list subtitle
}
```

## New / changed files

- **Create `src/library.ts`** — IndexedDB wrapper (no external deps), pure-ish CRUD:
  - `saveAnalysis(a: SavedAnalysis): Promise<void>`
  - `listAnalyses(): Promise<SavedAnalysis[]>`  (sorted by `createdAt` DESC)
  - `getAnalysis(id: string): Promise<SavedAnalysis | undefined>`
  - `deleteAnalysis(id: string): Promise<void>`
  - DB name `bar-path`, store `analyses` (keyPath `id`).
- **Create `src/librarySupport.ts`** — PURE helpers (unit-tested, no IndexedDB/DOM):
  - `defaultName(createdAt: number): string` — e.g. `"Lift — Jun 23, 7:14 PM"` from a
    timestamp (use `new Date(createdAt)` — allowed when given an arg).
  - `sortByNewest(list: SavedAnalysis[]): SavedAnalysis[]`
  - `driftSubtitle(range: number): string` — e.g. `"drift 95px"`.
- **Create `src/screens/library.ts`** — `renderLibrary(app, root)`:
  - Lists saved analyses (thumbnail, name, date, drift subtitle). Empty state: a message +
    "Upload a video" button → `app.go('upload')`.
  - Tap an item → load it (see reopen flow) → `app.go('result')`.
  - Each item has a Delete (✕) that calls `deleteAnalysis(id)` and re-renders the list.
  - A "Back" / "New video" affordance → `app.go('upload')`.
- **Modify `src/state.ts`** — add `'library'` to `Screen`. (AppData unchanged.)
- **Modify `src/app.ts`** — nothing structural needed; just ensure `reset()` still works.
  Note `reset()` currently revokes `videoUrl` and unloads `videoEl` — keep that.
- **Modify `src/main.ts`** — `import { renderLibrary }` and `app.register('library', renderLibrary)`.
- **Modify `src/screens/upload.ts`** — add a small "Saved lifts" button BELOW the chooser
  that does `app.go('library')` (always available; the library screen handles empty state).
- **Modify `src/screens/result.ts`** — add a "Save" button (next to Export / New video).
  On click: build a `SavedAnalysis` from `app.data` (capture the video Blob — see note),
  generate a thumbnail (draw the end frame + path to an offscreen canvas → `toDataURL('image/jpeg', 0.6)`,
  downscaled so it's small), `saveAnalysis(...)`, then show "Saved ✓" and offer `app.go('library')`.

## Reopen flow (library item → result)

`app.data` currently holds a live `videoEl`. For a saved item there is none, so reconstruct:
1. `const url = URL.createObjectURL(saved.video)`
2. create a `<video>` (muted, playsInline, `setAttribute('playsinline','')`, preload auto),
   set `src=url`, await `loadedmetadata`.
3. Set `app.data` = { videoUrl: url, videoEl: video, seed, startTime, endTime,
   verticalAngleRad, path } from the saved record.
4. `app.go('result')`.
The result screen already renders from `app.data` — no changes needed there for reopen.

## Capturing the video Blob for saving

`app.data.videoUrl` is an object URL; fetch it back to a Blob at save time:
`const video = await (await fetch(app.data.videoUrl!)).blob()`. (Object URLs are fetchable
same-origin.) Store that Blob in the record.

## Testing (required, this is the verification gate)

- Add `fake-indexeddb` as a devDependency and, at the top of the library test, do
  `import 'fake-indexeddb/auto'` so `src/library.ts` CRUD can be exercised in vitest.
- `test/library.test.ts`: save two analyses (use tiny `new Blob(['x'])` as the video),
  list them (assert sorted newest-first), get one by id, delete one, list again (assert gone).
- `test/librarySupport.test.ts`: test `defaultName` (stable format for a fixed timestamp),
  `sortByNewest`, `driftSubtitle`.
- Existing 8 tests must still pass.

## Out of scope (do NOT build)

Cloud sync, accounts, renaming UI (default names only), sharing, body tracking, analysis cues.

## PR

Title: `feat: saved library (persist + browse analyses)`. Body: what was built, the test
results (paste the `npm test` summary), and a short "how to verify on device" checklist for JP
(save a lift, see it in the library, reopen it, delete it, confirm it survives a reload).
