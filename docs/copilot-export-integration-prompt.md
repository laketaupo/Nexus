# Copilot Chat prompt: port the Nexus export function to another version

Plak onderstaande prompt in Copilot Chat (Agent mode), met de doelrepo open. Voeg de bron toe als context: ofwel de `index.html` van Nexus (branch `main`, repo `laketaupo/Nexus`) als bestand in de workspace, ofwel de regelbereiken hieronder. Werkt het best als je de bron-`index.html` onder een andere naam (bijv. `_source/nexus-index.html`) in de doelrepo zet, zodat Copilot beide kan lezen.

---

## PROMPT (kopieer vanaf hier)

You are an expert front-end engineer. Your task is to **port the complete "Export" feature from a source version of the Nexus app into a target version of the same app**, without breaking anything that already works in the target.

### 0. Context

Nexus is a single-file, framework-free web app (`index.html`, ~11,700 lines: inline CSS, HTML, and one big inline `<script>`). It renders a process hierarchy (L1 to L5) as flow diagrams. State lives in global variables such as `tree`, `currentPath`, `levelOffset`; there is no build step and no external dependency (even the .zip writer is hand-written).

- **Source version** = the file `<SOURCE_FILE>` (the version that has the export feature; reference = Nexus `main`). Treat it as **read-only**.
- **Target version** = the file `<TARGET_FILE>` (the version that must receive the export feature). Only this file is modified.

If the target already has a partial or older export implementation, **replace it in full** with the source implementation, but first list what you are replacing and carry over any target-specific behaviour that is not in the source (see step 6).

### 1. Rules of engagement (read first)

1. Work in small, verifiable phases (see section 5). After each phase, state what you changed, and check that the page still loads without console errors before continuing.
2. **Do not rewrite or "improve" the source code.** Copy it faithfully (same function names, same IDs, same CSS class names, same localStorage keys). Only adapt where the target's data model or naming genuinely differs, and list every such adaptation in your final report.
3. Do not touch unrelated features of the target. Keep the diff additive wherever possible.
4. No new dependencies, no build tooling, no CDN scripts. Everything stays inline in the single HTML file.
5. Never leave placeholders or TODOs in the final code. Do not stub out a function "for later".
6. If something in the target is ambiguous (e.g. a global that exists in the source but not in the target), **stop and ask** instead of guessing. Do not invent data-model fields.
7. Keep the UI language (English) and the existing code style: 2-space indentation, `const`/arrow functions as in the source, comments in the same style (short `//` comments above blocks; section banners like `// ── EXPORT MODAL ──────`).

### 2. What "the export feature" consists of (inventory in the source)

Locate these parts in the source by their markers (line numbers are approximate and valid for source commit `6cecc94`; search by the marker text, not by number):

**A. CSS**
- `/* ── EXPORT MODAL ── */` through `/* ── EXPORT FORMAT ── */` and the end of that block (about lines 1113 to 1345). Includes `#exportModal`, `.exp-*` classes, `.exp-picker`, `.pv-expanded` preview-expanded state, responsive rules (`@media` inside this range).
- `#exportToast` rules (about line 367) and `.show` state.
- `.gantt-export-btn` and `.gantt-export-fmt` (about lines 1229 and 1541). These style the Export buttons and format dropdown on the Gantt and Timeline views.
- The `/* ── SIMPLIFIED VIEW (dashboard export) ── */` block (about line 930), used by the dashboard export.
- The `/* ── DRAW.IO XML MODAL ── */` block if the target lacks it and the source export code references `drawio-xml` classes (the code textarea `#expCodeBox` uses `class="drawio-xml exp-code"`).

**B. HTML**
- `<div id="exportToast">` (about line 2914).
- The whole `<div id="exportModal" class="exp-overlay hidden"> ... </div>` block (about lines 2915 to 3085): header with "Reset to defaults", block 1 *What to export* (start level, "Down to", process list with All/None, include levels above, Files with tab rules and saved tab sets), block 2 *Type* (Image, Code, Dashboard, Flowchart), block 3 *View* (flow style, layout/swimlane, orientation, level checks, codes), the live preview pane (`.exp-preview`, expand button `#expPvExpand`), file list, `#expCodeBox`, and the footer buttons `#btnExpCancel`, `#btnExpCopy`, `#btnExpGo`.
- Toolbar buttons that call the view exports: `#btnGanttExport` + `#ganttExportFmt` (about line 2458) and `#btnYearExport` + `#yearExportFmt` (about line 2517), each with its download-icon SVG and the "Export" label.
- The keyboard-help (cheat-sheet) rows for `E` (Export: image, code, flowchart) and `B` (Export one diagram per process), about lines 2883 to 2884.

**C. JavaScript** (all inside the main `<script>`)
1. *Export modal*: section `// ── EXPORT MODAL ──` (about line 8681) up to and including `closeExportModal` and the `// ── Wiring ──` block (about line 10006 to 10062). Sub-sections: What to export, Building the diagrams, Code (HTML page, interactive dashboard), Hover card (shared by HTML export, dashboards and the app), Current output, Rendering the options, Tab rules, Wiring.
2. *Copy and download*: `// ── Copy and download ──` (`expCopyText`, `expCopy`, `expFileBlob`, `expDownload`).
3. *Shared export helpers*: `// ── Shared export helpers ──` (`EXPORT_EXT`, `EXPORT_LABEL`, `saveBlob`, `svgToRasterBlob`, `imageBlob`, `saveFiles` (multi-file as a single .zip), `viewExportFormat`, `exportViewImage`, and the `VIEW_FMT_KEY` format-dropdown sync for `ganttExportFmt` and `yearExportFmt`).
4. *SVG export*: `// ── SVG EXPORT ──` (`SVG_LAYOUT`, `EXP_FILLS/STROKES/TEXTS`, `EXP_ARROW_COLOR`, `getSvgColors`, `expFlowPolyline`, `buildSvgString`, about lines 10211 to 10547).
5. *Swimlane layout*: `// ── SWIMLANE LAYOUT ──` (`swimFieldValue`, `swimLaneOf`, `swimFieldsInData`, `buildSwimlaneSvg`, `EXP_UNASSIGNED`, about lines 10548 to 10731).
6. *Visio*: `// ── VISIO (.VSDX) EXPORT ──` (`vsdx*` helpers, `exportDataRows`, `buildVsdxBlob`, about lines 10732 to 11001).
7. *draw.io*: `// ── DRAW.IO EXPORT ──` (`buildDrawioXml`, `buildDrawioDiagram`, `expDrawioTabsXml`, then the zip helpers `zipCrc32` and `zipStore`, about lines 11002 to 11198).
8. *Toast + text utils*: `showExportToast`, `wrapText`, `escHtml` (only if the target lacks equivalents; check for name clashes first).
9. *Gantt and Timeline image exports*: `exportGanttAsJpeg()` (about line 7081) with its click binding (`$('btnGanttExport')`), and `exportTimelineAsJpeg()` (about line 6948) with `collectYearExportRows` and `yearExportBarSegments` (about lines 5549 to 5600) and the `$('btnYearExport')` click binding. These depend on the Gantt and Timeline (Year view) features. **Port them only if the target has those views**; otherwise skip them, and also omit the two toolbar buttons.
10. *Entry points*: the `case 'e'` and `case 'b'` keyboard shortcuts (about lines 8604 to 8607), which call `openExportModal()` and `openExportModal({ perProcess: true })`; also the guard `if (!exportModal.classList.contains('hidden')) return;` (about line 8442) that stops other shortcuts while the modal is open.
11. *Save-as-HTML interplay*: the code near `clone.querySelector('#exportModal').className = 'exp-overlay hidden'` (about line 9400) and `buildStandaloneHtml`, which strip the export modal from saved pages. Make sure this still works.
12. *Hover cards and simplified view*: `// ── HOVER CARDS AND THE SIMPLIFIED VIEW ──` (about line 11275) is used by the dashboard export. Port it if the target lacks it.

**D. Persistence (localStorage keys, keep the names exactly)**
`nexus.export.settings.v3`, `nexus.export.settings.v2` (read once for migration), `nexus.export.tabsets.v1`, `nexus.export.viewFormat`.

**E. Existing docs to read for intent**: `docs/superpowers/specs/2026-07-16-timeline-export-design.md` and `docs/superpowers/plans/2026-07-16-timeline-export.md` (design rationale for the Timeline export and the architecture shared with the Gantt export).

### 3. Dependencies the export code expects from the host app

Before copying anything, grep the source export code for every identifier it uses from *outside* the export sections, and verify each exists in the target with the same meaning. At minimum check:

- Data model: `tree`, node shape (`_children`, `_meta`, and the field names used by `exportDataRows`, `EXP_LANE_FIELDS`, `PANEL_*_FIELDS`), `levelOffset`, `currentPath`, `_dfsPathList`.
- DOM helper `$` and the DOM constants block (`const exportToast = $('exportToast')`, etc.).
- Layout/rendering: `BASE`, `SVG_LAYOUT`, the flow-style setting (Graph / Linear for Previous / Next flows, including the export-window override helper near line 3324 to 3340 that reads `#exportModal`), loop rendering option `loopTop` (about line 3475), virtual export nodes with `_path` (about line 3369).
- Utilities: `sanitizeFileName`, `escHtml`, `wrapText`, `showExportToast`.
- Anything the Gantt/Timeline exports use: `ganttL1Key`, `yearL0Filter`, `yearView`, `yearViewIndex`, `yearMinLevel`, `yearExpandedPaths`, `rcOverlayVisible`, `rcData`, `yearNodeEnvelope`, `yearFreqColors`, `yearUoMColors`, `rcExpandEvents`, `YEAR_MONTHS`, `YEAR_INDENT_W`.

Produce a **dependency table first** (identifier, exists in target yes/no, same semantics yes/no, action). Do not start editing until this table is complete and you have shown it to me. For each "no", propose the smallest fix: add the missing helper, or adapt the export call site. If a missing dependency is a whole feature (e.g. no Gantt view), ask me whether to skip that part.

### 4. Conflict checks

- Search the target for **name collisions** for every top-level function/const you will add (`saveBlob`, `escHtml`, `zipStore`, `sanitizeFileName`, `showExportToast`, `SVG_LAYOUT`, etc.). If a same-named symbol exists with different behaviour, do not overwrite silently: report it and propose a rename or a merge.
- Search for **duplicate element IDs** (`exportModal`, `exportToast`, `btnGanttExport`, `btnYearExport`, and every `exp*` ID) and duplicate CSS selectors.
- Check the target's existing global key handler: the `E` and `B` shortcuts must not shadow existing shortcuts. If they are taken, ask me which keys to use.
- Check z-index/stacking: the export modal overlay must appear above the target's panels and below nothing else that should cover it.

### 5. Execution plan (do these phases in order, pausing after phase 1 for my OK)

**Phase 1: Analysis only (no edits).** Produce (a) the dependency table from section 3, (b) the collision report from section 4, (c) a list of the exact insertion points in the target for each of A, B, C, D, with line numbers, and (d) any risks. Stop and wait for my confirmation.

**Phase 2: CSS and HTML.** Add the CSS blocks (A) and the HTML (B) to the target at the matching positions. Then add the keyboard-help rows. Verify the page still loads and the modal is hidden by default.

**Phase 3: Shared helpers and renderers.** Add C.3 to C.8 (shared helpers, SVG export, swimlane layout, Visio, draw.io, zip, toast and utils) and C.12 if needed. Verify no console errors and that `typeof buildSvgString === 'function'` etc.

**Phase 4: Export modal logic.** Add C.1 and C.2 and the persistence keys (D), then the entry points C.10 and the save-as-HTML interplay C.11. Verify: pressing `E` opens the modal, `Esc` closes it, the live preview renders, switching Type/format works, "Reset to defaults" works, settings persist after reload.

**Phase 5: View exports (only if the target has Gantt/Timeline).** Add C.9 and the toolbar buttons. Verify the format dropdown (`ganttExportFmt`/`yearExportFmt`) stays in sync and persists.

**Phase 6: Reconcile and clean up.** Remove any export code in the target that is now dead or duplicated (but only after confirming it is unused by grep), and carry over target-specific behaviour I flag.

### 6. Acceptance tests (run them yourself in the browser, headless is fine, and report results)

Use any demo data the target ships with, or `demo/harbour-cycles-demo.csv` from the source repo.

1. Page loads with **zero console errors/warnings** introduced by the port.
2. `E` opens the export modal; `B` opens it with one diagram per process; `Esc` closes it; background shortcuts are inert while it is open.
3. For every Type/format combination (Image: SVG, PNG; Code: HTML; Dashboard: HTML; Flowchart: draw.io, Visio .vsdx): the live preview renders, **Download** produces a valid file with the expected extension, and Copy works where offered (HTML, draw.io).
4. Files mode: *one file*, *a file per process*, *a file per parent*, *draw.io tabs* all produce the expected output. Multiple files download as a **single .zip** that unzips cleanly.
5. Options: start level, "Down to", process tick/untick (All/None), "Include the levels above", orientation, layout *Swimlane* with a lane field, flow style Graph vs Linear, codes on/off, *Same size* with alignment, image scale/background/padding, code size fluid/fixed.
6. Settings persist across reload and across closing/opening the modal; "Reset to defaults" restores `EXP_DEFAULTS`.
7. Gantt and Timeline "Export" buttons (if present) produce SVG/JPEG/PNG per the dropdown and honour the on-screen filters (see the Timeline design spec).
8. A saved standalone HTML page (the app's own "save" function) does not contain a visible export modal.
9. The target's pre-existing features (navigation, search, zoom, present mode, import, and anything else you touched near) behave exactly as before. Do a quick regression pass and list what you checked.
10. Large diagram guard: exporting a very large PNG shows the "too large" toast instead of crashing.

### 7. Final report format

Finish with a concise report containing: (1) a list of what was added/replaced, with line ranges in the target; (2) every adaptation you made versus the source and why; (3) the results of each acceptance test (pass/fail, with details for failures); (4) anything left undone or any open question. Do not claim a test passed unless you actually ran it.

Start now with **Phase 1 only**, and stop after presenting the analysis.

## EINDE PROMPT

---

### Invulpunten voor jou
- Vervang `<SOURCE_FILE>` en `<TARGET_FILE>` door de echte paden.
- Regelnummers gelden voor Nexus-commit `6cecc94`; Copilot zoekt op de markeringen (de `// ── ... ──` banners), dus kleine verschuivingen zijn geen probleem.
- Bevat de doelversie geen Gantt- of Timeline-weergave, dan slaat Copilot stap C.9 en de twee toolbarknoppen over (staat in de prompt).
