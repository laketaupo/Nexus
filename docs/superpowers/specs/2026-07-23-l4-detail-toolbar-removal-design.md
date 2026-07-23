# Remove L4 Detail Toolbar Bar — Design

**Date:** 2026-07-23
**Status:** Approved

## Goal

Remove the horizontal `.detail-toolbar` bar at the top of the L4 process detail
overlay (`#detailScreen`), which currently holds only the "‹ Back" button and the
prev/next process nav arrows. Relocate those controls as floating buttons directly
over the screen instead, so the hero card (breadcrumb, code, title, type badge,
description) and the quad/ribbon below it gain the vertical space the bar used to
reserve.

## Scope

- **Surface:** the detail screen toolbar and its two controls only
  (`#btnDetailBack`, `#dsNavPrev`, `#dsNavNext`). Applies to both L4 and L5 detail
  screens, since the toolbar and controls are shared markup — there is nothing
  L4-specific about the toolbar itself.
- **No JS/behavior changes.** Same element IDs, same click handlers
  (`closeDetailScreen`, the prev/next sibling navigation wired in
  `getDetailNavSiblings`/`updateDetailNav`, and the arrow-key roving-focus wiring).
  This is a markup relocation + CSS change only.
- **Out of scope:** the hero card's own content/layout, the 2×2 quad, the meta
  ribbon, and the control-panel "highlight empty fields" toggle — all unchanged.

## Design

### 1. Markup: flatten the toolbar

Current (`index.html:2513-2519`):

```html
<div id="detailScreen" class="hidden">
  <div class="detail-toolbar">
    <button class="dt-btn dt-btn-back" id="btnDetailBack">&#8249; Back</button>
    <div class="dt-nav-inline">
      <button class="dt-nav-btn hidden" id="dsNavPrev" aria-label="Previous process">&#8249;</button>
      <button class="dt-nav-btn hidden" id="dsNavNext" aria-label="Next process">&#8250;</button>
    </div>
  </div>
  <div class="ds-wrap">
    ...
```

New:

```html
<div id="detailScreen" class="hidden">
  <button class="dt-btn dt-btn-back" id="btnDetailBack">&#8249; Back</button>
  <button class="dt-nav-btn dt-nav-prev hidden" id="dsNavPrev" aria-label="Previous process">&#8249;</button>
  <button class="dt-nav-btn dt-nav-next hidden" id="dsNavNext" aria-label="Next process">&#8250;</button>
  <div class="ds-wrap">
    ...
```

The `.detail-toolbar` and `.dt-nav-inline` wrapper divs are removed entirely; the
three buttons become direct children of `#detailScreen`, positioned by CSS instead
of by flex layout. No changes to any other markup inside `.ds-wrap`.

### 2. Back button: floating pill, top-left

`#detailScreen` is already `position: fixed`, so it serves as the containing block
for absolutely-positioned children without further changes.

```css
#detailScreen .dt-btn-back {
  position: absolute; top: 14px; left: 16px; z-index: 20;
  font-weight: 600; box-shadow: 0 2px 6px rgba(0,0,0,.18);
}
```

This keeps the existing `.dt-btn` base styling (solid `var(--surf)` background,
border, padding, radius) — already opaque enough to read clearly over the card's
top-left corner — and just adds positioning plus a subtle lift shadow so it reads
as a floating control rather than part of the card.

### 3. Prev/Next: reactivate existing (currently dead) edge-floating CSS

The stylesheet already defines left/right edge-floating rules for `.dt-nav-btn`
that are never applied today because the buttons only ever carry the base
`dt-nav-btn` class, wrapped in `.dt-nav-inline` (which overrides them to sit inline
in the toolbar):

```css
/* index.html:1914-1925, already present */
#detailScreen .dt-nav-btn {
  position: absolute; top: 50%; transform: translateY(-50%);
  z-index: 8; width: 44px; height: 44px; border-radius: 50%;
  background: var(--surf); border: 1px solid var(--bdr); color: var(--txt3);
  font-size: 1.4rem; line-height: 1; cursor: pointer; font-family: inherit;
  display: flex; align-items: center; justify-content: center;
  transition: border-color .15s, background .15s, color .15s;
}
#detailScreen .dt-nav-btn:hover { background: var(--bdr); border-color: var(--acc); color: var(--txt); }
#detailScreen .dt-nav-prev { left: 1rem; }
#detailScreen .dt-nav-next { right: 1rem; }
#detailScreen .dt-nav-btn.hidden { display: none; }
```

Adding the `dt-nav-prev` / `dt-nav-next` classes to the markup (step 1) activates
this as-is: two 44px circular buttons, vertically centered on the left/right edges
of `#detailScreen`. No new CSS needed for these two buttons.

### 4. Remove now-dead toolbar CSS

Delete these rules (`index.html:1896-1905`), since nothing references them after
step 1:

```css
#detailScreen .detail-toolbar { ... }
#detailScreen .dt-nav-inline { ... }
#detailScreen .dt-nav-inline .dt-nav-btn { ... }
```

### 5. Reclaim the freed space in `.ds-wrap`

Current (`index.html:1926-1930`):

```css
#detailScreen .ds-wrap {
  flex: 1 1 auto; min-height: 0; max-width: 1500px; width: 100%; margin: 0 auto;
  display: grid; grid-template-rows: auto minmax(0, 1.5fr) minmax(0, 1fr);
  gap: .6rem; padding: .65rem 1.25rem .8rem;
}
```

Since `.ds-wrap` is now the only in-flow child of `#detailScreen` (the three
buttons are taken out of flow via `position: absolute`), it already expands to
fill the full screen height. Bump its top padding just enough to clear the
floating back button — from `.65rem` to `3rem` — leaving the rest of the space
previously consumed by the 52px toolbar bar (plus its 1px border) available to the
hero/quad/ribbon grid rows:

```css
#detailScreen .ds-wrap {
  flex: 1 1 auto; min-height: 0; max-width: 1500px; width: 100%; margin: 0 auto;
  display: grid; grid-template-rows: auto minmax(0, 1.5fr) minmax(0, 1fr);
  gap: .6rem; padding: 3rem 1.25rem .8rem;
}
```

Bottom padding is unchanged — the prev/next buttons no longer live at the bottom,
so nothing needs clearing there.

## Space accounting

| | Old | New |
|---|---|---|
| Top reserved (toolbar/back button + padding) | 52px bar + 1px border + 10.4px padding = 63.4px | 48px padding (clears floating back button) |
| Bottom reserved | 12.8px padding | 12.8px padding (unchanged) |
| Left/right reserved | 0px (nav was in top bar) | ~0px on desktop widths where `.ds-wrap`'s 1500px cap leaves gutter room; on narrow windows the edge buttons may sit close to card content — pre-existing characteristic of this CSS, not newly introduced |

Net: roughly 15px more vertical space for the hero/quad/ribbon grid, and the
visual weight of the solid bordered bar is gone, making the card itself feel
larger even where the numeric gain is modest.

## Out of scope

- Any change to hero card, quad, or ribbon content/layout.
- Auto-hide/idle-fade behavior for the floating buttons (they stay always visible,
  matching existing behavior).
- Fixing narrow-viewport overlap between the edge nav buttons and card content —
  pre-existing in the (previously unused) CSS, not introduced by this change.

## Testing

Manual verification in-browser:
1. Open an L4 detail screen → confirm the toolbar bar is gone, "‹ Back" floats
   top-left over the card corner, and prev/next arrows float at the vertical
   center of the left/right screen edges.
2. Click Back → closes the detail screen as before.
3. Click prev/next (when siblings exist) → navigates as before; buttons hide when
   there is no sibling in that direction.
4. Arrow-key roving focus still moves onto/between the nav buttons as before.
5. Open an L5 detail screen → same floating behavior (shared markup).
6. Check both light and dark themes for legibility of the floating back button
   over the card corner.
7. Resize to a narrow window and confirm behavior is acceptable (or at least no
   worse than the pre-existing dead CSS would have produced).
