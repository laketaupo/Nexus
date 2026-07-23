# Controls Panel Declutter — Design

**Date:** 2026-07-23
**Status:** Approved

## Goal

Reduce visual clutter in the Controls panel (`#ctrlPanel`) by (1) merging four
single-purpose sections — Presentation, Settings, Highlight Types, Detail screen —
into one compact "Display" section of toggle rows, and (2) moving the
always-visible 13-row keyboard shortcuts grid out of the panel body into a
popover triggered from a small icon button in the panel header, reusing the
existing File Info dropdown pattern (`#btnInfo` / `#infoDropdown`,
`index.html:7662-7698`).

## Scope

- **Surface:** `#ctrlPanel` markup and CSS only (`index.html:2623-2756` and its
  associated CSS at `index.html:245-359`), plus one new JS function mirroring
  `initInfoDropdown()`.
- **No changes to toggle behavior or state logic.** Every existing element ID
  (`cpPresentOff/On`, `presentScaleSlider`, `presentScaleLabel`, `cpErpOff/On`,
  `cpHlSysOff/On`, `cpHlMeetOff/On`, `cpEmptyOff/On`) is preserved exactly, so
  none of the existing click handlers need to change — this is a regrouping of
  markup, not a rewire of behavior.
- **Out of scope:** the View section, the File section, shortcut key bindings
  themselves, and the detail-screen floating nav buttons (already addressed in
  `2026-07-23-l4-detail-toolbar-removal-design.md`).

## Design

### 1. Merge four sections into one "Display" section

Current: four separate `.cp-section` blocks (`index.html:2655-2709`) — Presentation,
Settings, Highlight Types, Detail screen — each with its own `.cp-section-title`
header and top border (`.cp-section + .cp-section { border-top: ... }`).

New: one `.cp-section` titled "Display", containing a flat list of 5 toggle rows
(Presentation mode + its Text scale sub-control, System lane, System activity,
Meeting, Empty fields), with a subtle divider before the two highlight-type rows
since they're conceptually grouped:

```html
<div class="cp-section">
  <div class="cp-section-title">Display</div>

  <div class="cp-row">
    <span class="cp-row-label">Presentation mode</span>
    <div class="cp-theme-seg" style="margin:0">
      <button class="cp-theme-opt active" id="cpPresentOff">Off</button>
      <button class="cp-theme-opt" id="cpPresentOn">On</button>
    </div>
  </div>
  <div style="margin:.3rem 0 .6rem;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.15rem">
      <span style="font-size:.72rem;color:var(--txt5);">Text scale</span>
      <span id="presentScaleLabel" style="font-size:.7rem;color:var(--acc-t);font-weight:700;min-width:30px;text-align:right;">1.5×</span>
    </div>
    <input type="range" id="presentScaleSlider" min="1.0" max="3.0" step="0.1" value="1.5" disabled>
  </div>

  <div class="cp-row">
    <span class="cp-row-label">System lane</span>
    <div class="cp-theme-seg" style="margin:0">
      <button class="cp-theme-opt active" id="cpErpOff">Off</button>
      <button class="cp-theme-opt" id="cpErpOn">On</button>
    </div>
  </div>

  <div class="cp-row cp-row-divider">
    <span class="cp-row-label">Highlight: System activity</span>
    <div class="cp-theme-seg" style="margin:0">
      <button class="cp-theme-opt active" id="cpHlSysOff">Off</button>
      <button class="cp-theme-opt" id="cpHlSysOn">On</button>
    </div>
  </div>
  <div class="cp-row">
    <span class="cp-row-label">Highlight: Meeting</span>
    <div class="cp-theme-seg" style="margin:0">
      <button class="cp-theme-opt active" id="cpHlMeetOff">Off</button>
      <button class="cp-theme-opt" id="cpHlMeetOn">On</button>
    </div>
  </div>

  <div class="cp-row">
    <span class="cp-row-label">Empty fields</span>
    <div class="cp-theme-seg" style="margin:0">
      <button class="cp-theme-opt active" id="cpEmptyOff">Off</button>
      <button class="cp-theme-opt" id="cpEmptyOn">On</button>
    </div>
  </div>
</div>
```

New CSS (replaces five copies of the same ad hoc inline-style block with one
shared row class):

```css
.cp-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: .5rem; padding: .28rem 0;
}
.cp-row-label { font-size: .75rem; color: var(--txt4); }
.cp-row-divider { border-top: 1px solid var(--bdr-xs); margin-top: .35rem; padding-top: .5rem; }
```

The dead, unused `.cp-toggle-row` / `.cp-switch` CSS (`index.html:279-299`,
defined but never referenced anywhere in current markup) is left untouched —
removing genuinely-dead CSS is a separate cleanup, not part of this change.

### 2. Move keyboard shortcuts into a header popover

Add a small icon button to `.cp-header`, next to the existing close button:

```html
<div class="cp-header">
  <span class="cp-header-title">...Controls</span>
  <div style="display:flex;align-items:center;gap:.15rem">
    <button class="cp-close" id="btnShortcutsToggle" title="Keyboard shortcuts">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 17h8"/>
      </svg>
    </button>
    <button class="cp-close" id="btnControlsClose" title="Close">✕</button>
  </div>
</div>
```

Remove the "Keyboard shortcuts" `.cp-section` (`index.html:2738-2755`) from the
panel body. Its content moves, unchanged, into a new popover that reuses the
existing `.info-dropdown` CSS (`index.html:227-232`):

```html
<div id="shortcutsDropdown" class="info-dropdown hidden" style="width:280px;">
  <div class="cp-shortcuts">
    <span class="cp-key">&#8592;</span><span class="cp-key-desc">Previous node</span>
    <span class="cp-key">&#8594;</span><span class="cp-key-desc">Next node</span>
    <span class="cp-key">&#8595;</span><span class="cp-key-desc">Drill into node</span>
    <span class="cp-key">&#8593;</span><span class="cp-key-desc">Go up one level</span>
    <span class="cp-key">Esc</span><span class="cp-key-desc">Go to top level</span>
    <span class="cp-key">E</span><span class="cp-key-desc">Export single process</span>
    <span class="cp-key">B</span><span class="cp-key-desc">Export bulk processes</span>
    <span class="cp-key">/</span><span class="cp-key-desc">Focus search</span>
    <span class="cp-key">S</span><span class="cp-key-desc">Save HTML file</span>
    <span class="cp-key">C</span><span class="cp-key-desc">Open/close controls</span>
    <span class="cp-key">N</span><span class="cp-key-desc">Upload new CSV</span>
    <span class="cp-key">T</span><span class="cp-key-desc">Toggle system lane (at L5)</span>
    <span class="cp-key">P</span><span class="cp-key-desc">Toggle presentation mode</span>
  </div>
</div>
```

JS, mirroring `initInfoDropdown()` (`index.html:7662-7698`):

```js
function initShortcutsDropdown() {
  const btn = $('btnShortcutsToggle');
  const dropdown = $('shortcutsDropdown');
  function positionDropdown() {
    const r = btn.getBoundingClientRect();
    dropdown.style.top = (r.bottom + 6) + 'px';
    dropdown.style.left = (r.right - 280) + 'px';
  }
  btn.addEventListener('click', e => {
    e.stopPropagation();
    positionDropdown();
    dropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', () => dropdown.classList.add('hidden'));
}
```

Unlike `initInfoDropdown()` — which only runs for files carrying embedded
metadata — `initShortcutsDropdown()` is called unconditionally at startup,
since shortcuts should always be available regardless of file state.

## Space accounting

| | Old | New |
|---|---|---|
| Section headers in panel body | 6 (View, Presentation, Settings, Highlight Types, Detail screen, File) + Keyboard shortcuts = 7 | 3 (View, Display, File) |
| Keyboard shortcuts | 13-row grid + header, always rendered (~230-260px) | 0px in panel body; available in 1 click via header popover |
| Toggle rows | Same 5 toggles, spread across 4 bordered sections | Same 5 toggles, 1 section, no extra borders between them |

Net: panel body shrinks by roughly the height of 3 removed section
headers/borders plus the full shortcuts block (~300px+), while every control
remains reachable in the same number of clicks (toggles: 0 extra clicks;
shortcuts: 1 click instead of 0, in exchange for reclaiming that space
permanently).

## Out of scope

- View section and File section — unchanged.
- Redesigning the toggle control widget itself — still the existing off/on
  segmented `.cp-theme-seg` buttons, not the dead `.cp-toggle-row`/`.cp-switch`
  switch-style CSS.
- Any change to which keyboard shortcuts exist or what they do.
- Detail-screen floating nav buttons (separate, already-completed design).
- Auto-positioning edge cases for the new popover beyond what
  `initInfoDropdown()` already handles today (same positioning logic is
  reused as-is).

## Testing

Manual verification in-browser:

1. Open Controls panel → confirm only three section headers are visible:
   View, Display, File.
2. In the Display section, confirm all 5 rows are present and functionally
   unchanged: toggling Presentation mode still enables/disables the Text scale
   slider; System lane, System activity, Meeting, and Empty fields toggles
   still apply their existing effects.
3. Confirm the subtle divider appears before "Highlight: System activity",
   visually setting the two highlight rows apart from the rest.
4. Click the new keyboard icon in the panel header → popover opens showing
   all 13 shortcuts, positioned below the header without overflowing the
   viewport.
5. Click elsewhere → popover closes. Re-click the icon → toggles open again.
6. Confirm the "C" shortcut (open/close Controls panel) and "P" shortcut
   (toggle presentation mode) still work as before — no regression from the
   markup regrouping.
7. Check both light and dark themes for the new row divider and the
   shortcuts popover.
8. Resize the window and confirm the shortcuts popover doesn't overflow
   off-screen at narrow widths.
