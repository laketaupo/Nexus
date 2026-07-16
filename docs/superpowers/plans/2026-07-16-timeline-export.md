# Timeline View JPG Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user export the Timeline view (`#yearScreen`) as a JPG image that mirrors the current on-screen state: applied L1 process filter, Year/Quarter/Month view, level filter (All/L1–L5), manual row expand/collapse state, and the "o9 refresh cadence" overlay if it's toggled on.

**Architecture:** `index.html` is a single static file (no build step, no test framework, no `package.json`). All markup, CSS, and JS live inline. This feature follows the existing `exportGanttAsJpeg()` pattern exactly: a new function hand-builds an SVG string in absolute pixel coordinates from the current Timeline state, then rasterizes it via the existing `downloadJPEG(svgString, w, h, filename)` helper (canvas draw at 300 PPI → JPEG download). The Timeline's on-screen renderer (`buildYearRows`, CSS-percentage based) is not touched or refactored — the export duplicates its row-selection and bar-position math independently in pixel terms, the same way `exportGanttAsJpeg()` already duplicates layout math independently from its own on-screen renderer (`ganttRender`).

**Tech Stack:** Vanilla JS, inline CSS, no dependencies.

## Global Constraints

- No automated test suite exists in this repo (single static `index.html`, no build tooling). Every task's verification step is manual: open `index.html` directly in a browser (`open index.html` on macOS) and exercise the described interaction, watching the browser devtools console for JS errors. This replaces the red/green automated-test steps used in typical plans.
- Export must mirror the current on-screen state exactly: `yearL0Filter` (L1 process filter), `yearView`/`yearViewIndex` (Year/Quarter/Month + sub-selection), `yearMinLevel` (level filter), and `yearExpandedPaths` (manual expand/collapse). Do not force full expansion.
- Include the RC "o9 refresh cadence" overlay in the export only when `rcOverlayVisible && rcData.length` at export time (i.e. it's currently toggled on).
- Never draw a legend or an in-image title/header summarizing filters — the filename is the only place filter state is encoded.
- Bars are plain colored rectangles with no text drawn on them (on-screen bars have no visible text either — `.year-bar-label` is `display:none`; text only exists in hidden `title` tooltips, which a static image can't reproduce, and the process name is already shown in the row label column).
- Output format is JPG only, via the existing `downloadJPEG()` helper — no new format picker.
- Filename pattern: `Timeline - <L1 filter or All> - <View> - <Level>.jpg`, using the same sanitize-then-join approach as `exportGanttAsJpeg()`.
- Reuse existing data/color helpers without modification: `yearNodeEnvelope`, `yearFreqColors`, `yearUoMColors`, `countQuarterlyChildren`, `rcExpandEvents`, `YEAR_MONTHS`, `YEAR_INDENT_W`, `escHtml`, `downloadJPEG`, `showExportToast`.
- Do not modify `buildYearRows`, `yearRender`, or any other existing on-screen rendering function.

---

### Task 1: Add the Export JPG button to the Timeline toolbar

**Files:**
- Modify: `index.html` (HTML only, inside `.year-toolbar`, around line 2362–2364)

**Interfaces:**
- Produces: a new DOM element `#btnYearExport` (class `gantt-export-btn`, an existing generic CSS class already used by the Gantt chart's export button — no new CSS needed).

- [ ] **Step 1: Add the button markup**

In `index.html`, find this block (around line 2362–2365):

```html
      </div>
      <div class="year-toolbar-spacer"></div>
      <div style="position:relative;flex-shrink:0">
        <button id="btnYearLegend" class="year-legend-btn" title="Legend" aria-label="Legend">i</button>
```

Replace it with:

```html
      </div>
      <div class="year-toolbar-spacer"></div>
      <button id="btnYearExport" class="gantt-export-btn">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>Export JPG
      </button>
      <div style="position:relative;flex-shrink:0">
        <button id="btnYearLegend" class="year-legend-btn" title="Legend" aria-label="Legend">i</button>
```

- [ ] **Step 2: Verify visually**

Run: `open index.html` (macOS) to load the file in a browser.

In the app, open the Timeline view (Views menu → Timeline, or press the corresponding nav button). Confirm: no console errors, and an "Export JPG" button (same outline style and download icon as the Gantt chart's export button) appears in the toolbar between the level filter buttons and the legend ("i") button. Clicking it does nothing yet — that's expected, no handler is wired until Task 2.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add Timeline view export button markup"
```

---

### Task 2: Implement the core Timeline export (rows, axis, bars, filename)

**Files:**
- Modify: `index.html` (JS: two new functions inserted after `yearRender()`, around line 4888–4890; a new module-level constant near line 4513; one new event listener near line 6066)

**Interfaces:**
- Consumes: `tree` (global process tree), `yearL0Filter`, `yearExpandedPaths`, `yearMinLevel`, `yearView`, `yearViewIndex`, `levelOffset` (existing globals). `yearNodeEnvelope(nodeObj)` → `{start, end, uom, freq} | null` (existing, `index.html:4570`). `yearFreqColors(freq)` / `yearUoMColors(uom)` → `{fill, stroke, text}` (existing, `index.html:4544`/`4556`). `countQuarterlyChildren(nodeObj)` → number (existing, `index.html:4596`). `YEAR_MONTHS` (existing array), `YEAR_INDENT_W` (existing, `= 16`). `escHtml(str)` (existing utility). `downloadJPEG(svgString, w, h, filename)` (existing, `index.html:8314`). `showExportToast(msg)` (existing, `index.html:8346`).
- Produces: `collectYearExportRows(nodes, depth, parentPath, out)` — pushes `{ key, nodeObj, indentDepth, levelNum, env, dimmed }` entries into `out` for every row currently visible on screen (same filtering as `buildYearRows`). `yearExportBarSegments(nodeObj, env, levelNum)` → array of `{ leftPct, widthPct, inset }` (percent-based bar geometry, empty array = no bar). `exportTimelineAsJpeg()` — no return value; builds the SVG and triggers the JPEG download. Task 3 will insert RC overlay code into `exportTimelineAsJpeg()` immediately before its `const svgStr = ...` line.

- [ ] **Step 1: Add the row-collection and bar-geometry helper functions**

In `index.html`, find this block (around line 4884–4890):

```javascript
      const rows = buildYearRows(tree, 0, '');
      el.innerHTML = '<div class="year-grid">' + header + rows + '</div>';
      rcRenderOverlayLayer();
      rcUpdateToggleBtn();
    }

    function yearHandleClick(e) {
```

Replace it with:

```javascript
      const rows = buildYearRows(tree, 0, '');
      el.innerHTML = '<div class="year-grid">' + header + rows + '</div>';
      rcRenderOverlayLayer();
      rcUpdateToggleBtn();
    }

    /** Collect every row currently visible on screen (same filtering as buildYearRows), for export. */
    function collectYearExportRows(nodes, depth, parentPath, out) {
      const lo = typeof levelOffset === 'number' ? levelOffset : 0;
      const minVisDepth = yearMinLevel !== null ? Math.max(0, yearMinLevel - lo) : 0;
      for (const [key, nodeObj] of Object.entries(nodes)) {
        if (depth === 0 && yearL0Filter !== null && key !== yearL0Filter) continue;
        const pathKey = parentPath ? parentPath + '\x1E' + key : key;
        const hasKids = Object.keys(nodeObj._children || {}).length > 0;
        if (!hasKids && nodeObj._meta &&
            (nodeObj._meta.Frequency || '').toLowerCase().includes('continuously')) continue;
        const isExpanded = yearExpandedPaths.has(pathKey);
        const env      = yearNodeEnvelope(nodeObj);
        const levelNum = depth + lo;

        if (yearMinLevel !== null && levelNum < yearMinLevel) {
          if (hasKids) collectYearExportRows(nodeObj._children, depth + 1, pathKey, out);
          continue;
        }

        out.push({
          key: key,
          nodeObj: nodeObj,
          indentDepth: Math.max(0, depth - minVisDepth),
          levelNum: levelNum,
          env: env,
          dimmed: hasKids && isExpanded
        });

        if (hasKids && isExpanded) {
          collectYearExportRows(nodeObj._children, depth + 1, pathKey, out);
        }
      }
    }

    /** Percent-based bar geometry for one row, mirroring buildYearRows' view/frequency branches. */
    function yearExportBarSegments(nodeObj, env, levelNum) {
      if (!env) return [];
      const freq = env.freq;
      const segs = [];

      if (yearView === 'year') {
        if (freq === 'quarterly') {
          const WEEKS_PER_QTR = 13;
          const rawS = Math.max(1, Math.min(WEEKS_PER_QTR, Math.round(env.start)));
          const rawE = Math.max(rawS, Math.min(WEEKS_PER_QTR, Math.round(env.end)));
          if (levelNum === 0 && countQuarterlyChildren(nodeObj) === 4) {
            segs.push({ leftPct: 0, widthPct: 100, inset: false });
          } else {
            for (let q = 0; q < 4; q++) {
              const barStart = q * WEEKS_PER_QTR + rawS;
              const barEnd   = q * WEEKS_PER_QTR + rawE;
              segs.push({ leftPct: (barStart - 1) / 52 * 100, widthPct: (barEnd - barStart + 1) / 52 * 100, inset: true });
            }
          }
        } else if (freq === 'monthly') {
          const WEEKS_PER_MONTH = 4;
          const rawS = Math.max(1, Math.min(WEEKS_PER_MONTH, Math.round(env.start)));
          const rawE = Math.max(rawS, Math.min(WEEKS_PER_MONTH, Math.round(env.end)));
          for (let m = 0; m < 12; m++) {
            segs.push({
              leftPct: (m + (rawS - 1) / WEEKS_PER_MONTH) / 12 * 100,
              widthPct: (rawE - rawS + 1) / WEEKS_PER_MONTH / 12 * 100,
              inset: true
            });
          }
        } else {
          const s = Math.max(1, env.start), e = Math.min(12, env.end);
          if (s <= e) segs.push({ leftPct: (s - 1) / 12 * 100, widthPct: (e - s + 1) / 12 * 100, inset: false });
        }
      } else if (yearView === 'quarter') {
        const QI = yearViewIndex;
        if (freq === 'quarterly') {
          const COLS = 13;
          const rawS = Math.max(1, Math.min(COLS, Math.round(env.start)));
          const rawE = Math.max(rawS, Math.min(COLS, Math.round(env.end)));
          segs.push({ leftPct: (rawS - 1) / COLS * 100, widthPct: (rawE - rawS + 1) / COLS * 100, inset: true });
        } else if (freq === 'monthly') {
          const WPM = 4, COLS = 13;
          const rawS = Math.max(1, Math.min(WPM, Math.round(env.start)));
          const rawE = Math.max(rawS, Math.min(WPM, Math.round(env.end)));
          for (let mi = 0; mi < 3; mi++) {
            const barS = mi * WPM + rawS;
            if (barS > COLS) continue;
            segs.push({ leftPct: (barS - 1) / COLS * 100, widthPct: (rawE - rawS + 1) / COLS * 100, inset: true });
          }
        } else {
          const qStart = QI * 3 + 1, qEnd = QI * 3 + 3;
          const s = Math.max(1, Math.round(env.start)), e = Math.min(12, Math.round(env.end));
          const oS = Math.max(s, qStart), oE = Math.min(e, qEnd);
          if (oS <= oE) {
            const barS = (oS - qStart) * 4 + 1;
            const barE = Math.min(13, (oE - qStart + 1) * 4);
            segs.push({ leftPct: (barS - 1) / 13 * 100, widthPct: (barE - barS + 1) / 13 * 100, inset: false });
          }
        }
      } else {
        const MI = yearViewIndex;
        if (freq === 'monthly') {
          const COLS = 4;
          const rawS = Math.max(1, Math.min(COLS, Math.round(env.start)));
          const rawE = Math.max(rawS, Math.min(COLS, Math.round(env.end)));
          segs.push({ leftPct: (rawS - 1) / COLS * 100, widthPct: (rawE - rawS + 1) / COLS * 100, inset: true });
        } else if (freq === 'quarterly') {
          const monthInQtr = MI % 3;
          const qRawS = Math.max(1, Math.min(13, Math.round(env.start)));
          const qRawE = Math.max(qRawS, Math.min(13, Math.round(env.end)));
          const mWeekS = monthInQtr * 4 + 1, mWeekE = monthInQtr * 4 + 4;
          const overlapS = Math.max(qRawS, mWeekS), overlapE = Math.min(qRawE, mWeekE);
          if (overlapS <= overlapE) {
            const posS = overlapS - monthInQtr * 4, posE = overlapE - monthInQtr * 4;
            segs.push({ leftPct: (posS - 1) / 4 * 100, widthPct: (posE - posS + 1) / 4 * 100, inset: true });
          }
        } else {
          const monthNum = MI + 1;
          const s = Math.max(1, Math.round(env.start)), e = Math.min(12, Math.round(env.end));
          if (monthNum >= s && monthNum <= e) segs.push({ leftPct: 0, widthPct: 100, inset: false });
        }
      }
      return segs;
    }

    function yearHandleClick(e) {
```

- [ ] **Step 2: Add the `exportTimelineAsJpeg()` function**

In `index.html`, find this block (around line 4513, right after the RC state variables):

```javascript
    let rcData = [];            // parsed RefreshCalendar events
    let rcOverlayVisible = false; // whether overlay is shown
```

Replace it with:

```javascript
    let rcData = [];            // parsed RefreshCalendar events
    let rcOverlayVisible = false; // whether overlay is shown
    const RC_PERIOD_FILLS = {
      open: 'transparent',
      slush: 'rgba(220,180,0,0.13)',
      freeze: 'rgba(210,40,40,0.12)',
      default: 'rgba(218,80,40,0.10)'
    };
```

Now find this block (around line 6119–6120, right after the Gantt/detail close-button wiring):

```javascript
    $('btnGanttClose').addEventListener('click', closeGanttScreen);
    $('btnDetailBack').addEventListener('click', closeDetailScreen);
```

Replace it with:

```javascript
    $('btnGanttClose').addEventListener('click', closeGanttScreen);
    $('btnDetailBack').addEventListener('click', closeDetailScreen);
    $('btnYearExport').addEventListener('click', exportTimelineAsJpeg);

    /** Build an SVG of the current Timeline view state and download as JPEG. */
    function exportTimelineAsJpeg() {
      if (!Object.keys(tree).length) { showExportToast('No data to export'); return; }
      const rows = [];
      collectYearExportRows(tree, 0, '', rows);
      if (!rows.length) { showExportToast('No data to export'); return; }

      showExportToast('Building image…');

      const PAD       = 24;
      const LABEL_W   = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--year-label-w'), 10) || 260;
      const INDENT_W  = YEAR_INDENT_W;
      const ROW_H     = 37;
      const HEADER_H  = 40;
      const BAR_AREA_W = 900;
      const FF        = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
      const colCount  = yearView === 'quarter' ? 13 : yearView === 'month' ? 4 : 12;
      const colW      = BAR_AREA_W / colCount;
      const totalW    = PAD + LABEL_W + BAR_AREA_W + PAD;
      const totalH    = PAD + HEADER_H + rows.length * ROW_H + PAD;

      const defs  = [];
      const parts = [];

      parts.push('<rect width="' + totalW + '" height="' + totalH + '" fill="#ffffff"/>');
      parts.push('<rect x="0" y="' + PAD + '" width="' + totalW + '" height="' + HEADER_H + '" fill="#f5f6f8"/>');
      parts.push(
        '<text x="' + (PAD + 10) + '" y="' + (PAD + HEADER_H / 2 + 4) + '"' +
        ' font-size="10" font-weight="700" letter-spacing="0.5" fill="#888"' +
        ' font-family="' + FF + '">PROCESS</text>'
      );

      let axisLabels;
      if (yearView === 'quarter') {
        axisLabels = Array.from({ length: 13 }, (_, i) => 'W' + (i + 1));
      } else if (yearView === 'month') {
        axisLabels = ['W1', 'W2', 'W3', 'W4'];
      } else {
        axisLabels = YEAR_MONTHS.slice();
      }
      axisLabels.forEach(function (lbl, i) {
        const cx = PAD + LABEL_W + i * colW + colW / 2;
        parts.push(
          '<text x="' + cx + '" y="' + (PAD + HEADER_H / 2 + 4) + '" text-anchor="middle"' +
          ' font-size="10" font-weight="700" fill="#999" font-family="' + FF + '">' + escHtml(lbl) + '</text>'
        );
      });

      parts.push('<line x1="0" y1="' + (PAD + HEADER_H) + '" x2="' + totalW + '" y2="' + (PAD + HEADER_H) + '" stroke="#d0d0d0" stroke-width="2"/>');
      parts.push('<line x1="' + (PAD + LABEL_W) + '" y1="' + PAD + '" x2="' + (PAD + LABEL_W) + '" y2="' + (PAD + HEADER_H + rows.length * ROW_H) + '" stroke="#d0d0d0" stroke-width="1"/>');

      rows.forEach(function (row, i) {
        const rowY = PAD + HEADER_H + i * ROW_H;
        const dimOpacity = row.dimmed ? ' opacity="0.38"' : '';

        parts.push('<line x1="0" y1="' + (rowY + ROW_H) + '" x2="' + totalW + '" y2="' + (rowY + ROW_H) + '" stroke="#ececec" stroke-width="1"/>');

        for (let c = 1; c < colCount; c++) {
          const gx = PAD + LABEL_W + c * colW;
          parts.push('<line x1="' + gx + '" y1="' + rowY + '" x2="' + gx + '" y2="' + (rowY + ROW_H) + '" stroke="#ebebeb" stroke-width="1"/>');
        }

        const indent   = 10 + row.indentDepth * INDENT_W;
        const labelX   = PAD + indent;
        const labelY   = rowY + ROW_H / 2 + 4;
        const labelTxt = 'L' + row.levelNum + '   ' + row.key;
        const clipId   = 'ylc' + i;
        defs.push('<clipPath id="' + clipId + '"><rect x="' + PAD + '" y="' + rowY + '" width="' + Math.max(4, LABEL_W - indent - 4) + '" height="' + ROW_H + '"/></clipPath>');
        parts.push(
          '<text x="' + labelX + '" y="' + labelY + '" clip-path="url(#' + clipId + ')"' +
          ' font-size="12" fill="#333" font-family="' + FF + '"' + dimOpacity + '>' + escHtml(labelTxt) + '</text>'
        );

        const segs = yearExportBarSegments(row.nodeObj, row.env, row.levelNum);
        if (!segs.length) {
          parts.push(
            '<text x="' + (PAD + LABEL_W + 8) + '" y="' + labelY + '"' +
            ' font-size="11" fill="#ccc" font-family="' + FF + '"' + dimOpacity + '>—</text>'
          );
        } else {
          const col  = row.env.freq ? yearFreqColors(row.env.freq) : yearUoMColors(row.env.uom);
          const barY = rowY + Math.round((ROW_H - 18) / 2);
          segs.forEach(function (seg) {
            let barX = PAD + LABEL_W + Math.round(seg.leftPct / 100 * BAR_AREA_W);
            let barW = Math.round(seg.widthPct / 100 * BAR_AREA_W);
            if (seg.inset) { barX += 1; barW -= 2; }
            barW = Math.max(3, barW);
            parts.push(
              '<rect x="' + barX + '" y="' + barY + '" width="' + barW + '" height="18"' +
              ' rx="4" ry="4" fill="' + col.fill + '" stroke="' + col.stroke + '" stroke-width="1"' + dimOpacity + '/>'
            );
          });
        }
      });

      const svgStr =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + totalW + '" height="' + totalH + '"' +
        ' viewBox="0 0 ' + totalW + ' ' + totalH + '">\n' +
        (defs.length ? '  <defs>\n    ' + defs.join('\n    ') + '\n  </defs>\n' : '') +
        parts.map(function (s) { return '  ' + s; }).join('\n') +
        '\n</svg>';

      const viewLabel =
        yearView === 'quarter' ? 'Quarter Q' + (yearViewIndex + 1) :
        yearView === 'month'   ? 'Month ' + YEAR_MONTHS[yearViewIndex] :
        'Year';
      const levelLabel = yearMinLevel === null ? 'All' : 'L' + yearMinLevel;
      const l0Label     = yearL0Filter !== null ? yearL0Filter : 'All';
      const sanitize    = function (s) { return s.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''); };
      const filename    = 'Timeline - ' + sanitize(l0Label) + ' - ' + sanitize(viewLabel) + ' - ' + sanitize(levelLabel) + '.jpg';

      downloadJPEG(svgStr, totalW, totalH, filename);
    }
```

- [ ] **Step 3: Verify in browser**

Run: `open index.html`

In the app, open the Timeline view. Test each of these, checking after each click that a `.jpg` file downloads with no console errors, and that opening the image shows bars in the same relative positions/colors/indentation as the on-screen grid at the time of export:

1. Default state (All processes, Year view, All levels) → click Export JPG → confirm filename is `Timeline - All - Year - All.jpg`.
2. Select a specific process in the L1 filter dropdown, switch to Quarter view (pick Q2 if a sub-picker appears), set level filter to L2 → click Export JPG → confirm filename is `Timeline - <that process> - Quarter Q2 - L2.jpg` and only that process's subtree appears in the image.
3. Switch to Month view, pick January → click Export JPG → confirm filename contains `Month Jan`.
4. Expand a couple of rows that have children, then collapse one of them → click Export JPG → confirm the exported image shows exactly the rows that are visible on screen (expanded rows show their children in the image; the row you re-collapsed does not), and that any row you left expanded (which shows dimmed/faded on screen) appears at reduced opacity in the image too.
5. Resize the label column (drag the resize handle at the right edge of the "Process" header) → click Export JPG → confirm the label column width in the exported image is proportionally similar to the resized on-screen width (not reset to the default).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Implement core Timeline view JPG export"
```

---

### Task 3: Add the RC "o9 refresh cadence" overlay to the export

**Files:**
- Modify: `index.html` (JS: inside `exportTimelineAsJpeg()`, inserting a block right before its `const svgStr = ...` line)

**Interfaces:**
- Consumes: `rcOverlayVisible`, `rcData` (existing globals). `rcExpandEvents(entry)` → array of `{ left, width }` (percent-based, existing, `index.html:8474`) — `entry.type` is `'Period'` or `'Milestone'`; for `'Period'` entries `width` is meaningful, for milestones it's `0` and only `left` (the marker position) matters. `RC_PERIOD_FILLS` (added in Task 2, `index.html:4514`). `PAD`, `LABEL_W`, `BAR_AREA_W`, `HEADER_H`, `ROW_H`, `rows`, `parts` (local variables already in scope inside `exportTimelineAsJpeg()` from Task 2).

- [ ] **Step 1: Insert the RC overlay rendering block**

In `index.html`, find this block (the end of the `rows.forEach` loop and the start of SVG serialization, added in Task 2):

```javascript
      });

      const svgStr =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
```

Replace it with:

```javascript
      });

      if (rcOverlayVisible && rcData.length) {
        const overlayTop    = PAD + HEADER_H;
        const overlayBottom = PAD + HEADER_H + rows.length * ROW_H;
        rcData.forEach(function (entry) {
          rcExpandEvents(entry).forEach(function (ev) {
            const x = PAD + LABEL_W + Math.round(ev.left / 100 * BAR_AREA_W);
            if (entry.type === 'Period') {
              const fill = RC_PERIOD_FILLS[entry.colorKey] || RC_PERIOD_FILLS.default;
              if (fill !== 'transparent') {
                const w = Math.max(1, Math.round(ev.width / 100 * BAR_AREA_W));
                parts.push('<rect x="' + x + '" y="' + overlayTop + '" width="' + w + '" height="' + (overlayBottom - overlayTop) + '" fill="' + fill + '"/>');
              }
            } else {
              parts.push('<line x1="' + x + '" y1="' + overlayTop + '" x2="' + x + '" y2="' + overlayBottom + '" stroke="rgba(50,130,220,0.90)" stroke-width="3" stroke-dasharray="5,4"/>');
            }
          });
        });
      }

      const svgStr =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
```

This is the same visual stacking order as the on-screen overlay: drawn after (on top of) all row bars, and bounded to the row area of the grid rather than the header (the on-screen overlay technically extends behind the sticky header too, but the header's opaque background fully masks it there, so the visible effect is identical).

- [ ] **Step 2: Verify in browser**

Run: `open index.html`

Create a small test RefreshCalendar CSV so there's overlay data to check against:

```bash
cat > /tmp/rc-test.csv << 'EOF'
Name,Type,Frequency,Start,End
Open,Period,monthly,1,2
Slush,Period,monthly,3,3
Freeze,Period,monthly,4,4
BatchRun Milestone,Milestone,monthly,2,2
EOF
```

In the app, open the Timeline view, switch to Month view (any month), click the upload icon next to the refresh-cadence toggle button and select `/tmp/rc-test.csv`. Click the "o9 refresh cadence" toggle button to turn the overlay on — confirm colored bands and a dashed vertical line appear over the grid on screen. Click Export JPG and open the downloaded image — confirm it shows the same colored bands (slush = yellow-tinted, freeze = red-tinted, open = no tint) and dashed milestone line, in the same relative horizontal positions as on screen, spanning the full height of the row area.

Now click the overlay toggle button again to turn it off, and click Export JPG again — confirm the newly downloaded image has no overlay bands or lines, only the plain process bars.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add RC refresh cadence overlay to Timeline export"
```
