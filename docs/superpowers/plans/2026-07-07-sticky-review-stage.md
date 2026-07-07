# Sticky Review Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the result screen's video + controls + scrubber to the top of the viewport and move the two cue cards directly beneath them, so tapping "see the moment" always shows the video (spec: `docs/superpowers/specs/2026-07-07-sticky-review-stage-design.md`).

**Architecture:** Pure markup/layout change inside `renderResult`'s `root.innerHTML` template — one sticky wrapper div, reordered card blocks, one video height class change. No handler, state, persistence, or export changes.

**Tech Stack:** Vite + TypeScript, Tailwind (arbitrary-value classes like `max-h-[42vh]` are already used in this file), design tokens from `src/style.css` (`--bg`, `--line`).

## Global Constraints

- Screens are NOT unit-tested (project convention: Vitest covers pure logic only — jsdom can't run video/canvas). Verification = existing tests still green + build green + visual check.
- Do not touch tracking, persistence, export, cue logic, or graph internals.
- Design language: color = data, amber = action; separators use `var(--line)`.
- Work on a feature branch; master auto-deploys to GitHub Pages on push.

---

### Task 1: Sticky pinned stage + card reorder in `result.ts`

**Files:**
- Modify: `src/screens/result.ts:95-179` (the `root.innerHTML` template and the `video.className` line)

**Interfaces:**
- Consumes: existing template fragments (`cueCardHtml`, `tickHtml`, the velocity/gauge card HTML) and existing element IDs.
- Produces: same DOM IDs (`#stage`, `#play`, `#speed`, `#sound`, `#skel`, `#scrub`, `#vel-svg`, `#cue-card`, `#hip-card`, `#actions`, `#saved-msg`) — all `querySelector` lookups and the local e2e harness keep working. Only order and one wrapper change.

- [ ] **Step 1: Create a feature branch**

```bash
git checkout -b feat/sticky-review-stage
```

- [ ] **Step 2: Restructure the template**

In `src/screens/result.ts`, replace the opening of the template (lines 95–112, from `root.innerHTML = ` through the scrubber's closing `</div>`) with a sticky wrapper. The eyebrow stays OUTSIDE the wrapper (it may scroll away — pinned height is precious):

```ts
  root.innerHTML = `
    <div class="min-h-screen flex flex-col gap-3 p-4 pt-0 max-w-md mx-auto w-full rise">
      <div class="text-center pt-4">
        <p class="eyebrow">Step 3 — Review</p>
      </div>
      <div class="sticky top-0 z-10 flex flex-col gap-3 -mx-4 px-4 pt-2 pb-3 border-b border-[var(--line)] bg-[var(--bg)]">
        <div id="stage" class="frame"></div>

        <div class="flex items-center gap-3 justify-center">
          <button id="play" class="btn btn-amber btn-icon" aria-label="Play">▶</button>
          <button id="speed" class="chip" aria-label="Playback speed">1×</button>
          <button id="sound" class="chip" aria-label="Toggle sound" aria-pressed="false">🔇</button>
          ${app.data.poseFrames?.length ? '<button id="skel" class="chip" aria-label="Toggle skeleton" aria-pressed="false">Skeleton</button>' : ''}
        </div>
        <div class="relative">
          <input id="scrub" type="range" min="0" max="1000" value="1000" class="w-full" />
          ${cue ? tickHtml(cue.frameT, toneUi.tick) : ''}
          ${hipCue ? tickHtml(hipCue.frameT, hipUi.tick) : ''}
        </div>
      </div>
```

Notes baked into those classes: the "Step 3 — Review" eyebrow sits OUTSIDE the sticky wrapper (per spec — only stage + controls + scrubber pin; the eyebrow scrolls away, saving pinned height); `-mx-4 px-4` bleeds the opaque background across the container's side padding so cards can't peek through the gutters while sliding under; `bg-[var(--bg)]` + `border-b border-[var(--line)]` make the pin visually read as a surface.

- [ ] **Step 3: Reorder the scrolling content below the wrapper**

Immediately after the sticky wrapper's closing `</div>`, the remaining blocks go in this order (these are the EXISTING template fragments from lines 114–175, moved, not rewritten):

1. `${cue ? cueCardHtml('cue-card', toneUi, …) : (!calibrated ? …size-a-plate hint… : '')}` — unchanged fragment
2. `${hipCue ? cueCardHtml('hip-card', hipUi) : ''}` — unchanged fragment
3. The side-to-side travel card (`<div class="card p-4 flex flex-col gap-3">…gauge…</div>`) — unchanged fragment
4. The velocity card (`${vel.length ? `<div class="card p-4 flex flex-col gap-2">…</div>` : ''}`) — unchanged fragment
5. `<div id="actions"></div>`
6. `<div id="saved-msg" class="text-center text-sm text-[var(--amber)] h-5"></div>`

Then the two closing `</div>`s end the template as before.

- [ ] **Step 4: Trim the pinned video height**

Line ~179 (`video.className = …`), change `54vh` → `42vh`:

```ts
  video.className = 'max-h-[42vh] w-auto block'
```

- [ ] **Step 5: Tests + build**

```bash
npm test && npm run build
```

Expected: all existing tests PASS (none touch screens), build green. Tailwind JIT picks up `max-h-[42vh]`/`bg-[var(--bg)]` automatically.

- [ ] **Step 6: Visual verification (local preview screenshot)**

Run the local Playwright harness against the built app (HEADED Edge, fresh `--port`, kill stray `msedge`/`node` first — see HANDOFF testing notes):

```bash
node scripts/e2e-phase2.mjs --port 4179
```

Expected: harness still finds `#cue-card`, `#hip-card`, saved actions (IDs unchanged). In its screenshots, confirm: cards appear ABOVE the gauge/velocity graph, and after scrolling, the video/controls stay pinned at the top with an opaque background.

If the harness is unavailable in this session, fall back to `npm run preview` + a manual DOM-order check (`document.querySelector('#cue-card').compareDocumentPosition(document.querySelector('#vel-svg'))`) and a scroll screenshot.

- [ ] **Step 7: Commit**

```bash
git add src/screens/result.ts
git commit -m "feat(result): pin video+controls while scrolling; cue cards first, graphs demoted"
```

- [ ] **Step 8: PR**

```bash
git push -u origin feat/sticky-review-stage
gh pr create --title "feat(result): sticky review stage — cue cards first" --body "Per docs/superpowers/specs/2026-07-07-sticky-review-stage-design.md: video+controls+scrubber pin to the top; midfoot + hip cards move directly under them; side-to-side gauge and velocity graph demoted below; video 54vh→42vh so a full cue card fits on screen. Markup-only — no handler/persistence/export changes."
```

Expected: PR opens; GitHub Actions build green. JP device-tests from the deployed URL after merge.
