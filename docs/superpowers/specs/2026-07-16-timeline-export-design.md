# Timeline View JPG Export — Design

## Purpose

Let users export the Timeline view (`#yearScreen`) as a shareable image, reflecting whatever filters/state they currently have applied: L1 process filter, Year/Quarter/Month view (+ sub-selection), level filter (All/L1/L2/L3/L4/L5), and manual row expand/collapse state.

## Scope

- One new "Export JPG" button in the Timeline toolbar.
- One new export function that renders the current Timeline state to a raster JPG, following the same architecture as the existing Gantt chart export (`exportGanttAsJpeg`).
- No new export formats, no in-image title/header, no legend in the export, no new keyboard shortcut.

## UI

- Add a button reusing the existing `.gantt-export-btn` class (visually identical to the Gantt export button: outlined, download icon, "Export JPG" label).
- Placement: in `.year-toolbar`, before the legend ("i") button and the Close button — mirroring where the Gantt export button sits relative to its Close button.
- Clicking it calls `exportTimelineAsJpeg()`. No modal, no options dialog — one click, one file, matching the Gantt export's zero-friction behavior.

## Export scope semantics

The exported image is a 1:1 snapshot of the current on-screen grid:

- **L1 process filter** (`yearL0Filter`): only the selected L1 subtree, or all L1s if unset.
- **View** (`yearView` / `yearViewIndex`): Year (12-month axis), Quarter (13-week axis for the selected quarter), or Month (4-week axis for the selected month) — same axis the screen currently shows.
- **Level filter** (`yearMinLevel`): rows below the selected minimum level are skipped, exactly as on screen.
- **Expand/collapse state** (`yearExpandedPaths`): only rows that are currently expanded on screen are included in the export. Collapsed subtrees are omitted, matching what the user sees — this is a deliberate choice (confirmed with user) over forcing full expansion.
- **RC "o9 refresh cadence" overlay**: included in the export if `rcOverlayVisible` is true and `rcData.length` at export time; omitted otherwise.
- **Legend**: never included, regardless of whether the legend popover happens to be open.
- **No title/header row** summarizing filters is drawn into the image — the filename carries that information instead (see Filename below).

If no data is loaded (`tree` is empty) or there are no visible rows to export, show the existing toast pattern (e.g. `showExportToast('No data to export')`) and abort — no file is generated.

## Rendering approach

Follow the established codebase pattern used by `exportGanttAsJpeg()`: hand-build an SVG string in absolute pixel coordinates, then rasterize it via the existing `downloadJPEG(svgString, w, h, filename)` helper (canvas draw at 300 PPI, `toBlob('image/jpeg', 0.95)`, triggers a browser download).

This is chosen over a DOM/`foreignObject` screenshot approach for consistency with every other export already in this app, and to avoid `foreignObject`-to-canvas rasterization inconsistencies across browsers (notably Safari).

### New function: `exportTimelineAsJpeg()`

Structural mirror of `exportGanttAsJpeg()`, but for the Timeline grid instead of the Gantt chart:

1. **Data pass** — walk the same node set `buildYearRows()` would walk (respecting `yearL0Filter`, `yearExpandedPaths`, `yearMinLevel`), collecting one entry per visible row: key, depth/level, and its envelope (via the existing `yearNodeEnvelope()` helper — reused, not reimplemented).
2. **Layout pass** — compute absolute pixel geometry:
   - Label column width from the live `--year-label-w` CSS variable (so a user-resized label column is respected).
   - Row height / indent-per-depth constants matching `YEAR_INDENT_W` and the on-screen row height.
   - Axis columns: 12 months (year view), 13 weeks (quarter view), or 4 weeks (month view) — same header logic as `yearRender()`'s `axisCells` branch.
   - Bar geometry: reimplement each of `buildYearRows()`'s view × frequency branches (year/quarter/month × annual/quarterly/monthly, ~9 cases) in pixel terms instead of percentages — same math, converted from `%` to `px` against the computed bar-area width. Colors come from the existing `yearFreqColors()` / `yearUoMColors()` helpers (reused, not reimplemented).
3. **RC overlay pass** (only if applicable per the semantics above) — reuse `rcExpandEvents()`'s percentage math, converted to pixels, drawn as translucent full-column-height `<rect>` bands (period type: open/slush/freeze/default) and dashed `<line>` milestones, layered on top of the bars — same visual stacking order as the on-screen `.rc-overlay-layer`.
4. **Serialize** the collected SVG parts (background, header, grid lines, labels with `<clipPath>` text clipping like the Gantt export uses, bars, RC overlay) into one SVG string.
5. **Rasterize** via the existing `downloadJPEG()` helper.

Data helpers reused as-is (no changes needed): `yearNodeEnvelope`, `yearFreqColors`, `yearUoMColors`, `rcExpandEvents`, `YEAR_MONTHS`, `YEAR_INDENT_W`.

New code is confined to the layout/serialization pass — consistent with how the Gantt export already duplicates layout math independently from its on-screen renderer rather than sharing a renderer between screen and export (screen renders via CSS %, export renders via SVG px; only the underlying data/color helpers are shared).

## Filename

Pattern: `Timeline - <L1 filter or All> - <View> - <Level>.jpg`

- `<L1 filter or All>`: the selected `yearL0Filter` value, or `All` if unset.
- `<View>`:
  - Year view → `Year`
  - Quarter view → `Quarter Q<N>` (e.g. `Quarter Q2`)
  - Month view → `Month <MonName>` (e.g. `Month Jan`)
- `<Level>`: `All`, or `L1`…`L5` matching `yearMinLevel`.

Sanitized the same way the Gantt export sanitizes its filename (strip to alphanumerics, collapse/trim dashes) before joining segments.

Examples:
- `Timeline - All - Year - All.jpg`
- `Timeline - Finance - Quarter Q2 - L2.jpg`
- `Timeline - All - Month Jan - L3.jpg`

## Out of scope

- PNG/PDF/SVG export formats.
- An in-image title/header summarizing filters.
- Baking the legend into the export.
- Forcing full tree expansion regardless of on-screen collapse state.
- New keyboard shortcut for this export (button-only, like most other exports in this app).
