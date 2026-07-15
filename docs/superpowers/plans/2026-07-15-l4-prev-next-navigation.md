# L4 Process View Prev/Next Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user step between sibling L4 processes (same L3 parent) from within the full-screen L4 detail view, via floating carousel arrows and left/right arrow keys.

**Architecture:** `index.html` is a single static file (no build step, no test framework, no `package.json`). All markup, CSS, and JS live inline. This feature adds two `<button>` elements inside `#detailScreen`, a small CSS block for their carousel styling, two new JS helper functions (`getDetailNavSiblings`, `updateDetailNav`) called from the existing `renderDetailScreen`, and a small guard in the existing global `keydown` listener.

**Tech Stack:** Vanilla JS, inline CSS, no dependencies.

## Global Constraints

- No automated test suite exists in this repo (single static `index.html`, no build tooling). Every task's verification step is manual: open `index.html` directly in a browser (`open index.html` on macOS) and exercise the described interaction, watching the browser devtools console for JS errors. This replaces the red/green automated-test steps used in typical plans.
- Reuse existing theming variables (`--surf`, `--bdr`, `--acc`, `--txt3`, `--txt`) — do not introduce new color values.
- Sibling order and set: siblings are `Object.keys(getNodesAtPath(currentPath))` filtered to entries with `Object.keys(node._children).length === 0` (no-children / detail-view leaves), in existing key order. Do not sort or reorder.
- Edge behavior: stop at the group edge — no wraparound, no crossing into a different L3 parent's children.
- Keyboard: `ArrowLeft`/`ArrowRight` mirror the click behavior of the Prev/Next buttons, only while `#detailScreen` is visible, and must not also trigger the existing background flow-node arrow-key navigation.

---

### Task 1: Add nav button markup and carousel CSS

**Files:**
- Modify: `index.html` (HTML: inside `#detailScreen`, around line 2460–2465; CSS: inside the `#detailScreen` rule block, around line 1913–1914)

**Interfaces:**
- Produces: two DOM elements `#dsNavPrev` and `#dsNavNext` (class `dt-nav-btn`, plus `dt-nav-prev`/`dt-nav-next`), each starting with class `hidden` applied/removed by later tasks. CSS class `.dt-nav-btn.hidden` hides via `display: none`.

- [ ] **Step 1: Add the button markup**

In `index.html`, find this block (around line 2460–2465):

```html
  <div id="detailScreen" class="hidden">
    <div class="detail-toolbar">
      <button class="dt-btn dt-btn-back" id="btnDetailBack">&#8249; Back</button>
      <span class="dt-title" id="detailToolbarTitle"></span>
    </div>
    <div class="ds-wrap">
```

Replace it with:

```html
  <div id="detailScreen" class="hidden">
    <div class="detail-toolbar">
      <button class="dt-btn dt-btn-back" id="btnDetailBack">&#8249; Back</button>
      <span class="dt-title" id="detailToolbarTitle"></span>
    </div>
    <button class="dt-nav-btn dt-nav-prev hidden" id="dsNavPrev" aria-label="Previous process">&#8249;</button>
    <button class="dt-nav-btn dt-nav-next hidden" id="dsNavNext" aria-label="Next process">&#8250;</button>
    <div class="ds-wrap">
```

- [ ] **Step 2: Add the carousel button CSS**

In `index.html`, find this block (around line 1909–1914):

```css
    #detailScreen .dt-title {
      font-size: .75rem; color: var(--txt4); overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; flex: 1;
    }
    #detailScreen .dt-title b { color: var(--txt2); font-weight: 600; }
    #detailScreen .ds-wrap {
```

Replace it with:

```css
    #detailScreen .dt-title {
      font-size: .75rem; color: var(--txt4); overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; flex: 1;
    }
    #detailScreen .dt-title b { color: var(--txt2); font-weight: 600; }
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
    #detailScreen .ds-wrap {
```

- [ ] **Step 3: Verify visually**

Run: `open index.html` (macOS) to load the file in a browser.

In the app, drill into any L1 → L2 → L3 with multiple L4 leaf processes, then click one to open the detail screen. Confirm: no console errors, and (since no JS wires them yet) the two round buttons are not visible because they're rendered with the `hidden` class — this is expected at this step. Confirm via devtools Elements panel that `#dsNavPrev` and `#dsNavNext` exist inside `#detailScreen`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Add L4 detail screen prev/next nav button markup and styling"
```

---

### Task 2: Wire sibling computation and click navigation

**Files:**
- Modify: `index.html` (JS: add two new functions near `getNodesAtPath` around line 3016–3020; call site inside `renderDetailScreen` around line 4187–4189)

**Interfaces:**
- Consumes: `getNodesAtPath(path)` → returns `{ [name]: { _children, _meta, _desc, _code } }` (defined at `index.html:3016`). `currentPath` (existing module-level array). `openDetailScreen(key, meta, desc)` (existing function, `index.html:4170`). `$(id)` DOM lookup helper.
- Produces: `getDetailNavSiblings(currentName)` → `{ names: string[], idx: number }` where `names` is the ordered list of no-children sibling keys under `currentPath`, and `idx` is `currentName`'s position in that list (`-1` if not found). `updateDetailNav(currentName)` → no return value; shows/hides and wires `#dsNavPrev`/`#dsNavNext`.

- [ ] **Step 1: Add the helper functions**

In `index.html`, find this block (around line 3016–3020):

```javascript
    function getNodesAtPath(path) {
      let cur = tree;
      for (const seg of path) { if (!cur[seg]) return {}; cur = cur[seg]._children; }
      return cur;
    }
```

Replace it with:

```javascript
    function getNodesAtPath(path) {
      let cur = tree;
      for (const seg of path) { if (!cur[seg]) return {}; cur = cur[seg]._children; }
      return cur;
    }

    function getDetailNavSiblings(currentName) {
      const siblings = getNodesAtPath(currentPath);
      const names = Object.keys(siblings).filter(function(k) {
        return Object.keys(siblings[k]._children).length === 0;
      });
      return { names: names, idx: names.indexOf(currentName) };
    }

    function updateDetailNav(currentName) {
      const prevBtn = $('dsNavPrev');
      const nextBtn = $('dsNavNext');
      const info = getDetailNavSiblings(currentName);

      if (info.idx <= 0) {
        prevBtn.classList.add('hidden');
        prevBtn.onclick = null;
      } else {
        prevBtn.classList.remove('hidden');
        const prevName = info.names[info.idx - 1];
        prevBtn.onclick = function() {
          const sib = getNodesAtPath(currentPath)[prevName];
          openDetailScreen(prevName, sib._meta, sib._desc);
        };
      }

      if (info.idx === -1 || info.idx >= info.names.length - 1) {
        nextBtn.classList.add('hidden');
        nextBtn.onclick = null;
      } else {
        nextBtn.classList.remove('hidden');
        const nextName = info.names[info.idx + 1];
        nextBtn.onclick = function() {
          const sib = getNodesAtPath(currentPath)[nextName];
          openDetailScreen(nextName, sib._meta, sib._desc);
        };
      }
    }
```

- [ ] **Step 2: Call `updateDetailNav` from `renderDetailScreen`**

In `index.html`, find this block (around line 4187–4189):

```javascript
    function renderDetailScreen(name, meta, desc) {
      const label = altLabel(name);
      $('dsTitle').textContent = label;
```

Replace it with:

```javascript
    function renderDetailScreen(name, meta, desc) {
      const label = altLabel(name);
      $('dsTitle').textContent = label;
      updateDetailNav(name);
```

This runs on every call to `renderDetailScreen`, including the early-return path for nodes without `meta`, so Prev/Next stay correct regardless of whether the current process has RASCI/SIPOC data.

- [ ] **Step 3: Verify in browser**

Run: `open index.html`

In the app, drill into an L3 parent that has at least 2 L4 leaf processes. Open the first one — confirm the left (`‹`) arrow is hidden and the right (`›`) arrow is visible. Click `›` — confirm the screen updates in place to the next process (title, breadcrumbs, code chip all change) and, if it's the last sibling, the right arrow is now hidden. Click `‹` to go back and confirm it returns to the previous process correctly. If any L4 leaf in that group has children (rare — check via the L4 grid before drilling in), confirm it's skipped by Prev/Next.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Wire L4 detail screen prev/next sibling navigation"
```

---

### Task 3: Add arrow-key navigation

**Files:**
- Modify: `index.html` (JS: global `keydown` listener, around line 7435–7436)

**Interfaces:**
- Consumes: `$('detailScreen')` (existing DOM element), `$('dsNavPrev')`/`$('dsNavNext')` (from Task 1/2), their `.hidden` class and `.onclick` handler (from Task 2).

- [ ] **Step 1: Add the keyboard guard**

In `index.html`, find this block (around line 7435–7436):

```javascript
    document.addEventListener('keydown', e => {
      if (e.target === searchInput || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
```

Replace it with:

```javascript
    document.addEventListener('keydown', e => {
      if (e.target === searchInput || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      // ── L4 detail screen prev/next arrow-key navigation ──────────────
      if (!$('detailScreen').classList.contains('hidden')) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const prevBtn = $('dsNavPrev');
          if (!prevBtn.classList.contains('hidden')) prevBtn.click();
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const nextBtn = $('dsNavNext');
          if (!nextBtn.classList.contains('hidden')) nextBtn.click();
          return;
        }
      }
```

This returns early only for `ArrowLeft`/`ArrowRight` while `#detailScreen` is visible, so those two keys no longer fall through to the background flow-node arrow-key navigation lower in the same handler. Other keys (e.g. `Escape`, `Backspace`) are unaffected — that's pre-existing behavior, out of scope for this feature.

- [ ] **Step 2: Verify in browser**

Run: `open index.html`

Open an L4 process detail screen for a process that has both a previous and next sibling. Press the `→` key — confirm it navigates to the next sibling exactly like clicking the `›` button. Press `←` — confirm it navigates back. Navigate to the first sibling in the group and press `←` — confirm nothing happens (button is hidden, no error in console). Click into the search box (if visible) and press arrow keys — confirm no interference (existing input guard already handles this).

Then close the detail screen (Back button) and confirm `←`/`→` still drive the normal L1–L4 flow-grid navigation as before (unaffected by this change).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add arrow-key navigation for L4 detail screen prev/next"
```
