# Remove L4 Detail Toolbar Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the solid `.detail-toolbar` bar from the L4/L5 process detail overlay and relocate its two controls (Back, prev/next) as floating buttons, so the hero card and quad/ribbon below it gain the vertical space the bar used to reserve.

**Architecture:** Pure markup + CSS change in the single-file app `index.html`. The three controls (`#btnDetailBack`, `#dsNavPrev`, `#dsNavNext`) move from being flex children of a `.detail-toolbar` bar to being absolutely-positioned direct children of `#detailScreen`. Back floats top-left over the card corner (new CSS). Prev/next reactivate existing-but-unused edge-floating CSS (`.dt-nav-prev`/`.dt-nav-next`) by gaining those classes. `.ds-wrap`'s top padding is bumped to clear the floating back button. No JS/behavior changes — same element IDs, same event listeners.

**Tech Stack:** Plain HTML/CSS/JS, no build step, no test framework. Verification is manual in-browser (matches this repo's existing pattern — see `docs/superpowers/specs/2026-07-17-highlight-empty-fields-design.md`, which also used manual verification only).

## Global Constraints

- No JS behavior changes: `#btnDetailBack`, `#dsNavPrev`, `#dsNavNext` keep their exact IDs and existing event listeners (`index.html:6276`, `index.html:3082-3083`, `index.html:7806-7816`) untouched.
- Applies to both L4 and L5 detail screens (shared markup/CSS) — do not gate anything on level.
- Keep the floating buttons always visible (no idle-fade/auto-hide behavior).
- Follow the exact CSS values specified in the spec (`docs/superpowers/specs/2026-07-23-l4-detail-toolbar-removal-design.md`) — this plan is a direct implementation of that spec, not a reinterpretation.

---

### Task 1: Flatten the detail-screen toolbar into floating controls

**Files:**
- Modify: `index.html:2513-2520` (markup — flatten toolbar)
- Modify: `index.html:1896-1905` (CSS — remove dead toolbar rules)
- Modify: `index.html:1913` (CSS — float the back button)
- Modify: `index.html:1929` (CSS — bump `.ds-wrap` top padding)

**Interfaces:**
- Consumes: nothing from other tasks (this is the only task).
- Produces: nothing consumed elsewhere — this is a self-contained visual change. Element IDs `#btnDetailBack`, `#dsNavPrev`, `#dsNavNext` are unchanged, so all existing JS wiring (`closeDetailScreen` click handler, prev/next sibling nav, arrow-key roving focus) continues to work without modification.

- [ ] **Step 1: Flatten the toolbar markup**

Current (`index.html:2513-2520`):

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
```

Replace with:

```html
  <div id="detailScreen" class="hidden">
    <button class="dt-btn dt-btn-back" id="btnDetailBack">&#8249; Back</button>
    <button class="dt-nav-btn dt-nav-prev hidden" id="dsNavPrev" aria-label="Previous process">&#8249;</button>
    <button class="dt-nav-btn dt-nav-next hidden" id="dsNavNext" aria-label="Next process">&#8250;</button>
    <div class="ds-wrap">
```

Note: `#dsNavPrev`/`#dsNavNext` now carry `dt-nav-prev`/`dt-nav-next` in addition to
the existing `dt-nav-btn hidden` classes — this activates the edge-floating CSS in
Step 3 without any new CSS for these two buttons.

- [ ] **Step 2: Remove the now-dead toolbar CSS**

Current (`index.html:1896-1905`):

```css
    #detailScreen .detail-toolbar {
      flex: 0 0 auto; z-index: 10; display: flex; align-items: center;
      gap: .7rem; height: 52px; padding: 0 1rem;
      background: var(--nav); border-bottom: 1px solid var(--bdr-s);
      transition: background .2s, border-color .2s;
    }
    #detailScreen .dt-nav-inline { display: flex; gap: .4rem; margin-left: auto; flex: 0 0 auto; }
    #detailScreen .dt-nav-inline .dt-nav-btn {
      position: static; transform: none; width: 30px; height: 30px; font-size: 1.05rem;
    }
```

Delete these three rules entirely (nothing references `.detail-toolbar` or
`.dt-nav-inline` after Step 1).

- [ ] **Step 3: Float the back button top-left**

Current (`index.html:1913`, inside the existing `.dt-btn` block):

```css
    #detailScreen .dt-btn-back { font-weight: 600; }
```

Replace with:

```css
    #detailScreen .dt-btn-back {
      position: absolute; top: 14px; left: 16px; z-index: 20;
      font-weight: 600; box-shadow: 0 2px 6px rgba(0,0,0,.18);
    }
```

Leave the `.dt-nav-btn`, `.dt-nav-btn:hover`, `.dt-nav-prev`, `.dt-nav-next`, and
`.dt-nav-btn.hidden` rules immediately below it (`index.html:1914-1925`)
untouched — they already define the 44px circular, edge-floating style these
buttons need now that they carry the `dt-nav-prev`/`dt-nav-next` classes.

- [ ] **Step 4: Give `.ds-wrap` room to clear the floating back button**

Current (`index.html:1929`, inside the `.ds-wrap` block):

```css
      gap: .6rem; padding: .65rem 1.25rem .8rem;
```

Replace with:

```css
      gap: .6rem; padding: 3rem 1.25rem .8rem;
```

- [ ] **Step 5: Manually verify in-browser**

Open `index.html` directly in a browser (or via the project's usual local server if
one exists) and check:

1. Navigate to any L4 process → open its detail screen. Confirm the solid toolbar
   bar is gone: no bordered bar above the hero card.
2. Confirm "‹ Back" now floats as a pill in the top-left corner, over/near the hero
   card's top-left, with a visible drop shadow.
3. Confirm the hero card, quad, and ribbon visibly occupy more vertical space than
   before (no longer clipped/cramped under a 52px+ bar).
4. Click "‹ Back" → detail screen closes as before.
5. Navigate to an L4 node that has siblings → confirm small circular arrows appear
   vertically centered on the left and/or right edges of the screen (not inside the
   card), and clicking them navigates to the sibling process.
6. Navigate to an L4 node with no sibling in one direction → confirm that side's
   arrow is hidden (same `hidden` class toggling as before).
7. Use arrow keys to roving-focus onto the nav buttons (existing behavior at
   `index.html:7802-7816`) → confirm focus still lands on/cycles through them.
8. Open an L5 detail screen → confirm the same floating layout (shared markup).
9. Toggle light/dark theme → confirm the floating back button stays legible over
   the card corner in both themes.
10. Resize the browser to a narrow width → confirm the layout is at least as good
    as before (edge nav buttons may sit close to card content on very narrow
    windows — this is a pre-existing characteristic of this CSS per the spec's
    "Out of scope" section, not a regression to fix here).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Remove L4/L5 detail toolbar bar, float Back and prev/next controls

Frees the vertical space the toolbar bar reserved for the hero card and
quad/ribbon below it. Back floats top-left over the card corner;
prev/next reactivate previously-unused edge-floating CSS. No JS changes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Markup flattening (spec §1) → Task 1 Step 1. ✅
- Back button floating style (spec §2) → Task 1 Step 3. ✅
- Prev/next reactivating dead CSS (spec §3) → Task 1 Steps 1 (classes) + 3 (leaves existing rules untouched). ✅
- Dead CSS removal (spec §4) → Task 1 Step 2. ✅
- `.ds-wrap` padding bump (spec §5) → Task 1 Step 4. ✅
- Testing checklist (spec's Testing section) → Task 1 Step 5, expanded 1:1 into concrete checks. ✅
- Out-of-scope items (hero/quad/ribbon content, auto-hide, narrow-viewport fix) → explicitly not touched by any step, and Step 5.10 calls out the narrow-viewport item as a known non-issue rather than silently ignoring it. ✅

**Placeholder scan:** No TBD/TODO, no "add appropriate X", no "similar to Task N" — this is a single task and every step shows exact before/after code.

**Type/name consistency:** Element IDs (`#btnDetailBack`, `#dsNavPrev`, `#dsNavNext`), classes (`dt-btn`, `dt-btn-back`, `dt-nav-btn`, `dt-nav-prev`, `dt-nav-next`, `ds-wrap`), and line numbers all cross-checked directly against the current `index.html` content — no drift between steps.
