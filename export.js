// Nexus export code, extracted verbatim from index.html (lines 8681-11328).
// JavaScript only: export modal, SVG / Visio (.vsdx) / draw.io / HTML exports, helpers.
// Depends on globals defined elsewhere in index.html (tree, $, SVG_LAYOUT, ...), so it is a reference file, not standalone.

// ── EXPORT MODAL ───────────────────────────────────────────────────────
// One screen with three numbered blocks and a live preview on the right:
// 1 What to export (start level, depth, which processes, levels above,
// files), 2 Type (Image, Code, Dashboard, Flowchart, plus the format) and
// 3 View (flow, layout, orientation, levels, codes). The preview follows
// every change and the last choices are remembered.
const exportModal  = $('exportModal');
const expLvlChecks = $('expLevelChecks');
const EXP_MAX_LEVEL    = 4;
const EXP_SETTINGS_KEY = 'nexus.export.settings.v3';
const EXP_TYPES = {
  image:     { formats: [['svg', 'SVG'], ['png', 'PNG']] },
  code:      { formats: [['html', 'HTML']] },
  dashboard: { formats: [['html', 'HTML']] },
  flowchart: { formats: [['drawio', 'draw.io'], ['vsdx', 'Visio (.vsdx)']] },
};
// Fields that can group the steps into swimlanes (see buildSwimlaneSvg)
const EXP_LANE_FIELDS = [
  ['R', 'Responsible (R)'], ['A', 'Accountable (A)'], ['S', 'Support (S)'],
  ['BPO', 'Process owner (BPO)'], ['BPE', 'Process expert (BPE)'], ['SME', 'Subject matter expert (SME)'],
  ['Tool', 'System (Tool)'], ['Tool_function', 'System function'], ['Type', 'Type'],
  ['Supplier', 'Supplier'], ['Customer', 'Customer'],
];
const EXP_DEFAULTS = {
  type: 'image',
  fmt: { image: 'png', code: 'html', dashboard: 'html', flowchart: 'drawio' },
  dashView: 'full',
  // What to export: processes at the start level, down to `deepest`.
  // `excluded` holds the unticked ones (so new processes start ticked),
  // `parentLevels` the levels above the start level that are drawn too.
  startLevel: 1, deepest: 4, excluded: [], parentLevels: [], files: 'one',
  direction: 'lr', layout: 'standard', laneField: 'R', orient: 'auto',
  image: { scale: 2, bg: 'white', padding: 24 },
  // Same size: every file of an image/code export gets the canvas of the
  // largest diagram, so boxes come out the same size in each file
  sameSize: 'off', align: 'center',
  code:  { size: 'fluid', width: 960 },
  levels: { 1: { o: 'h', a: true }, 2: { o: 'h', a: true }, 3: { o: 'h', a: true }, 4: { o: 'v', a: false } },
  showCodes: false, codeMode: 'auto', codePos: 'inline', l1Code: true,
  // Steps linked with Previous / Next: 'graph' (branches stacked) or 'linear' (one row)
  flowStyle: 'graph',
  // All tabs in one file (draw.io): the tab rules, in tab order. u: one
  // tab for the whole overview (0) or for each process at L1..L3; f..t:
  // the levels each tab shows. tabNav: clickable blocks and back buttons.
  tabRules: [{ u: 0, f: 1, t: 2 }, { u: 2, f: 2, t: 3 }], tabNav: false,
};

// Tab rules as saved (settings or a saved set), made valid
function expCleanRules(rules) {
  return (Array.isArray(rules) ? rules : []).filter(r => r && typeof r === 'object').map(r => {
    const u = Math.max(0, Math.min(EXP_MAX_LEVEL - 1, Math.round(r.u) || 0));
    const f = Math.max(1, Math.min(EXP_MAX_LEVEL, Math.round(r.f) || 1));
    const t = Math.max(f, u, Math.min(EXP_MAX_LEVEL, Math.round(r.t) || f));
    return { u, f, t };
  });
}
// Saved tab sets ({ name, rules }), kept apart from the settings so that
// Reset to defaults leaves them alone
const EXP_TABSETS_KEY = 'nexus.export.tabsets.v1';
function expLoadTabSets() {
  try {
    const v = JSON.parse(localStorage.getItem(EXP_TABSETS_KEY));
    return Array.isArray(v) ? v.filter(x => x && typeof x.name === 'string' && x.name.trim())
      .map(x => ({ name: x.name.trim(), rules: expCleanRules(x.rules) })).filter(x => x.rules.length) : [];
  } catch (_) { return []; }
}
function expSaveTabSets(sets) {
  try { localStorage.setItem(EXP_TABSETS_KEY, JSON.stringify(sets)); } catch (_) {}
}

// Saved values win where they have the same type as the default
function expMerge(d, saved) {
  if (!saved || typeof saved !== 'object') return d;
  Object.keys(d).forEach(k => {
    const dv = d[k], sv = saved[k];
    if (sv === undefined || sv === null) return;
    if (dv && typeof dv === 'object' && !Array.isArray(dv)) expMerge(dv, sv);
    else if (Array.isArray(dv) ? Array.isArray(sv) : typeof sv === typeof dv) d[k] = sv;
  });
  return d;
}
function expMergeDefaults(saved) {
  const d = expMerge(JSON.parse(JSON.stringify(EXP_DEFAULTS)), saved);
  if (!EXP_TYPES[d.type]) d.type = 'image';
  Object.keys(EXP_TYPES).forEach(t => {
    if (!EXP_TYPES[t].formats.some(f => f[0] === d.fmt[t])) d.fmt[t] = EXP_DEFAULTS.fmt[t];
  });
  if (![1, 2, 4].includes(d.image.scale)) d.image.scale = 2;
  if (!['full', 'simple'].includes(d.dashView)) d.dashView = 'full';
  if (!['standard', 'swimlane'].includes(d.layout)) d.layout = 'standard';
  if (!['one', 'each', 'parent', 'tabs'].includes(d.files)) d.files = 'one';
  if (!['landscape', 'portrait', 'auto'].includes(d.orient)) d.orient = 'auto';
  if (!['off', 'on'].includes(d.sameSize)) d.sameSize = 'off';
  if (!['center', 'topcenter', 'topleft'].includes(d.align)) d.align = 'center';
  if (!['graph', 'linear'].includes(d.flowStyle)) d.flowStyle = 'graph';
  if (!EXP_LANE_FIELDS.some(([f]) => f === d.laneField)) d.laneField = 'R';
  d.startLevel = Math.max(1, Math.min(EXP_MAX_LEVEL, Math.round(d.startLevel) || 1));
  d.deepest = Math.max(d.startLevel, Math.min(EXP_MAX_LEVEL, Math.round(d.deepest) || EXP_MAX_LEVEL));
  d.excluded = d.excluded.filter(k => typeof k === 'string');
  d.parentLevels = d.parentLevels.filter(l => Number.isInteger(l) && l >= 1 && l < EXP_MAX_LEVEL);
  d.tabRules = expCleanRules(d.tabRules);
  if (!d.tabRules.length) d.tabRules = EXP_DEFAULTS.tabRules.map(r => Object.assign({}, r));
  return d;
}
function expLoadSettings() {
  try {
    const v3 = localStorage.getItem(EXP_SETTINGS_KEY);
    if (v3) return expMergeDefaults(JSON.parse(v3));
    // Carry over the options of the previous export window
    const v2 = JSON.parse(localStorage.getItem('nexus.export.settings.v2'));
    if (v2 && typeof v2 === 'object') {
      const s = expMergeDefaults(v2);
      if (v2.type === 'code' && v2.content && v2.content.code === 'dashboard') s.type = 'dashboard';
      if (v2.code && v2.code.dashView === 'simple') s.dashView = 'simple';
      const o = v2[v2.type] && v2[v2.type].orient;
      if (['landscape', 'portrait', 'auto'].includes(o)) s.orient = o;
      if (v2.split && v2.split !== 'one') s.files = 'each';
      return s;
    }
  } catch (_) {}
  return expMergeDefaults(null);
}
function expSaveSettings() {
  try { localStorage.setItem(EXP_SETTINGS_KEY, JSON.stringify(expSettings)); } catch (_) {}
}
let expSettings = expLoadSettings();

const expGet = key => key.split('.').reduce((o, k) => (o == null ? o : o[k]), expSettings);
function expSet(key, v) {
  const ks = key.split('.'), last = ks.pop();
  ks.reduce((o, k) => o[k], expSettings)[last] = v;
}
const expType = () => expSettings.type;
const expFmt  = () => expSettings.fmt[expSettings.type];
const expKey  = p => p.join('\u001f');
// Swimlanes: SVG, PNG, HTML and draw.io (not Visio, not the dashboard)
const EXP_SWIM_FORMATS = ['svg', 'png', 'html', 'drawio'];
const expSwimOn = () => expSettings.layout === 'swimlane' && expType() !== 'dashboard' && EXP_SWIM_FORMATS.includes(expFmt());
// draw.io and HTML: all tabs in one file (built from the tab rules)
const expTabsCan = () => (expType() === 'flowchart' && expFmt() === 'drawio') || (expType() === 'code' && expFmt() === 'html');
const expTabsOn = () => expSettings.files === 'tabs' && expTabsCan();
// The Files choice in effect ('tabs' falls back to one file for other formats)
const expFilesMode = () => expSettings.files === 'tabs' && !expTabsOn() ? 'one' : expSettings.files;

function expNodeAt(path) {
  if (!path.length) return null;
  const parent = getNodesAtPath(path.slice(0, -1));
  return parent[path[path.length - 1]] || null;
}

// ── What to export ──
// Deepest level that has processes (at most EXP_MAX_LEVEL)
function expDataDepth() {
  let m = 1;
  (function walk(nodes, d) {
    Object.keys(nodes).forEach(k => { m = Math.max(m, d); if (d < EXP_MAX_LEVEL) walk(nodes[k]._children, d + 1); });
  })(tree, 1);
  return m;
}
// Every process at a level, as paths, in tree order
function expPathsAt(level) {
  const out = [];
  (function walk(nodes, path) {
    Object.keys(nodes).forEach(k => {
      const p = path.concat(k);
      if (p.length === level) out.push(p);
      else walk(nodes[k]._children, p);
    });
  })(tree, []);
  return out;
}
const expStart   = () => Math.min(expSettings.startLevel, expDataDepth());
const expDeepest = () => Math.max(expStart(), Math.min(EXP_MAX_LEVEL, expSettings.deepest));
// Ticked processes at the start level
function expChecked() {
  const ex = new Set(expSettings.excluded);
  return expPathsAt(expStart()).filter(p => !ex.has(expKey(p)));
}
// Levels above the start level that are drawn too, top-down
const expParentLvls = () => expSettings.parentLevels.filter(l => l >= 1 && l < expStart()).sort((a, b) => a - b);

// The diagrams to build, one per file: { paths, swim }
// Swimlanes: one per ticked process that has steps. Otherwise one diagram
// with every ticked process, or one per ticked process.
function expDiagramSpecs() {
  if (expType() === 'dashboard') return [];
  if (expTabsOn()) return expTabSpecs();
  const checked = expChecked();
  if (expSwimOn()) {
    return checked.filter(p => { const n = expNodeAt(p); return n && Object.keys(n._children).length; })
      .map(p => ({ paths: [p], swim: true }));
  }
  if (!checked.length) return [];
  if (expFilesMode() === 'parent' && expStart() > 1) {
    // One file per parent: its ticked processes together (with their flow)
    const groups = new Map();
    checked.forEach(p => {
      const k = expKey(p.slice(0, -1));
      if (!groups.has(k)) groups.set(k, { paths: [], parent: p.slice(0, -1) });
      groups.get(k).paths.push(p);
    });
    return Array.from(groups.values());
  }
  if (expFilesMode() !== 'one') return checked.map(p => ({ paths: [p] }));
  return [{ paths: checked }];
}

// All tabs in one file (draw.io): the tabs come from the tab rules, in
// rule order. A rule gives one tab for the whole overview, or one tab per
// process at L1..L3, showing levels f to t. Only processes in line with a
// ticked one (above, at or below it) are drawn. A tab per process shows
// that process (and, when f is higher, its parents) with what is below it.
// Swimlanes: a per-process tab that shows just the process and its steps.
const EXP_TAB_UNITS = [[0, 'Whole overview'], [1, 'Each L1'], [2, 'Each L2'], [3, 'Each L3']];
const expRuleRange = r => 'L' + r.f + (r.t > r.f ? '–L' + r.t : '');
function expTabSpecs() {
  const checked = expChecked();
  if (!checked.length) return [];
  const S = expStart(), swim = expSwimOn();
  const chk = new Set(checked.map(expKey)), up = new Set();
  checked.forEach(p => { for (let i = 1; i <= p.length; i++) up.add(expKey(p.slice(0, i))); });
  const inScope = q => up.has(expKey(q)) || (q.length > S && chk.has(expKey(q.slice(0, S))));
  const codeOf = expCodeOfNow() || expBuildCodeOf('data', expDefaultCodeStart());
  const tabName = p => { const c = codeOf(p); return (c ? c + ' ' : '') + p[p.length - 1]; };
  const rules = expSettings.tabRules, perUnit = {};
  rules.forEach(r => { perUnit[r.u] = (perUnit[r.u] || 0) + 1; });
  const tabs = [];
  rules.forEach(r => {
    // Two rules for the same unit: tell their tabs apart by their levels
    const suffix = perUnit[r.u] > 1 ? ' (' + expRuleRange(r) + ')' : '';
    if (!r.u) {
      tabs.push({ tab: 'overview', id: 'nx-' + tabs.length, name: 'Overview' + suffix, rule: r, paths: checked, inScope });
      return;
    }
    expPathsAt(r.u).filter(inScope).forEach(p => {
      const n = expNodeAt(p);
      const kids = n ? Object.keys(n._children).map(k => p.concat(k)).filter(inScope) : [];
      if (r.t > r.u && !kids.length) return;   // nothing below it to show
      tabs.push({ tab: 'proc', id: 'nx-' + tabs.length, name: tabName(p) + suffix, rule: r, paths: [p], path: p, inScope,
                  swim: swim && r.t === r.u + 1 && r.u >= S && r.f <= r.u });
    });
  });
  return tabs;
}
// The tree a tab draws: levels f..t, in line with a ticked process and,
// for a per-process tab, in line with that process
function expTabTree(spec) {
  const { f, t } = spec.rule, subj = spec.path;
  const related = q => !subj || (q.length <= subj.length ? expKey(subj.slice(0, q.length)) === expKey(q) : expKey(q.slice(0, subj.length)) === expKey(subj));
  const ok = q => spec.inScope(q) && related(q);
  const build = p => {
    const n = expNodeAt(p);
    const node = { _children: {}, _meta: n._meta, _desc: n._desc, _code: n._code, _rowId: n._rowId, _path: p, _name: p[p.length - 1] };
    if (p.length < t) Object.keys(n._children).map(k => p.concat(k)).filter(ok).forEach(c => { node._children[expKey(c)] = build(c); });
    return node;
  };
  const nodes = {};
  expPathsAt(f).filter(ok).forEach(p => { nodes[expKey(p)] = build(p); });
  const depthLevels = [];
  for (let l = f; l <= t; l++) depthLevels.push(l);
  return { nodes, depthLevels };
}

// The tree one diagram draws: the chosen levels above (only processes with
// ticked ones below them; levels not chosen are skipped), the ticked
// processes, and their real steps below down to `deepest`.
function expVirtualTree(paths) {
  const keep = expParentLvls(), start = expStart(), deepest = expDeepest();
  const wrap = (n, p) => ({ _children: n._children, _meta: n._meta, _desc: n._desc, _code: n._code, _rowId: n._rowId, _path: p, _name: p[p.length - 1] });
  const root = {};
  paths.forEach(p => {
    let nodes = root;
    keep.forEach(l => {
      const ap = p.slice(0, l), id = expKey(ap);
      if (!nodes[id]) nodes[id] = Object.assign(wrap(expNodeAt(ap), ap), { _children: {} });
      nodes = nodes[id]._children;
    });
    nodes[expKey(p)] = wrap(expNodeAt(p), p);
  });
  const depthLevels = keep.slice();
  for (let l = start; l <= deepest; l++) depthLevels.push(l);
  return { nodes: root, depthLevels };
}
// Levels that appear in the diagrams (for the Levels rows)
function expShownLevels() {
  if (expTabsOn()) {
    const set = new Set();
    expSettings.tabRules.forEach(r => { for (let l = r.f; l <= r.t; l++) set.add(l); });
    return [...set].sort((a, b) => a - b);
  }
  const out = expParentLvls();
  for (let l = expStart(); l <= expDeepest(); l++) out.push(l);
  return out;
}

// Direct ancestors of a process, top-down, as parent-chain bars (swimlanes)
function expParentChain(path) {
  const chain = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const p = path.slice(0, i + 1);
    chain.push({ key: p[i], nodeObj: expNodeAt(p), abs: levelOffset + i, path: p });
  }
  return chain;
}

// Codes over the whole tree: the first L1 gets `start`, the steps below
// parent.1, parent.2, ...; or the CSV codes with missing ones numbered.
// Returns path → code. With "L1 code in front" off the first part is
// dropped (1.2.1 → 2.1; an L1 process gets no code).
function expBuildCodeOf(mode, start) {
  const map = new Map();
  (function walk(nodes, basePath, parentCode) {
    Object.keys(nodes).forEach((k, i) => {
      const n = nodes[k], p = basePath.concat(k);
      const code = (mode === 'data' && n._code) ? String(n._code)
        : parentCode ? parentCode + '.' + (i + 1) : String(start + i);
      map.set(expKey(p), code);
      walk(n._children, p, code);
    });
  })(tree, [], '');
  const l1 = expSettings.l1Code !== false;
  return path => {
    const c = map.get(expKey(path)) || '';
    if (l1 || !c) return c;
    const i = c.indexOf('.');
    return i < 0 ? '' : c.slice(i + 1);
  };
}
function expCodeOfNow() {
  const s = expSettings, start = parseInt($('expCodeStart').value, 10);
  return s.showCodes ? expBuildCodeOf(s.codeMode, Number.isFinite(start) ? start : 1) : null;
}

function expDefaultCodeStart() {
  const n = tree[Object.keys(tree)[0]];
  const num = parseInt(String((n && n._code) || '').split('.').pop(), 10);
  return Number.isFinite(num) ? num : 1;
}

function sanitizeFileName(s) {
  return String(s).replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90) || 'export';
}
// File name for a diagram: "S&OP - 1.2 Demand review"
function expFileBase(path, codeOf) {
  if (!path.length) return 'All processes';
  const names = path.map(sanitizeFileName);
  const code = codeOf ? codeOf(path) : '';
  if (code) names[names.length - 1] = sanitizeFileName(code) + ' ' + names[names.length - 1];
  return names.join(' - ');
}
// File name and title of one diagram
function expSpecName(spec, codeOf) {
  if (spec.parent) {
    const lvl = expStart();
    return { base: expFileBase(spec.parent, codeOf) + ' (L' + lvl + ')', title: spec.parent[spec.parent.length - 1] };
  }
  if (spec.paths.length === 1) {
    const p = spec.paths[0];
    return { base: expFileBase(p, codeOf) + (spec.swim ? ' (swimlanes)' : ''), title: p[p.length - 1] };
  }
  const lvl = expStart();
  if (lvl === 1 && spec.paths.length === expPathsAt(1).length) return { base: 'All processes', title: 'All processes' };
  const t = 'L' + lvl + ' processes (' + spec.paths.length + ')';
  return { base: t, title: t };
}

// ── Building the diagrams ──
// Lays out the diagrams with the View options. `limit` caps how many are
// built from index `from` (the preview only needs one).
function expBuildItems(limit, from) {
  const s = expSettings;
  const orientations = {}, arrowLevels = [];
  Object.keys(s.levels).forEach(l => {
    orientations[l] = s.levels[l].o;
    if (s.levels[l].a) arrowLevels.push(Number(l));
  });
  const codeOf = expCodeOfNow();
  const specs = expDiagramSpecs();
  const at = from || 0;
  const items = [];
  const keep = expParentLvls();
  (limit ? specs.slice(at, at + limit) : specs).forEach(spec => {
    const names = spec.tab ? { base: spec.name, title: spec.name } : expSpecName(spec, codeOf);
    let result;
    if (spec.tab && !spec.swim) {
      // A tab: the levels of its rule, in line with the ticked processes
      const v = expTabTree(spec);
      result = buildSvgString([], EXP_MAX_LEVEL, orientations, {
        rootNodes: v.nodes, depthLevels: v.depthLevels, arrowLevels, showCodes: s.showCodes, codeOwnLine: s.codePos === 'line',
        direction: s.direction === 'tb' ? 'tb' : 'lr', codeOf: codeOf || undefined,
      });
    } else if (spec.swim) {
      const path = spec.paths[0];
      result = buildSwimlaneSvg(path, {
        laneField: s.laneField, direction: s.direction === 'tb' ? 'tb' : 'lr',
        showCodes: s.showCodes, codeOwnLine: s.codePos === 'line', codeOf: codeOf || undefined,
        parentChain: expParentChain(path).filter(c => spec.tab ? c.abs >= spec.rule.f : keep.includes(c.abs)),
      });
    } else {
      const v = expVirtualTree(spec.paths);
      result = buildSvgString([], EXP_MAX_LEVEL, orientations, {
        rootNodes: v.nodes, depthLevels: v.depthLevels,
        arrowLevels, showCodes: s.showCodes, codeOwnLine: s.codePos === 'line',
        direction: s.direction === 'tb' ? 'tb' : 'lr',
        codeOf: codeOf || undefined,
      });
    }
    if (result) items.push(Object.assign({ result, spec }, names));
  });
  return { items, total: specs.length };
}

// Page proportions per orientation: A4 for images and flowcharts, screen
// proportions for code. null = fit the diagram.
function expRatio() {
  const t = expType(), o = expSettings.orient, screen = t === 'code' || t === 'dashboard';
  if (o === 'landscape') return screen ? 16 / 9 : Math.SQRT2;
  if (o === 'portrait')  return screen ? 3 / 4  : Math.SQRT1_2;
  return null;
}

// Crops a laid-out diagram to its content, adds padding and widens or
// heightens it to the page proportions, keeping the diagram centred.
// Bounding box of a laid-out diagram's content
function expContentBox(result) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y, w, h) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); };
  (result.shapes || []).forEach(sh => grow(sh.x, sh.y, sh.w, sh.h));
  (result.levelTags || []).forEach(t => grow(t.x, t.y, t.w, t.h));
  (result.arrows || []).forEach(a => (a.points || []).forEach(p => grow(p[0], p[1], 0, 0)));
  if (result.swim) grow(result.swim.pool.x, result.swim.pool.y, result.swim.pool.w, result.swim.pool.h);
  if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = result.svgW; y1 = result.svgH; }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

// `shared` ({w, h}): a content size to frame for instead of the diagram's
// own (Same size); `align` 'topleft' puts the diagram top left, 'topcenter' at
// the top and centred horizontally, else centred.
function expFrame(result, ratio, pad, shared, align) {
  const { x0, y0, w: bw, h: bh } = expContentBox(result);
  let W = Math.max(bw, shared ? shared.w : 0) + 2 * pad, H = Math.max(bh, shared ? shared.h : 0) + 2 * pad;
  if (ratio) { if (W / H < ratio) W = H * ratio; else H = W / ratio; }
  W = Math.ceil(W); H = Math.ceil(H);
  const left = shared && align === 'topleft';
  const top = shared && (align === 'topleft' || align === 'topcenter');
  const dx = Math.round(left ? pad - x0 : (W - bw) / 2 - x0);
  const dy = Math.round(top ? pad - y0 : (H - bh) / 2 - y0);
  const inner = result.svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    .replace(/<rect width="[^"]*" height="[^"]*" fill="none"\/>/, '');
  return {
    inner, dx, dy, svgW: W, svgH: H,
    shapes: (result.shapes || []).map(sh => Object.assign({}, sh, { x: sh.x + dx, y: sh.y + dy })),
    levelTags: (result.levelTags || []).map(t => Object.assign({}, t, { x: t.x + dx, y: t.y + dy })),
    arrows: (result.arrows || []).map(a => Object.assign({}, a, { x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy },
      a.points ? { points: a.points.map(p => [p[0] + dx, p[1] + dy]) } : {})),
    swim: result.swim ? Object.assign({}, result.swim, {
      pool: Object.assign({}, result.swim.pool, { x: result.swim.pool.x + dx, y: result.swim.pool.y + dy }),
      lanes: result.swim.lanes.map(l => Object.assign({}, l, { x: l.x + dx, y: l.y + dy })),
    }) : null,
  };
}

// Same size: the largest content box over all files of the export (null
// when off, not an image or code export, or only one file). Cached per
// settings; cleared when the export window opens.
let expSharedCache = null;
const expSameSizeOn = () => expSettings.sameSize === 'on' && ['image', 'code'].includes(expType());
function expSharedBox() {
  if (!expSameSizeOn()) return null;
  const key = JSON.stringify(expSettings) + '|' + $('expCodeStart').value;
  if (expSharedCache && expSharedCache.key === key) return expSharedCache.box;
  const { items } = expBuildItems();
  let box = null;
  if (items.length > 1) {
    box = { w: 0, h: 0 };
    items.forEach(it => { const b = expContentBox(it.result); box.w = Math.max(box.w, b.w); box.h = Math.max(box.h, b.h); });
  }
  expSharedCache = { key, box };
  return box;
}

function expFramed(result) {
  const t = expType();
  const pad = t === 'image' ? Math.max(0, Math.min(400, Number(expSettings.image.padding) || 0))
    : t === 'flowchart' ? 40 : 24;
  const shared = expSharedBox();
  const fr = expFrame(result, expRatio(), pad, shared, expSettings.align);
  fr.sameSize = !!shared;
  if (t === 'flowchart') {
    const o = expSettings.orient;
    fr.pageOrient = o === 'auto' ? (fr.svgW >= fr.svgH ? 'landscape' : 'portrait') : o;
  }
  return fr;
}

// SVG markup of a framed diagram; the diagram itself sits in <g id="d">
function expSvgMarkup(fr, scale, bg, attrs) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(fr.svgW * scale) + '" height="' +
    Math.round(fr.svgH * scale) + '" viewBox="0 0 ' + fr.svgW + ' ' + fr.svgH + '"' + (attrs || '') + '>\n' +
    (bg ? '  <rect width="' + fr.svgW + '" height="' + fr.svgH + '" fill="' + bg + '"/>\n' : '') +
    '  <g id="d" transform="translate(' + fr.dx + ',' + fr.dy + ')">' + fr.inner + '</g>\n</svg>\n';
}
const expImageBg = () => expSettings.image.bg === 'white' ? '#ffffff' : null;
function expSvgFile(fr) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + expSvgMarkup(fr, expSettings.image.scale, expImageBg());
}

const EXP_CANVAS_MAX = 16384, EXP_CANVAS_AREA = 16384 * 16384 / 2;
const expPngTooBig = (w, h) => w > EXP_CANVAS_MAX || h > EXP_CANVAS_MAX || w * h > EXP_CANVAS_AREA;

// Framed diagram → PNG at the chosen scale; null if the browser can't
function expPngBlob(fr) {
  const scale = expSettings.image.scale, bg = expImageBg();
  const w = Math.round(fr.svgW * scale), h = Math.round(fr.svgH * scale);
  if (expPngTooBig(w, h)) return Promise.resolve(null);
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(null); return; }
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
    const url = URL.createObjectURL(new Blob([expSvgMarkup(fr, scale, null)], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload  = () => { ctx.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); canvas.toBlob(b => resolve(b), 'image/png'); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// ── Code: HTML page, interactive dashboard ──
const expJsonForScript = v => JSON.stringify(v).replace(/</g, '\\u003c');

// Size of the embedded page: fixed pixels, or 100% wide at the given proportions
function expCodeSize(ratio) {
  const c = expSettings.code;
  const w = Math.max(200, Math.min(4000, Math.round(Number(c.width) || 960)));
  return { fixed: c.size === 'fixed', w, h: Math.round(w / ratio), ratio };
}
function expCodeRatio(fr) {
  return expRatio() || (fr ? fr.svgW / fr.svgH : 16 / 9);
}

// ── Hover card: shared by the HTML export, the dashboards and the app ──
// A card with the process name and all of its filled-in fields. `big`
// gives the larger, easier to read version used by the dashboards.
function hoverCardCss(big) {
  const k = big ? 1.3 : 1;
  const px = v => Math.round(v * k * 10) / 10 + 'px';
  return '.hcard{position:fixed;z-index:1000;max-width:min(' + px(340) + ',calc(100vw - 16px));min-width:' + px(200) + ';box-sizing:border-box;' +
    'background:#fff;color:#1f2a1f;border:1px solid #d5dfd3;border-radius:' + px(10) + ';box-shadow:0 8px 24px rgba(20,40,20,.16);' +
    'padding:' + px(12) + ' ' + px(14) + ';font-size:' + px(12.5) + ';line-height:1.45;text-align:left;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;' +
    'pointer-events:none;opacity:0;transition:opacity .1s;max-height:calc(100vh - 16px);overflow:auto;overscroll-behavior:contain}\n' +
    '.hcard.show{opacity:1;pointer-events:auto}\n' +
    '.hcard h3{margin:0 0 ' + px(8) + ';font-size:' + px(14) + ';line-height:1.3;font-weight:650;color:#1c3620;overflow-wrap:anywhere}\n' +
    '.hcard dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:' + px(4) + ' ' + px(12) + '}\n' +
    '.hcard dt{color:#6a776a;white-space:nowrap}\n' +
    '.hcard dd{margin:0;overflow-wrap:anywhere;white-space:pre-line}\n' +
    '.hcard .none{color:#8a948a;font-style:italic}\n' +
    '.hcard .hint{margin-top:' + px(10) + ';padding-top:' + px(8) + ';border-top:1px solid #e6ece4;color:#4d6b4d;font-size:' + px(11.5) + '}\n';
}
// Fills the card for n = { t: title, f: [[label, value], ...], hint }.
// Self-contained: its source is also written into exported pages.
function hoverCardFill(card, n) {
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var h = '<h3>' + esc(n.t) + '</h3>';
  if (n.f.length) { h += '<dl>'; n.f.forEach(function (r) { h += '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }); h += '</dl>'; }
  else h += '<div class="none">No details</div>';
  if (n.hint) h += '<div class="hint">' + esc(n.hint) + '</div>';
  card.innerHTML = h;
}
// Hover card behaviour. Self-contained too (written into exported pages).
// With a mouse the card appears after a short delay, right against the
// process, and goes away as soon as the pointer leaves both.
// o: { root, find(target) -> el|null, data(el, touch) -> { t, f, hint },
//      delay, id, tap: 'show' | 'open' | 'none', clickShows,
//      opens(el) -> bool, open(el) }
function hoverCardKit(o) {
  var card = document.createElement('div');
  card.className = 'hcard'; card.setAttribute('role', 'tooltip');
  if (o.id) card.id = o.id;
  document.body.appendChild(card);
  var on = null, pend = null, timer = 0, held = false, touch = false, keyboard = false;
  var delay = o.delay == null ? 1000 : o.delay;
  function inside(box, n) { return !!(n && box && box.contains(n)); }
  function place(el) {
    var r = el.getBoundingClientRect(), m = 8, w = card.offsetWidth, h = card.offsetHeight,
        W = window.innerWidth, H = window.innerHeight;
    // Right against the process (1px overlap) so the pointer can move onto the card
    var t = r.bottom - 1;
    if (t + h > H - m) t = r.top - h + 1 >= m ? r.top - h + 1 : Math.max(m, H - h - m);
    card.style.top = t + 'px';
    card.style.left = Math.max(m, Math.min(W - w - m, r.left + r.width / 2 - w / 2)) + 'px';
  }
  function show(el) {
    clearTimeout(timer); pend = null;
    if (on && on !== el) on.classList.remove('hc-on');
    on = el; el.classList.add('hc-on');
    hoverCardFill(card, o.data(el, touch));
    card.classList.add('show');
    place(el);
  }
  function hide() {
    clearTimeout(timer); pend = null; held = false;
    if (on) on.classList.remove('hc-on');
    on = null; card.classList.remove('show');
  }
  function later(el) {
    if (pend === el || on === el) return;
    clearTimeout(timer); pend = el;
    timer = setTimeout(function () { if (pend === el && document.body.contains(el)) show(el); }, delay);
  }
  document.addEventListener('pointerdown', function (e) { touch = e.pointerType !== 'mouse'; keyboard = false; }, true);
  document.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') touch = false; }, true);
  document.addEventListener('keydown', function () { keyboard = true; }, true);
  o.root.addEventListener('mouseover', function (e) {
    if (touch || held) return;
    var el = o.find(e.target);
    if (!el) return;
    if (on && on !== el) hide();
    later(el);
  });
  o.root.addEventListener('mouseout', function (e) {
    if (touch || held) return;
    var el = o.find(e.target), rt = e.relatedTarget;
    if (!el || inside(el, rt)) return;
    if (on === el && inside(card, rt)) return;
    hide();
  });
  card.addEventListener('mouseout', function (e) {
    var rt = e.relatedTarget;
    if (touch || held || inside(card, rt) || inside(on, rt)) return;
    hide();
  });
  card.addEventListener('click', function (e) {
    e.stopPropagation();
    // Tapping the card of a process with steps opens it
    if (o.tap === 'open' && on && o.opens && o.opens(on) && o.open) { var el = on; hide(); o.open(el); }
  });
  // Capture phase: decides before the process's own click
  o.root.addEventListener('click', function (e) {
    var el = o.find(e.target);
    if (!el || (e.target.closest && e.target.closest('a, button'))) return;
    var opens = !!(o.opens && o.opens(el));
    if (touch && o.tap && o.tap !== 'none') {
      if (held && on === el) { hide(); if (opens && o.tap === 'open') return; }
      else { show(el); held = true; }
      e.stopPropagation(); e.preventDefault();
      return;
    }
    if (opens || !o.clickShows) { hide(); return; }
    show(el);
  }, true);
  o.root.addEventListener('focusin', function (e) {
    var el = o.find(e.target);
    if (el && keyboard && !held) show(el);
  });
  o.root.addEventListener('focusout', function (e) {
    if (!held && on && !inside(on, e.relatedTarget) && !inside(card, e.relatedTarget)) hide();
  });
  document.addEventListener('click', function (e) {
    if (held && !inside(card, e.target) && o.find(e.target) !== on) hide();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' || e.key === 'Enter') hide(); });
  window.addEventListener('scroll', function (e) {
    if (inside(card, e.target)) return;
    if (held && on) place(on); else hide();
  }, true);
  window.addEventListener('resize', hide);
  return { hide: hide };
}
// Card rows for a node: all filled-in fields except the name (the title)
const hoverCardRows = sh => exportDataRows(sh).filter(([k]) => k !== 'Name').map(([, label, v]) => [label, String(v).trim()]);

// One self-contained HTML page with the diagram. Hovering (or tapping) a
// process shows a card with all of its filled-in data.
function expStaticHtml(fr, title, size) {
  const data = fr.shapes.map(sh => ({ t: sh.name || sh.text, f: hoverCardRows(sh) }));
  const frameCss = size.fixed
    ? '.frame{width:' + size.w + 'px;height:' + size.h + 'px;margin:0 auto}'
    : '.frame{width:100%;height:100%}';
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + escHtml(title) + '</title>\n<style>\n' +
    'html,body{margin:0;height:100%;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}\n' +
    frameCss + '\n' +
    '.frame svg{display:block;width:100%;height:100%}\n' +
    '#d rect:not(.sl){cursor:pointer;transition:filter .12s}\n#d rect:not(.sl):hover,#d rect.hc-on{filter:brightness(.93)}\n' +
    '#d text{pointer-events:none}\n' +
    hoverCardCss(false) +
    '</style>\n</head>\n<body>\n<div class="frame">\n' +
    expSvgMarkup(fr, 1, '#ffffff', ' preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + escHtml(title) + '"') +
    '</div>\n<div class="hcard" id="card" role="tooltip"></div>\n' +
    '<script>\n(function () {\n' +
    '  var D = ' + expJsonForScript(data) + ';\n' +
    '  var rects = document.querySelectorAll("#d rect:not(.sl)");\n' +
    '  function idx(r) { return Array.prototype.indexOf.call(rects, r); }\n' +
    '  ' + hoverCardFill.toString() + '\n' +
    '  ' + hoverCardKit.toString() + '\n' +
    '  hoverCardKit({ root: document, tap: "show", clickShows: true,\n' +
    '    find: function (t) { var r = t && t.closest ? t.closest("#d rect:not(.sl)") : null; return r && D[idx(r)] ? r : null; },\n' +
    '    data: function (r) { var n = D[idx(r)]; return { t: n.t, f: n.f }; } });\n' +
    '})();\n</' + 'script>\n</body>\n</html>\n';
}

// All tabs in one HTML file: a tab bar on top and a diagram per tab, in
// the order of the tab rules. Hovering (or tapping) a process shows its
// card. With navigation on, a block with its own tab opens it (small
// arrow in its corner) and a tab opened that way gets a ↑ Back button;
// the browser's Back button works too. `start`: the tab shown first.
function expHtmlTabsDoc(title, start) {
  const { items, linkOf, backOf } = expTabLinks();
  if (!items.length) return null;
  const at = new Map(items.map((it, i) => [it.spec.id, i]));
  const frs = items.map(it => expFramed(it.result));
  const sizes = frs.map(fr => expCodeSize(expCodeRatio(fr)));
  const fixed = sizes[0].fixed;
  const T = items.map((it, i) => {
    const back = backOf(it.spec);
    return {
      id: it.spec.id, n: it.title, b: back ? at.get(back.id) : -1,
      d: frs[i].shapes.map(sh => {
        const to = linkOf(i, sh);
        return { t: sh.name || sh.text, f: hoverCardRows(sh), g: to ? at.get(to.id) : -1 };
      }),
    };
  });
  const sections = items.map((it, i) => {
    const fr = frs[i], sz = sizes[i];
    // Small arrow in the top right corner of a block that opens a tab
    const arrows = fr.shapes.map((sh, k) => T[i].d[k].g < 0 ? '' :
      '<text x="' + Math.round(sh.x + sh.w - 12) + '" y="' + Math.round(sh.y + 13) + '" class="go" fill="' + sh.stroke +
      '" font-size="13" font-weight="700" text-anchor="middle" dominant-baseline="central">↗</text>').join('');
    const svg = expSvgMarkup(fr, 1, '#ffffff', ' preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + escHtml(it.title) + '"')
      .replace('<g id="d"', '<g class="d"').replace(/<\/svg>\s*$/, arrows + '</svg>');
    return '<section class="tab" id="' + escHtml(it.spec.id) + '" role="tabpanel" aria-label="' + escHtml(it.title) + '" hidden>' +
      '<div class="frame"' + (fixed ? ' style="width:' + sz.w + 'px;height:' + sz.h + 'px"' : '') + '>\n' + svg + '</div></section>\n';
  }).join('');
  const tabs = items.map((it, i) => '<button type="button" role="tab" data-i="' + i + '">' + escHtml(it.title) + '</button>').join('');
  const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + escHtml(title) + '</title>\n<style>\n' +
    'html,body{margin:0;height:100%;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}\n' +
    'body{display:flex;flex-direction:column}\n' +
    '.bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #e2e8e0;background:#f7f9f6;flex:none}\n' +
    '.tabs{display:flex;gap:4px;overflow-x:auto;flex:1;min-width:0;scrollbar-width:thin}\n' +
    '.tabs button,.back{font:inherit;font-size:13px;white-space:nowrap;border:1px solid transparent;border-radius:7px;padding:5px 11px;background:none;color:#475569;cursor:pointer}\n' +
    '.tabs button:hover{background:#eef2ec}\n' +
    '.tabs button[aria-selected="true"]{background:#fff;border-color:#cbd5e1;color:#1c3620;font-weight:600}\n' +
    '.back{border-color:#cbd5e1;background:#fff;flex:none}\n.back:hover{background:#eef2ec}\n' +
    'main{flex:1;min-height:0;overflow:auto}\n' +
    (fixed ? '.frame{margin:0 auto}\n' : '.tab{height:100%}\n.frame{width:100%;height:100%}\n') +
    '.frame svg{display:block;width:100%;height:100%}\n' +
    '.d rect:not(.sl){cursor:pointer;transition:filter .12s}\n.d rect:not(.sl):hover,.d rect.hc-on{filter:brightness(.93)}\n' +
    '.d text,text.go{pointer-events:none}\n' +
    hoverCardCss(false) +
    '</style>\n</head>\n<body>\n' +
    '<header class="bar"><button type="button" class="back" id="back" hidden>↑ Back</button>' +
    '<nav class="tabs" role="tablist" aria-label="Tabs">' + tabs + '</nav></header>\n<main>\n' + sections + '</main>\n' +
    '<script>\n(function () {\n' +
    '  var T = ' + expJsonForScript(T) + ';\n' +
    '  var START = ' + (Math.max(0, Math.min(items.length - 1, start || 0))) + ';\n' +
    '  var secs = document.querySelectorAll("section.tab"), btns = document.querySelectorAll(".tabs button"), back = document.getElementById("back"), cur = -1;\n' +
    '  Array.prototype.forEach.call(secs, function (s, ti) {\n' +
    '    Array.prototype.forEach.call(s.querySelectorAll(".d rect:not(.sl)"), function (r, ri) { r.setAttribute("data-t", ti); r.setAttribute("data-r", ri); });\n' +
    '  });\n' +
    '  function show(i, push) {\n' +
    '    if (i < 0 || i >= T.length) return;\n' +
    '    cur = i;\n' +
    '    Array.prototype.forEach.call(secs, function (s, k) { s.hidden = k !== i; });\n' +
    '    Array.prototype.forEach.call(btns, function (b, k) { b.setAttribute("aria-selected", k === i ? "true" : "false"); if (k === i && b.scrollIntoView) b.scrollIntoView({ block: "nearest", inline: "nearest" }); });\n' +
    '    var b = T[i].b; back.hidden = b < 0; back.title = b < 0 ? "" : "Back to " + T[b].n;\n' +
    '    document.querySelector("main").scrollTop = 0;\n' +
    '    if (push) { try { history.pushState({ t: i }, "", "#" + T[i].id); } catch (e) {} }\n' +
    '  }\n' +
    '  function fromHash() { var h = decodeURIComponent(location.hash.slice(1)); for (var i = 0; i < T.length; i++) if (T[i].id === h) return i; return -1; }\n' +
    '  window.addEventListener("popstate", function (e) { var i = e.state && typeof e.state.t === "number" ? e.state.t : fromHash(); show(i < 0 ? START : i); });\n' +
    '  Array.prototype.forEach.call(btns, function (b, k) { b.addEventListener("click", function () { if (k !== cur) show(k, true); }); });\n' +
    '  back.addEventListener("click", function () { if (cur >= 0 && T[cur].b >= 0) show(T[cur].b, true); });\n' +
    '  function node(r) { var t = T[+r.getAttribute("data-t")]; return t && t.d[+r.getAttribute("data-r")]; }\n' +
    '  function find(t) { var r = t && t.closest ? t.closest(".d rect:not(.sl)") : null; return r && node(r) ? r : null; }\n' +
    '  ' + hoverCardFill.toString() + '\n' +
    '  ' + hoverCardKit.toString() + '\n' +
    '  hoverCardKit({ root: document, tap: "open", clickShows: true, find: find,\n' +
    '    data: function (r, touch) { var n = node(r); return { t: n.t, f: n.f, hint: n.g < 0 ? "" : (touch ? "Tap again to open " : "Click to open ") + T[n.g].n }; },\n' +
    '    opens: function (r) { return node(r).g >= 0; },\n' +
    '    open: function (r) { show(node(r).g, true); } });\n' +
    '  document.addEventListener("click", function (e) { var r = find(e.target); if (r && node(r).g >= 0) show(node(r).g, true); });\n' +
    '  var h = fromHash(); show(h < 0 ? START : h);\n' +
    '})();\n</' + 'script>\n</body>\n</html>\n';
  return { html, frs, sizes };
}

// The whole Nexus page with the data built in (as "Save" does)
// opts.simple: the simplified view (only the process, details in a large hover card)
function buildStandaloneHtml(opts) {
  const simple = !!(opts && opts.simple);
  const raw = (_sessionData ? _sessionData.raw : null) ||
    (window.__PF_EMBED__ ? window.__PF_EMBED__.d : null);
  const sig = (_sessionData ? _sessionData.sig : null) ||
    (window.__PF_EMBED__ ? window.__PF_EMBED__.s : null);
  if (!raw || !sig) return null;

  // Clone the live DOM — no fetch needed, works on file:// URLs
  const clone = document.documentElement.cloneNode(true);
  const resizer = clone.querySelector('#hierResizer');
  if (resizer) resizer.remove();
  // Closed modals, and no export preview inside the saved page
  clone.querySelector('#exportModal').className = 'exp-overlay hidden';
  clone.querySelector('#expPreview').innerHTML = '';
  clone.querySelector('#expCodeBox').textContent = '';
  clone.querySelector('#ctrlPanel').className = 'hidden';
  clone.querySelector('#shortcutsDropdown').classList.add('hidden');
  clone.querySelector('#importOverlay').className = 'imp-overlay hidden';
  clone.classList.toggle('pf-simple', simple);
  ['#pfHoverCard', '#pfHoverCss'].forEach(sel => { const n = clone.querySelector(sel); if (n) n.remove(); });

  const topKeys = Object.keys(tree);
  const dt = new Date();
  const rows = JSON.parse(raw);
  const count = k => new Set(rows.map(r => r[k]).filter(Boolean)).size;
  const meta = {
    name: topKeys.length ? topKeys[0] : 'ProcessFlow',
    savedAt: dt.toISOString(),
    rows: rows.length,
    l1Count: count('L1'), l2Count: count('L2'), l3Count: count('L3'), l4Count: count('L4'),
    // Preserve original creation date if re-saving
    createdAt: (window.__PF_EMBED__ && window.__PF_EMBED__.meta && window.__PF_EMBED__.meta.createdAt)
      || dt.toISOString()
  };
  clone.querySelector('#pfEmbedData').textContent =
    'window.__PF_EMBED__=' + JSON.stringify(Object.assign(simple ? { d: raw, s: sig, meta, v: 'simple' } : { d: raw, s: sig, meta }, appFlowStyle === 'linear' ? { f: 'linear' } : {})).replace(/<\//g, '<\\/') + ';';

  const dateStr = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getDate()).padStart(2, '0');
  return { html: '<!DOCTYPE html>\n' + clone.outerHTML, dateStr };
}

// ── Current output: what the preview shows and the buttons deliver ──
let expOut = null;          // { kind, total, ... } for the current options
let expDashCache = null;    // dashboard HTML, built once per opening
let expPreviewUrl = null;
let expPreviewTimer = null;

// Builds the single output that the preview shows (one diagram)
function expBuildOutput() {
  const t = expType();
  if (t === 'dashboard') {
    const view = expSettings.dashView === 'simple' ? 'simple' : 'full';
    expDashCache = expDashCache || {};
    if (!expDashCache[view]) expDashCache[view] = buildStandaloneHtml({ simple: view === 'simple' });
    const dash = expDashCache[view];
    if (!dash) return { empty: 'No data to export' };
    const ratio = expCodeRatio(null), size = expCodeSize(ratio);
    size.view = { w: 960, h: Math.round(960 / ratio) };
    const title = view === 'simple' ? 'Process overview' : 'Process dashboard';
    return { kind: 'html', total: 1, html: dash.html, size, base: title + ' ' + dash.dateStr, title, text: dash.html };
  }
  if (!expChecked().length) return { empty: 'Tick at least one process' };
  const { items, total } = expBuildItems(1, expPvAt(expSpecCount()));
  if (expTabsOn() && items.length) {
    // One file with several tabs: the preview shows the chosen tab
    const it = items[0];
    const base = expSpecName({ paths: expChecked() }, expCodeOfNow()).base;
    if (t === 'code') {
      // The whole page; the preview opens on the chosen tab, the file on the first
      const doc = expHtmlTabsDoc(base, 0), at = Math.min(expPvIndex, doc.frs.length - 1);
      const pvHtml = doc.html.replace('  var START = 0;\n', '  var START = ' + at + ';\n');
      const fr = doc.frs[at], size = Object.assign({}, doc.sizes[at]);
      const BAR = 46;
      if (size.fixed) size.view = { w: size.w, h: size.h + BAR };
      else size.view = { w: 960, h: Math.round(960 / size.ratio) + BAR };
      return { kind: 'html', total: 1, tabs: total, html: pvHtml, size, fr, base: base + ' (tabs)', title: base, text: doc.html, file: doc.html };
    }
    return { kind: t, total: 1, tabs: total, fr: expFramed(it.result), base: base + ' (tabs)', title: it.title };
  }
  if (!items.length) return { empty: expSwimOn() ? 'The ticked processes have no steps to put in lanes' : 'Nothing to export' };
  const it = items[0], fr = expFramed(it.result);
  if (t === 'code') {
    const size = expCodeSize(expCodeRatio(fr));
    const html = expStaticHtml(fr, it.title, size);
    if (!size.fixed) size.view = { w: 960, h: Math.round(960 / size.ratio) };
    return { kind: 'html', total, html, size, fr, base: it.base, title: it.title, text: html };
  }
  return { kind: t, total, fr, base: it.base, title: it.title };
}
// Names and titles of every file, without laying the diagrams out
function expFileEntries() {
  const codeOf = expCodeOfNow();
  return expDiagramSpecs().map(spec => spec.tab ? { base: spec.name, title: spec.name } : expSpecName(spec, codeOf));
}
// One file of several: its text (HTML, draw.io XML) or null
function expItemText(i) {
  const { items } = expBuildItems(1, i);
  if (!items.length) return null;
  const it = items[0], fr = expFramed(it.result), fmt = expFmt();
  if (fmt === 'html')   return expStaticHtml(fr, it.title, expCodeSize(expCodeRatio(fr)));
  if (fmt === 'drawio') return buildDrawioXml(fr, it.title);
  return null;
}
// One file of several, ready to save
async function expItemBlob(i) {
  const fmt = expFmt();
  if (fmt === 'html' || fmt === 'drawio') {
    const text = expItemText(i);
    return text == null ? null : new Blob([text], { type: fmt === 'html' ? 'text/html' : 'application/xml' });
  }
  const { items } = expBuildItems(1, i);
  if (!items.length) return null;
  return expFileBlob(expFramed(items[0].result), items[0].title);
}
const expItemExt = () => expFmt() === 'html' ? '.html' : EXPORT_EXT[expFmt()];
const expCanCopyItems = () => ['html', 'drawio'].includes(expFmt());

// Lists the files when there are several, each with its own buttons
function expRenderFileList(out) {
  const box = $('expFiles'), list = $('expFilesList');
  if (!out || (out.total < 2 && !out.tabs)) { box.hidden = true; list.innerHTML = ''; return; }
  const tabs = !!out.tabs;
  const entries = expFileEntries(), ext = tabs ? '' : expItemExt(), canCopy = !tabs && expCanCopyItems();
  box.hidden = false;
  $('expFilesCount').textContent = tabs ? entries.length + ' tabs in one file' : entries.length + ' files';
  $('expFilesSub').textContent = tabs ? 'Click a tab to preview it' : 'Click a name to preview it';
  list.innerHTML = '';
  const flash = (b, txt) => {
    b.textContent = txt; b.classList.add('done');
  };
  entries.forEach((e, i) => {
    const li = document.createElement('li');
    li.classList.toggle('active', i === expPvIndex);
    const name = document.createElement('button');
    name.type = 'button'; name.className = 'exp-file-name';
    name.textContent = e.base + ext; name.title = e.title;
    name.addEventListener('click', () => { expPvIndex = i; expSchedulePreview(); });
    li.appendChild(name);
    if (canCopy) {
      const cp = document.createElement('button');
      cp.type = 'button'; cp.className = 'exp-file-copy'; cp.textContent = 'Copy';
      cp.setAttribute('aria-label', 'Copy ' + e.base + ext);
      cp.addEventListener('click', async () => {
        const text = expItemText(i);
        const ok = text != null && await expCopyText(text);
        showExportToast(ok ? (expFmt() === 'html' ? 'HTML' : 'draw.io XML') + ' copied' : 'Copy failed: use Download instead');
        if (ok) {
          flash(cp, 'Copied ✓');
          setTimeout(() => { if (cp.textContent === 'Copied ✓') { cp.textContent = 'Copy'; cp.classList.remove('done'); } }, 1600);
        }
      });
      li.appendChild(cp);
    }
    if (tabs) { list.appendChild(li); return; }
    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 'exp-file-dl'; dl.textContent = 'Download';
    dl.setAttribute('aria-label', 'Download ' + e.base + ext);
    dl.addEventListener('click', async () => {
      const blob = await expItemBlob(i);
      if (!blob) { showExportToast('Export failed: diagram too large at this scale'); return; }
      saveBlob(blob, e.base + ext);
      flash(dl, 'Downloaded ✓');
    });
    li.appendChild(dl);
    list.appendChild(li);
  });
  const act = list.children[expPvIndex];
  if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
}

// Which of several files the preview shows
let expPvIndex = 0;
const expSpecCount = () => expDiagramSpecs().length;
const expPvAt = n => (expPvIndex = Math.max(0, Math.min(expPvIndex, n - 1)));

function expSchedulePreview() {
  clearTimeout(expPreviewTimer);
  expPreviewTimer = setTimeout(expRenderPreview, 60);
}

function expFitInto(pane, w, h, maxScale) {
  const pw = Math.max(40, pane.clientWidth - 24), ph = Math.max(40, pane.clientHeight - 24);
  return Math.min(pw / w, ph / h, maxScale || 1);
}

function expRenderPreview() {
  if (exportModal.classList.contains('hidden')) return;
  const pv = $('expPreview'), meta = $('expPreviewMeta'), box = $('expCodeBox');
  if (expPreviewUrl) { URL.revokeObjectURL(expPreviewUrl); expPreviewUrl = null; }
  let out;
  try { out = expBuildOutput(); } catch (err) { console.error(err); out = { empty: 'Preview failed' }; }
  expOut = out.empty ? null : out;
  expRenderFileList(expOut);
  pv.className = 'exp-preview';
  box.value = '';
  if (out.empty) {
    pv.innerHTML = '<div class="exp-pv-empty">' + escHtml(out.empty) + '</div>';
    meta.textContent = '';
    expUpdateActions();
    return;
  }
  const fmt = expFmt();
  if (out.kind === 'image' || out.kind === 'flowchart') {
    const fr = out.fr;
    const isImage = out.kind === 'image';
    const bg = isImage ? expImageBg() : '#ffffff';
    if (isImage && !bg) pv.classList.add('is-checker');
    if (!isImage) pv.classList.add('is-page');
    const k = expFitInto(pv, fr.svgW, fr.svgH, 1);
    pv.innerHTML = '<div class="exp-pv-sheet">' + expSvgMarkup(fr, 1, bg) + '</div>';
    const svg = pv.querySelector('svg');
    svg.setAttribute('width', Math.max(1, Math.round(fr.svgW * k)));
    svg.setAttribute('height', Math.max(1, Math.round(fr.svgH * k)));
    const more = out.tabs ? ' · tab ' + (expPvIndex + 1) + ' of ' + out.tabs + ' in one file'
      : out.total > 1 ? ' · file ' + (expPvIndex + 1) + ' of ' + out.total : '';
    if (isImage) {
      const sc = expSettings.image.scale, w = Math.round(fr.svgW * sc), h = Math.round(fr.svgH * sc);
      const big = fmt === 'png' && expPngTooBig(w, h) ? ' · too large for PNG at ' + sc + 'x, pick a smaller scale or SVG' : '';
      meta.textContent = fmt.toUpperCase() + ' · ' + w + ' × ' + h + ' px' + (fr.sameSize ? ' · same size for all files' : '') + more + big;
      meta.classList.toggle('is-warn', !!big);
    } else {
      const o = fr.pageOrient === 'portrait' ? 'Portrait' : 'Landscape';
      const lab = fmt === 'vsdx' ? 'Visio' : 'draw.io';
      meta.textContent = lab + ' · ' + o + ' page' + (expSettings.orient === 'auto' ? ' sized to the diagram' : ' (A4 proportions)') +
        ' · ' + (fr.swim ? fr.swim.lanes.length + ' lane' + (fr.swim.lanes.length === 1 ? '' : 's') + ', ' : '') +
        fr.shapes.length + ' shapes' + (fr.arrows.length ? ', ' + fr.arrows.length + ' connectors' : '') + more;
      meta.classList.remove('is-warn');
    }
  } else {
    // Code: the page itself, at its real size and scaled down to fit
    const v = out.size.view || { w: out.size.w, h: out.size.h };
    const k = expFitInto(pv, v.w, v.h, 1);
    expPreviewUrl = URL.createObjectURL(new Blob([out.html], { type: 'text/html' }));
    pv.innerHTML = '<div class="exp-pv-frame" style="width:' + Math.round(v.w * k) + 'px;height:' + Math.round(v.h * k) + 'px">' +
      '<iframe title="Export preview" style="width:' + v.w + 'px;height:' + v.h + 'px;transform:scale(' + k + ')"></iframe></div>';
    pv.querySelector('iframe').src = expPreviewUrl;
    const kb = Math.round(out.html.length / 1024);
    const sizeTxt = out.size.fixed ? out.size.w + ' × ' + out.size.h + ' px' : '100% width';
    meta.classList.remove('is-warn');
    meta.textContent = 'HTML · ' + sizeTxt + (out.fr && out.fr.sameSize ? ' · same size for all files' : '') + (out.tabs ? ' · tab ' + (expPvIndex + 1) + ' of ' + out.tabs + ' in one file, ' : out.total > 1 ? ' · file ' + (expPvIndex + 1) + ' of ' + out.total + ', ' : ' · one file, ') + kb + ' KB' +
      (expType() === 'dashboard' && expSettings.dashView !== 'simple' ? '' : ' · hover a process for its details');
    const MAX = 20000;
    box.value = out.text.length > MAX
      ? out.text.slice(0, MAX) + '\n\n… (' + kb + ' KB in total; Copy and Download give the full file)'
      : out.text;
  }
  expUpdateActions();
}

const EXP_ACTIONS = {
  svg:    { copy: 'Copy SVG',     dl: 'Download SVG' },
  png:    { copy: 'Copy image',   dl: 'Download PNG' },
  drawio: { copy: 'Copy XML',     dl: 'Download .drawio' },
  vsdx:   { copy: null,           dl: 'Download .vsdx' },
  html:   { copy: 'Copy HTML',    dl: 'Download HTML' },
};
function expUpdateActions() {
  const fmt = expFmt(), a = EXP_ACTIONS[fmt], go = $('btnExpGo'), cp = $('btnExpCopy');
  const n = expOut ? expOut.total : 0, blocked = !expOut;
  go.textContent = n > 1 ? 'Download all ' + n + ' files (.zip)' : a.dl;
  go.disabled = blocked || n === 0;
  cp.hidden = !a.copy || n > 1;
  cp.textContent = a.copy || '';
  cp.disabled = blocked || n !== 1 || (fmt === 'png' && !window.ClipboardItem);
  $('expActionNote').textContent = n > 1 && expCanCopyItems() ? 'Copy a file from the list under the preview' : '';
}

// ── Rendering the options ──
function expBuildSeg(el, options, current, onPick) {
  el.innerHTML = '';
  options.forEach(([v, label]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.v = v; b.textContent = label;
    b.classList.toggle('active', v === current);
    b.setAttribute('aria-pressed', v === current ? 'true' : 'false');
    b.addEventListener('click', () => onPick(v));
    el.appendChild(b);
  });
}

function expBuildStartSeg() {
  const opts = [];
  for (let l = 1; l <= expDataDepth(); l++) opts.push([String(l), 'L' + l]);
  expBuildSeg($('expStartSeg'), opts, String(expStart()), v => {
    expSettings.startLevel = Number(v);
    if (expSettings.deepest < expSettings.startLevel) expSettings.deepest = expSettings.startLevel;
    expPvIndex = 0; expChanged();
  });
}

function expBuildDeepestOptions() {
  const sel = $('expDeepest');
  sel.innerHTML = '';
  for (let l = expStart(); l <= EXP_MAX_LEVEL; l++) {
    const o = document.createElement('option'); o.value = l; o.textContent = 'L' + l; sel.appendChild(o);
  }
  sel.value = String(expDeepest());
}

// Ticks or unticks processes at the start level
function expToggle(paths, on) {
  const ex = new Set(expSettings.excluded);
  paths.forEach(p => { if (on) ex.delete(expKey(p)); else ex.add(expKey(p)); });
  expSettings.excluded = [...ex];
  expPvIndex = 0; expChanged();
}

// The processes at the start level, grouped under their parent
function expBuildProcList() {
  const list = $('expProcList'), scroll = list.scrollTop;
  const all = expPathsAt(expStart()), ex = new Set(expSettings.excluded);
  const on = p => !ex.has(expKey(p));
  list.innerHTML = '';
  $('expProcCount').textContent = 'Processes · ' + all.filter(on).length + ' of ' + all.length;
  if (!all.length) { list.innerHTML = '<div class="exp-proc-empty">No processes at this level</div>'; return; }
  const item = (p, inGroup) => {
    const lab = document.createElement('label');
    lab.className = 'exp-proc-item' + (inGroup ? ' in-group' : '');
    lab.title = p.join(' › ');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = on(p);
    cb.addEventListener('change', () => expToggle([p], cb.checked));
    const sp = document.createElement('span'); sp.textContent = p[p.length - 1];
    lab.appendChild(cb); lab.appendChild(sp);
    return lab;
  };
  if (expStart() === 1) all.forEach(p => list.appendChild(item(p, false)));
  else {
    const groups = new Map();
    all.forEach(p => {
      const k = expKey(p.slice(0, -1));
      if (!groups.has(k)) groups.set(k, { parent: p.slice(0, -1), paths: [] });
      groups.get(k).paths.push(p);
    });
    groups.forEach(g => {
      const lab = document.createElement('label');
      lab.className = 'exp-proc-group'; lab.title = 'Tick or untick everything under ' + g.parent.join(' › ');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      const n = g.paths.filter(on).length;
      cb.checked = n === g.paths.length; cb.indeterminate = n > 0 && n < g.paths.length;
      cb.addEventListener('change', () => expToggle(g.paths, cb.checked));
      const sp = document.createElement('span'); sp.textContent = g.parent.join(' › ');
      lab.appendChild(cb); lab.appendChild(sp);
      list.appendChild(lab);
      g.paths.forEach(p => list.appendChild(item(p, true)));
    });
  }
  list.scrollTop = scroll;
}

// One tick box per level above the start level
function expBuildParentChecks() {
  const box = $('expParentChecks'), start = expStart();
  $('expParentsBox').hidden = start === 1 || expTabsOn();   // tabs: the tab rules set the levels
  box.innerHTML = '';
  for (let l = 1; l < start; l++) {
    const lab = document.createElement('label');
    lab.className = 'exp-opt'; lab.title = 'Draw the L' + l + ' processes above the ticked ones';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = expSettings.parentLevels.includes(l);
    cb.addEventListener('change', () => {
      const set = new Set(expSettings.parentLevels);
      if (cb.checked) set.add(l); else set.delete(l);
      expSettings.parentLevels = [...set].sort((a, b) => a - b);
      expChanged();
    });
    lab.appendChild(cb); lab.appendChild(document.createTextNode(' L' + l));
    box.appendChild(lab);
  }
}

// ── Tab rules (draw.io and HTML, all tabs in one file) ──
function expBuildTabRules() {
  const box = $('expTabRules'), rules = expSettings.tabRules;
  const specs = expDiagramSpecs();
  box.innerHTML = '';
  const sel = (opts, v, label, onPick) => {
    const el = document.createElement('select');
    el.className = 'exp-opt-input'; el.setAttribute('aria-label', label);
    el.innerHTML = opts.map(([ov, t]) => '<option value="' + ov + '">' + escHtml(t) + '</option>').join('');
    el.value = String(v);
    el.addEventListener('change', () => onPick(Number(el.value)));
    return el;
  };
  const lvls = from => { const o = []; for (let l = from; l <= EXP_MAX_LEVEL; l++) o.push([l, 'L' + l]); return o; };
  const set = (i, r) => { rules[i] = expCleanRules([r])[0]; expPvIndex = 0; expChanged(); };
  rules.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'exp-tab-rule';
    const n = document.createElement('span'); n.className = 'exp-tab-n'; n.textContent = (i + 1) + '.';
    row.appendChild(n);
    row.appendChild(sel(EXP_TAB_UNITS, r.u, 'One tab for', u => set(i, u ? { u, f: u, t: Math.max(r.t, u + 1) } : { u, f: r.f, t: r.t })));
    row.appendChild(sel(lvls(1), r.f, 'From level', f => set(i, { u: r.u, f, t: Math.max(r.t, f) })));
    const t2 = document.createElement('span'); t2.textContent = '\u2013';
    row.appendChild(t2);
    row.appendChild(sel(lvls(Math.max(r.f, r.u)), r.t, 'To level', t => set(i, { u: r.u, f: r.f, t })));
    const cnt = specs.filter(sp => sp.rule === r).length;
    const c = document.createElement('span'); c.className = 'exp-tab-count';
    c.textContent = cnt + ' tab' + (cnt === 1 ? '' : 's');
    row.appendChild(c);
    const tools = document.createElement('span'); tools.className = 'exp-tab-tools';
    const tool = (txt, title, dis, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = txt; b.title = title; b.disabled = dis;
      b.addEventListener('click', fn);
      tools.appendChild(b);
    };
    const move = d => { const [x] = rules.splice(i, 1); rules.splice(i + d, 0, x); expPvIndex = 0; expChanged(); };
    tool('\u2191', 'Move up', i === 0, () => move(-1));
    tool('\u2193', 'Move down', i === rules.length - 1, () => move(1));
    tool('\u00d7', 'Remove this rule', rules.length === 1, () => { rules.splice(i, 1); expPvIndex = 0; expChanged(); });
    row.appendChild(tools);
    box.appendChild(row);
  });
  // Saved sets
  const sets = expLoadTabSets(), same = x => JSON.stringify(x.rules) === JSON.stringify(rules);
  const cur = sets.find(same);
  const ss = $('expTabSet');
  ss.innerHTML = '<option value="">' + (sets.length ? 'Saved sets\u2026' : 'No saved sets') + '</option>' +
    sets.map((x, i) => '<option value="' + i + '">' + escHtml(x.name) + '</option>').join('');
  ss.value = cur ? String(sets.indexOf(cur)) : '';
  ss.disabled = !sets.length;
  $('expTabSetDel').hidden = !cur;
  $('expTabNav').checked = !!expSettings.tabNav;
}
$('expTabAdd').addEventListener('click', () => {
  const rules = expSettings.tabRules, last = rules[rules.length - 1];
  // A new rule one level deeper than the last one
  const u = Math.min(EXP_MAX_LEVEL - 1, (last ? last.u : 0) + 1);
  rules.push(expCleanRules([{ u, f: u, t: u + 1 }])[0]);
  expChanged();
});
$('expTabSet').addEventListener('change', e => {
  const sets = expLoadTabSets(), x = sets[Number(e.target.value)];
  if (e.target.value === '' || !x) return;
  expSettings.tabRules = x.rules.map(r => Object.assign({}, r));
  $('expTabSetName').value = x.name;
  expPvIndex = 0; expChanged();
});
$('expTabSetSave').addEventListener('click', () => {
  const inp = $('expTabSetName'), name = inp.value.trim();
  if (!name) { inp.focus(); return; }
  const sets = expLoadTabSets().filter(x => x.name.toLowerCase() !== name.toLowerCase());
  sets.push({ name, rules: expSettings.tabRules.map(r => Object.assign({}, r)) });
  sets.sort((a, b) => a.name.localeCompare(b.name));
  expSaveTabSets(sets);
  expBuildTabRules();
});
$('expTabSetName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('expTabSetSave').click(); } });
$('expTabSetDel').addEventListener('click', () => {
  const sets = expLoadTabSets(), i = Number($('expTabSet').value);
  if ($('expTabSet').value === '' || !sets[i]) return;
  sets.splice(i, 1);
  expSaveTabSets(sets);
  expBuildTabRules();
});
$('expTabNav').addEventListener('change', e => { expSettings.tabNav = e.target.checked; expChanged(); });

function expBuildFilesBox() {
  const n = expChecked().length, swim = expSwimOn();
  const canTabs = expTabsCan(), tabs = expTabsOn();
  $('expFilesBox').hidden = n <= 1 && !canTabs;
  const seg = $('expFilesBox').querySelector('.exp-seg');
  seg.querySelectorAll('button').forEach(b => { b.disabled = swim && b.dataset.v !== 'tabs'; });
  $('expFilesParent').hidden = expStart() === 1;
  $('expFilesTabs').hidden = !canTabs;
  $('expTabsBox').hidden = !tabs;
  if (tabs) expBuildTabRules();
  const files = expSpecCount();
  $('expFilesHint').textContent = tabs
    ? files + ' tab' + (files === 1 ? '' : 's') + ' in one ' + (expFmt() === 'html' ? 'HTML' : '.drawio') + ' file, in the order of the rules below. Only ticked processes get tabs.'
    : swim
    ? 'Swimlanes always give one file per process' + (files ? ' (' + files + ' files).' : '.')
    : expFilesMode() === 'parent' && expStart() > 1
      ? files + ' file' + (files === 1 ? '' : 's') + ', one per parent with its ticked L' + expStart() + ' processes together.'
    : expFilesMode() !== 'one'
      ? files + ' files, each with its own buttons under the preview.'
      : 'All ' + n + ' processes in one diagram.';
}

function buildLevelChecks() {
  expLvlChecks.innerHTML = '';
  const shown = expShownLevels(), start = expStart();
  for (let abs = 1; abs <= EXP_MAX_LEVEL; abs++) {
    const lv = expSettings.levels[abs];
    const inDiagram = shown.includes(abs);
    const row = document.createElement('div');
    row.className = 'exp-level-row' + (inDiagram ? '' : ' is-out');

    const lbl = document.createElement('span');
    lbl.className = 'exp-lv-label'; lbl.textContent = 'L' + abs;
    const state = document.createElement('span');
    state.className = 'exp-lv-name';
    state.textContent = !inDiagram ? 'Not included' : abs === start ? 'Start level' : abs < start ? 'Level above' : 'Included';
    row.appendChild(lbl); row.appendChild(state);

    const optsEl = document.createElement('span');
    optsEl.className = 'exp-lv-opts';
    const orient = document.createElement('span');
    orient.className = 'exp-lv-orient';
    // Top to bottom turns the whole diagram, so a level laid out "side by side" runs downwards
    const tb = expSettings.direction === 'tb';
    [['h', tb ? '⇅ V' : '⇆ H', tb ? 'Vertical (along the flow)' : 'Horizontal'],
     ['v', tb ? '⇆ H' : '⇅ V', tb ? 'Horizontal (across the flow)' : 'Vertical']].forEach(([v, t, title]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = t; b.title = title + ' layout for L' + abs;
      b.dataset.abs = abs; b.dataset.orient = v;
      if (lv.o === v) b.classList.add('active');
      b.addEventListener('click', () => {
        lv.o = v; expSaveSettings();
        orient.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        expSchedulePreview();
      });
      orient.appendChild(b);
    });
    const arrLbl = document.createElement('label');
    arrLbl.className = 'exp-lv-arrows';
    arrLbl.title = 'Arrows between consecutive shapes on L' + abs;
    const arrCb = document.createElement('input');
    arrCb.type = 'checkbox'; arrCb.dataset.arrowAbs = abs; arrCb.checked = !!lv.a;
    arrCb.addEventListener('change', () => { lv.a = arrCb.checked; expSaveSettings(); expSchedulePreview(); });
    arrLbl.appendChild(arrCb); arrLbl.appendChild(document.createTextNode(' Arrows'));
    optsEl.appendChild(orient); optsEl.appendChild(arrLbl);
    row.appendChild(optsEl);
    expLvlChecks.appendChild(row);
  }
}

function expApplyVisibility() {
  const type = expType(), fmt = expFmt();
  const has = (attr, v) => attr.split(' ').includes(v);
  exportModal.querySelectorAll('[data-types],[data-hide-types],[data-formats],[data-hide-formats],[data-when],[data-swim],[data-hide-swim],[data-hide-tabs]').forEach(el => {
    const d = el.dataset;
    let show = true;
    if (d.types)        show = show && has(d.types, type);
    if (d.hideTypes)    show = show && !has(d.hideTypes, type);
    if (d.formats)      show = show && has(d.formats, fmt);
    if (d.hideFormats)  show = show && !has(d.hideFormats, fmt);
    if (d.when) { const [k, v] = d.when.split(':'); show = show && String(expGet(k)) === v; }
    if (d.swim !== undefined) show = show && expSwimOn();
    if (d.hideSwim !== undefined) show = show && (!expSwimOn() || expTabsOn());   // tabs: only the last tabs get lanes
    if (d.hideTabs !== undefined) show = show && !expTabsOn();                    // tabs: the tab rules set the levels
    el.hidden = !show;
  });
}

function expSyncControls() {
  const s = expSettings;
  exportModal.querySelectorAll('.exp-type').forEach(b => {
    const on = b.dataset.type === s.type;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  });
  expBuildSeg($('expFmtSeg'), EXP_TYPES[s.type].formats, expFmt(), v => {
    s.fmt[s.type] = v; expPvIndex = 0; expChanged();
  });
  exportModal.querySelectorAll('.exp-seg[data-key]').forEach(seg => {
    // Swimlanes always write one file per process
    let cur = seg.dataset.key === 'files' ? (expSwimOn() && !expTabsOn() ? 'each' : expFilesMode()) : String(expGet(seg.dataset.key));
    if (seg.dataset.key === 'files' && cur === 'parent' && expStart() === 1) cur = 'each';   // L1 has no parent
    seg.querySelectorAll('button[data-v]').forEach(b => {
      b.classList.toggle('active', b.dataset.v === cur);
      b.setAttribute('aria-pressed', b.dataset.v === cur ? 'true' : 'false');
    });
  });
  if (document.activeElement !== $('expPadding')) $('expPadding').value = s.image.padding;
  if (document.activeElement !== $('expWidth'))   $('expWidth').value = s.code.width;
  $('expShowCodes').checked = !!s.showCodes;
  $('expCodeMode').value = s.codeMode;
  $('expCodePos').value = s.codePos;
  $('expL1Code').checked = s.l1Code !== false;
  const laneSel = $('expLaneField'), inData = swimFieldsInData();
  const laneOpts = inData.some(([f]) => f === s.laneField) ? inData : inData.concat(EXP_LANE_FIELDS.filter(([f]) => f === s.laneField));
  laneSel.innerHTML = laneOpts.map(([f, l]) => '<option value="' + f + '">' + escHtml(l) + '</option>').join('');
  laneSel.value = s.laneField;
  ['expCodeMode', 'expCodePos', 'expCodeStart'].forEach(id => { $(id).disabled = !s.showCodes; });
}

function expRefresh() {
  expBuildStartSeg();
  expBuildDeepestOptions();
  expBuildProcList();
  expBuildParentChecks();
  buildLevelChecks();
  expSyncControls();
  expApplyVisibility();
  expBuildFilesBox();
  expSchedulePreview();
}
function expChanged() { expSaveSettings(); expRefresh(); }

function openExportModal(preset) {
  if (!Object.keys(tree).length) return;
  expDashCache = null; expSharedCache = null;
  if (preset && preset.perProcess) {
    if (expSettings.type === 'code' || expSettings.type === 'dashboard') expSettings.type = 'image';
    expSettings.files = 'each';
    expSaveSettings();
  }
  $('expCodeStart').value = expDefaultCodeStart();
  expPvIndex = 0;
  exportModal.classList.remove('hidden');
  expRefresh();
  const active = exportModal.querySelector('.exp-type.active');
  if (active) active.focus();
}
// Enlarges the live preview inside the export window (Esc goes back)
function expSetPreviewExpanded(on) {
  exportModal.classList.toggle('pv-expanded', on);
  const b = $('expPvExpand');
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.title = on ? 'Back to the settings (Esc)' : 'Enlarge the preview (Esc to go back)';
  $('expPvExpandLabel').textContent = on ? 'Back to settings' : 'Enlarge';
  expSchedulePreview();
}
function closeExportModal() {
  expSetPreviewExpanded(false);
  exportModal.classList.add('hidden');
  clearTimeout(expPreviewTimer);
  $('expPreview').innerHTML = '';
  if (expPreviewUrl) { URL.revokeObjectURL(expPreviewUrl); expPreviewUrl = null; }
  expDashCache = null;
}

// ── Wiring ──
exportModal.querySelectorAll('.exp-type').forEach(b => b.addEventListener('click', () => {
  if (expSettings.type === b.dataset.type) return;
  expSettings.type = b.dataset.type;
  expPvIndex = 0; expChanged();
}));
// Arrow keys move between the four type tiles
$('expTypes').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  const types = Object.keys(EXP_TYPES);
  const i = types.indexOf(expSettings.type) + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1);
  const next = types[(i + types.length) % types.length];
  e.preventDefault();
  exportModal.querySelector('.exp-type[data-type="' + next + '"]').click();
  exportModal.querySelector('.exp-type[data-type="' + next + '"]').focus();
});
exportModal.querySelectorAll('.exp-seg[data-key]').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button[data-v]');
  if (!b || b.disabled) return;
  expSet(seg.dataset.key, seg.hasAttribute('data-num') ? Number(b.dataset.v) : b.dataset.v);
  if (['files', 'layout'].includes(seg.dataset.key)) expPvIndex = 0;
  expChanged();
}));
$('expProcAll').addEventListener('click', () => expToggle(expPathsAt(expStart()), true));
$('expProcNone').addEventListener('click', () => expToggle(expPathsAt(expStart()), false));
$('expPadding').addEventListener('input', e => {
  const v = parseInt(e.target.value, 10);
  if (Number.isFinite(v) && v >= 0) { expSettings.image.padding = Math.min(400, v); expSaveSettings(); expSchedulePreview(); }
});
$('expWidth').addEventListener('input', e => {
  const v = parseInt(e.target.value, 10);
  if (Number.isFinite(v) && v >= 200) { expSettings.code.width = Math.min(4000, v); expSaveSettings(); expSchedulePreview(); }
});
$('expDeepest').addEventListener('change', e => { expSettings.deepest = Number(e.target.value); expChanged(); });
$('expLaneField').addEventListener('change', e => { expSettings.laneField = e.target.value; expChanged(); });
$('expShowCodes').addEventListener('change', e => { expSettings.showCodes = e.target.checked; expChanged(); });
$('expCodeMode').addEventListener('change', e => { expSettings.codeMode = e.target.value; expChanged(); });
$('expCodePos').addEventListener('change', e => { expSettings.codePos = e.target.value; expChanged(); });
$('expL1Code').addEventListener('change', e => { expSettings.l1Code = e.target.checked; expChanged(); });
$('expCodeStart').addEventListener('input', () => { expRenderFileList(expOut); expSchedulePreview(); });
$('expReset').addEventListener('click', () => {
  const type = expSettings.type;
  expSettings = expMergeDefaults(null); expSettings.type = type;
  $('expCodeStart').value = expDefaultCodeStart();
  expPvIndex = 0; expChanged();
});
window.addEventListener('resize', () => { if (!exportModal.classList.contains('hidden')) expSchedulePreview(); });

$('btnExpCancel').addEventListener('click', closeExportModal);
exportModal.addEventListener('click', e => { if (e.target === exportModal) closeExportModal(); });
$('expPvExpand').addEventListener('click', () => expSetPreviewExpanded(!exportModal.classList.contains('pv-expanded')));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || exportModal.classList.contains('hidden')) return;
  if (exportModal.classList.contains('pv-expanded')) expSetPreviewExpanded(false);
  else closeExportModal();
});

// ── Copy and download ──
async function expCopyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    return ok;
  }
}

async function expCopy() {
  if (!expOut || expOut.total !== 1) return;
  const fmt = expFmt();
  let ok = false, what = '';
  if (fmt === 'png') {
    try {
      const blobP = expPngBlob(expOut.fr).then(b => { if (!b) throw new Error('png'); return b; });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobP })]);
      ok = true; what = 'Image';
    } catch (_) { ok = false; }
  } else if (fmt === 'svg')    { ok = await expCopyText(expSvgFile(expOut.fr)); what = 'SVG'; }
  else if (fmt === 'drawio')   { ok = await expCopyText(expTabsOn() ? expDrawioTabsXml() : buildDrawioXml(expOut.fr, expOut.title)); what = 'draw.io XML'; }
  else if (fmt === 'html')     { ok = await expCopyText(expOut.file || expOut.html); what = 'HTML'; }
  showExportToast(ok ? what + ' copied' : 'Copy failed: use Download instead');
  if (ok) {
    const cp = $('btnExpCopy'), label = cp.textContent;
    cp.textContent = 'Copied ✓';
    setTimeout(() => { if (cp.textContent === 'Copied ✓') cp.textContent = label; }, 1600);
  }
}

async function expFileBlob(fr, title) {
  const fmt = expFmt();
  if (fmt === 'svg')    return new Blob([expSvgFile(fr)], { type: 'image/svg+xml' });
  if (fmt === 'png')    return expPngBlob(fr);
  if (fmt === 'drawio') return new Blob([expTabsOn() ? expDrawioTabsXml() : buildDrawioXml(fr, title)], { type: 'application/xml' });
  if (fmt === 'vsdx')   return buildVsdxBlob(fr, title);
  return null;
}

async function expDownload() {
  if (!expOut) return;
  const fmt = expFmt();
  if (expOut.total > 1) {
    const ext = expItemExt();
    await saveFiles(expFileEntries().map((e, i) => ({ name: e.base + ext, make: () => expItemBlob(i) })),
                    'Nexus export ' + new Date().toISOString().slice(0, 10));
    return;
  }
  if (fmt === 'html') {
    saveBlob(new Blob([expOut.file || expOut.html], { type: 'text/html' }), sanitizeFileName(expOut.base) + '.html');
    showExportToast('Exported HTML');
    return;
  }
  const blob = await expFileBlob(expOut.fr, expOut.title);
  if (!blob) { showExportToast('Export failed: diagram too large for ' + fmt.toUpperCase() + ' at this scale'); return; }
  saveBlob(blob, expOut.base + EXPORT_EXT[fmt]);
  showExportToast('Exported ' + EXPORT_LABEL[fmt]);
}

$('btnExpGo').addEventListener('click', expDownload);
$('btnExpCopy').addEventListener('click', expCopy);

// ── Shared export helpers (process diagrams, Gantt, Timeline) ──
const EXPORT_EXT   = { svg: '.svg', jpeg: '.jpg', png: '.png', vsdx: '.vsdx', drawio: '.drawio' };
const EXPORT_LABEL = { svg: 'SVG', jpeg: 'JPEG', png: 'PNG', vsdx: 'Visio file', drawio: 'draw.io file' };

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// SVG string → raster blob at 300 PPI (white background); null if it fails
function svgToRasterBlob(svgStr, svgW, svgH, mime) {
  return new Promise(resolve => {
    const scale = 300 / 96;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(svgW * scale); canvas.height = Math.round(svgH * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(null); return; }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload  = () => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url);
                          canvas.toBlob(b => resolve(b), mime, 0.95); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

async function imageBlob(svgStr, svgW, svgH, fmt) {
  if (fmt === 'svg') return new Blob([svgStr], { type: 'image/svg+xml' });
  return svgToRasterBlob(svgStr, svgW, svgH, fmt === 'png' ? 'image/png' : 'image/jpeg');
}

// Several files: all in one .zip download
async function saveFiles(files, zipName) {
  showExportToast('Exporting ' + files.length + ' files…');
  const entries = [], used = new Set();
  for (const f of files) {
    const blob = await f.make();
    if (!blob) continue;
    // Keep names unique inside the zip: "name.ext", "name (2).ext", …
    let name = f.name, n = 1;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    while (used.has(name.toLowerCase())) name = stem + ' (' + (++n) + ')' + ext;
    used.add(name.toLowerCase());
    entries.push([name, new Uint8Array(await blob.arrayBuffer())]);
  }
  if (!entries.length) { showExportToast('Export failed: nothing could be built'); return; }
  saveBlob(new Blob([zipStore(entries)], { type: 'application/zip' }), sanitizeFileName(zipName || 'Nexus export') + '.zip');
  const skipped = files.length - entries.length;
  showExportToast('Exported ' + entries.length + ' file' + (entries.length === 1 ? '' : 's') + ' as .zip' +
                  (skipped ? ' (' + skipped + ' skipped: too large)' : ''));
}

// Gantt / Timeline: one format choice (JPEG / PNG / SVG), remembered
const VIEW_FMT_KEY = 'nexus.export.viewFormat';
function viewExportFormat() {
  try { const f = localStorage.getItem(VIEW_FMT_KEY); if (['jpeg', 'png', 'svg'].includes(f)) return f; } catch (_) {}
  return 'jpeg';
}
['ganttExportFmt', 'yearExportFmt'].forEach(id => {
  const sel = $(id);
  if (!sel) return;
  sel.value = viewExportFormat();
  sel.addEventListener('change', () => {
    try { localStorage.setItem(VIEW_FMT_KEY, sel.value); } catch (_) {}
    ['ganttExportFmt', 'yearExportFmt'].forEach(o => { if ($(o)) $(o).value = sel.value; });
  });
});
async function exportViewImage(svgStr, w, h, baseName) {
  const fmt = viewExportFormat();
  const blob = await imageBlob(svgStr, w, h, fmt);
  if (!blob) { showExportToast('Export failed: image too large for ' + fmt.toUpperCase()); return; }
  saveBlob(blob, sanitizeFileName(baseName) + EXPORT_EXT[fmt]);
  showExportToast('Exported ' + EXPORT_LABEL[fmt]);
}

// ── SVG EXPORT ─────────────────────────────────────────────────────────
const SVG_LAYOUT = { NW: 240, NH: 110, HGAP: 28, VGAP: 28, VLEAF: 28, PAD: 60, FONT: 13, SMALL_FONT: 11, CORNER: 8 };
const SVG_FLOW_GAP = 64;   // space between flow columns (room for the arrow bends)
// Level colours L0–L5
const EXP_FILLS   = ['#3E603D','#619A60','#88D17F','#B0E3A5','#D7F5CB','#EBFFDF'];
const EXP_STROKES = ['#2d4a2c','#4d7a4c','#6ab062','#8dc882','#b3dfa4','#c5eaae'];
const EXP_TEXTS   = ['#f0f8f0','#f0f8f0','#1c3620','#1c3620','#1c3620','#1c3620'];

function getSvgColors() {
  const s = getComputedStyle(document.documentElement);
  const g = v => s.getPropertyValue(v).trim();
  return {
    BG: g('--bg'), FILL: g('--surf'), STROKE: g('--bdr'),
    TEXT: g('--txt'), CONN: g('--bdr'), ACC: g('--acc'),
    ACC_T: g('--acc-t'), BADGE_BG: g('--acc-10'),
  };
}

const EXP_ARROW_COLOR = '#5f6f5f';

// opts (all optional): { arrowLevels: [abs,...], showCodes, codeMode: 'auto'|'data',
//                        codeStart: number }
// SVG for a flow arrow (points along its route); loops are dashed
function expFlowPolyline(a) {
  const pts = a.points.map(p => p.slice());
  const n = pts.length - 1, dx = Math.sign(pts[n][0] - pts[n - 1][0]), dy = Math.sign(pts[n][1] - pts[n - 1][1]);
  pts[n] = [pts[n][0] - dx, pts[n][1] - dy];   // stop 1px short so the arrowhead sits on the border
  return '<polyline points="' + pts.map(p => p[0] + ',' + p[1]).join(' ') + '" fill="none" stroke="' + EXP_ARROW_COLOR +
    '" stroke-width="1.5"' + (a.back ? ' stroke-dasharray="6 4"' : '') + ' marker-end="url(#expArrow)"/>';
}

function buildSvgString(exportPath, maxAbsLevel, leafHorizontalOrOrientations, opts) {
  opts = opts || {};
  const arrowLevels = new Set(opts.arrowLevels || []);
  const usePath   = exportPath  !== undefined ? exportPath  : [...currentPath];
  const useMaxAbs = maxAbsLevel !== undefined ? maxAbsLevel : 5;

  // Build orientMap: absLevel → 'h' | 'v'
  // Accepts: boolean (legacy), object {absLevel: 'h'|'v'}, or undefined (all H)
  let orientMap = {};
  if (leafHorizontalOrOrientations && typeof leafHorizontalOrOrientations === 'object') {
    orientMap = leafHorizontalOrOrientations;
  }
  // Legacy boolean: leafHorizontal=false means the deepest level is 'v'
  const isLegacyBool = typeof leafHorizontalOrOrientations === 'boolean';

  // opts.rootNodes: a ready-made (virtual) set of top nodes, used as is.
  // Virtual nodes may carry _path (the real path, for codes) and _name
  // (the text shown; the key can then be any unique id).
  let subtree = opts.rootNodes || getNodesAtPath(usePath);
  if (!opts.rootNodes && usePath.length > 0) {
    const i = usePath.length - 1;
    let cur = tree;
    for (let j = 0; j < i; j++) cur = cur[usePath[j]]._children;
    const nodeObj = cur[usePath[i]];
    subtree = { [usePath[i]]: { _children: subtree, _meta: nodeObj._meta, _desc: nodeObj._desc, _code: nodeObj._code } };
  }
  if (!Object.keys(subtree).length) return null;
  // Top to bottom: the left-to-right layout is computed with width and
  // height swapped, then every position is mirrored on the diagonal, so the
  // steps run downwards and each level sits in a column to the right.
  const TB = opts.direction === 'tb';
  const L0 = SVG_LAYOUT;
  const S = TB ? Object.assign({}, L0, { NW: L0.NH, NH: L0.NW, HGAP: L0.VGAP, VGAP: L0.HGAP }) : L0;
  const tx = TB ? (x, y, w, h) => ({ x: y, y: x, w: h, h: w }) : (x, y, w, h) => ({ x, y, w, h });

  const exportRootAbsDepth = Math.max(0, usePath.length - 1) + levelOffset;
  // opts.depthLevels: absolute level per depth (levels may be skipped)
  const depthLevels = Array.isArray(opts.depthLevels) && opts.depthLevels.length ? opts.depthLevels : null;
  const absAt = depth => depthLevels ? depthLevels[depth] : exportRootAbsDepth + depth;
  const maxExportLevel     = depthLevels ? depthLevels.length
                           : Math.min(useMaxAbs - exportRootAbsDepth + 1, 6 - exportRootAbsDepth);

  function isVertical(depth) {
    const abs = absAt(depth);
    if (isLegacyBool) {
      // legacy: only the leaf level can be vertical
      return depth === maxExportLevel - 1 && leafHorizontalOrOrientations === false;
    }
    return (orientMap[abs] || 'h') === 'v';
  }

  // measure() returns { totalW, totalH, items[] }
  // each item: { key, nodeObj, child, subtreeW, subtreeH, x, y }
  function measure(nodes, depth) {
    if (depth >= maxExportLevel) return { totalW: 0, totalH: 0, items: [] };
    const keys = Object.keys(nodes);
    if (!keys.length) return { totalW: 0, totalH: 0, items: [] };

    // Steps linked with Previous / Next (and nothing shown below them): a flow graph
    const flow = keys.length > 1 ? flowOf(nodes) : null;
    // Linear: one row along the flow; at a level set to vertical, a plain column in flow order
    const seq = flow && flow.linear ? flow.order : keys;
    if (flow && !(flow.linear && isVertical(depth))) {
      const kids = keys.map(k => measure(nodes[k]._children, depth + 1));
      if (kids.every(c => !c.items.length)) {
        const FG = SVG_FLOW_GAP, RH = S.NH + S.VLEAF;
        const boxes = new Map(keys.map(k => [k, { x: flow.col.get(k) * (S.NW + FG), y: flow.y.get(k) * RH, w: S.NW, h: S.NH }]));
        const r = flowRoutes(flow, boxes, FG, 14, 0, true);
        const items = flow.order.map(k => {
          const b = boxes.get(k), i = keys.indexOf(k);
          return { key: k, nodeObj: nodes[k], child: kids[i], csvIdx: i, subtreeW: S.NW, subtreeH: S.NH, x: b.x, y: b.y + r.above };
        });
        items.flow = flow;
        items.flowGap = FG;
        const maxY = Math.max(...flow.y.values());
        return { totalW: flow.cols * S.NW + (flow.cols - 1) * FG, totalH: r.above + maxY * RH + S.NH + r.below, items };
      }
    }

    if (isVertical(depth)) {
      // Stack siblings top-to-bottom
      const items = [];
      let totalH = 0, maxW = 0;
      seq.forEach(key => {
        const nodeObj = nodes[key];
        const child   = measure(nodeObj._children, depth + 1);
        const itemW   = Math.max(S.NW, child.totalW);
        const itemH   = S.NH + (child.totalH > 0 ? S.VGAP + child.totalH : 0);
        items.push({ key, csvIdx: keys.indexOf(key), nodeObj, child, subtreeW: itemW, subtreeH: itemH, x: 0, y: totalH });
        totalH += itemH + S.VLEAF;
        maxW = Math.max(maxW, itemW);
      });
      const finalH = Math.max(0, totalH - S.VLEAF);
      items.forEach(it => { it.subtreeW = maxW; }); // uniform width in column
      return { totalW: maxW, totalH: finalH, items };
    } else {
      // Spread siblings left-to-right
      const items = [];
      let totalW = 0, maxChildH = 0;
      seq.forEach(key => {
        const nodeObj = nodes[key];
        const child   = measure(nodeObj._children, depth + 1);
        const itemW   = Math.max(S.NW, child.totalW);
        items.push({ key, csvIdx: keys.indexOf(key), nodeObj, child, subtreeW: itemW, subtreeH: 0, x: totalW, y: 0 });
        totalW   += itemW + S.HGAP;
        maxChildH = Math.max(maxChildH, child.totalH);
      });
      const finalW = Math.max(0, totalW - S.HGAP);
      const totalH = S.NH + (maxChildH > 0 ? S.VGAP + maxChildH : 0);
      items.forEach(it => { it.subtreeH = totalH; });
      return { totalW: finalW, totalH, items };
    }
  }

  const parts = { rects: [], texts: [], labels: [], shapes: [], levelTags: [], arrows: [] };
  let svgW = 0, svgH = 0;
  const labeledLevels = new Set();
  const FF = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

  // Pushes the shape model (used by every exporter) and its SVG; returns its index.
  function drawNode(nodeX, nodeY, nodeW, nodeH, cx, key, absLevel, nodeObj, code) {
    const ci = Math.min(absLevel, EXP_FILLS.length - 1);
    const g = tx(nodeX, nodeY, nodeW, nodeH);
    nodeX = g.x; nodeY = g.y; nodeW = g.w; nodeH = g.h;
    const sh = { x: nodeX, y: nodeY, w: nodeW, h: nodeH, name: key, level: absLevel,
      text: (opts.showCodes && code) ? code + (opts.codeOwnLine ? '\n' : ' ') + key : key,
      fill: EXP_FILLS[ci], stroke: EXP_STROKES[ci], color: EXP_TEXTS[ci],
      code: code || '', desc: (nodeObj && nodeObj._desc) || '',
      meta: (nodeObj && nodeObj._meta) || null };
    svgW = Math.max(svgW, nodeX + nodeW + S.PAD);
    svgH = Math.max(svgH, nodeY + nodeH + S.PAD);
    return pushShape(sh);
  }

  function pushShape(sh) {
    parts.shapes.push(sh);
    const r = S.CORNER;
    parts.rects.push(
      '<rect x="' + sh.x + '" y="' + sh.y + '" width="' + sh.w + '" height="' + sh.h +
      '" rx="' + r + '" ry="' + r +
      '" fill="' + sh.fill + '" stroke="' + sh.stroke + '" stroke-width="1.5"/>'
    );
    if (sh.text) {
      const fs = sh.fontSize || S.FONT;
      // Explicit line breaks (e.g. code on its own line) are kept; each part wraps on its own
      const lines = String(sh.text).split('\n').flatMap(part => wrapText(part, sh.w - 20, fs));
      const lh = fs * 1.4;
      const textStartY = sh.y + sh.h / 2 - (lines.length * lh) / 2 + fs;
      lines.forEach((ln, li) => {
        parts.texts.push(
          '<text x="' + (sh.x + sh.w / 2) + '" y="' + (textStartY + li * lh) + '" text-anchor="middle"' +
          ' fill="' + sh.color + '" font-size="' + fs + '" font-family="' + FF + '">' +
          escHtml(ln) + '</text>'
        );
      });
    }
    return parts.shapes.length - 1;
  }

  // Code for a node: from opts.codeOf(path) when given (export window), else
  // generated for the i-th sibling under parentCode (data code wins in 'data' mode)
  function codeFor(nodeObj, parentCode, i, path) {
    const dataCode = nodeObj && nodeObj._code ? String(nodeObj._code) : '';
    if (opts.codeOf) return opts.codeOf(path) || '';
    if (!opts.showCodes) return dataCode;
    if (opts.codeMode === 'data' && dataCode) return dataCode;
    const start = Number.isFinite(opts.codeStart) ? opts.codeStart : 1;
    return parentCode ? parentCode + '.' + (i + 1) : String(start + i);
  }

  // renderLevel: positions items at absolute (xBase+item.x, yBase+item.y)
  function levelLabel(abs, y) {
    const ci = Math.min(abs, EXP_FILLS.length - 1);
    if (TB) {
      // Columns: the level tag sits above its column
      const cx = y + L0.NW / 2;
      parts.levelTags.push({ x: cx - 20, y: S.PAD - 40, w: 40, h: 20, text: 'L' + abs, color: EXP_FILLS[ci] });
      parts.labels.push(
        '<text x="' + cx + '" y="' + (S.PAD - 14) + '" text-anchor="middle" fill="' + EXP_FILLS[ci] + '"' +
        ' font-size="11" font-weight="700" letter-spacing="0.5" font-family="' + FF + '">L' + abs + '</text>');
      return;
    }
    parts.levelTags.push({ x: S.PAD - 50, y: y + S.NH / 2 - 10, w: 40, h: 20, text: 'L' + abs, color: EXP_FILLS[ci] });
    parts.labels.push(
      '<text x="' + (S.PAD - 10) + '" y="' + (y + S.NH / 2 + 4) + '" text-anchor="end"' +
      ' fill="' + EXP_FILLS[ci] + '"' +
      ' font-size="11" font-weight="700" letter-spacing="0.5" font-family="' + FF + '">' +
      'L' + abs + '</text>'
    );
  }

  function renderLevel(items, depth, xBase, yBase, parentCode, parentPath) {
    const absLevelBase = absAt(depth);
    const placed = [];
    items.forEach((item, idx) => {
      const absX  = xBase + item.x;
      const absY  = yBase + item.y;
      const nodeW = item.subtreeW;   // fill the full allocated width
      const nodeH = S.NH;
      const nodeX = absX;
      const cx    = absX + nodeW / 2;
      const nodeY = absY;

      if (!labeledLevels.has(depth)) {
        labeledLevels.add(depth);
        levelLabel(absLevelBase, nodeY);
      }

      const path = (item.nodeObj && item.nodeObj._path) || parentPath.concat(item.key);
      const code = codeFor(item.nodeObj, parentCode, item.csvIdx != null ? item.csvIdx : idx, path);
      const shapeIdx = drawNode(nodeX, nodeY, nodeW, nodeH, cx, (item.nodeObj && item.nodeObj._name) || item.key, absLevelBase, item.nodeObj, code);
      parts.shapes[shapeIdx].path = path;   // the process it shows (draw.io tab links)
      placed.push({ shapeIdx, x: nodeX, y: nodeY, w: nodeW, subtreeH: item.subtreeH,
                    hasKids: item.child.items.length > 0 });

      if (item.child.items.length > 0) {
        // Children start at the same x as the parent — they already fill that space
        const childXBase = absX;
        const childYBase = absY + S.NH + S.VGAP;
        renderLevel(item.child.items, depth + 1, childXBase, childYBase, code, path);
      }
    });

    // Steps linked with Previous / Next: arrows along the links, always
    // (the links are what shows the parallel steps, branches and loops)
    if (items.flow) {
      const boxes = new Map(items.map((it, i) => [it.key, { x: placed[i].x, y: placed[i].y, w: placed[i].w, h: S.NH }]));
      const shapeOf = new Map(items.map((it, i) => [it.key, placed[i].shapeIdx]));
      flowRoutes(items.flow, boxes, items.flowGap, 14, 0, true).routes.forEach(rt => {
        const pts = TB ? rt.points.map(([x, y]) => [y, x]) : rt.points;
        const last = pts[pts.length - 1];
        parts.arrows.push({ from: shapeOf.get(rt.from), to: shapeOf.get(rt.to), points: pts, back: rt.back, tb: TB, vertical: TB,
          x1: pts[0][0], y1: pts[0][1], x2: last[0], y2: last[1] });
      });
    }
    // Flow arrows between consecutive siblings at this level
    else if (arrowLevels.has(absLevelBase)) {
      const vertical = isVertical(depth);
      for (let k = 0; k + 1 < placed.length; k++) {
        const a = placed[k], b = placed[k + 1];
        const ar = vertical
          ? { x1: a.x + a.w / 2, y1: a.y + (a.hasKids ? a.subtreeH : S.NH), x2: b.x + b.w / 2, y2: b.y }
          : { x1: a.x + a.w, y1: a.y + S.NH / 2, x2: b.x, y2: b.y + S.NH / 2 };
        ar.from = a.shapeIdx; ar.to = b.shapeIdx; ar.vertical = vertical; ar.fromHasKids = a.hasKids;
        if (TB) {
          [ar.x1, ar.y1, ar.x2, ar.y2] = [ar.y1, ar.x1, ar.y2, ar.x2];
          ar.vertical = !vertical;
          ar.tb = true;
        }
        parts.arrows.push(ar);
      }
    }
  }

  const measured = measure(subtree, 0);
  // Optional parent chain (direct ancestors of the diagram root), drawn as
  // full-width bars above the diagram: [{ key, nodeObj, abs, path }]
  const chain = opts.parentChain || [];
  const chainH = chain.length * (S.NH + S.VGAP);
  svgW = measured.totalW + S.PAD * 2;
  svgH = measured.totalH + chainH + S.PAD * 2;
  if (TB) [svgW, svgH] = [svgH, svgW];
  chain.forEach((p, i) => {
    const y = S.PAD + i * (S.NH + S.VGAP);
    levelLabel(p.abs, y);
    drawNode(S.PAD, y, measured.totalW, S.NH, S.PAD + measured.totalW / 2, p.key, p.abs, p.nodeObj,
             codeFor(p.nodeObj, '', 0, p.path));
  });
  renderLevel(measured.items, 0, S.PAD, S.PAD + chainH, '', usePath.slice(0, -1));

  const arrowSvg = parts.arrows.map(a => {
    if (a.points) return expFlowPolyline(a);
    if (a.tb && a.y1 === a.y2) {
      return '<line x1="' + a.x1 + '" y1="' + a.y1 + '" x2="' + (a.x2 - 1) + '" y2="' + a.y2 + '" stroke="' + EXP_ARROW_COLOR +
        '" stroke-width="1.5" marker-end="url(#expArrow)"/>';
    }
    if (a.tb && a.vertical && a.x1 !== a.x2) {
      const my = (a.y1 + a.y2) / 2;
      return '<polyline points="' + a.x1 + ',' + a.y1 + ' ' + a.x1 + ',' + my + ' ' + a.x2 + ',' + my + ' ' + a.x2 + ',' + (a.y2 - 1) +
        '" fill="none" stroke="' + EXP_ARROW_COLOR + '" stroke-width="1.5" marker-end="url(#expArrow)"/>';
    }
    if (a.vertical || a.y1 === a.y2) {
      return '<line x1="' + a.x1 + '" y1="' + a.y1 + '" x2="' + a.x2 + '" y2="' + (a.y2 - 1) + '" stroke="' + EXP_ARROW_COLOR +
        '" stroke-width="1.5" marker-end="url(#expArrow)"/>';
    }
    const mx = (a.x1 + a.x2) / 2;
    return '<polyline points="' + a.x1 + ',' + a.y1 + ' ' + mx + ',' + a.y1 + ' ' + mx + ',' + a.y2 + ' ' + (a.x2 - 1) + ',' + a.y2 +
      '" fill="none" stroke="' + EXP_ARROW_COLOR + '" stroke-width="1.5" marker-end="url(#expArrow)"/>';
  });
  return {
    svg: '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgW + '" height="' + svgH + '"' +
      ' viewBox="0 0 ' + svgW + ' ' + svgH + '">\n' +
      '  <rect width="' + svgW + '" height="' + svgH + '" fill="none"/>\n' +
      (arrowSvg.length ? '  <defs><marker id="expArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"' +
        ' orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="' + EXP_ARROW_COLOR + '"/></marker></defs>\n' : '') +
      parts.labels.map(s => '  ' + s).join('\n') + '\n' +
      parts.rects.map(s => '  ' + s).join('\n') + '\n' +
      parts.texts.map(s => '  ' + s).join('\n') + '\n' +
      arrowSvg.map(s => '  ' + s).join('\n') + '\n' +
      '</svg>',
    svgW, svgH,
    shapes: parts.shapes, levelTags: parts.levelTags, arrows: parts.arrows
  };
}

// ── SWIMLANE LAYOUT ──────────────────────────────────────────────────────
// One process and its direct steps, with one lane per value of a chosen
// field (Responsible, Tool, BPO, ...). Steps without a value go in an
// "Unassigned" lane. Left to right: lanes are rows and the steps run to the
// right; top to bottom: lanes are columns and the steps run down. Each
// step gets its own column (row) so the flow reads in order across lanes.
// Returns the same shape as buildSvgString plus `swim` (pool and lanes),
// which the draw.io exporter turns into native swimlane containers.
const EXP_UNASSIGNED = 'Unassigned';
const SWIM = { HEAD: 30, M: 30, GAP: 60 };   // title strip, margin round the steps, gap between steps
const SWIM_COLORS = { poolHead: '#D7F5CB', laneHead: '#EBFFDF', laneBody: '#ffffff', stroke: '#6ab062', text: '#1c3620' };

function swimFieldValue(meta, field) {
  const v = meta && meta[field] != null ? String(meta[field]).trim() : '';
  return v.toLowerCase() === 'n/a' ? '' : v;
}
// A step's lane: its own value, else the most common value among the
// lowest-level processes below it (process data sits on those rows).
function swimLaneOf(nodeObj, field) {
  const own = swimFieldValue(nodeObj && nodeObj._meta, field);
  if (own) return own;
  const counts = new Map();
  (function walk(n) {
    const kids = Object.keys(n._children || {});
    if (!kids.length) { const v = swimFieldValue(n._meta, field); if (v) counts.set(v, (counts.get(v) || 0) + 1); return; }
    kids.forEach(k => walk(n._children[k]));
  })(nodeObj || { _children: {} });
  let best = '', n = 0;
  counts.forEach((c, v) => { if (c > n) { best = v; n = c; } });
  return best;
}
// Lane fields that have at least one value in the data
function swimFieldsInData() {
  const found = new Set();
  (function walk(nodes) {
    Object.keys(nodes).forEach(k => {
      const n = nodes[k];
      EXP_LANE_FIELDS.forEach(([f]) => { if (!found.has(f) && swimFieldValue(n._meta, f)) found.add(f); });
      walk(n._children);
    });
  })(tree);
  return EXP_LANE_FIELDS.filter(([f]) => found.has(f));
}

// opts: { laneField, direction: 'lr'|'tb', showCodes, codeOwnLine, codeOf(path), parentChain }
function buildSwimlaneSvg(path, opts) {
  opts = opts || {};
  const field = opts.laneField || 'R';
  const TB = opts.direction === 'tb';
  const parentObj = path.length ? expNodeAt(path) : null;
  const steps = path.length ? (parentObj ? parentObj._children : {}) : tree;
  const keys = Object.keys(steps);
  if (!keys.length) return null;
  const { NW, NH, PAD, FONT, CORNER } = SVG_LAYOUT;
  const { HEAD, M, GAP } = SWIM;
  const FF = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
  const stepAbs = levelOffset + path.length;          // absolute level of the steps
  const ci = Math.min(stepAbs, EXP_FILLS.length - 1);

  // Lanes in order of first use; Unassigned always last
  const laneOfKey = {}, laneNames = [];
  keys.forEach(k => {
    const v = swimLaneOf(steps[k], field) || EXP_UNASSIGNED;
    laneOfKey[k] = v;
    if (v !== EXP_UNASSIGNED && !laneNames.includes(v)) laneNames.push(v);
  });
  if (keys.some(k => laneOfKey[k] === EXP_UNASSIGNED)) laneNames.push(EXP_UNASSIGNED);

  // Pool title: the process (with its code), after its parents when the chain is on
  const codeOf = opts.codeOf || (() => '');
  const procName = path.length ? path[path.length - 1] : 'All processes';
  const procCode = path.length && opts.showCodes ? codeOf(path) : '';
  const chain = (opts.parentChain || []).map(p => p.key);
  const poolTitle = chain.concat((procCode ? procCode + ' ' : '') + procName).join(' › ');

  // Place along the flow: one slot per step in CSV order, or with Previous /
  // Next links the step's flow column, with an extra slot where two steps
  // of one column fall in the same lane
  const flow = keys.length > 1 ? flowOf(steps) : null;
  const slotOf = {};
  let n = keys.length;
  if (flow) {
    let base = 0;
    for (let c = 0; c < flow.cols; c++) {
      const used = {};
      let width = 1;
      flow.order.filter(k => flow.col.get(k) === c).forEach(k => {
        const l = laneOfKey[k];
        used[l] = used[l] || 0;
        slotOf[k] = base + used[l];
        used[l]++;
        width = Math.max(width, used[l]);
      });
      base += width;
    }
    n = base;
  } else keys.forEach((k, i) => { slotOf[k] = i; });

  // Geometry: "along" runs with the flow, "across" over the lanes
  const laneAcross = (TB ? NW : NH) + 2 * M;                  // lane thickness
  const laneAlong  = HEAD + M + n * ((TB ? NH : NW) + GAP) - GAP + M;
  const pool = TB
    ? { x: PAD, y: PAD, w: laneNames.length * laneAcross, h: HEAD + laneAlong, title: poolTitle }
    : { x: PAD, y: PAD, w: HEAD + laneAlong, h: laneNames.length * laneAcross, title: poolTitle };
  const lanes = laneNames.map((name, i) => TB
    ? { x: pool.x + i * laneAcross, y: pool.y + HEAD, w: laneAcross, h: laneAlong, title: name }
    : { x: pool.x + HEAD, y: pool.y + i * laneAcross, w: laneAlong, h: laneAcross, title: name });

  const shapes = [], arrows = [];
  keys.forEach((k, i) => {
    const li = laneNames.indexOf(laneOfKey[k]), ln = lanes[li];
    const p = path.concat(k), code = opts.showCodes ? codeOf(p) : '';
    const x = TB ? ln.x + M : ln.x + HEAD + M + slotOf[k] * (NW + GAP);
    const y = TB ? ln.y + HEAD + M + slotOf[k] * (NH + GAP) : ln.y + M;
    shapes.push({ x, y, w: NW, h: NH, name: k, level: stepAbs, lane: li, path: p,
      text: code ? code + (opts.codeOwnLine ? '\n' : ' ') + k : k,
      fill: EXP_FILLS[ci], stroke: EXP_STROKES[ci], color: EXP_TEXTS[ci],
      code, desc: steps[k]._desc || '', meta: steps[k]._meta || null });
  });
  if (flow) {
    // Route in left-to-right space (top to bottom is mirrored on the diagonal)
    const sw = TB ? (b => ({ x: b.y, y: b.x, w: b.h, h: b.w })) : (b => b);
    const boxes = new Map(keys.map((k, i) => [k, sw(shapes[i])]));
    flowRoutes(flow, boxes, GAP, 14, 0, true).routes.forEach(rt => {
      const pts = TB ? rt.points.map(([x, y]) => [y, x]) : rt.points;
      const last = pts[pts.length - 1];
      arrows.push({ from: keys.indexOf(rt.from), to: keys.indexOf(rt.to), points: pts, back: rt.back, tb: TB, vertical: TB,
        x1: pts[0][0], y1: pts[0][1], x2: last[0], y2: last[1] });
    });
  }
  for (let i = 0; !flow && i + 1 < shapes.length; i++) {
    const a = shapes[i], b = shapes[i + 1];
    arrows.push(TB
      ? { x1: a.x + NW / 2, y1: a.y + NH, x2: b.x + NW / 2, y2: b.y, from: i, to: i + 1, tb: true, vertical: true }
      : { x1: a.x + NW, y1: a.y + NH / 2, x2: b.x, y2: b.y + NH / 2, from: i, to: i + 1 });
  }

  const svgW = pool.x + pool.w + PAD, svgH = pool.y + pool.h + PAD;
  const out = [];
  const fit = (t, px) => { const max = Math.max(4, Math.floor(px / (11 * 0.58))); return t.length > max ? t.slice(0, max - 1) + '…' : t; };
  const title = (t, box, bold, size) => {
    // Title strip: on the left, turned (left to right), or along the top (top to bottom)
    const along = TB ? box.w : box.h, cx = TB ? box.x + box.w / 2 : box.x + HEAD / 2, cy = TB ? box.y + HEAD / 2 : box.y + box.h / 2;
    const rot = TB ? '' : ' transform="rotate(-90 ' + cx + ' ' + cy + ')"';
    return '<text x="' + cx + '" y="' + (cy + 4) + '"' + rot + ' text-anchor="middle" fill="' + SWIM_COLORS.text + '" font-size="' + size + '"' +
      (bold ? ' font-weight="700"' : ' font-weight="600"') + ' font-family="' + FF + '">' + escHtml(fit(t, along - 16)) + '</text>';
  };
  const strip = b => TB ? { x: b.x, y: b.y, w: b.w, h: HEAD } : { x: b.x, y: b.y, w: HEAD, h: b.h };
  const rect = (b, fill) => '<rect class="sl" x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h +
    '" fill="' + fill + '" stroke="' + SWIM_COLORS.stroke + '" stroke-width="1"/>';
  out.push(rect(pool, SWIM_COLORS.laneBody), rect(strip(pool), SWIM_COLORS.poolHead), title(pool.title, pool, true, 12));
  lanes.forEach(l => { out.push(rect(l, SWIM_COLORS.laneBody), rect(strip(l), SWIM_COLORS.laneHead), title(l.title, l, false, 11)); });
  // Steps (the only rects without class="sl", so the HTML export can find them)
  shapes.forEach(sh => {
    out.push('<rect x="' + sh.x + '" y="' + sh.y + '" width="' + sh.w + '" height="' + sh.h + '" rx="' + CORNER + '" ry="' + CORNER +
      '" fill="' + sh.fill + '" stroke="' + sh.stroke + '" stroke-width="1.5"/>');
  });
  shapes.forEach(sh => {
    const lines = String(sh.text).split('\n').flatMap(part => wrapText(part, sh.w - 20, FONT));
    const lh = FONT * 1.4, y0 = sh.y + sh.h / 2 - (lines.length * lh) / 2 + FONT;
    lines.forEach((ln, li) => out.push('<text x="' + (sh.x + sh.w / 2) + '" y="' + (y0 + li * lh) + '" text-anchor="middle" fill="' + sh.color +
      '" font-size="' + FONT + '" font-family="' + FF + '">' + escHtml(ln) + '</text>'));
  });
  arrows.forEach(a => {
    if (a.points) { out.push(expFlowPolyline(a)); return; }
    const end = TB ? [a.x2, a.y2 - 1] : [a.x2 - 1, a.y2];
    let pts;
    if (TB) { const my = (a.y1 + a.y2) / 2; pts = a.x1 === a.x2 ? [[a.x1, a.y1], end] : [[a.x1, a.y1], [a.x1, my], [a.x2, my], end]; }
    else    { const mx = (a.x1 + a.x2) / 2; pts = a.y1 === a.y2 ? [[a.x1, a.y1], end] : [[a.x1, a.y1], [mx, a.y1], [mx, a.y2], end]; }
    out.push('<polyline points="' + pts.map(p => p.join(',')).join(' ') + '" fill="none" stroke="' + EXP_ARROW_COLOR +
      '" stroke-width="1.5" marker-end="url(#expArrow)"/>');
  });
  return {
    svg: '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgW + '" height="' + svgH + '" viewBox="0 0 ' + svgW + ' ' + svgH + '">\n' +
      '  <rect width="' + svgW + '" height="' + svgH + '" fill="none"/>\n' +
      '  <defs><marker id="expArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"' +
      ' orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="' + EXP_ARROW_COLOR + '"/></marker></defs>\n' +
      out.map(s => '  ' + s).join('\n') + '\n</svg>',
    svgW, svgH, shapes, levelTags: [], arrows,
    swim: { horizontal: !TB, pool, lanes },
  };
}

// ── VISIO (.VSDX) EXPORT ──────────────────────────────────────────────────
// Builds a native Visio file from the layout produced by buildSvgString().
// Every node becomes an editable Visio shape (same position, colours and
// text) with the process data attached as Shape Data. No dependencies:
// the package is written with a small store-only ZIP writer below.

const VSDX_NS  = 'http://schemas.microsoft.com/office/visio/2012/main';
const VSDX_RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const VSDX_REL = 'http://schemas.microsoft.com/visio/2010/relationships/';
const VSDX_DPI = 96; // SVG px → Visio inches

function vsdxEsc(v) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
const vsdxNum = n => String(Math.round(n * 1e6) / 1e6);
const vsdxIn  = px => vsdxNum(px / VSDX_DPI);

// Process data attached to an exported node, as [key, label, value]
// (empty values skipped). Shared by the Visio and draw.io exporters.
function exportDataRows(sh) {
  const rows = [
    ['Level', 'Level', 'L' + sh.level],
    ['Code', 'Code', sh.code],
    ['Name', 'Name', sh.name || sh.text],
    ['Description', 'Description', sh.desc],
  ];
  const m = sh.meta;
  if (m) {
    rows.push(['RowID', 'ID', m.ID]);
    [['Type','Type'],['Frequency','Frequency'],['Time_UoM','Time unit'],['Start','Start'],['End','End'],
     ['R','Responsible'],['A','Accountable'],['S','Support'],['C','Consulted'],['I','Informed'],
     ['BPO','BPO'],['BPE','BPE'],['SME','SME'],
     ['Supplier','Supplier'],['Input','Input'],['Output','Output'],['Customer','Customer'],
     ['Previous','Previous'],['Next','Next'],
     ['KPI','KPI'],['Goal','Goal'],['Tool','Tool'],['Tool_function','Tool function'],['Tool_desc','Tool description'],
     ['Documentation','Documentation'],['Tool_link','Tool link'],['TestScript_link','Test script link']]
      .forEach(([k, label]) => rows.push([k, label, m[k]]));
  }
  return rows.filter(([, , v]) => v !== null && v !== undefined && String(v).trim() !== '');
}

function vsdxShapeData(sh) {
  const cells = exportDataRows(sh)
    .map(([k, label, v], i) =>
      '<Row N="' + k.replace(/[^A-Za-z0-9_]/g, '_') + '">' +
      '<Cell N="Value" V="' + vsdxEsc(String(v).trim()) + '" U="STR"/>' +
      '<Cell N="Prompt" V=""/><Cell N="Label" V="' + vsdxEsc(label) + '"/>' +
      '<Cell N="Format" V=""/><Cell N="SortKey" V="' + String(i).padStart(2, '0') + '"/>' +
      '<Cell N="Type" V="0"/><Cell N="Invisible" V="0"/><Cell N="Verify" V="0"/>' +
      '<Cell N="DataLinked" V="0"/><Cell N="LangID" V="nl-NL"/><Cell N="Calendar" V="0"/></Row>');
  return cells.length ? '<Section N="Property">' + cells.join('') + '</Section>' : '';
}

// Values are written out (not only formulas) so viewers that don't
// evaluate ShapeSheet formulas still lay the text out correctly.
function vsdxTextCells(w, h) {
  return '<Cell N="TxtPinX" V="' + vsdxNum(w / 2) + '" F="Width*0.5"/><Cell N="TxtPinY" V="' + vsdxNum(h / 2) + '" F="Height*0.5"/>' +
    '<Cell N="TxtWidth" V="' + vsdxNum(w) + '" F="Width*1"/><Cell N="TxtHeight" V="' + vsdxNum(h) + '" F="Height*1"/>' +
    '<Cell N="TxtLocPinX" V="' + vsdxNum(w / 2) + '" F="TxtWidth*0.5"/><Cell N="TxtLocPinY" V="' + vsdxNum(h / 2) + '" F="TxtHeight*0.5"/>' +
    '<Cell N="TxtAngle" V="0"/>';
}

function vsdxShapeXml(id, sh, pageH) {
  const w = sh.w / VSDX_DPI, h = sh.h / VSDX_DPI;
  const pinX = (sh.x + sh.w / 2) / VSDX_DPI;
  const pinY = (pageH - (sh.y + sh.h / 2)) / VSDX_DPI;
  return '<Shape ID="' + id + '" NameU="Process.' + id + '" Name="' + vsdxEsc(sh.code ? sh.code + ' ' + (sh.name || sh.text) : sh.text) +
    '" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">' +
    '<Cell N="PinX" V="' + vsdxNum(pinX) + '"/><Cell N="PinY" V="' + vsdxNum(pinY) + '"/>' +
    '<Cell N="Width" V="' + vsdxNum(w) + '"/><Cell N="Height" V="' + vsdxNum(h) + '"/>' +
    '<Cell N="LocPinX" V="' + vsdxNum(w / 2) + '" F="Width*0.5"/><Cell N="LocPinY" V="' + vsdxNum(h / 2) + '" F="Height*0.5"/>' +
    '<Cell N="Angle" V="0"/><Cell N="FlipX" V="0"/><Cell N="FlipY" V="0"/>' +
    '<Cell N="FillForegnd" V="' + sh.fill + '"/><Cell N="FillPattern" V="1"/>' +
    '<Cell N="LineColor" V="' + sh.stroke + '"/><Cell N="LinePattern" V="1"/>' +
    '<Cell N="LineWeight" V="' + vsdxNum(1.5 / VSDX_DPI) + '" U="PT"/>' +
    '<Cell N="Rounding" V="' + vsdxIn(SVG_LAYOUT.CORNER) + '" U="IN"/>' +
    '<Cell N="VerticalAlign" V="1"/>' +
    '<Cell N="LeftMargin" V="' + vsdxIn(10) + '" U="IN"/><Cell N="RightMargin" V="' + vsdxIn(10) + '" U="IN"/>' +
    '<Cell N="TopMargin" V="' + vsdxIn(4) + '" U="IN"/><Cell N="BottomMargin" V="' + vsdxIn(4) + '" U="IN"/>' +
    vsdxTextCells(w, h) +
    '<Section N="Character"><Row IX="0"><Cell N="Color" V="' + sh.color + '"/>' +
    '<Cell N="Size" V="' + vsdxIn(SVG_LAYOUT.FONT) + '" U="PT"/></Row></Section>' +
    '<Section N="Paragraph"><Row IX="0"><Cell N="HorzAlign" V="1"/></Row></Section>' +
    vsdxShapeData(sh) +
    '<Section N="Geometry" IX="0"><Cell N="NoFill" V="0"/><Cell N="NoLine" V="0"/><Cell N="NoShow" V="0"/><Cell N="NoSnap" V="0"/>' +
    '<Row T="RelMoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>' +
    '<Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="0"/></Row>' +
    '<Row T="RelLineTo" IX="3"><Cell N="X" V="1"/><Cell N="Y" V="1"/></Row>' +
    '<Row T="RelLineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row>' +
    '<Row T="RelLineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row></Section>' +
    (sh.text ? '<Text>' + vsdxEsc(sh.text) + '</Text>' : '') + '</Shape>';
}

function vsdxLabelXml(id, tag, pageH) {
  const w = tag.w / VSDX_DPI, h = tag.h / VSDX_DPI;
  return '<Shape ID="' + id + '" NameU="LevelLabel.' + id + '" Name="Level label ' + vsdxEsc(tag.text) +
    '" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">' +
    '<Cell N="PinX" V="' + vsdxNum((tag.x + tag.w / 2) / VSDX_DPI) + '"/>' +
    '<Cell N="PinY" V="' + vsdxNum((pageH - (tag.y + tag.h / 2)) / VSDX_DPI) + '"/>' +
    '<Cell N="Width" V="' + vsdxNum(w) + '"/><Cell N="Height" V="' + vsdxNum(h) + '"/>' +
    '<Cell N="LocPinX" V="' + vsdxNum(w / 2) + '" F="Width*0.5"/><Cell N="LocPinY" V="' + vsdxNum(h / 2) + '" F="Height*0.5"/>' +
    '<Cell N="FillPattern" V="0"/><Cell N="LinePattern" V="0"/><Cell N="VerticalAlign" V="1"/>' +
    vsdxTextCells(w, h) +
    '<Section N="Character"><Row IX="0"><Cell N="Color" V="' + tag.color + '"/>' +
    '<Cell N="Size" V="' + vsdxIn(11) + '" U="PT"/>' +
    '<Cell N="Style" V="1"/></Row></Section>' +
    '<Section N="Paragraph"><Row IX="0"><Cell N="HorzAlign" V="2"/></Row></Section>' +
    '<Text>' + vsdxEsc(tag.text) + '</Text></Shape>';
}

// 1-D dynamic connector from shape `fromId` to `toId` with an arrow head.
function vsdxConnectorXml(id, a, fromId, toId, pageH) {
  const bx = a.x1 / VSDX_DPI, by = (pageH - a.y1) / VSDX_DPI;
  const ex = a.x2 / VSDX_DPI, ey = (pageH - a.y2) / VSDX_DPI;
  const w = ex - bx, h = ey - by;
  return '<Shape ID="' + id + '" NameU="Dynamic connector.' + id + '" Name="Dynamic connector" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">' +
    '<Cell N="PinX" V="' + vsdxNum((bx + ex) / 2) + '" F="GUARD((BeginX+EndX)/2)"/>' +
    '<Cell N="PinY" V="' + vsdxNum((by + ey) / 2) + '" F="GUARD((BeginY+EndY)/2)"/>' +
    '<Cell N="Width" V="' + vsdxNum(w) + '" F="GUARD(EndX-BeginX)"/>' +
    '<Cell N="Height" V="' + vsdxNum(h) + '" F="GUARD(EndY-BeginY)"/>' +
    '<Cell N="LocPinX" V="' + vsdxNum(w / 2) + '" F="GUARD(Width*0.5)"/>' +
    '<Cell N="LocPinY" V="' + vsdxNum(h / 2) + '" F="GUARD(Height*0.5)"/>' +
    '<Cell N="BeginX" V="' + vsdxNum(bx) + '" F="_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)"/>' +
    '<Cell N="BeginY" V="' + vsdxNum(by) + '" F="_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)"/>' +
    '<Cell N="EndX" V="' + vsdxNum(ex) + '" F="_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)"/>' +
    '<Cell N="EndY" V="' + vsdxNum(ey) + '" F="_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)"/>' +
    '<Cell N="BegTrigger" V="2" F="_XFTRIGGER(Sheet.' + fromId + '!EventXFMod)"/>' +
    '<Cell N="EndTrigger" V="2" F="_XFTRIGGER(Sheet.' + toId + '!EventXFMod)"/>' +
    '<Cell N="ObjType" V="2"/><Cell N="ShapeRouteStyle" V="' + (a.vertical ? 2 : 1) + '"/>' +
    (a.points ? '<Cell N="ConLineRouteExt" V="1"/>' : '') +
    '<Cell N="LineColor" V="' + EXP_ARROW_COLOR + '"/><Cell N="LinePattern" V="' + (a.back ? 2 : 1) + '"/>' +
    '<Cell N="LineWeight" V="' + vsdxNum(1.5 / VSDX_DPI) + '" U="PT"/>' +
    '<Cell N="EndArrow" V="4"/><Cell N="EndArrowSize" V="1"/><Cell N="BeginArrow" V="0"/>' +
    '<Cell N="FillPattern" V="0"/>' +
    '<Section N="Geometry" IX="0"><Cell N="NoFill" V="1"/><Cell N="NoLine" V="0"/><Cell N="NoShow" V="0"/><Cell N="NoSnap" V="0"/>' +
    '<Row T="MoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>' +
    (a.points
      // Flow arrow: one line per segment of its route, relative to the begin point
      ? a.points.slice(1).map((p, k) => '<Row T="LineTo" IX="' + (k + 2) + '"><Cell N="X" V="' + vsdxNum(p[0] / VSDX_DPI - bx) +
          '"/><Cell N="Y" V="' + vsdxNum((pageH - p[1]) / VSDX_DPI - by) + '"/></Row>').join('')
      : '<Row T="LineTo" IX="2"><Cell N="X" V="' + vsdxNum(w) + '" F="Width"/><Cell N="Y" V="' + vsdxNum(h) + '" F="Height"/></Row>') +
    '</Section></Shape>';
}

function vsdxDocumentXml() {
  return '<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n' +
    '<VisioDocument xmlns="' + VSDX_NS + '" xmlns:r="' + VSDX_RNS + '" xml:space="preserve">' +
    '<DocumentSettings TopPage="0" DefaultTextStyle="0" DefaultLineStyle="0" DefaultFillStyle="0" DefaultGuideStyle="0">' +
    '<GlueSettings>9</GlueSettings><SnapSettings>65847</SnapSettings><SnapExtensions>34</SnapExtensions><SnapAngles/>' +
    '<DynamicGridEnabled>1</DynamicGridEnabled><ProtectStyles>0</ProtectStyles><ProtectShapes>0</ProtectShapes>' +
    '<ProtectMasters>0</ProtectMasters><ProtectBkgnds>0</ProtectBkgnds></DocumentSettings>' +
    '<Colors><ColorEntry IX="0" RGB="#000000"/><ColorEntry IX="1" RGB="#FFFFFF"/></Colors>' +
    '<FaceNames><FaceName NameU="Calibri" UnicodeRanges="-536859905 -1073732485 9 0" CharSets="536871423 0" Panose="2 15 5 2 2 2 4 3 2 4" Flags="325"/></FaceNames>' +
    '<StyleSheets><StyleSheet ID="0" NameU="No Style" IsCustomNameU="1" Name="No Style" IsCustomName="1">' +
    '<Cell N="EnableLineProps" V="1"/><Cell N="EnableFillProps" V="1"/><Cell N="EnableTextProps" V="1"/>' +
    '<Cell N="HideForApply" V="0"/><Cell N="LineWeight" V="0.01041666666666667"/><Cell N="LineColor" V="0"/>' +
    '<Cell N="LinePattern" V="1"/><Cell N="Rounding" V="0"/><Cell N="EndArrowSize" V="2"/><Cell N="BeginArrow" V="0"/>' +
    '<Cell N="EndArrow" V="0"/><Cell N="LineCap" V="0"/><Cell N="BeginArrowSize" V="2"/><Cell N="LineColorTrans" V="0"/>' +
    '<Cell N="CompoundType" V="0"/><Cell N="FillForegnd" V="1"/><Cell N="FillBkgnd" V="0"/><Cell N="FillPattern" V="1"/>' +
    '<Cell N="ShdwForegnd" V="0"/><Cell N="ShdwPattern" V="0"/><Cell N="FillForegndTrans" V="0"/><Cell N="FillBkgndTrans" V="0"/>' +
    '<Cell N="ShdwForegndTrans" V="0"/><Cell N="ShapeShdwType" V="0"/><Cell N="ShapeShdwOffsetX" V="0"/><Cell N="ShapeShdwOffsetY" V="0"/>' +
    '<Cell N="ShapeShdwObliqueAngle" V="0"/><Cell N="ShapeShdwScaleFactor" V="1"/><Cell N="ShapeShdwBlur" V="0"/><Cell N="ShapeShdwShow" V="0"/>' +
    '<Cell N="LeftMargin" V="0"/><Cell N="RightMargin" V="0"/><Cell N="TopMargin" V="0"/><Cell N="BottomMargin" V="0"/>' +
    '<Cell N="VerticalAlign" V="1"/><Cell N="TextBkgnd" V="0"/><Cell N="DefaultTabStop" V="0.5"/><Cell N="TextDirection" V="0"/>' +
    '<Cell N="TextBkgndTrans" V="0"/><Cell N="LockTextEdit" V="0"/><Cell N="LockVtxEdit" V="0"/>' +
    '<Section N="Character"><Row IX="0"><Cell N="Font" V="Calibri"/><Cell N="Color" V="0"/><Cell N="Style" V="0"/>' +
    '<Cell N="Case" V="0"/><Cell N="Pos" V="0"/><Cell N="FontScale" V="1"/><Cell N="Size" V="0.1666666666666667"/>' +
    '<Cell N="DblUnderline" V="0"/><Cell N="Overline" V="0"/><Cell N="Strikethru" V="0"/><Cell N="DoubleStrikethrough" V="0"/>' +
    '<Cell N="Letterspace" V="0"/><Cell N="ColorTrans" V="0"/><Cell N="AsianFont" V="0"/><Cell N="ComplexScriptFont" V="0"/>' +
    '<Cell N="ComplexScriptSize" V="-1"/><Cell N="LangID" V="nl-NL"/></Row></Section>' +
    '<Section N="Paragraph"><Row IX="0"><Cell N="IndFirst" V="0"/><Cell N="IndLeft" V="0"/><Cell N="IndRight" V="0"/>' +
    '<Cell N="SpLine" V="-1.2"/><Cell N="SpBefore" V="0"/><Cell N="SpAfter" V="0"/><Cell N="HorzAlign" V="1"/>' +
    '<Cell N="Bullet" V="0"/><Cell N="BulletStr" V=""/><Cell N="BulletFont" V="0"/><Cell N="BulletFontSize" V="-1"/>' +
    '<Cell N="TextPosAfterBullet" V="0"/><Cell N="Flags" V="0"/></Row></Section>' +
    '<Section N="Tabs"><Row IX="0"/></Section>' +
    '</StyleSheet></StyleSheets></VisioDocument>';
}

function buildVsdxBlob(result, pageName) {
  const pageH = result.svgH;
  const name  = vsdxEsc(String(pageName || 'Process').slice(0, 31));
  let id = 1;
  const shapeIds = [];
  const shapeXml = (result.levelTags || []).map(t => vsdxLabelXml(id++, t, pageH))
    .concat((result.shapes || []).map((sh, i) => { shapeIds[i] = id; return vsdxShapeXml(id++, sh, pageH); }))
    .concat((result.arrows || []).map(a => vsdxConnectorXml(id++, a, shapeIds[a.from], shapeIds[a.to], pageH)))
    .join('');
  // Glue connectors to their shapes so they follow when shapes are moved
  let cid = id - (result.arrows || []).length;
  const connects = (result.arrows || []).map(a => {
    const c = cid++;
    return '<Connect FromSheet="' + c + '" FromCell="BeginX" FromPart="9" ToSheet="' + shapeIds[a.from] + '" ToCell="PinX" ToPart="3"/>' +
           '<Connect FromSheet="' + c + '" FromCell="EndX" FromPart="12" ToSheet="' + shapeIds[a.to] + '" ToCell="PinX" ToPart="3"/>';
  }).join('');

  const xmlHead = '<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n';
  const pageW = vsdxIn(result.svgW), pageHIn = vsdxIn(result.svgH);
  const files = [
    ['[Content_Types].xml', xmlHead +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>' +
      '<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>' +
      '<Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>' +
      '<Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>'],
    ['_rels/.rels', xmlHead +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId2" Type="' + VSDX_REL + 'document" Target="visio/document.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>'],
    ['docProps/app.xml', xmlHead +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      '<Application>Microsoft Visio</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>' +
      '<LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged>' +
      '<AppVersion>16.0000</AppVersion></Properties>'],
    ['docProps/core.xml', xmlHead +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + name + '</dc:title>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created>' +
      '</cp:coreProperties>'],
    ['visio/_rels/document.xml.rels', xmlHead +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + VSDX_REL + 'pages" Target="pages/pages.xml"/>' +
      '<Relationship Id="rId2" Type="' + VSDX_REL + 'windows" Target="windows.xml"/>' +
      '</Relationships>'],
    ['visio/document.xml', vsdxDocumentXml()],
    ['visio/windows.xml', xmlHead +
      '<Windows ClientWidth="1280" ClientHeight="800" xmlns="' + VSDX_NS + '" xmlns:r="' + VSDX_RNS + '" xml:space="preserve">' +
      '<Window ID="0" WindowType="Drawing" WindowState="1073741824" WindowLeft="-8" WindowTop="-31" ' +
      'WindowWidth="1296" WindowHeight="839" ContainerType="Page" Page="0" ViewScale="-1" ' +
      'ViewCenterX="' + vsdxNum(result.svgW / VSDX_DPI / 2) + '" ViewCenterY="' + vsdxNum(result.svgH / VSDX_DPI / 2) + '">' +
      '<ShowRulers>1</ShowRulers><ShowGrid>1</ShowGrid><ShowPageBreaks>0</ShowPageBreaks><ShowGuides>1</ShowGuides>' +
      '<ShowConnectionPoints>1</ShowConnectionPoints><GlueSettings>9</GlueSettings><SnapSettings>65847</SnapSettings>' +
      '<SnapExtensions>34</SnapExtensions><SnapAngles/><DynamicGridEnabled>1</DynamicGridEnabled><TabSplitterPos>0.5</TabSplitterPos>' +
      '</Window></Windows>'],
    ['visio/pages/_rels/pages.xml.rels', xmlHead +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + VSDX_REL + 'page" Target="page1.xml"/>' +
      '</Relationships>'],
    ['visio/pages/pages.xml', xmlHead +
      '<Pages xmlns="' + VSDX_NS + '" xmlns:r="' + VSDX_RNS + '" xml:space="preserve">' +
      '<Page ID="0" NameU="' + name + '" Name="' + name + '" ViewScale="-1" ViewCenterX="0" ViewCenterY="0">' +
      '<PageSheet LineStyle="0" FillStyle="0" TextStyle="0">' +
      '<Cell N="PageWidth" V="' + pageW + '"/><Cell N="PageHeight" V="' + pageHIn + '"/>' +
      (result.pageOrient ? '<Cell N="PrintPageOrientation" V="' + (result.pageOrient === 'portrait' ? 1 : 2) + '"/>' : '') +
      '<Cell N="ShdwOffsetX" V="0.125"/><Cell N="ShdwOffsetY" V="-0.125"/>' +
      '<Cell N="PageScale" V="1" U="IN"/><Cell N="DrawingScale" V="1" U="IN"/>' +
      '<Cell N="DrawingSizeType" V="0"/><Cell N="DrawingScaleType" V="0"/>' +
      '<Cell N="InhibitSnap" V="0"/><Cell N="PageLockReplace" V="0" U="BOOL"/><Cell N="PageLockDuplicate" V="0" U="BOOL"/>' +
      '<Cell N="UIVisibility" V="0"/><Cell N="ShdwType" V="0"/><Cell N="ShdwObliqueAngle" V="0"/><Cell N="ShdwScaleFactor" V="1"/>' +
      '<Cell N="DrawingResizeType" V="1"/><Cell N="PageShapeSplit" V="1"/>' +
      '</PageSheet><Rel r:id="rId1"/></Page></Pages>'],
    ['visio/pages/page1.xml', xmlHead +
      '<PageContents xmlns="' + VSDX_NS + '" xmlns:r="' + VSDX_RNS + '" xml:space="preserve">' +
      '<Shapes>' + shapeXml + '</Shapes>' + (connects ? '<Connects>' + connects + '</Connects>' : '') + '</PageContents>'],
  ];
  return new Blob([zipStore(files)], { type: 'application/vnd.ms-visio.drawing' });
}

// ── DRAW.IO EXPORT ────────────────────────────────────────────────────────
// Same layout as the SVG export, as draw.io XML (mxfile). Process data is
// stored as shape properties (Edit Data in draw.io). The XML can be pasted
// straight onto a draw.io canvas or saved as a .drawio file.
function buildDrawioXml(result, pageName) {
  return '<mxfile host="Nexus" type="device">\n' + buildDrawioDiagram(result, pageName) + '</mxfile>\n';
}
// One page (<diagram>) of a draw.io file. opts (all tabs in one file):
// id: the page id; linkOf(shape): { id, name } of the tab its block opens,
// or null (the block gets a small arrow in its corner); back: { id, name },
// a small "↑ Back" button top left that opens the tab one up.
function buildDrawioDiagram(result, pageName, opts) {
  opts = opts || {};
  const r1 = n => String(Math.round(n * 10) / 10);
  const geo = (o) => '<mxGeometry x="' + r1(o.x) + '" y="' + r1(o.y) + '" width="' + r1(o.w) +
    '" height="' + r1(o.h) + '" as="geometry"/>';
  // Labels are rendered as HTML (html=1, needed for wrapping), so escape twice.
  const label = t => vsdxEsc(String(t).split('\n').map(escHtml).join('<br>'));
  const cells = [], icons = [];
  let id = 2;
  // Swimlanes: one pool with a lane per group, as native draw.io containers.
  // Lanes are children of the pool and steps children of their lane, with
  // coordinates relative to the container; connectors stay on the page.
  const swim = result.swim;
  const parentOf = sh => swim ? 'lane' + sh.lane : '1';
  const relGeo = sh => swim ? Object.assign({}, sh, { x: sh.x - swim.lanes[sh.lane].x, y: sh.y - swim.lanes[sh.lane].y }) : sh;
  if (swim) {
    const st = (head, body) => 'swimlane;' + (swim.horizontal ? 'horizontal=0;' : '') + 'startSize=' + SWIM.HEAD +
      ';html=1;whiteSpace=wrap;collapsible=0;fillColor=' + head + ';swimlaneFillColor=' + body + ';strokeColor=' + SWIM_COLORS.stroke +
      ';fontColor=' + SWIM_COLORS.text + ';';
    const P = swim.pool;
    cells.push('<mxCell id="pool" value="' + label(P.title) + '" style="' + st(SWIM_COLORS.poolHead, SWIM_COLORS.laneBody) +
      'fontStyle=1;fontSize=12;" vertex="1" parent="1">' + geo(P) + '</mxCell>');
    swim.lanes.forEach((l, i) => {
      cells.push('<mxCell id="lane' + i + '" value="' + label(l.title) + '" style="' + st(SWIM_COLORS.laneHead, SWIM_COLORS.laneBody) +
        'fontSize=11;fontStyle=0;" vertex="1" parent="pool">' + geo({ x: l.x - P.x, y: l.y - P.y, w: l.w, h: l.h }) + '</mxCell>');
    });
  }
  (result.levelTags || []).forEach(t => {
    cells.push('<mxCell id="n' + (id++) + '" value="' + label(t.text) + '" style="text;html=1;align=right;' +
      'verticalAlign=middle;fontStyle=1;fontSize=11;fontColor=' + t.color + ';" vertex="1" parent="1">' +
      geo(t) + '</mxCell>');
  });
  (result.shapes || []).forEach((sh, i) => {
    const shapeStyle = 'rounded=1;absoluteArcSize=1;arcSize=' + (SVG_LAYOUT.CORNER * 2) + ';';
    const attrs = exportDataRows(sh)
      .filter(([k]) => k !== 'Name')
      .map(([k, , v]) => ' ' + k.replace(/[^A-Za-z0-9_]/g, '_') + '="' + vsdxEsc(String(v).trim()) + '"').join('');
    const to = opts.linkOf ? opts.linkOf(sh) : null;
    const link = to ? ' link="data:page/id,' + vsdxEsc(to.id) + '" tooltip="' + vsdxEsc('Open tab: ' + to.name) + '"' : '';
    if (to) {
      // Small arrow in the top right corner: this block has its own tab
      const g = relGeo(sh);
      icons.push('<object id="s' + i + 'go" label="\u2197"' + link + '>' +
        '<mxCell style="text;html=1;align=center;verticalAlign=middle;fontSize=13;fontStyle=1;fontColor=' + sh.stroke +
        ';" vertex="1" parent="' + parentOf(sh) + '">' + geo({ x: g.x + g.w - 22, y: g.y + 2, w: 20, h: 20 }) + '</mxCell></object>');
    }
    cells.push('<object id="s' + i + '" label="' + label(sh.text) + '"' + link + attrs + '>' +
      '<mxCell style="' + shapeStyle + 'whiteSpace=wrap;html=1;' +
      'fillColor=' + sh.fill + ';strokeColor=' + sh.stroke + ';strokeWidth=1.5;fontColor=' + sh.color +
      ';fontSize=' + SVG_LAYOUT.FONT + ';spacing=10;" vertex="1" parent="' + parentOf(sh) + '">' + geo(relGeo(sh)) + '</mxCell></object>');
  });
  (result.arrows || []).forEach((a, i) => {
    if (a.points) {
      // Flow arrow: fixed ports and the route's bends as waypoints
      const ports = a.tb
        ? 'exitX=0.5;exitY=1;' + (a.back ? 'entryX=0;entryY=0.5;' : 'entryX=0.5;entryY=0;')
        : 'exitX=1;exitY=0.5;' + (a.back ? 'entryX=0.5;entryY=0;' : 'entryX=0;entryY=0.5;');
      const way = a.points.slice(1, -1).map(p => '<mxPoint x="' + r1(p[0]) + '" y="' + r1(p[1]) + '"/>').join('');
      cells.push('<mxCell id="e' + i + '" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;' +
        ports + (a.back ? 'dashed=1;' : '') + 'strokeColor=' + EXP_ARROW_COLOR + ';strokeWidth=1.5;" edge="1" parent="1" source="s' + a.from +
        '" target="s' + a.to + '"><mxGeometry relative="1" as="geometry">' + (way ? '<Array as="points">' + way + '</Array>' : '') +
        '</mxGeometry></mxCell>');
      return;
    }
    // Vertical arrow from a block with children goes round the left side
    // Top to bottom: steps flow downwards; a sideways arrow from a block with children goes over the top
    const ports = swim
      ? (a.tb ? 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;' : 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;')
      : a.tb
      ? (a.vertical ? 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;'
         : a.fromHasKids ? 'exitX=0.5;exitY=0;entryX=0.5;entryY=0;' : 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;')
      : !a.vertical ? 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;'
      : a.fromHasKids ? 'exitX=0;exitY=0.5;entryX=0;entryY=0.5;'
      : 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;';
    cells.push('<mxCell id="e' + i + '" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;' +
      ports + 'strokeColor=' + EXP_ARROW_COLOR + ';strokeWidth=1.5;" edge="1" parent="1" source="s' + a.from +
      '" target="s' + a.to + '"><mxGeometry relative="1" as="geometry"/></mxCell>');
  });
  cells.push(...icons);
  if (opts.back) {
    cells.push('<object id="back" label="\u2191 Back" link="data:page/id,' + vsdxEsc(opts.back.id) + '" tooltip="' +
      vsdxEsc('Back to ' + opts.back.name) + '">' +
      '<mxCell style="rounded=1;arcSize=50;html=1;align=center;verticalAlign=middle;fontSize=11;fillColor=#ffffff;' +
      'strokeColor=#cbd5e1;fontColor=#475569;" vertex="1" parent="1">' +
      geo({ x: 12, y: 8, w: 64, h: 22 }) + '</mxCell></object>');
  }
  const name = vsdxEsc(pageName || 'Process');
  return '<diagram id="' + vsdxEsc(opts.id || 'nexus-process') + '" name="' + name + '">\n' +
    '<mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" ' +
    'pageScale="1" pageWidth="' + Math.ceil(result.svgW) + '" pageHeight="' + Math.ceil(result.svgH) + '" math="0" shadow="0">\n' +
    '<root>\n<mxCell id="0"/>\n<mxCell id="1" parent="0"/>\n' + cells.join('\n') + '\n</root>\n' +
    '</mxGraphModel>\n</diagram>\n';
}
// All tabs in one file (draw.io and HTML): the tabs as laid out, with,
// when navigation is on, the tab each block opens and the tab each tab's
// back button returns to. A block opens the next deeper tab of that
// process (the one that shows the most levels below it, the shallowest of
// those first); a tab's back button goes to the first tab that opens it.
// Returns { items, linkOf(i, shape) -> spec|null, backOf(spec) -> spec|null }.
function expTabLinks() {
  const { items } = expBuildItems();
  const nav = !!expSettings.tabNav;
  const byPath = new Map();
  items.forEach(it => { if (it.spec.path) { const k = expKey(it.spec.path); if (!byPath.has(k)) byPath.set(k, []); byPath.get(k).push(it.spec); } });
  const target = (sp, path) => {
    const own = sp.path && expKey(sp.path) === expKey(path);
    let best = null;
    (byPath.get(expKey(path)) || []).forEach(t => {
      if (t === sp || !(t.rule.t > sp.rule.t || (t.rule.t === sp.rule.t && !own))) return;
      if (!best || t.rule.t < best.rule.t) best = t;
    });
    return best;
  };
  const backOf = new Map();
  const linkMaps = items.map(it => {
    const m = new Map();
    if (!nav) return m;
    (it.result.shapes || []).forEach(sh => {
      if (!sh.path) return;
      const t = target(it.spec, sh.path);
      if (!t) return;
      m.set(expKey(sh.path), t);
      if (!backOf.has(t.id)) backOf.set(t.id, it.spec);
    });
    return m;
  });
  return {
    items, nav,
    linkOf: (i, sh) => nav && sh.path ? linkMaps[i].get(expKey(sh.path)) || null : null,
    backOf: sp => backOf.get(sp.id) || null,
  };
}
// All tabs in one .drawio file: every tab as a page
function expDrawioTabsXml() {
  const { items, nav, linkOf, backOf } = expTabLinks();
  const pages = items.map((it, i) => {
    const sp = it.spec, back = backOf(sp);
    return buildDrawioDiagram(expFramed(it.result), it.title, {
      id: sp.id,
      linkOf: nav ? sh => linkOf(i, sh) : null,
      back: back ? { id: back.id, name: back.name } : null,
    });
  });
  return '<mxfile host="Nexus" type="device" pages="' + pages.length + '">\n' + pages.join('') + '</mxfile>\n';
}

// Minimal ZIP writer (store, no compression) — enough for an OPC package.
const ZIP_CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function zipCrc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = ZIP_CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipStore(files) {
  const enc = new TextEncoder();
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const chunks = [], central = [];
  let offset = 0;
  files.forEach(([path, content]) => {
    const nameB = enc.encode(path);
    const data  = typeof content === 'string' ? enc.encode(content) : content;
    const crc   = zipCrc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), nameB, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true);
    ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true); ch.setUint16(28, nameB.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  });
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = chunks.concat(central, [new Uint8Array(end.buffer)]);
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let p = 0; all.forEach(b => { out.set(b, p); p += b.length; });
  return out;
}

function showExportToast(msg) {
  exportToast.textContent = msg;
  exportToast.classList.add('show');
  setTimeout(() => exportToast.classList.remove('show'), 1800);
}

function wrapText(text, maxPx, fontSize) {
  const avgCharW = fontSize * 0.56;
  const maxChars = Math.floor(maxPx / avgCharW);
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (test.length <= maxChars) { cur = test; }
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}
