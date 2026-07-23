# Controls Panel Declutter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce visual clutter in the Controls panel (`#ctrlPanel`) by merging four single-toggle sections into one compact "Display" section, and moving the always-visible 13-row keyboard shortcuts grid into a popover triggered from a header icon button.

**Architecture:** Pure markup + CSS change in the single-file app `index.html`, plus one small new JS function for the shortcuts popover (mirrors the existing `initInfoDropdown()` pattern exactly). Task 1 regroups the Presentation/Settings/Highlight Types/Detail screen sections into one "Display" section using a new shared `.cp-row` CSS class, preserving every existing element ID so no toggle-handling JS changes. Task 2 removes the inline "Keyboard shortcuts" section and replaces it with a header icon button that toggles a popover, reusing the `.info-dropdown` CSS and the same show/hide/position logic as the File Info dropdown.

**Tech Stack:** Plain HTML/CSS/JS, no build step, no test framework. Verification is manual in-browser (matches this repo's existing pattern — see `docs/superpowers/plans/2026-07-23-l4-detail-toolbar-removal.md`).

## Global Constraints

- No changes to toggle state/behavior logic: `cpPresentOff/On`, `presentScaleSlider`, `presentScaleLabel`, `cpErpOff/On`, `cpHlSysOff/On`, `cpHlMeetOff/On`, `cpEmptyOff/On` keep their exact IDs — this is a markup regrouping only.
- Leave the View section and File section untouched.
- Leave the dead, unused `.cp-toggle-row`/`.cp-switch` CSS (`index.html:279-299`) untouched — it is out of scope per the spec.
- Follow the exact markup/CSS specified in `docs/superpowers/specs/2026-07-23-controls-panel-declutter-design.md` — this plan is a direct implementation of that spec, not a reinterpretation.

---

### Task 1: Merge Presentation/Settings/Highlight Types/Detail screen into one "Display" section

**Files:**
- Modify: `index.html:2655-2709` (markup — replace 4 sections with 1)
- Modify: `index.html:275-276` (CSS — add `.cp-row` rules near `.cp-section`)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by Task 2 — the two tasks touch disjoint regions of `#ctrlPanel` and can be done/reviewed independently.

- [ ] **Step 1: Add the `.cp-row` CSS class**

Current (`index.html:275-276`):

```css
    .cp-section { padding: .7rem 1rem; }
    .cp-section + .cp-section { border-top: 1px solid var(--bdr-xs); }
```

Replace with:

```css
    .cp-section { padding: .7rem 1rem; }
    .cp-section + .cp-section { border-top: 1px solid var(--bdr-xs); }
    .cp-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: .5rem; padding: .28rem 0;
    }
    .cp-row-label { font-size: .75rem; color: var(--txt4); }
    .cp-row-divider { border-top: 1px solid var(--bdr-xs); margin-top: .35rem; padding-top: .5rem; }
```

- [ ] **Step 2: Replace the four sections with one merged "Display" section**

Current (`index.html:2655-2709`):

```html
    <div class="cp-section">
      <div class="cp-section-title">Presentation</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.5rem">
        <span style="font-size:.75rem;color:var(--txt4);">Mode</span>
        <div class="cp-theme-seg" style="margin:0">
          <button class="cp-theme-opt active" id="cpPresentOff">Off</button>
          <button class="cp-theme-opt" id="cpPresentOn">On</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.15rem">
        <span style="font-size:.75rem;color:var(--txt4);">Text scale</span>
        <span id="presentScaleLabel" style="font-size:.7rem;color:var(--acc-t);font-weight:700;min-width:30px;text-align:right;">1.5×</span>
      </div>
      <input type="range" id="presentScaleSlider" min="1.0" max="3.0" step="0.1" value="1.5" disabled>
    </div>

    <div class="cp-section">
      <div class="cp-section-title">Settings</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;">
        <span style="font-size:.75rem;color:var(--txt4);">System lane</span>
        <div class="cp-theme-seg" style="margin:0">
          <button class="cp-theme-opt active" id="cpErpOff">Off</button>
          <button class="cp-theme-opt" id="cpErpOn">On</button>
        </div>
      </div>
    </div>

    <div class="cp-section">
      <div class="cp-section-title">Highlight Types</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.4rem">
        <span style="font-size:.75rem;color:var(--txt4);">System activity</span>
        <div class="cp-theme-seg" style="margin:0">
          <button class="cp-theme-opt active" id="cpHlSysOff">Off</button>
          <button class="cp-theme-opt" id="cpHlSysOn">On</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;">
        <span style="font-size:.75rem;color:var(--txt4);">Meeting</span>
        <div class="cp-theme-seg" style="margin:0">
          <button class="cp-theme-opt active" id="cpHlMeetOff">Off</button>
          <button class="cp-theme-opt" id="cpHlMeetOn">On</button>
        </div>
      </div>
    </div>

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

Replace with:

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

Note: every element ID (`cpPresentOff/On`, `presentScaleSlider`, `presentScaleLabel`,
`cpErpOff/On`, `cpHlSysOff/On`, `cpHlMeetOff/On`, `cpEmptyOff/On`) is unchanged, so
all existing JS event listeners for these controls keep working without modification.

- [ ] **Step 3: Manually verify in-browser**

Open `index.html` directly in a browser and check:

1. Open the Controls panel (press `C` or click the gear icon) → confirm you see
   exactly one "Display" section header where there used to be four separate
   headers ("Presentation", "Settings", "Highlight Types", "Detail screen").
2. Confirm a thin horizontal divider line appears above "Highlight: System
   activity", visually separating the two highlight rows from the rows above.
3. Toggle "Presentation mode" On → confirm the Text scale slider becomes enabled
   and the label still reads e.g. "1.5×"; drag the slider → confirm the diagram
   zoom/text scale updates as before.
4. Toggle "System lane" On/Off → confirm the system lane still shows/hides in the
   diagram as before.
5. Toggle "Highlight: System activity" and "Highlight: Meeting" On/Off → confirm
   the corresponding highlight behavior in the diagram is unchanged.
6. Toggle "Empty fields" On/Off (open an L4 detail screen first) → confirm empty
   field highlighting in the detail screen still works as before.
7. Check both light and dark themes → confirm the row divider and section styling
   look correct in both.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Merge controls panel sections into one Display section

Combines Presentation, Settings, Highlight Types, and Detail screen into
a single "Display" section of toggle rows, cutting the Controls panel
from 6 section headers down to 3 (View, Display, File). No behavior
changes — all toggle element IDs are unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Move keyboard shortcuts into a header popover

**Files:**
- Modify: `index.html:2625-2634` (markup — add icon button to `.cp-header`)
- Modify: `index.html:2738-2755` (markup — remove inline shortcuts section, add popover markup elsewhere in panel)
- Modify: `index.html:7662` area (JS — add `initShortcutsDropdown()` and call it at startup)

**Interfaces:**
- Consumes: the existing `.info-dropdown` CSS (`index.html:227-232`) and the
  positioning/toggle pattern from `initInfoDropdown()` (`index.html:7662-7698`) —
  read-only reference, not modified.
- Produces: nothing consumed by Task 1.

- [ ] **Step 1: Add the keyboard-icon button to the Controls panel header**

Current (`index.html:2625-2634`):

```html
  <div id="ctrlPanel" class="hidden">
    <div class="cp-header">
      <span class="cp-header-title">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Controls
      </span>
      <button class="cp-close" id="btnControlsClose" title="Close">✕</button>
    </div>
```

Replace with:

```html
  <div id="ctrlPanel" class="hidden">
    <div class="cp-header">
      <span class="cp-header-title">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Controls
      </span>
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

- [ ] **Step 2: Replace the inline shortcuts section with a popover**

Current (`index.html:2738-2755`):

```html
    <div class="cp-section">
      <div class="cp-section-title">Keyboard shortcuts</div>
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
  </div>
```

Replace with:

```html
  </div>

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

Note: the closing `</div>` for `#ctrlPanel` moves up to right after the "File"
section (which is unchanged and immediately precedes this block), and
`#shortcutsDropdown` becomes a sibling of `#ctrlPanel` rather than a child of it
— it needs to be positioned with `position: fixed` independent of the panel, same
as `#infoDropdown` already is.

- [ ] **Step 3: Add `initShortcutsDropdown()` and call it at startup**

Current (`index.html:7662-7698`, the existing `initInfoDropdown()` function):

```js
    function initInfoDropdown() {
      const btn = $('btnInfo');
      const dropdown = $('infoDropdown');
      const m = window.__PF_EMBED__.meta || {};
      // ... (unchanged, do not modify)
    }
```

Add this new function directly after `initInfoDropdown()`:

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

Then find where `initInfoDropdown()` is called (search for `initInfoDropdown()` in
`index.html` — it's called conditionally, only when embedded metadata exists).
Add a call to `initShortcutsDropdown();` on its own line, unconditionally, in the
same startup sequence (e.g. immediately after the conditional block that calls
`initInfoDropdown()`), since shortcuts must be available regardless of file state.

- [ ] **Step 4: Manually verify in-browser**

Open `index.html` directly in a browser and check:

1. Open the Controls panel → confirm there is no "Keyboard shortcuts" section in
   the panel body anymore, and the panel body ends after "File".
2. Confirm a small keyboard icon button appears in the panel header, to the left
   of the ✕ close button.
3. Click the keyboard icon → confirm a popover opens below the header showing all
   13 shortcut rows (arrows, Esc, E, B, /, S, C, N, T, P) with their descriptions.
4. Click anywhere outside the popover → confirm it closes.
5. Click the keyboard icon again → confirm it reopens (toggle behavior works both
   ways).
6. With the popover open, click the icon a second time (without an intervening
   outside click) → confirm it closes (verifies the toggle, not just open-on-click).
7. Resize the browser to a narrow width and reopen the popover → confirm it
   doesn't overflow off the right or bottom edge of the viewport in a way that's
   worse than the existing File Info dropdown's behavior at the same width.
8. Check both light and dark themes → confirm the popover background/border/text
   are legible in both.
9. Press `C` to close the Controls panel, then press `C` again to reopen it →
   confirm the shortcuts popover (if left open) is hidden along with the panel,
   and the icon button still works after reopening.
10. Load a file with embedded metadata (so the File Info button is visible) →
    confirm both the File Info dropdown and the shortcuts popover open/close
    independently without interfering with each other.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Move keyboard shortcuts into a header popover

Replaces the always-visible 13-row shortcuts section in the Controls
panel with a keyboard-icon button in the panel header that toggles a
popover, reusing the existing File Info dropdown's CSS and
show/hide/position pattern. Frees the shortcuts section's full height
in the panel body.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Merge 4 sections into "Display" (spec §1) → Task 1 Steps 1-2. ✅
- Divider before highlight rows (spec §1) → Task 1 Step 2 (`.cp-row-divider` on the System activity row). ✅
- All 5 element IDs preserved (spec §1) → Task 1 Step 2, verified unchanged. ✅
- Header icon button (spec §2) → Task 2 Step 1. ✅
- Popover markup reusing `.info-dropdown` (spec §2) → Task 2 Step 2. ✅
- `initShortcutsDropdown()` JS mirroring `initInfoDropdown()` (spec §2) → Task 2 Step 3. ✅
- Unconditional call at startup, unlike `initInfoDropdown()` (spec §2) → Task 2 Step 3, called out explicitly. ✅
- Testing checklist (spec's Testing section) → Task 1 Step 3 and Task 2 Step 4, expanded into concrete checks covering both merged sections and the popover. ✅
- Out-of-scope items (View/File sections, dead `.cp-toggle-row`/`.cp-switch` CSS, shortcut keybindings themselves) → not touched by any step. ✅

**Placeholder scan:** No TBD/TODO, no "add appropriate X", no "similar to Task N" — both tasks show exact before/after code for every markup/CSS/JS change.

**Type/name consistency:** Element IDs (`cpPresentOff/On`, `presentScaleSlider`, `presentScaleLabel`, `cpErpOff/On`, `cpHlSysOff/On`, `cpHlMeetOff/On`, `cpEmptyOff/On`, `btnShortcutsToggle`, `shortcutsDropdown`, `btnControlsClose`) and CSS classes (`cp-row`, `cp-row-label`, `cp-row-divider`, `info-dropdown`, `cp-shortcuts`, `cp-key`, `cp-key-desc`) are used identically across both tasks and match the approved spec — no drift.
