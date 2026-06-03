# Technical Build Prompt: System Overview Page

**Context**

Single-file vanilla JS/HTML/CSS app (`index.html`). No framework, no build step. All styles are in a `<style>` block in `<head>`, all logic is in a `<script>` block at the bottom of `<body>`. The app already has a `tree` data structure and a CSS custom-property theme system. You are adding one new full-screen overlay: the System Overview.

---

## 1. Data Model

The app maintains a global `tree` object populated from CSV rows. Its shape is a nested object:

```
tree = {
  "[L1 key]": {
    _children: {
      "[L2 key]": {
        _children: {
          "[L3 key]": {
            _children: {
              "[leaf node name]": {
                _meta: {
                  Tool: "Salesforce",        // tool/system name (may be "N/A" or empty)
                  Type: "System",            // node type
                  R, A, S, C, I,            // RASCI fields
                  Input, Output, Time_UoM, Start, End,
                  ...
                },
                _children: {},
                _desc: "...",
                _code: "..."
              }
            }
          }
        }
      }
    }
  }
}
```

Leaf nodes (`_meta !== null`) are the process steps that appear as swimlane nodes. Their sequence is determined by DFS traversal order of the tree. The `Tool` field in `_meta` determines which swimlane row a node belongs to.

---

## 2. HTML Structure

The screen is a `position: fixed` overlay that sits above the main app at `z-index: 95`. It occupies `top: 56px; left: 0; right: 0; bottom: 0` (56px reserved for the app's top nav bar).

**Static HTML skeleton** (present in the file, never removed):

```html
<div id="sysoverviewScreen" class="hidden">
  <div class="sysov-toolbar">
    <span class="sysov-toolbar-title">
      <!-- SVG icon --> System Overview
    </span>
    <div class="sysov-l1-tabs" id="sysovL1Tabs"></div>
    <button id="btnSysOvClose" class="sysov-close-btn">
      <!-- X SVG icon --> Close
    </button>
  </div>
  <div class="sysov-body">
    <div id="sysovScroll">
      <div id="sysovContent">
        <svg id="sysovSvg"></svg>
      </div>
    </div>
  </div>
</div>
```

**Dynamic DOM built by JS** during each `renderSysOverview()` call (inserted into `#sysovScroll` and `#sysovContent`):

```
#sysovScroll                          (flex column, overflow: auto — the scroll root)
  .sysov-top-hdr                      (sticky top:0 — injected as first child of sysovScroll)
    .sysov-top-hdr-corner             (sticky left:0 — blank corner over the label column)
    .sysov-top-hdr-labels             (position:relative — receives absolutely-placed label divs)
  #sysovContent                       (flex column, flex:1)
    .sysov-swim-body                  (flex row, flex:1)
      .sysov-labels-col               (sticky left:0 — tool name chips)
        .sysov-row-label × M          (one per unique tool, height = rowH − 16px)
      .sysov-node-area                (position:relative — the canvas for nodes)
        .sysov-node × N               (position:absolute — each process step)
    #sysovSvg                         (position:absolute, top:0, left:0 — connectors & dividers)
```

**Key constraint:** `.sysov-top-hdr` must be a direct child of `#sysovScroll` (not inside `#sysovContent`) for `position: sticky; top: 0` to work. It is inserted with `scroll.insertBefore(topHdr, content)` each render and removed at the start of the next render.

---

## 3. CSS

```css
/* ── Overlay screen ──────────────────────────────────────────── */
#sysoverviewScreen {
  position: fixed; top: 56px; left: 0; right: 0; bottom: 0;
  background: var(--bg); z-index: 95;
  display: flex; flex-direction: column;
  transition: background .2s;
}
#sysoverviewScreen.hidden { display: none; }

/* ── Toolbar ──────────────────────────────────────────────────── */
.sysov-toolbar {
  background: var(--nav); border-bottom: 1px solid var(--bdr-s);
  padding: .55rem 1rem; display: flex; align-items: center; gap: .75rem;
  flex-shrink: 0; flex-wrap: wrap;
  transition: background .2s, border-color .2s;
}
.sysov-toolbar-title {
  font-size: .78rem; font-weight: 600; color: var(--txt2);
  display: flex; align-items: center; gap: .4rem; white-space: nowrap;
}
.sysov-l1-tabs {
  display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; flex: 1;
}
.sysov-l1-tab {
  background: var(--surf); border: 1px solid var(--bdr); border-radius: 6px;
  color: var(--txt3); font-size: .72rem; padding: .25rem .65rem; cursor: pointer;
  transition: background .15s, border-color .15s, color .15s; white-space: nowrap;
}
.sysov-l1-tab:hover { background: var(--bdr); color: var(--txt); }
.sysov-l1-tab.active {
  background: var(--acc-15); border-color: var(--acc); color: var(--acc-t); font-weight: 600;
}
.sysov-close-btn {
  background: var(--surf); border: 1px solid var(--bdr); border-radius: 6px;
  color: var(--txt3); font-size: .78rem; padding: .3rem .75rem; cursor: pointer;
  transition: background .15s, border-color .15s, color .15s;
  display: flex; align-items: center; gap: .35rem; white-space: nowrap; flex-shrink: 0;
}
.sysov-close-btn:hover { background: var(--bdr); border-color: var(--acc); color: var(--txt); }

/* ── Body / scroll container ─────────────────────────────────── */
.sysov-body {
  display: flex; flex-direction: row; flex: 1; overflow: hidden;
}
#sysovScroll {
  flex: 1; overflow: auto; position: relative; background: var(--bg);
  display: flex; flex-direction: column;
  cursor: grab; user-select: none;
}
#sysovScroll.sysov-dragging { cursor: grabbing; }
#sysovContent {
  position: relative; min-width: max-content;
  flex: 1; display: flex; flex-direction: column;
}

/* ── Sticky top header (L2 / L3 labels) ─────────────────────── */
.sysov-top-hdr {
  position: sticky; top: 0; z-index: 6;
  background: var(--bg); display: flex; flex-direction: row;
  min-height: 56px; box-sizing: border-box;
  border-bottom: 2px solid var(--bdr-s);
  transition: background .2s, border-color .2s;
}
.sysov-top-hdr-corner {
  flex-shrink: 0; background: var(--bg);
  position: sticky; left: 0; z-index: 7;
  border-right: 1px solid var(--bdr-s);
  transition: background .2s, border-color .2s;
}
.sysov-top-hdr-labels {
  position: relative; flex: 1; overflow: hidden; min-height: 56px;
}
.sysov-hdr-l2 {
  position: absolute; top: 5px;
  font-size: .68rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: .07em; color: var(--txt2);
  padding-left: 7px; line-height: 1.25;
  white-space: normal; word-break: break-word; max-width: 220px;
}
.sysov-hdr-l3 {
  position: absolute; top: 30px;
  font-size: .63rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: .06em; color: var(--txt2); opacity: 0.65;
  padding-left: 7px; line-height: 1.25;
  white-space: normal; word-break: break-word; max-width: 220px;
}

/* ── SVG overlay ─────────────────────────────────────────────── */
#sysovSvg {
  position: absolute; top: 0; left: 0;
  pointer-events: none; overflow: visible;
}

/* ── Swimlane body ───────────────────────────────────────────── */
.sysov-swim-body {
  display: flex; flex-direction: row; flex: 1;
}
.sysov-labels-col {
  position: sticky; left: 0; z-index: 5; flex-shrink: 0;
  background: var(--bg); border-right: 1px solid var(--bdr-s);
  transition: background .2s, border-color .2s;
  display: flex; flex-direction: column;
}
.sysov-row-label {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end;
  padding: 0 .75rem 0 .5rem;
  font-size: .68rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; text-align: right;
  border: 1px solid; border-radius: 5px;
  margin: 8px 0.5rem;
  white-space: normal; word-break: break-word; line-height: 1.25;
}
.sysov-node-area { position: relative; flex-shrink: 0; }
.sysov-node {
  position: absolute; width: 180px; height: 60px; border-radius: 8px;
  border: 1.5px solid; padding: .4rem .7rem;
  font-size: .76rem; font-weight: 600; text-align: center;
  display: flex; align-items: center; justify-content: center;
  line-height: 1.3; word-break: break-word; box-sizing: border-box;
  overflow: hidden;
}
```

---

## 4. Color Palette

Six color slots, cycled with `i % 6` based on the tool's first-seen index:

```javascript
const SYSOV_COLORS = [
  { acc: '#4a90d9', bg: 'rgba(74,144,217,.10)',  border: 'rgba(74,144,217,.55)' },
  { acc: '#2e9e7a', bg: 'rgba(46,158,122,.10)',  border: 'rgba(46,158,122,.55)' },
  { acc: '#e07b3a', bg: 'rgba(224,123,58,.10)',  border: 'rgba(224,123,58,.55)' },
  { acc: '#7b5ea7', bg: 'rgba(123,94,167,.10)',  border: 'rgba(123,94,167,.55)' },
  { acc: '#c0485a', bg: 'rgba(192,72,90,.10)',   border: 'rgba(192,72,90,.55)'  },
  { acc: '#b08b2a', bg: 'rgba(176,139,42,.10)',  border: 'rgba(176,139,42,.55)' },
];
```

Each color object's `bg` and `border` are applied to both the node chip and the row label chip for that tool. Node text uses `var(--txt)`.

---

## 5. JavaScript Functions

### `openSysOverviewScreen()`

Hides all other screens/panels, then:

```javascript
$('sysoverviewScreen').classList.remove('hidden');
const l1Keys = Object.keys(tree);
buildSysOvL1Tabs(l1Keys);
sysovActiveL1 = l1Keys[0] || null;
renderSysOverview(sysovActiveL1);
```

### `closeSysOverviewScreen()`

```javascript
$('sysoverviewScreen').classList.add('hidden');
```

### `buildSysOvL1Tabs(l1Keys)`

Clears `#sysovL1Tabs`, then for each key creates a `<button class="sysov-l1-tab">`. Active tab gets class `active`. On click: update `sysovActiveL1`, re-toggle `.active` on all tabs, call `renderSysOverview(k)`.

---

### `renderSysOverview(l1Key)` — Main layout function

**Step 1 — Cleanup**

Remove any existing `.sysov-top-hdr` from `#sysovScroll`. Remove all children of `#sysovContent` except `#sysovSvg`. Clear `svg.innerHTML`.

**Step 2 — DFS collection**

Walk the tree from `tree[l1Key]._children`, depth-first, tracking L2 and L3 ancestor keys. Every leaf node (`node._meta !== null`) is pushed into `orderedNodes[]` as `{ name, meta, l2Key, l3Key }`. The order of this array is the left-to-right sequence order of nodes in the diagram.

```javascript
function dfsCollect(children, depth, l2, l3) {
  for (const [key, node] of Object.entries(children)) {
    if (node._meta) {
      orderedNodes.push({ name: key, meta: node._meta, l2Key: l2, l3Key: l3 });
    } else {
      dfsCollect(node._children, depth + 1,
        depth === 0 ? key : l2,
        depth === 1 ? key : l3);
    }
  }
}
dfsCollect(tree[l1Key]._children, 0, null, null);
```

**Step 3 — Row assignment**

For each node, `n.rowKey = (n.meta.Tool || '').trim()`. If empty or `"N/A"` (case-insensitive), use `"Manual / Other"`. Build `rowKeys[]` (unique keys in first-seen order) and `rowIndex{}` (key → row index). Assign colors: `rowColor[k] = SYSOV_COLORS[i % SYSOV_COLORS.length]`.

**Step 4 — Layout constants**

```javascript
const nodeW = 180, nodeH = 60, nodeGap = 80;  // node size + horizontal gap
const rowH = 120;                               // px per tool row (vertical)
const labelW = 180;                             // left column width
const padV = 16, padH = 24;                    // content padding inside nodeArea
const N = orderedNodes.length;                  // total node count
const M = rowKeys.length;                       // total row count
const areaW = N * (nodeW + nodeGap) - nodeGap + 2 * padH;
const areaH = M * rowH + 2 * padV;
```

**Step 5 — Vertical centering**

Center the node rows in the viewport space below the 56px sticky header:

```javascript
const hdrH = 56;
const availH = $('sysovScroll').clientHeight - hdrH;
const nodeAreaTopOffset = Math.max(0, Math.round((availH - areaH) / 2));
```

`nodeAreaTopOffset` is used as `nodeArea.style.marginTop` and added to `labelsCol.style.paddingTop` so both scroll together and labels align with their rows.

**Step 6 — Build sticky header**

```javascript
const topHdr = document.createElement('div');
topHdr.className = 'sysov-top-hdr';
topHdr.style.minWidth = (labelW + areaW) + 'px';

const hdrCorner = document.createElement('div');
hdrCorner.className = 'sysov-top-hdr-corner';
hdrCorner.style.width = labelW + 'px';
hdrCorner.style.minHeight = '56px';

const hdrLabels = document.createElement('div');
hdrLabels.className = 'sysov-top-hdr-labels';

topHdr.appendChild(hdrCorner);
topHdr.appendChild(hdrLabels);
scroll.insertBefore(topHdr, content);   // must be child of scroll, not content
```

`hdrLabels` is left empty here. It is populated by `drawSysOverviewConnectors()` after layout is painted.

**Step 7 — Build swimlane body**

```javascript
const swimBody = document.createElement('div');
swimBody.className = 'sysov-swim-body';
content.appendChild(swimBody);

// Left label column
const labelsCol = document.createElement('div');
labelsCol.className = 'sysov-labels-col';
labelsCol.style.width = labelW + 'px';
labelsCol.style.paddingTop = (nodeAreaTopOffset + padV) + 'px';

rowKeys.forEach(function (k) {
  const color = rowColor[k];
  const lbl = document.createElement('div');
  lbl.className = 'sysov-row-label';
  lbl.textContent = k;
  lbl.style.height = (rowH - 16) + 'px';  // 8px margin top + 8px bottom = rowH total
  lbl.style.color = color.acc;
  lbl.style.borderColor = color.border;
  lbl.style.background = color.bg;
  labelsCol.appendChild(lbl);
});
swimBody.appendChild(labelsCol);

// Node area
const nodeArea = document.createElement('div');
nodeArea.className = 'sysov-node-area';
nodeArea.style.width  = areaW + 'px';
nodeArea.style.height = areaH + 'px';
nodeArea.style.marginTop = nodeAreaTopOffset + 'px';
swimBody.appendChild(nodeArea);
```

**Step 8 — Place nodes**

For each node in `orderedNodes` (index = `seqIdx`):

```javascript
const ri = rowIndex[n.rowKey];
const x = padH + seqIdx * (nodeW + nodeGap);
const y = padV + ri * rowH + (rowH - nodeH) / 2;  // vertically centered in row

const nodeEl = document.createElement('div');
nodeEl.className = 'sysov-node';
nodeEl.dataset.seqIdx = seqIdx;
nodeEl.dataset.l2Key  = n.l2Key || '';
nodeEl.dataset.l3Key  = n.l3Key || '';
nodeEl.style.left        = x + 'px';
nodeEl.style.top         = y + 'px';
nodeEl.style.width       = nodeW + 'px';
nodeEl.style.height      = nodeH + 'px';
nodeEl.style.background  = color.bg;
nodeEl.style.borderColor = color.border;
nodeEl.style.color       = 'var(--txt)';
nodeEl.textContent       = n.name;
nodeArea.appendChild(nodeEl);
```

**Step 9 — Schedule connector draw**

Use a double-rAF to ensure the browser has laid out all elements before reading `getBoundingClientRect()`:

```javascript
requestAnimationFrame(function () { requestAnimationFrame(function () {
  drawSysOverviewConnectors();
}); });
```

---

### `drawSysOverviewConnectors()` — SVG overlay function

**Step 1 — Size the SVG**

```javascript
const content = $('sysovContent');
const nodeArea = content.querySelector('.sysov-node-area');
const contentRect = content.getBoundingClientRect();
const areaRect    = nodeArea.getBoundingClientRect();

const svgW = content.scrollWidth;
const svgH = content.scrollHeight;
svg.setAttribute('width',  svgW);
svg.setAttribute('height', svgH);
svg.style.width  = svgW + 'px';
svg.style.height = svgH + 'px';
```

**Step 2 — Compute nodeArea offset within content space**

```javascript
const areaOffX = areaRect.left - contentRect.left;
const areaOffY = areaRect.top  - contentRect.top;
```

This difference cancels scroll, yielding pure layout-space coordinates. All SVG coordinates use `areaOffX + nodeEl.style.left` (not viewport coordinates).

**Step 3 — Draw cubic bezier connectors**

Sort `nodeEls` by `dataset.seqIdx`. For each consecutive pair:

- Skip if `l2Key` differs (no connector across L2 boundaries)
- Skip if `l3Key` differs (no connector across L3 boundaries — solid connectors only within the same L3)

For same-L2 + same-L3 pairs:

```javascript
const ax = areaOffX + parseFloat(a.style.left) + parseFloat(a.style.width || a.offsetWidth);
const ay = areaOffY + parseFloat(a.style.top)  + a.offsetHeight / 2;
const bx = areaOffX + parseFloat(b.style.left);
const by = areaOffY + parseFloat(b.style.top)  + b.offsetHeight / 2;

const cp = Math.min(Math.abs(bx - ax) * 0.45, 60);
const d = `M ${ax} ${ay} C ${ax+cp} ${ay}, ${bx-cp} ${by}, ${bx} ${by}`;

// <path fill="none" stroke="var(--acc)" stroke-width="1.8" opacity="0.6" stroke-linecap="round">
```

**Step 4 — Compute section boundaries**

Walk `nodeEls` in order; push a section entry whenever L2 or L3 key changes. L2 changes take priority.

```javascript
const sections = [];  // { type: 'l2'|'l3', key, firstEl, isFirst }
nodeEls.forEach(function (el, i) {
  if (i === 0) {
    sections.push({ type: 'l2', key: el.dataset.l2Key, firstEl: el, isFirst: true });
    return;
  }
  const prev = nodeEls[i - 1];
  if (el.dataset.l2Key !== prev.dataset.l2Key) {
    sections.push({ type: 'l2', key: el.dataset.l2Key, firstEl: el, isFirst: false });
  } else if (el.dataset.l3Key !== prev.dataset.l3Key) {
    sections.push({ type: 'l3', key: el.dataset.l3Key, firstEl: el, isFirst: false });
  }
});
```

**Step 5 — Draw vertical dividers and populate sticky header labels**

```javascript
const lineY1 = 0;                                   // top of SVG (content top)
const lineY2 = areaOffY + nodeArea.offsetHeight;    // bottom of node area

sections.forEach(function (s) {
  const nodeX = parseFloat(s.firstEl.style.left);
  const isL2  = s.type === 'l2';
  const dividerX = areaOffX + nodeX - nodeGap / 2;

  if (!s.isFirst) {
    // L2 boundary: stroke="var(--txt2)" stroke-width="3" opacity="0.55"
    // L3 boundary: stroke="var(--txt3)" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.5"
    svgLine(dividerX, isL2);
  }

  // labelLeft is relative to hdrLabels (which starts at the nodeArea left edge)
  const labelLeft = s.isFirst ? nodeX : nodeX - nodeGap / 2 + 8;

  const div = document.createElement('div');
  div.className = isL2 ? 'sysov-hdr-l2' : 'sysov-hdr-l3';
  div.textContent = s.key;
  div.style.left = labelLeft + 'px';
  hdrLabels.appendChild(div);

  // For L2 sections, also render the first L3 name on the second line
  if (isL2 && s.firstEl.dataset.l3Key) {
    const l3div = document.createElement('div');
    l3div.className = 'sysov-hdr-l3';
    l3div.textContent = s.firstEl.dataset.l3Key;
    l3div.style.left = labelLeft + 'px';
    hdrLabels.appendChild(l3div);
  }
});
```

---

## 6. Interaction: Click-Drag Pan

Attached once in an IIFE after the close-button listener:

```javascript
(function () {
  const el = $('sysovScroll');
  let dragging = false, startX = 0, startY = 0, scrollX = 0, scrollY = 0;

  el.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    scrollX = el.scrollLeft; scrollY = el.scrollTop;
    el.classList.add('sysov-dragging');
    e.preventDefault();
  });

  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    el.scrollLeft = scrollX - (e.clientX - startX);
    el.scrollTop  = scrollY - (e.clientY - startY);
  });

  window.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('sysov-dragging');
  });
}());
```

`mousemove` and `mouseup` are on `window` so releasing the mouse outside the element still ends the drag.

---

## 7. Resize Handler

```javascript
let _sysovResizeRaf = null;
window.addEventListener('resize', function () {
  if (!$('sysoverviewScreen').classList.contains('hidden')) {
    if (_sysovResizeRaf) cancelAnimationFrame(_sysovResizeRaf);
    _sysovResizeRaf = requestAnimationFrame(function () {
      renderSysOverview(sysovActiveL1);
    });
  }
});
```

Full re-render on resize to recalculate `nodeAreaTopOffset` based on the new viewport height.

---

## 8. Critical Constraints & Gotchas

| Constraint | Why |
|---|---|
| `.sysov-top-hdr` must be a direct child of `#sysovScroll`, not `#sysovContent` | `position: sticky; top: 0` only works relative to the nearest scrolling ancestor. `#sysovContent` is a flex child, not a scroller. |
| `labelsCol.paddingTop` = `nodeAreaTopOffset + padV` | `swimBody` fills the full `#sysovContent` height (via `flex: 1`). Without the offset, label chips render at the top of that tall column instead of aligned with the nodes. |
| Double `requestAnimationFrame` before `drawSysOverviewConnectors` | `getBoundingClientRect()` must be called after the browser has painted layout. A single rAF sometimes fires before layout is complete. |
| `hdrLabels` label `left` values use nodeArea-local coordinates | `.sysov-top-hdr-labels` starts immediately after the corner (which is `labelW` wide), and `.sysov-node-area` also starts `labelW` from the left of `swimBody`. Both origins are aligned, so raw `parseFloat(nodeEl.style.left)` maps correctly into header space. |
| `areaOffX/Y` computed as rect differences, not absolute positions | Cancels out scroll offset. Always gives correct layout-space position even when the container is scrolled. |
