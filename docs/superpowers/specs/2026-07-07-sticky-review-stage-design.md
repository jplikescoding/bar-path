# Sticky Review Stage — Design

Date: 2026-07-07
Status: approved (JP, device-test feedback 2026-07-07)

## Problem

On the result screen, the cue cards (bar-drift-off-midfoot, hip timing) sit ~2 screens
below the video, after the velocity graph and side-to-side gauge. Tapping a card seeks
the video to the flagged moment, but the video is off-screen — the user has to scroll
up to see it, which breaks the "Tap to see the moment →" affordance entirely
(device-test finding, JP 2026-07-07).

JP's priority call: the two cue cards are the most actionable content on the screen;
the velocity graph and side-to-side gauge are secondary.

## Decision

Pin the review stage; put the cue cards directly under it; demote the graphs.
(Chosen over "reorder + auto-scroll on card tap" — pinning guarantees video + card
are visible together at all times, not just right after a tap.)

## Changes (all in `src/screens/result.ts`, plus tokens/utilities already in `src/style.css`)

1. **Sticky block.** Wrap the video stage (`#stage`), the play/speed/sound/skeleton
   control row, and the scrubber row (including its cue/hip tick overlays) in one
   container: `position: sticky; top: 0`, opaque `var(--bg)` background, hairline
   bottom border (`var(--line)`) so scrolling content visibly slides under it,
   z-index above the cards.
2. **Video height trim.** Video element class `max-h-[54vh]` → `max-h-[42vh]` so the
   whole pinned block is ~55vh on an iPhone, leaving at least one full cue card
   visible below it.
3. **Reorder** the scrolling content below the pinned block to:
   midfoot cue card → hip timing card → side-to-side gauge → velocity graph →
   actions → saved-msg. (Today: velocity → gauge → cards → actions.)
4. **Card tap:** unchanged seek handlers; no scroll logic needed — the video is
   pinned on screen by construction.

## Out of scope

Tracking, persistence, export, cue logic, graph internals — untouched. This is
markup order + one sticky wrapper + a height class.

## Verification

- `npm test` (pure-logic tests, should be unaffected) and a green build.
- Local Playwright harness (`scripts/e2e-phase2.mjs`) still finds the cards/actions;
  screenshot sanity check of the new order.
- Final validation is JP on iPhone Safari: scroll the result screen — video stays
  pinned, cards slide under it; tap a cue card — the flagged moment is visible
  without scrolling.
