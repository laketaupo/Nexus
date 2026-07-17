# Highlight Empty Fields Toggle — Design

**Date:** 2026-07-17
**Status:** Approved

## Goal

Add a control-panel toggle that, when on, highlights all empty fields on the **L4**
detail screen with a light-red background — so it is immediately clear which fields
still need to be filled in.

## Scope

- **Surface:** the L4 detail screen only (`#detailScreen` when the viewed node is L4).
  The same render function also serves L5 detail screens; those are left unchanged.
- **Fields:** only the fields that are already always rendered. Empty markers already
  carry classes:
  - `.ds-cell-muted` — RASCI and SIPOC grid cells
  - `.ds-empty-muted` — KPIs/Goals, Systems & functionality rows, Documentation,
    Owners, Timing
  Fields that hide entirely when empty (Description, Type badge) stay hidden — they
  are out of scope.
- **Highlight target:** just the empty value marker (the `—`), not the field label.
- **Default:** Off. Session-only, matching existing toggles (System lane, Highlight
  Types).

## Design

### 1. Control-panel toggle

Add a new `.cp-section` titled **"Detail screen"**, placed immediately after the
existing "Highlight Types" section (around [index.html:2689](../../index.html)).
It contains one Off/On segmented control labelled **"Empty fields"**, using the same
markup pattern as `cpErpOff`/`cpErpOn`:

```html
<div class="cp-section">
  <div class="cp-section-title">Detail screen</div>
  <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;">
    <span style="font-size:.75rem;color:var(--txt4);">Empty fields</span>
    <div class="cp-theme-seg" style="margin:0">
      <button class="cp-theme-opt active" id="cpEmptyOff">Off</button>
      <button class="cp-theme-opt" id="cpEmptyOn">On</button>
    </div>
  </div>
</div>
```

Kept as its own section (rather than folded into "Highlight Types") because
"Highlight Types" highlights nodes on the flow diagram, whereas this targets the
detail screen.

### 2. State

A module-level flag alongside the other view-state variables:

```js
let highlightEmptyFields = false;
```

Button handlers mirror the existing `cpErp*` pattern: toggle the flag, move the
`active` class between the two buttons, and live-apply the highlight to an open
detail screen.

### 3. Level detection + class application

Inside `renderDetailScreen` ([index.html:4244](../../index.html)), the viewed node's
absolute level is `levelOffset + currentPath.length` (L4 ⇔ `currentPath.length === 3`).
Each render:

```js
const absLevel = levelOffset + currentPath.length;
detailScreen.classList.toggle('lvl-4', absLevel === 4);
detailScreen.classList.toggle('hl-empty', highlightEmptyFields);
```

This re-applies correctly on prev/next navigation between detail screens.

### 4. CSS (theme-aware, gated on both classes)

```css
#detailScreen.hl-empty.lvl-4 .ds-cell-muted,
#detailScreen.hl-empty.lvl-4 .ds-empty-muted {
  background: rgba(220,60,60,.18);
  border: 1px solid rgba(220,60,60,.45);
  border-radius: 4px;
  color: #e88;
}
html.light #detailScreen.hl-empty.lvl-4 .ds-cell-muted,
html.light #detailScreen.hl-empty.lvl-4 .ds-empty-muted {
  background: #fde8e8;
  border-color: #f0b0b0;
  color: #c0392b;
}
```

`.ds-empty-muted` is an inline span, so the highlight renders as a small red pill
around the `—`. `.ds-cell-muted` is a grid cell, so its whole cell fills.
Gating on `.lvl-4` ensures L5 detail screens are never affected.

## Out of scope

- L5 detail screens, the flow diagram, and the info side-panel.
- Persisting the toggle across reloads.
- Force-showing fields that currently hide when empty.

## Testing

Manual verification in-browser:
1. Open an L4 detail screen with some empty fields → toggle On → empty markers
   turn light red; filled fields and labels unchanged.
2. Toggle Off → highlight clears.
3. Prev/Next to another L4 node → highlight persists and reflects that node's empties.
4. Open an L5 detail screen with toggle On → no highlight.
5. Check both light and dark themes.
