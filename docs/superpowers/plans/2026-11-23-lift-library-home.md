# Lift Library as Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app opens on a filterable, day-grouped feed of saved lifts (Strava-like), lifts carry recorded date + optional weight (lb) + note, and storage is protected from Safari eviction.

**Architecture:** Pure feed/date helpers in `src/librarySupport.ts` and a pure MP4/MOV date parser in `src/videoDate.ts` (both unit-tested); screens (`library.ts`, `result.ts`, `upload.ts`) consume them. New `SavedAnalysis`/`AppData` fields are optional so existing IndexedDB records keep working with no schema bump. Session-only UI state (filters, scroll, banner dismissal) lives on `App`.

**Tech Stack:** Vite + TypeScript strict, Tailwind, vanilla DOM screens, IndexedDB, vitest (+ fake-indexeddb), local Playwright scripts (gitignored `scripts/`).

**Spec:** `docs/superpowers/specs/2026-11-23-lift-library-home-design.md`

## Global Constraints

- 100% client-side; no new runtime dependencies.
- Weight is **lb**, one fixed unit, stored exactly as entered in `weightLb`; no kg, no toggle.
- `liftDate(rec) = rec.recordedAt ?? rec.createdAt` drives sort, grouping, month filter. All day/month math in **local time**.
- All new fields optional; records lacking them must list, open, and edit.
- Design identity: color = data, amber = action; one amber primary action per screen (Library: **+ New**). Safari banner is NOT amber.
- Depth wording is a measurement, never a verdict ("below parallel" / "at parallel" / "above parallel").
- User text (name, note) rendered into HTML must be escaped.
- Metadata date parsing must never block or fail an upload: any error → `null`.

## Review Focus

1. **Legacy records** (no `recordedAt`/`weightLb`/`note`/`liftType`) → list under `createdAt` day as Deadlift, open, edit. Pinned in Task 1 and Task 4 tests.
2. **Date-only edit keeps time of day and is local-time correct** (incl. across DST) → `withDate` test in Task 1.
3. **Bad weight input** (`""`, `"abc"`, `"0"`, `"-5"`, `"312.5"`) → `null,null,null,null,312.5` via `parseWeightLb`, Task 1.
4. **HTML in name/note** (`<b>x</b>`) renders as text in rows → `escapeHtml` test in Task 1, used in Task 5.
5. **Garbage / truncated / moov-at-end video files** → parser returns `null` or the right date, never throws. Task 2.

---

### Task 1: Feed + field helpers (pure)

**Files:**
- Modify: `src/librarySupport.ts`
- Test: `test/librarySupport.test.ts`

**Interfaces:**
- Produces (all exported from `src/librarySupport.ts`):
  - `SavedAnalysis` gains `recordedAt?: number | null`, `weightLb?: number | null`, `note?: string`
  - `type LiftFilter = 'all' | LiftType`
  - `liftDate(a: SavedAnalysis): number`
  - `sortByNewest(list)` — now sorts by `liftDate` desc (signature unchanged)
  - `monthKey(ts: number): string` → `'YYYY-MM'` local
  - `monthOptions(list: SavedAnalysis[]): { key: string; label: string }[]` — distinct months, newest first, label `'Nov 2026'`
  - `filterLifts(list, lift: LiftFilter, month: 'all' | string): SavedAnalysis[]` (legacy `liftType` undefined = deadlift)
  - `groupByDay(list: SavedAnalysis[], now: number): { label: string; items: SavedAnalysis[] }[]` — input order preserved; label `'Sat, Nov 22'`, with `', 2025'` appended when year ≠ year of `now`
  - `liftSummary(a: SavedAnalysis): string` — squat with `depthCue` → `'below parallel' | 'at parallel' | 'above parallel'`; otherwise `'drift 3.1 cm'` (calibrated, 1 dp) / `'drift 95 px'`
  - `liftTitle(a: SavedAnalysis): string` — `'Deadlift'` / `'Squat'`, plus `' · 315 lb'` when `weightLb` set
  - `parseWeightLb(s: string): number | null` — positive finite number else null
  - `toDateInput(ts: number): string` → `'YYYY-MM-DD'` local
  - `withDate(ts: number, ymd: string): number` — same local time-of-day on the new local date
  - `escapeHtml(s: string): string` — escapes `& < > " '`
- Keep `driftSubtitle` and `defaultName` unchanged (still used until Task 5 removes `driftSubtitle`'s last caller; delete it then if unused).

- [ ] **Step 1: Write failing tests** in `test/librarySupport.test.ts` (extend the existing `make()` with an optional overrides param):
  - `liftDate` returns `recordedAt` when set, `createdAt` when `recordedAt` is undefined or null.
  - `sortByNewest` orders `[a(created 3, recorded 1), b(created 2)]` → `[b, a]`.
  - `monthOptions` on lifts in Nov 2026 ×2 and Oct 2026 → `[{key:'2026-11',label:'Nov 2026'},{key:'2026-10',label:'Oct 2026'}]`.
  - `filterLifts(list,'deadlift','all')` includes a record with no `liftType`; `filterLifts(list,'squat','2026-11')` keeps only Nov squats; `('all','all')` returns all.
  - `groupByDay` with two lifts on 2026-11-22 and one on 2026-11-18, `now` in 2026 → labels `['Sun, Nov 22','Wed, Nov 18']` (compute expected weekday from `new Date(2026,10,22)`), sizes `[2,1]`; a 2025 lift → label ends `', 2025'`.
  - `liftSummary`: squat + `depthCue.where:'below'` → `'below parallel'`; `'level'` → `'at parallel'`; squat without depthCue, `driftRange 95`, no plate → `'drift 95 px'`; deadlift calibrated → `'drift X.X cm'` matching `pxToCm`.
  - `liftTitle`: legacy → `'Deadlift'`; squat 225 → `'Squat · 225 lb'`.
  - `parseWeightLb`: `''→null, 'abc'→null, '0'→null, '-5'→null, '312.5'→312.5, ' 315 '→315`.
  - `toDateInput(new Date(2026,10,3,19,14).getTime())` → `'2026-11-03'`; `withDate(that ts,'2026-03-08')` → `new Date(2026,2,8,19,14).getTime()` (DST date in US).
  - `escapeHtml('<b>"a"&\'</b>')` → `'&lt;b&gt;&quot;a&quot;&amp;&#39;&lt;/b&gt;'`.

- [ ] **Step 2:** `npm test -- librarySupport` → FAIL (missing exports).
- [ ] **Step 3:** Implement the interfaces above in `src/librarySupport.ts` using local `Date` getters and the existing `MONTHS` array (add a `DAYS` array).
- [ ] **Step 4:** `npm test` → all PASS.
- [ ] **Step 5: Commit** `feat(library): feed helpers — liftDate, filters, day groups, summaries, weight/date parsing`

---

### Task 2: Recorded-date parser

**Files:**
- Create: `src/videoDate.ts`
- Test: `test/videoDate.test.ts`

**Interfaces:**
- Produces:
  - `parseRecordedAt(bytes: Uint8Array): number | null` — scans ISO-BMFF boxes in the given bytes for `moov`
  - `readRecordedAt(file: Blob): Promise<number | null>` — reads head (first 4 MB) and tail (last 4 MB) via `Blob.slice`, tries each with `parseRecordedAt`; whole function wrapped so any throw → `null`
  - `pickRecordedAt(parsed: number | null, lastModified: number, now: number): number | null` — `parsed ?? (lastModified < now - 60_000 ? lastModified : null)`

Parsing rules (spec): prefer Apple `moov/meta` with `keys` entry `com.apple.quicktime.creationdate` → the matching `ilst` item's `data` atom string (e.g. `2026-11-22T19:14:05-0800`; accept offset with or without colon) → `Date.parse` after normalizing offset to `±HH:MM`. Else `moov/mvhd` `creation_time` (v0: uint32 at +4 after version/flags; v1: uint64) − 2082844800 s → ms; ignore 0. Tail scan: search the tail bytes for the ASCII `moov` type and parse from 4 bytes before it (box size must fit in the slice).

- [ ] **Step 1: Write failing tests** with fixtures built by a small in-test `box(type, ...payload)` helper:
  - mvhd v0 with creation_time for 2026-11-22T03:14:05Z → that epoch ms.
  - mvhd creation_time 0 → `null`.
  - Apple keys/ilst with `'2026-11-22T19:14:05-0800'` AND an mvhd with a different time → Apple value wins (`Date.parse('2026-11-22T19:14:05-08:00')`).
  - Same with `'-08:00'` form → same result.
  - moov preceded by a large `mdat` (fixture of 1 KB, parsed from a tail-only slice starting mid-mdat) → found.
  - Random bytes / empty array / truncated moov (size > available) → `null`, no throw.
  - `pickRecordedAt(null, now-120_000, now)` → `now-120_000`; `pickRecordedAt(null, now-5_000, now)` → `null`; `pickRecordedAt(5, now-120_000, now)` → `5`.
- [ ] **Step 2:** `npm test -- videoDate` → FAIL.
- [ ] **Step 3:** Implement with `DataView`; no dependencies.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(upload): parse recorded date from MP4/MOV metadata`

---

### Task 3: Thread new fields through state, upload, save, reopen

**Files:**
- Modify: `src/state.ts`, `src/screens/upload.ts`, `src/screens/result.ts` (`persist`), `src/screens/library.ts` (`reopen`)
- Test: `test/state.test.ts`, `test/library.test.ts`

**Interfaces:**
- Consumes: `readRecordedAt`, `pickRecordedAt` (Task 2); `SavedAnalysis` fields (Task 1).
- Produces: `AppData` gains `recordedAt: number | null`, `weightLb: number | null`, `note: string` (initial `null, null, ''`).

- [ ] **Step 1: Failing tests:** `initialData()` has `recordedAt:null, weightLb:null, note:''`; in `library.test.ts`, a record saved with `recordedAt/weightLb/note` round-trips through `saveAnalysis`/`getAnalysis` unchanged.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement:
  - `upload.ts`: in the `change` handler, start `readRecordedAt(file)` immediately; in `loadedmetadata`, after `app.reset()`, await it (it's fast; still never throws) and set `app.data.recordedAt = pickRecordedAt(parsed, file.lastModified, Date.now())`.
  - `result.ts` `persist`: write `recordedAt`, `weightLb`, `note` from `app.data`.
  - `library.ts` `reopen`: restore with `?? null` / `?? ''` defaults.
- [ ] **Step 4:** `npm test` → PASS; `npm run build` → no type errors.
- [ ] **Step 5: Commit** `feat(state): carry recordedAt, weightLb, note through save and reopen`

---

### Task 4: Shared lift-details form (save + edit)

**Files:**
- Create: `src/screens/liftFields.ts`
- Modify: `src/screens/result.ts` (`showNameEditor`), `src/screens/library.ts` (replace `startRename`)

**Interfaces:**
- Consumes: `parseWeightLb`, `toDateInput`, `withDate`, `escapeHtml`, `defaultName`, `liftDate` (Task 1).
- Produces:
  - `liftFieldsHtml(v: { name: string; date: number; weightLb: number | null; note: string }): string` — inputs `#lf-name`, `#lf-weight` (`inputmode="decimal"`, placeholder `Weight (lb)`), `#lf-date` (`type="date"`), `#lf-note` (placeholder `Note (optional)`); values escaped.
  - `readLiftFields(scope: HTMLElement, baseDate: number): { name: string; date: number; weightLb: number | null; note: string }` — date via `withDate(baseDate, input.value)` (unchanged/empty input → `baseDate`), weight via `parseWeightLb`, note trimmed.

- [ ] **Step 1:** Result save editor: render `liftFieldsHtml` with `{ name: defaultName(Date.now()), date: app.data.recordedAt ?? Date.now(), weightLb: null, note: '' }` above the existing Save to library / Cancel buttons. On commit, write `weightLb`, `note`, and `recordedAt = date` into `app.data` before `persist(name)`. Enter key in name still commits.
- [ ] **Step 2:** Library ✎: replace the inline rename row with an inline editor using the same form + ✓/✕; on ✓ update `name`, `weightLb`, `note`, `recordedAt` on the record, `saveAnalysis`, re-render. Legacy record: base date = `liftDate(item)`.
- [ ] **Step 3:** `npm run build` → OK; `npm test` → PASS.
- [ ] **Step 4: Verify** (local Playwright script `scripts/e2e-library.mjs`, gitignored, pattern of `scripts/repro-stale-saved.mjs`): seed a fresh analysis via `__app`, open the save editor, enter weight `315`, note `<b>hi</b>`, save → IndexedDB record has `weightLb:315`, `note:'<b>hi</b>'`. Edit a legacy record (inject one without new fields) → saves without error.
- [ ] **Step 5: Commit** `feat(library): optional weight, date and note on save and edit`

---

### Task 5: Library is home — feed, filters, navigation

**Files:**
- Modify: `src/app.ts`, `src/main.ts`, `src/screens/library.ts`, `src/screens/upload.ts`, `src/screens/result.ts`

**Interfaces:**
- Consumes: Task 1 helpers; Task 4 editor.
- Produces: `App.libraryView: { lift: LiftFilter; month: 'all' | string; scrollY: number }` initialised `{ lift:'all', month:'all', scrollY:0 }`; `App.bannerDismissed: boolean` (used in Task 6).

- [ ] **Step 1:** `main.ts`: start screen `'library'` (keep `#pose` → `'posetest'`).
- [ ] **Step 2:** Library render:
  - Header: eyebrow-free title `Lifts`, amber `+ New` → `app.go('upload')`.
  - Chip row `All / Deadlift / Squat` (existing `.chip` + `aria-pressed`) and a month `<select>` styled as a chip: `All time` + `monthOptions(all)`. If the stored month is no longer in the options (e.g. after deletes), reset to `'all'`.
  - List: `groupByDay(filterLifts(...), Date.now())` → day header (`.eyebrow`-style hairline header) then rows: thumbnail, `liftTitle`, subtitle `liftSummary` + (note ? ` · "${first line, truncated by CSS}"` : ''), all via `escapeHtml`. Show the stored `name` as a faint third line only when it differs from `defaultName(item.createdAt)`.
  - Empty: no lifts → existing empty card (button → upload). Filters match none → "No lifts match" + quiet `Clear filters` (resets both to all).
  - Changing a filter re-renders the list and updates `app.libraryView`. Opening a row stores `scrollY = window.scrollY` first; after render, `window.scrollTo(0, app.libraryView.scrollY)`.
- [ ] **Step 3:** Upload screen: replace `Saved lifts` with quiet `← Lifts` → `app.go('library')`.
- [ ] **Step 4:** Result screen saved-state actions: button label `Library` → `← Lifts` (same `leave('library')`). Remove `driftSubtitle` if now unused.
- [ ] **Step 5: Verify** with `scripts/e2e-library.mjs`: app opens on Library; `+ New` → upload → `← Lifts` → Library; inject 3 records (deadlift Nov, squat Nov, deadlift Oct) → `Squat` chip shows 1 row; month Oct + Deadlift shows 1; Squat + Oct shows "No lifts match"; open a row → `← Lifts` restores chip selection. `npm test`, `npm run build` green.
- [ ] **Step 6: Commit** `feat(library): library is home — lift/month filters, day groups, back navigation`

---

### Task 6: Keep lifts safe

**Files:**
- Create: `src/storage.ts`
- Modify: `src/main.ts`, `src/screens/library.ts`
- Test: `test/storage.test.ts`

**Interfaces:**
- Produces: `isStandalone(nav: { standalone?: boolean }, matchMedia: (q: string) => { matches: boolean }): boolean`; `requestPersist(storage?: StorageManager): Promise<void>` (no-op if API missing or already persisted; swallows errors).

- [ ] **Step 1: Failing tests:** `isStandalone({standalone:true}, ()=>({matches:false}))` → true; `({}, q => ({matches: q==='(display-mode: standalone)'}))` → true; `({}, ()=>({matches:false}))` → false. `requestPersist` calls `persist()` once when `persisted()` resolves false, not when true, and resolves (no throw) when `persist` rejects or `storage` is undefined.
- [ ] **Step 2:** `npm test -- storage` → FAIL.
- [ ] **Step 3:** Implement; `main.ts` calls `requestPersist(navigator.storage)` at startup.
- [ ] **Step 4:** Library: when `!isStandalone(navigator as any, matchMedia)` and `!app.bannerDismissed`, render above the list a non-amber info card (surface/line tokens) with exact copy: "Lifts saved in Safari can be erased after 7 days. Add Bar Path to your Home Screen to keep them: Share → Add to Home Screen." and a ✕ that sets `app.bannerDismissed = true` and removes it.
- [ ] **Step 5: Verify:** `npm test` PASS; e2e script (normal browser tab = not standalone) sees the banner, ✕ hides it, navigating away/back keeps it hidden; with `matchMedia` stubbed to standalone via `page.addInitScript`, no banner.
- [ ] **Step 6: Commit** `feat(storage): request persistent storage; Safari-tab banner`

---

### Task 7: Handoff + ship

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1:** Add a "Lift library as home" section: what shipped, and JP's iPhone checklist — opens on Library in the Home Screen app; no banner there, banner in a Safari tab; a clip filmed on a known earlier day files under that day (or the save date, editable); save with weight/note and edit via ✎; filters by lift + month; ← Lifts returns to the same filters; old lifts still open; update = swipe app away and reopen.
- [ ] **Step 2:** `npm test` and `npm run build` green; commit `docs(handoff): lift library as home + device checklist`.
- [ ] **Step 3:** Push branch, open PR (body ends with the Claude Code attribution line), merge after JP's go-ahead, confirm the Pages deploy succeeds.
