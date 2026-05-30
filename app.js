    'use strict';

    // ── CONSTANTS ──────────────────────────────────────────────────────────
    const STORAGE_KEY      = 'processFlowData';
    const SIG_KEY          = 'processFlowSig';
    const SIGN_SALT        = 'PF::integrity::v1::';
    const PANEL_CHIP_FIELDS = ['R','A','S','C','I','Input','Output'];
    const PANEL_TEXT_FIELDS = ['L4_Desc','L5_Desc','Tool','Goal','KPI','Documentation','Tool_function','Tool_navigation','Tool_desc','Tool_link','TestScript_link'];
    const BASE    = { nw: 180, nh: 88, fs: 1.0, cw: 40, nwv: 600 };
    const ZOOM_STEP = 0.10;
    const ZOOM_MIN  = 0.5;
    const ZOOM_MAX  = 2.0;

    // ── STATE ──────────────────────────────────────────────────────────────
    let tree          = {};
    let currentPath   = [];
    let zoomLevel     = 1.0;
    let presentMode   = false;
    let presentScale  = 1.5;
    let lastFocusedIdx = 0;
    let _pendingFocusKey = null; // key to focus after next render transition
    let lastFocusedKey = '';
    let selectedKey    = '';
    const levelOffset = 1;   // always L1 as root (L0 level no longer used)
    let _sessionData  = null;   // in-memory only; cleared on every fresh page load
    let erpLaneVisible = false;   // ERP swim-lane toggle
    let _outputIndex  = new Map(); // lowercase output text → [{path: string[], dfsIdx: number}]
    let _inputIndex   = new Map(); // lowercase output text → steps that consume it as Input
    let _dfsPathList  = [];        // all node paths in DFS pre-order
    let highlightSysActivity = false; // highlight system activity nodes
    let highlightMeeting = false;     // highlight meeting nodes
    let ipBottomCollapsed = true; // collapsed state of Tool/Doc card in info panel
    let ipRasciCollapsed  = true; // collapsed state of RASCI card in presentation mode
    let ipSipocCollapsed  = true; // collapsed state of SIPOC card in presentation mode

    // ── DOM ────────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const flowContainer  = $('flowContainer');
    const btnHome        = $('btnHome');
    const btnUp          = $('btnUp');
    const breadcrumb     = $('breadcrumb');
    const searchInput    = $('searchInput');
    const searchDropdown = $('searchDropdown');
    const levelInfo      = $('levelInfo');
    const levelLabel     = $('levelLabel');
    const pathTree       = $('pathTree');
    const zoomLabel      = $('zoomLabel');
    const btnZoomIn      = $('btnZoomIn');
    const btnZoomOut     = $('btnZoomOut');
    const btnReset       = $('btnReset');
    const ipContent      = $('ipContent');
    const ipName         = $('ipName');
    const ipType         = $('ipType');
    const ipTable        = $('ipTable');
    const ipPlaceholder  = $('ipPlaceholder');
    const exportToast    = $('exportToast');
    const infoPanel      = $('infoPanel');
    const mainEl         = $('main');
    const root           = document.documentElement;

    // ── DATA ───────────────────────────────────────────────────────────────

    // ── CSV PARSER (RFC 4180, auto-detects , or ; delimiter) ──────────────
    function parseCSV(text) {
      const src = (text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)
                    .replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const firstLine = src.slice(0, src.indexOf('\n') < 0 ? undefined : src.indexOf('\n'));
      const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
      const rows = [];
      let headers = null;
      let pos = 0;
      const len = src.length;
      while (pos < len) {
        const fields = [];
        while (pos < len) {
          if (src[pos] === '"') {
            pos++;
            let val = '';
            while (pos < len) {
              if (src[pos] === '"') {
                pos++;
                if (pos < len && src[pos] === '"') { val += '"'; pos++; }
                else break;
              } else { val += src[pos++]; }
            }
            fields.push(val);
          } else {
            const start = pos;
            while (pos < len && src[pos] !== delim && src[pos] !== '\n') pos++;
            fields.push(src.slice(start, pos));
          }
          if (pos >= len || src[pos] === '\n') break;
          if (src[pos] === delim) pos++;
        }
        if (pos < len && src[pos] === '\n') pos++;
        if (fields.length === 1 && fields[0] === '') continue;
        if (!headers) {
          headers = fields;
        } else {
          const obj = {};
          headers.forEach((h, i) => { obj[h] = i < fields.length ? fields[i] : ''; });
          if (Object.values(obj).some(v => v !== '')) rows.push(obj);
        }
      }
      return rows;
    }

    async function computeSig(json) {
      const data = new TextEncoder().encode(SIGN_SALT + json);
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function loadData() {
      // ── 1. Auto-fetch data.csv from the same directory ─────────────────
      try {
        const res = await fetch('./data.csv');
        if (res.ok) {
          const text = await res.text();
          const rows = parseCSV(text);
          if (Array.isArray(rows) && rows.length && 'L1' in rows[0]) return rows;
        }
      } catch (_) {}

      // ── 2. Check for embedded data (saved/shared standalone file) ──────
      if (window.__PF_EMBED__) {
        try {
          const { d, s } = window.__PF_EMBED__;
          const expected = await computeSig(d);
          if (s === expected) {
            const p = JSON.parse(d);
            if (Array.isArray(p) && p.length) return p;
          }
        } catch (_) {}
      }
      // ── 3. Fall back to in-session import data (manual upload during session) ──
      if (_sessionData) {
        try {
          const { raw, sig } = _sessionData;
          const expected = await computeSig(raw);
          if (sig === expected) {
            const p = JSON.parse(raw);
            if (Array.isArray(p) && p.length) return p;
          }
        } catch (_) {}
      }
      return null;
    }

    function buildTree(rows) {
      const t = {};
      for (const row of rows) {
        const levels = [row.L1,row.L2,row.L3,row.L4]
          .map(v => v != null ? String(v).trim() : '').filter(Boolean);
        if (!levels.length) continue;
        // L1 is always the root level (absolute depth 1)
        const startDepth = 1;
        let cur = t;
        for (let i = 0; i < levels.length; i++) {
          const k = levels[i];
          if (!cur[k]) cur[k] = { _children:{}, _meta:null, _desc:'', _code:'' };
          // Capture level description — first non-empty value wins
          const descKey = 'L' + (startDepth + i) + '_Desc';
          if (!cur[k]._desc && row[descKey]) cur[k]._desc = String(row[descKey]).trim();
          // Capture level code — first non-empty value wins
          const codeKey = 'L' + (startDepth + i) + '_code';
          if (!cur[k]._code && row[codeKey]) cur[k]._code = String(row[codeKey]).trim();
          if (i === levels.length - 1) {
            const rawUoM = row['Time Unit-of-Measure'] || row['Time_UoM'] || row['Time UoM'] || '';
            const rawStart = row['Start'];
            const rawEnd   = row['End'];
            const rawFreq  = row['Frequency'] || row['frequency'] || '';
            cur[k]._meta = { R:row.R, A:row.A, S:row.S, C:row.C, I:row.I,
              L4_Desc:row.L4_Desc, L5_Desc:row.L5_Desc, Supplier:row.Supplier, Input:row.Input, Output:row.Output, Customer:row.Customer,
              Tool:row.Tool, Goal:row.Goal, KPI:row.KPI, Documentation:row.Documentation, Type:row.Type,
              BPO:row.BPO, BPE:row.BPE, SME:row.SME,
              Tool_function:row.Tool_function, Tool_navigation:row.Tool_navigation, Tool_desc:row.Tool_desc,
              Tool_link:row.Tool_link, TestScript_link:row.TestScript_link,
              Time_UoM: rawUoM ? String(rawUoM).trim() : '',
              Frequency: rawFreq ? String(rawFreq).trim() : '',
              Start: (rawStart !== '' && rawStart != null && !isNaN(Number(rawStart))) ? Number(rawStart) : null,
              End:   (rawEnd   !== '' && rawEnd   != null && !isNaN(Number(rawEnd)))   ? Number(rawEnd)   : null };
          }
          cur = cur[k]._children;
        }
      }
      return t;
    }

    // Auto-size nodes to fit the longest label in 3 lines
    function autoSizeNodes(t) {
      let maxLen = 0;
      function walk(node) {
        for (const [k, v] of Object.entries(node)) {
          maxLen = Math.max(maxLen, k.length);
          walk(v._children);
        }
      }
      walk(t);
      if (!maxLen) return;
      // At 1rem ≈ 16px, avg char width ≈ 8.8px, 3 lines, horizontal padding 24px
      const charW = 8.8;
      const pad   = 28;
      const lines = 3;
      const needed = Math.ceil(maxLen / lines) * charW + pad;
      BASE.nw = Math.max(160, Math.min(320, Math.round(needed)));
    }

    function getNodesAtPath(path) {
      let cur = tree;
      for (const seg of path) { if (!cur[seg]) return {}; cur = cur[seg]._children; }
      return cur;
    }

    function getNodeAtPath(pathArr) {
      if (!pathArr.length) return null;
      let cur = tree;
      for (let i = 0; i < pathArr.length - 1; i++) {
        const seg = pathArr[i];
        if (!cur[seg]) return null;
        cur = cur[seg]._children;
      }
      const last = pathArr[pathArr.length - 1];
      return cur[last] || null;
    }

    function buildOutputIndex(t) {
      _outputIndex = new Map();
      _inputIndex  = new Map();
      _dfsPathList = [];
      function walk(children, pathSoFar) {
        for (const [key, node] of Object.entries(children)) {
          const p = [...pathSoFar, key];
          _dfsPathList.push(p);
          const dfsIdx = _dfsPathList.length - 1;
          if (node._meta) {
            if (node._meta.Output) {
              const vals = splitSemicolon(node._meta.Output).map(s => s.toLowerCase());
              for (const v of vals) {
                if (!_outputIndex.has(v)) _outputIndex.set(v, []);
                _outputIndex.get(v).push({ path: p, dfsIdx });
              }
            }
            if (node._meta.Input) {
              const vals = splitSemicolon(node._meta.Input).map(s => s.toLowerCase());
              for (const v of vals) {
                if (!_inputIndex.has(v)) _inputIndex.set(v, []);
                _inputIndex.get(v).push({ path: p, dfsIdx });
              }
            }
          }
          walk(node._children, p);
        }
      }
      walk(t, []);
    }

    function isValidPath(path) {
      let cur = tree;
      for (const seg of path) { if (!cur[seg]) return false; cur = cur[seg]._children; }
      return true;
    }

    function searchAll(query, node, path, results, seen) {
      const q = query.toLowerCase();
      if (!seen) seen = new Set();
      for (const key of Object.keys(node)) {
        const np = path.concat(key);
        const pathKey = np.join('\x00');
        let added = false;
        if (key.toLowerCase().includes(q)) {
          results.push({ name:key, path:np });
          seen.add(pathKey);
          added = true;
        }
        if (!added && node[key]._code && node[key]._code.toLowerCase().startsWith(q)) {
          results.push({ name:key, path:np, fieldMatch:{ field:'Code', value:node[key]._code } });
          seen.add(pathKey);
          added = true;
        }
        const meta = node[key]._meta;
        if (!added && meta) {
          for (const field of ['R','A','S','C','I']) {
            if (!meta[field]) continue;
            const names = splitSemicolon(meta[field]);
            const hit = names.find(n => n.toLowerCase().includes(q));
            if (hit) {
              results.push({ name:key, path:np, rasciMatch:{ field, value:hit } });
              seen.add(pathKey);
              break;
            }
          }
        }
        searchAll(query, node[key]._children, np, results, seen);
      }
    }

    // All searchable meta columns (name is the process node name itself)
    const SEARCH_FIELDS = [
      { key: 'name',     label: 'Name',     hint: 'Process / step name' },
      { key: '_code',   label: 'Code',     hint: 'Process code' },
      { key: 'Type',     label: 'Type',     hint: 'Process type' },
      { key: 'R',        label: 'R',        hint: 'Responsible' },
      { key: 'A',        label: 'A',        hint: 'Accountable' },
      { key: 'S',        label: 'S',        hint: 'Supporting' },
      { key: 'C',        label: 'C',        hint: 'Consulted' },
      { key: 'I',        label: 'I',        hint: 'Informed' },
      { key: 'Supplier', label: 'Supplier', hint: 'Supplier' },
      { key: 'Input',    label: 'Input',    hint: 'Input' },
      { key: 'Output',   label: 'Output',   hint: 'Output' },
      { key: 'Customer', label: 'Customer', hint: 'Customer' },
      { key: 'KPI',      label: 'KPI',      hint: 'KPI' },
      { key: 'Goal',     label: 'Goal',     hint: 'Goal' },
      { key: 'Tool',     label: 'Tool',     hint: 'Tool' },
    ];

    // Search restricted to a single field across the whole tree
    function searchByField(fieldKey, query, node, path, results, seen) {
      const q = query.toLowerCase();
      if (!seen) seen = new Set();
      for (const key of Object.keys(node)) {
        const np = path.concat(key);
        const pathKey = np.join('\x00');
        const meta = node[key]._meta;
        if (!seen.has(pathKey)) {
          if (fieldKey === 'name') {
            if (key.toLowerCase().includes(q)) {
              results.push({ name: key, path: np });
              seen.add(pathKey);
            }
          } else if (fieldKey === '_code') {
            const code = node[key]._code || '';
            if (code && code.toLowerCase().startsWith(q)) {
              results.push({ name: key, path: np, fieldMatch: { field: 'Code', value: code } });
              seen.add(pathKey);
            }
          } else if (meta && meta[fieldKey] !== undefined && meta[fieldKey] !== null && meta[fieldKey] !== '') {
            const raw = String(meta[fieldKey]);
            const values = splitSemicolon(raw);
            const hit = values.find(v => v.toLowerCase().includes(q));
            if (hit) {
              results.push({ name: key, path: np, fieldMatch: { field: fieldKey, value: hit } });
              seen.add(pathKey);
            }
          }
        }
        searchByField(fieldKey, query, node[key]._children, np, results, seen);
      }
    }

    // ── RENDER ─────────────────────────────────────────────────────────────
    function render(direction) {
      const nodes = getNodesAtPath(currentPath);
      const keys  = Object.keys(nodes);
      const isL5  = (levelOffset + currentPath.length) === 4 && erpLaneVisible; // viewing L4 nodes (drilled into L3)

      // ── Business process lane ──
      const newLevel = document.createElement('div');
      newLevel.className = 'flow-level';

      if (!keys.length) {
        const msg = document.createElement('div');
        msg.className = 'empty-state';
        msg.innerHTML = '<h2>No items at this level</h2><p>Try going back up.</p>';
        newLevel.appendChild(msg);
      } else {
        // Separate main nodes from alternative nodes (keys containing ' ~')
        const mainKeys = keys.filter(k => !k.includes(' ~'));
        const altMap   = {};
        keys.filter(k => k.includes(' ~')).forEach(k => {
          const base = k.substring(0, k.indexOf(' ~'));
          (altMap[base] = altMap[base] || []).push(k);
        });

        // Render main nodes, wrapping each in .node-group when it has alt variants
        mainKeys.forEach((key, i) => {
          const alts = altMap[key] || [];
          if (alts.length) {
            const group = document.createElement('div');
            group.className = 'node-group';
            group.appendChild(buildNodeEl(key, nodes[key], i, currentPath.length, mainKeys));
            const altRow = document.createElement('div');
            altRow.className = 'alt-sub-row';
            alts.forEach((altKey, ai) => {
              altRow.appendChild(buildNodeEl(altKey, nodes[altKey], mainKeys.length + i * 100 + ai, currentPath.length, null));
            });
            group.appendChild(altRow);
            newLevel.appendChild(group);
          } else {
            newLevel.appendChild(buildNodeEl(key, nodes[key], i, currentPath.length, mainKeys));
          }
          if (i < mainKeys.length - 1) {
            const conn = document.createElement('div');
            conn.className = 'connector';
            newLevel.appendChild(conn);
          }
        });

        // Orphan alts — alt keys whose base name has no main node at this level
        const orphanAlts = keys.filter(k => k.includes(' ~') && !mainKeys.includes(k.substring(0, k.indexOf(' ~'))));
        orphanAlts.forEach((key, i) => {
          if (mainKeys.length > 0 || i > 0) {
            const conn = document.createElement('div');
            conn.className = 'connector';
            newLevel.appendChild(conn);
          }
          newLevel.appendChild(buildNodeEl(key, nodes[key], mainKeys.length + i, currentPath.length, null));
        });
      }

      // ── ERP lane (only at L5 depth) ──
      let wrapEl;
      if (isL5 && keys.length) {
        // Check if any node has ERP data
        const hasAnyErp = keys.some(k => nodes[k]._meta && nodes[k]._meta.Tool_function && String(nodes[k]._meta.Tool_function).trim());

        if (hasAnyErp) {
          wrapEl = document.createElement('div');
          wrapEl.className = 'flow-lanes';

          // Business lane row (label above, not inside row)
          const bizLabel = document.createElement('div');
          bizLabel.className = 'lane-label';
          bizLabel.textContent = 'Business';
          wrapEl.appendChild(bizLabel);
          const bizRow = document.createElement('div');
          bizRow.className = 'lane-row';
          bizRow.appendChild(newLevel);
          wrapEl.appendChild(bizRow);

          // Vertical connector row (dashed lines under each node position)
          const vertRow = document.createElement('div');
          vertRow.className = 'lane-connector-row';
          keys.forEach((key, i) => {
            const hasMeta = nodes[key]._meta && nodes[key]._meta.Tool_function && String(nodes[key]._meta.Tool_function).trim()
              && String(nodes[key]._meta.Tool || '').trim().toLowerCase() !== 'n/a';
            const vert = document.createElement('div');
            vert.className = 'lane-vert';
            if (hasMeta) {
              const line = document.createElement('div');
              line.className = 'lane-vert-line';
              vert.appendChild(line);
            }
            vertRow.appendChild(vert);
            if (i < keys.length - 1) {
              const gap = document.createElement('div');
              gap.className = 'lane-vert-gap';
              vertRow.appendChild(gap);
            }
          });
          wrapEl.appendChild(vertRow);

          // ERP lane row (label above, not inside row)
          const erpLabel = document.createElement('div');
          erpLabel.className = 'lane-label erp-label';
          erpLabel.textContent = 'System';
          wrapEl.appendChild(erpLabel);
          const erpRow = document.createElement('div');
          erpRow.className = 'lane-row';

          const erpLane = document.createElement('div');
          erpLane.className = 'flow-level';

          keys.forEach((key, i) => {
            const meta = nodes[key]._meta || {};
            const toolVal = String(meta.Tool || '').trim();
            const toolIsNA = toolVal.toLowerCase() === 'n/a';
            const erpStep = !toolIsNA && meta.Tool_function ? String(meta.Tool_function).trim() : '';

            const erpEl = document.createElement('div');
            const isSysCalcErpType = String(meta.Type || '').trim().toLowerCase();
            const isSysCalcErp = isSysCalcErpType === 'system' || isSysCalcErpType === 'system activity';
            erpEl.className = 'erp-node' + (erpStep ? '' : ' erp-empty') + (isSysCalcErp ? ' erp-syscalc' : '');
            erpEl.setAttribute('data-key', key);
            erpEl.setAttribute('data-erp', '1');
            erpEl.setAttribute('tabindex', '-1');

            if (erpStep) {
              const nameDiv = document.createElement('div');
              nameDiv.className = 'erp-node-name';
              nameDiv.textContent = erpStep;
              erpEl.appendChild(nameDiv);

              const toolLink = parseErpLink(meta.Tool_link);
              const testLink = parseErpLink(meta.TestScript_link);

              if (toolLink || testLink) {
                const linksDiv = document.createElement('div');
                linksDiv.className = 'erp-node-links';

                if (toolLink) {
                  const a = document.createElement('a');
                  a.className = 'erp-node-link-btn';
                  a.href = toolLink.url;
                  a.title = toolLink.label;
                  a.target = '_blank';
                  a.rel = 'noopener noreferrer';
                  // External link / tool icon
                  a.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9"/><path d="M10 2h4v4"/><line x1="14" y1="2" x2="7" y2="9"/></svg>';
                  a.addEventListener('click', e => e.stopPropagation());
                  linksDiv.appendChild(a);
                }

                if (testLink) {
                  const a = document.createElement('a');
                  a.className = 'erp-node-link-btn erp-node-link-btn-text';
                  a.href = testLink.url;
                  a.title = testLink.label;
                  a.target = '_blank';
                  a.rel = 'noopener noreferrer';
                  // Test script label
                  a.innerHTML = 'TS';
                  a.addEventListener('click', e => e.stopPropagation());
                  linksDiv.appendChild(a);
                }

                erpEl.appendChild(linksDiv);
              }

              erpEl.addEventListener('click', () => {
                // Toggle selection and show ERP detail in info panel
                const wasSelected = erpEl.classList.contains('erp-selected');
                erpLane.querySelectorAll('.erp-node').forEach(n => n.classList.remove('erp-selected'));
                // Clear business node selection
                selectedKey = '';
                flowContainer.querySelectorAll('.node').forEach(n => n.classList.remove('node-selected'));
                if (!wasSelected) {
                  erpEl.classList.add('erp-selected');
                  updateErpPanel(key, meta);
                } else {
                  clearInfoPanel();
                }
              });

              erpEl.addEventListener('focus', () => {
                erpLane.querySelectorAll('.erp-node').forEach(n => n.classList.remove('erp-selected'));
                selectedKey = '';
                flowContainer.querySelectorAll('.node').forEach(n => n.classList.remove('node-selected'));
                erpEl.classList.add('erp-selected');
                updateErpPanel(key, meta);
              });
            }

            erpLane.appendChild(erpEl);
            if (i < keys.length - 1) {
              const conn = document.createElement('div');
              conn.className = 'connector erp-conn';
              erpLane.appendChild(conn);
            }
          });

          erpRow.appendChild(erpLane);
          wrapEl.appendChild(erpRow);
        }
      }

      clearInfoPanel();
      lastFocusedIdx = 0;
      selectedKey = '';
      const isL5now = (levelOffset + currentPath.length) === 4 && erpLaneVisible;
      flowContainer.classList.toggle('system-lane-on', isL5now);
      animateTransition(wrapEl || newLevel, direction);
      updateNav();
      updateLevelInfo(keys.length);
      // Apply lookup highlights after each render
      requestAnimationFrame(applyRoleHighlights);
      requestAnimationFrame(applyToolHighlights);
    }

    function buildNodeEl(key, nodeObj, index, level, siblings) {
      const hasChildren = Object.keys(nodeObj._children).length > 0;
      const el = document.createElement('div');
      const isSysCalcType = String((nodeObj._meta && nodeObj._meta.Type) || '').trim().toLowerCase();
      const isSysCalc = !hasChildren && nodeObj._meta && (isSysCalcType === 'system' || isSysCalcType === 'system activity');
      const isMeeting = !hasChildren && nodeObj._meta && isSysCalcType === 'meeting';
      const isAlt = key.includes(' ~');
      el.className = 'node ' + (hasChildren ? 'has-children' : 'leaf') + (isSysCalc ? ' node-syscalc' : '') + (isMeeting ? ' node-meeting' : '') + (isAlt ? ' alt-node' : '');
      el.setAttribute('data-key', key);
      el.setAttribute('data-index', String(index));
      el.setAttribute('data-level', String(level));
      el.setAttribute('tabindex', (index === 0 && !isAlt) ? '0' : '-1');

      if (nodeObj._code) {
        const codeSpan = document.createElement('span');
        codeSpan.className = 'node-code';
        codeSpan.textContent = nodeObj._code;
        el.appendChild(codeSpan);
      }
      const nameSpan = document.createElement('span');
      nameSpan.className = 'node-name';
      nameSpan.textContent = isAlt ? altLabel(key) : key;
      el.appendChild(nameSpan);

      // ── Prev/next navigation circles (first/last node, L1–L5) ──
      const absLevel = levelOffset + level;
      if ((absLevel === 1 || absLevel === 2 || absLevel === 3 || absLevel === 4 || absLevel === 5) && siblings && currentPath.length > 0) {
        const isFirst = index === 0;
        const isLast  = index === siblings.length - 1;

        // Check if any ancestor level has a prev/next sibling (for button visibility)
        function hasAncestorSibling(dir) {
          for (let depth = currentPath.length; depth >= 1; depth--) {
            const sibKeys = Object.keys(getNodesAtPath(currentPath.slice(0, depth - 1)));
            const idx = sibKeys.indexOf(currentPath[depth - 1]);
            if (dir === 'next' ? idx < sibKeys.length - 1 : idx > 0) return true;
          }
          return false;
        }

        function navigateCrossParent(dir) {
          // Walk up the path to find a sibling at any ancestor level,
          // then drill down to first (next) or last (prev) child at each level below.
          for (let depth = currentPath.length; depth >= 1; depth--) {
            const ancestorPath = currentPath.slice(0, depth - 1);
            const ancestorNodes = getNodesAtPath(ancestorPath);
            const siblingKeys = Object.keys(ancestorNodes);
            const curKey = currentPath[depth - 1];
            const curIdx = siblingKeys.indexOf(curKey);
            const targetIdx = dir === 'next' ? curIdx + 1 : curIdx - 1;
            if (targetIdx < 0 || targetIdx >= siblingKeys.length) continue;

            // Found a sibling — build the new path by drilling down
            let newPath = ancestorPath.concat(siblingKeys[targetIdx]);
            const levelsToFill = currentPath.length - depth;
            for (let i = 0; i < levelsToFill; i++) {
              const childKeys = Object.keys(getNodesAtPath(newPath));
              if (!childKeys.length) break;
              newPath = newPath.concat(dir === 'next' ? childKeys[0] : childKeys[childKeys.length - 1]);
            }

            history.pushState(null, '', pathToHash(newPath));
            currentPath = newPath;
            if (dir === 'prev') _pendingFocusKey = '__last__';
            render(dir === 'next' ? 'right' : 'left');
            return;
          }
        }

        if (isFirst && hasAncestorSibling('prev')) {
          const prevBtn = document.createElement('button');
          prevBtn.className = 'node-nav-btn node-nav-prev';
          prevBtn.setAttribute('tabindex', '0');
          prevBtn.setAttribute('aria-label', 'Previous group');
          prevBtn.textContent = '\u2039';
          prevBtn.addEventListener('click', e => { e.stopPropagation(); navigateCrossParent('prev'); });
          el.appendChild(prevBtn);
        }

        if (isLast && hasAncestorSibling('next')) {
          const nextBtn = document.createElement('button');
          nextBtn.className = 'node-nav-btn node-nav-next';
          nextBtn.setAttribute('tabindex', '0');
          nextBtn.setAttribute('aria-label', 'Next group');
          nextBtn.textContent = '\u203a';
          nextBtn.addEventListener('click', e => { e.stopPropagation(); navigateCrossParent('next'); });
          el.appendChild(nextBtn);
        }
      }

      if (hasChildren) {
        el.addEventListener('click', () => drillInto(key));
      } else {
        el.addEventListener('click', () => {
          selectedKey = key;
          for (const n of flowContainer.querySelectorAll('.node')) {
            n.classList.toggle('node-selected', n.getAttribute('data-key') === key);
          }
          // Clear any ERP selection and sync the details pane
          flowContainer.querySelectorAll('.erp-node').forEach(n => n.classList.remove('erp-selected'));
          updateInfoPanel(key, nodeObj._meta, nodeObj._desc);
          updatePathTree();
        });
      }

      el.addEventListener('focus', () => {
        lastFocusedIdx = index;
        lastFocusedKey = key;
        if (!hasChildren) {
          selectedKey = key;
          flowContainer.querySelectorAll('.node').forEach(n => {
            n.classList.toggle('node-selected', n.getAttribute('data-key') === key);
          });
        }
        updateInfoPanel(key, nodeObj._meta, nodeObj._desc);
        updatePathTree();
      });
      el.addEventListener('mouseenter', () => {
        if (levelOffset + level >= 4) return;
        lastFocusedKey = key;
        updateInfoPanel(key, nodeObj._meta, nodeObj._desc);
      });
      el.addEventListener('keydown', e => { if (e.key === 'Enter' && hasChildren) drillInto(key); });

      return el;
    }

    function animateTransition(newEl, direction) {
      const old = flowContainer.querySelector('.flow-lanes, .flow-level');

      function focusFirst() {
        const nodes = Array.from(newEl.querySelectorAll('.node'));
        if (!nodes.length) return;
        if (_pendingFocusKey === '__last__') {
          _pendingFocusKey = null;
          focusNode(nodes[nodes.length - 1], nodes.length - 1);
        } else {
          _pendingFocusKey = null;
          focusNode(nodes[0], 0);
        }
      }

      if (direction === 'none') {
        if (old) old.remove();
        flowContainer.appendChild(newEl);
        focusFirst();
        return;
      }
      const cls = direction === 'right' ? 'enter-from-right' : 'enter-from-left';
      newEl.classList.add(cls);
      flowContainer.appendChild(newEl);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        newEl.classList.remove(cls);
        if (old) old.remove();
        newEl.addEventListener('transitionend', focusFirst, { once: true });
      }));
    }

    // ── NAVIGATION ─────────────────────────────────────────────────────────
    function drillInto(key) {
      const np = currentPath.concat(key);
      history.pushState(null, '', pathToHash(np));
      currentPath = np;
      render('right');
    }
    function goUp() {
      if (!currentPath.length) return;
      const np = currentPath.slice(0, -1);
      history.pushState(null, '', pathToHash(np));
      currentPath = np;
      render('left');
    }
    function goHome() {
      // Close all overlay screens
      ctrlPanel.classList.add('hidden');
      closeRolePanel();
      closeToolPanel();
      closeOverviewScreen();
      $('yearScreen').classList.add('hidden');
      $('ganttScreen').classList.add('hidden');
      if (currentPath.length) {
        history.pushState(null, '', pathToHash([]));
        currentPath = [];
        render('left');
      }
    }

    function updateNav() {
      const d = currentPath.length;
      btnHome.disabled = false;
      btnUp.classList.toggle('hidden', d === 0);

      breadcrumb.innerHTML = '';
      const rootLi = document.createElement('li');
      const rootCrumb = document.createElement('span');
      rootCrumb.className = 'crumb' + (d === 0 ? ' current' : '');
      rootCrumb.textContent = 'All';
      if (d > 0) rootCrumb.addEventListener('click', goHome);
      rootLi.appendChild(rootCrumb);
      breadcrumb.appendChild(rootLi);

      currentPath.forEach((seg, i) => {
        const sepLi = document.createElement('li');
        sepLi.innerHTML = '<span class="sep"> / </span>';
        breadcrumb.appendChild(sepLi);
        const li = document.createElement('li');
        const crumb = document.createElement('span');
        const isCurrent = i === d - 1;
        crumb.className = 'crumb' + (isCurrent ? ' current' : '');
        crumb.textContent = altLabel(seg);
        if (!isCurrent) {
          const p = currentPath.slice(0, i + 1);
          crumb.addEventListener('click', () => {
            history.pushState(null, '', pathToHash(p));
            currentPath = p; render('left');
          });
        }
        li.appendChild(crumb);
        breadcrumb.appendChild(li);
      });

      levelLabel.textContent = 'L' + (levelOffset + d);
      updatePathTree();
    }

    function updatePathTree() {
      const d = currentPath.length;
      pathTree.innerHTML = '';
      if (!d) { pathTree.classList.add('empty'); return; }
      pathTree.classList.remove('empty');
      // Show ancestors + current level
      const items = ['All', ...currentPath];
      items.forEach((label, i) => {
        const row = document.createElement('div');
        row.className = 'pt-row';
        const prefix = document.createElement('span');
        prefix.className = 'pt-prefix';
        prefix.textContent = i === 0 ? '' : ('\u2514\u2500');
        const lbl = document.createElement('span');
        const isCurrent = i === items.length - 1;
        lbl.className = 'pt-label' + (isCurrent ? ' pt-current' : '');
        const ptNode = i > 0 ? getNodeAtPath(currentPath.slice(0, i)) : null;
        const ptCode = ptNode && ptNode._code ? ptNode._code + ' - ' : '';
        lbl.textContent = ptCode + altLabel(label);
        lbl.title = ptCode + altLabel(label);
        if (!isCurrent) {
          lbl.addEventListener('click', () => {
            const targetPath = i === 0 ? [] : currentPath.slice(0, i);
            history.pushState(null, '', pathToHash(targetPath));
            currentPath = targetPath;
            render('left');
            updateNav();
          });
        }
        if (prefix.textContent) row.appendChild(prefix);
        row.appendChild(lbl);
        row.style.paddingRight = '0';
        pathTree.appendChild(row);
      });

      // Append active node rows (selected + keyboard-focused)
      const _levelNodes = getNodesAtPath(currentPath);
      function _makeActiveRow(key, symbol) {
        const ar = document.createElement('div');
        ar.className = 'pt-row';
        const ap = document.createElement('span');
        ap.className = 'pt-prefix';
        ap.textContent = '\u2514\u2500';
        const al = document.createElement('span');
        al.className = 'pt-label pt-active';
        const an = _levelNodes[key];
        const ac = an && an._code ? an._code + ' \u2013 ' : '';
        al.textContent = ac + altLabel(key);
        al.title = ac + altLabel(key);
        ar.appendChild(ap);
        ar.appendChild(al);
        ar.style.paddingRight = '0';
        return ar;
      }
      if (selectedKey && _levelNodes[selectedKey])
        pathTree.appendChild(_makeActiveRow(selectedKey, '\u25cf'));
      if (lastFocusedKey && _levelNodes[lastFocusedKey] && lastFocusedKey !== selectedKey)
        pathTree.appendChild(_makeActiveRow(lastFocusedKey, '\u25ce'));
    }

    function updateLevelInfo(count) {
      const d   = currentPath.length;
      const lvl = 'L' + (levelOffset + d);
      const ctx = d > 0 ? ' · ' + currentPath[d - 1] : '';
      levelInfo.textContent = count + ' ' + (count === 1 ? 'node' : 'nodes') + ' · ' + lvl + ctx;
    }

    // ── URL HASH ───────────────────────────────────────────────────────────
    function pathToHash(path) { return path.length ? '#' + path.map(encodeURIComponent).join('/') : '#'; }
    function hashToPath(hash) {
      if (!hash || hash === '#' || hash === '') return [];
      return hash.slice(1).split('/').map(decodeURIComponent).filter(Boolean);
    }
    window.addEventListener('popstate', () => {
      const path = hashToPath(location.hash);
      if (isValidPath(path)) { currentPath = path; render('none'); updateNav(); }
    });

    // ── SEARCH ─────────────────────────────────────────────────────────────
    let searchFieldFilter = null; // null = global; string key = column filter
    const searchFilterBadge = $('searchFilterBadge');
    const searchFilterLabel = $('searchFilterLabel');
    const searchFilterClear = $('searchFilterClear');

    function applyColumnFilter(fieldKey) {
      searchFieldFilter = fieldKey;
      const f = SEARCH_FIELDS.find(f => f.key === fieldKey);
      searchFilterLabel.textContent = '@' + (f ? f.label : fieldKey);
      searchFilterBadge.classList.add('visible');
      searchInput.value = '';
      searchInput.placeholder = 'Filter by ' + (f ? f.hint : fieldKey) + '…';
      searchDropdown.classList.add('hidden');
      searchInput.focus();
    }

    function clearColumnFilter() {
      searchFieldFilter = null;
      searchFilterBadge.classList.remove('visible');
      searchInput.placeholder = 'Search… or type @';
      searchInput.value = '';
      searchDropdown.classList.add('hidden');
      searchInput.focus();
    }

    searchFilterClear.addEventListener('click', clearColumnFilter);

    function renderColumnSuggestions(partial) {
      // partial is the text after '@', may be empty
      const p = partial.toLowerCase();
      const matches = SEARCH_FIELDS.filter(f => f.key.toLowerCase().startsWith(p) || f.label.toLowerCase().startsWith(p) || f.hint.toLowerCase().startsWith(p));
      if (!matches.length) { searchDropdown.classList.add('hidden'); return; }
      let idx = 0;
      const html = matches.map((f, i) =>
        '<button class="sr-col-item" tabindex="0" data-field="' + escHtml(f.key) + '">' +
          '<span class="sr-col-badge">@' + escHtml(f.label) + '</span>' +
          '<span class="sr-col-hint">' + escHtml(f.hint) + '</span>' +
        '</button>'
      ).join('');
      searchDropdown.innerHTML = html;
      searchDropdown.classList.remove('hidden');
      searchDropdown.querySelectorAll('.sr-col-item').forEach(btn => {
        btn.addEventListener('click', () => applyColumnFilter(btn.getAttribute('data-field')));
        btn.addEventListener('keydown', e => { if (e.key === 'Enter') applyColumnFilter(btn.getAttribute('data-field')); });
      });
    }

    let _searchTimer;
    function triggerSearch() {
      const raw = searchInput.value;
      const q = raw.trim();

      // Column suggestions: immediate, no debounce
      if (!searchFieldFilter && q.startsWith('@')) {
        clearTimeout(_searchTimer);
        renderColumnSuggestions(q.slice(1));
        return;
      }

      // Empty query: immediate hide
      if (!q) { clearTimeout(_searchTimer); searchDropdown.classList.add('hidden'); return; }

      // Debounce the expensive tree walk
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        const results = [];
        if (searchFieldFilter) {
          searchByField(searchFieldFilter, q, tree, [], results);
        } else {
          searchAll(q, tree, [], results);
        }
        renderSearchResults(results, q);
      }, 200);
    }

    searchInput.addEventListener('input', triggerSearch);

    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (searchFieldFilter) { clearColumnFilter(); }
        else { searchInput.value = ''; searchDropdown.classList.add('hidden'); searchInput.blur(); }
        return;
      }
      // Tab: commit column filter from the first suggestion, or cycle suggestions
      if (e.key === 'Tab' && !searchFieldFilter) {
        const q = searchInput.value.trim();
        if (q.startsWith('@')) {
          e.preventDefault();
          const partial = q.slice(1).toLowerCase();
          const match = SEARCH_FIELDS.find(f =>
            f.key.toLowerCase().startsWith(partial) || f.label.toLowerCase().startsWith(partial) || f.hint.toLowerCase().startsWith(partial)
          );
          if (match) { applyColumnFilter(match.key); return; }
        }
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const f = searchDropdown.querySelector('.sr-item, .sr-col-item');
        if (f) f.focus();
      }
      // Backspace with empty input + active filter → clear filter
      if (e.key === 'Backspace' && searchFieldFilter && searchInput.value === '') {
        clearColumnFilter();
      }
    });

    searchDropdown.addEventListener('keydown', e => {
      const isItem = el => el && (el.classList.contains('sr-item') || el.classList.contains('sr-col-item'));
      if (e.key === 'ArrowDown') { e.preventDefault(); const n = document.activeElement.nextElementSibling; if (isItem(n)) n.focus(); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); const p = document.activeElement.previousElementSibling; if (isItem(p)) p.focus(); else searchInput.focus(); }
      if (e.key === 'Escape')    { searchFieldFilter ? clearColumnFilter() : (searchInput.value = ''); searchDropdown.classList.add('hidden'); searchInput.focus(); }
    });
    document.addEventListener('click', e => { if (!$('searchWrap').contains(e.target)) searchDropdown.classList.add('hidden'); });

    function renderSearchResults(results, query) {
      if (!results.length) {
        const scope = searchFieldFilter ? ' in @' + searchFieldFilter : '';
        searchDropdown.innerHTML = '<div class="sr-empty">No results for "' + escHtml(query) + '"' + escHtml(scope) + '</div>';
        searchDropdown.classList.remove('hidden'); return;
      }
      const re = new RegExp('(' + escRegex(query) + ')', 'gi');
      const items = results.slice(0, 25).map(r => {
        const pathStr = r.path.slice(0,-1).map(s => escHtml(altLabel(s))).join(' › ');
        const nameHL  = escHtml(altLabel(r.name)).replace(re, '<mark>$1</mark>');
        // show either a RASCI match or a field match
        const matchTag = r.fieldMatch
          ? '<span class="sr-rasci">' + escHtml(r.fieldMatch.field) + ': ' + escHtml(r.fieldMatch.value).replace(re, '<mark>$1</mark>') + '</span>'
          : r.rasciMatch
            ? '<span class="sr-rasci">' + escHtml(r.rasciMatch.field) + ': ' + escHtml(r.rasciMatch.value).replace(re, '<mark>$1</mark>') + '</span>'
            : '';
        return '<button class="sr-item" tabindex="0" data-path="' + escHtml(JSON.stringify(r.path)) + '">' +
          (pathStr ? '<span class="sr-path">' + pathStr + ' ›</span>' : '') +
          '<span class="sr-name">' + nameHL + '</span>' + matchTag + '</button>';
      }).join('');
      const more = results.length > 25 ? '<div class="sr-more">+' + (results.length-25) + ' more</div>' : '';
      searchDropdown.innerHTML = items + more;
      searchDropdown.classList.remove('hidden');
      searchDropdown.querySelectorAll('.sr-item').forEach(btn => {
        const go = () => {
          const path = JSON.parse(btn.getAttribute('data-path'));
          const target = path[path.length - 1];
          searchInput.value = '';
          searchDropdown.classList.add('hidden');
          history.pushState(null, '', pathToHash(path.slice(0,-1)));
          currentPath = path.slice(0,-1); render('none'); updateNav();
          requestAnimationFrame(() => {
            for (const n of flowContainer.querySelectorAll('.node')) {
              if (n.getAttribute('data-key') === target) {
                n.classList.add('highlighted');
                n.scrollIntoView({ behavior:'smooth', inline:'nearest', block:'nearest' });
                n.focus(); setTimeout(() => n.classList.remove('highlighted'), 2500); break;
              }
            }
          });
        };
        btn.addEventListener('click', go);
        btn.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      });
    }

    // ── GANTT CHART ────────────────────────────────────────────────────────
    let ganttL1Key         = null;    // selected L1 key
    let ganttExpandedPaths = new Set(); // Set of '\x1E'-joined path strings for expanded rows

    function getGanttLabelW() { return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--gantt-label-w')) || 240; }
    const GANTT_INDENT_W  = 16;    // px indent per depth level
    const GANTT_ROW_H     = 38;    // px per row (bar area height)
    const GANTT_BAR_FILLS  = ['#3E603D','#619A60','#88D17F','#B0E3A5','#D7F5CB','#EBFFDF'];
    const GANTT_BAR_TEXTS  = ['#f0f8f0','#f0f8f0','#1c3620','#1c3620','#1c3620','#1c3620'];
    const GANTT_BAR_STROKES= ['#2d4a2c','#4d7a4c','#6ab062','#8dc882','#b3dfa4','#c5eaae'];

    /** Normalise user-entered UoM string to canonical lowercase key. */
    function ganttNormUoM(raw) {
      if (!raw) return '';
      const s = String(raw).trim().toLowerCase();
      if (s === 'h' || s.startsWith('hour')) return 'hours';
      if (s === 'd' || s.startsWith('day'))  return 'days';
      if (s === 'w' || s.startsWith('week')) return 'weeks';
      if (s === 'm' || s.startsWith('month')) return 'months';
      if (s === 'y' || s.startsWith('year')) return 'years';
      return s;
    }

    /** Full label for axis ticks: "1 hour", "2 days", "3 weeks", etc. */
    function ganttTickLabel(uom, value) {
      const v = Number(value);
      switch (uom) {
        case 'hours':  return v + ' ' + (v === 1 ? 'hour'  : 'hours');
        case 'days':   return v + ' ' + (v === 1 ? 'day'   : 'days');
        case 'weeks':  return v + ' ' + (v === 1 ? 'week'  : 'weeks');
        case 'months': return v + ' ' + (v === 1 ? 'month' : 'months');
        case 'years':  return v + ' ' + (v === 1 ? 'year'  : 'years');
        default:       return String(value);
      }
    }

    /**
     * Walk all descendants of nodeObj and compute the
     * min Start, max End and most-frequent UoM from _meta.
     * Returns { start, end, uom } or null if no data found.
     */
    function ganttNodeEnvelope(nodeObj) {
      let minS = Infinity, maxE = -Infinity;
      const uomCounts = {};
      function walk(obj) {
        if (obj._meta) {
          const uom = ganttNormUoM(obj._meta.Time_UoM);
          const s = obj._meta.Start, e = obj._meta.End;
          if (s !== null && e !== null) {
            if (s < minS) minS = s;
            if (e > maxE) maxE = e;
            if (uom) uomCounts[uom] = (uomCounts[uom] || 0) + 1;
          }
        }
        for (const child of Object.values(obj._children)) walk(child);
      }
      walk(nodeObj);
      if (!isFinite(minS)) return null;
      const uom = Object.keys(uomCounts).sort((a, b) => uomCounts[b] - uomCounts[a])[0] || '';
      return { start: minS, end: maxE, uom };
    }

    /**
     * Given a nodes map (key → nodeObj), compute the overall range and dominant UoM.
     * Returns { min, max, uom } or null if nothing has time info.
     */
    function ganttComputeRange(nodes) {
      let minV = Infinity, maxV = -Infinity;
      const uomCounts = {};
      for (const nodeObj of Object.values(nodes)) {
        const env = ganttNodeEnvelope(nodeObj);
        if (!env) continue;
        if (env.start < minV) minV = env.start;
        if (env.end   > maxV) maxV = env.end;
        if (env.uom) uomCounts[env.uom] = (uomCounts[env.uom] || 0) + 1;
      }
      if (!isFinite(minV)) return null;
      const uom = Object.keys(uomCounts).sort((a, b) => uomCounts[b] - uomCounts[a])[0] || '';
      return { min: minV, max: maxV, uom };
    }

    /** Return a "nice" tick step for a given numeric range displayed in ~px pixels. */
    function ganttTickStep(range, totalPx) {
      if (range <= 0) return 1;
      const targetTicks = Math.max(2, Math.floor(totalPx / 90));
      const rawStep     = range / targetTicks;
      const mag  = Math.pow(10, Math.floor(Math.log10(rawStep)));
      const norm = rawStep / mag;
      let nice = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
      // Always snap to whole units — never show fractional ticks (e.g. 1.5 weeks)
      return Math.max(1, Math.ceil(nice * mag));
    }

    /**
     * Recursively build HTML rows for a nodes map.
     * Nodes in ganttExpandedPaths have their children rendered inline below them.
     * axis = { min, max, uom, pxPerU, barAreaW, step } or null (no time data).
     */
    function buildGanttRows(nodes, depth, parentPath, axis) {
      let html = '';
      const colorIdx  = Math.min(depth, GANTT_BAR_FILLS.length - 1);
      const barFill   = GANTT_BAR_FILLS[colorIdx];
      const barTxt    = GANTT_BAR_TEXTS[colorIdx];
      const barStroke = GANTT_BAR_STROKES[colorIdx];
      const indent    = 10 + depth * GANTT_INDENT_W;

      for (const key of Object.keys(nodes)) {
        const nodeObj     = nodes[key];
        const hasChildren = Object.keys(nodeObj._children).length > 0;
        const pathKey     = parentPath ? parentPath + '\x1E' + key : key;
        const isExpanded  = ganttExpandedPaths.has(pathKey);
        const env         = axis ? ganttNodeEnvelope(nodeObj) : null;

        html += '<div class="gantt-data-row" data-path="' + escHtml(pathKey) + '">';

        // Sticky label cell
        html += '<div class="gantt-td-label"><div class="gantt-label-inner" style="padding-left:' + indent + 'px">';
        if (hasChildren) {
          html += '<button class="gantt-expand-btn' + (isExpanded ? ' expanded' : '') + '"'
            + ' data-path="' + escHtml(pathKey) + '"'
            + ' title="' + (isExpanded ? 'Collapse' : 'Expand') + '">'
            + (isExpanded ? '&#9660;' : '&#9654;') + '</button>';
        } else {
          html += '<span class="gantt-expand-spacer"></span>';
        }
        html += '<span class="gantt-label-text" title="' + escHtml(key) + '">' + escHtml(key) + '</span>';
        html += '</div></div>';

        // Bar cell
        if (axis) {
          html += '<div class="gantt-td-bars" style="width:' + axis.barAreaW + 'px">';
          html += '<div class="gantt-bar-area" style="width:' + axis.barAreaW + 'px;position:relative">';
          for (let ti = 0; ; ti++) {
            const t = axis.min + ti * axis.step;
            if (t > axis.max + axis.step * 0.01) break;
            const px = Math.round((t - axis.min) * axis.pxPerU);
            html += '<div class="gantt-grid-line" style="left:' + px + 'px;height:' + GANTT_ROW_H + 'px"></div>';
          }
          if (env) {
            const x = Math.round((env.start - axis.min) * axis.pxPerU);
            const w = Math.max(4, Math.round((env.end - env.start) * axis.pxPerU));
            html += '<div class="gantt-bar"'
              + ' data-path="' + escHtml(pathKey) + '"'
              + ' style="left:' + x + 'px;width:' + w + 'px;background:' + barFill + ';border:1px solid ' + barStroke + '"'
              + ' title="' + escHtml(key + ' \xb7 ' + env.start + '\u2013' + env.end + (env.uom ? ' ' + env.uom : '')) + '">'
              + '<span class="gantt-bar-label" style="color:' + barTxt + '">' + escHtml(key) + '</span>'
              + '</div>';
          } else {
            html += '<span class="gantt-no-bar">\u2014</span>';
          }
          html += '</div></div>';
        } else {
          html += '<div class="gantt-td-bars"><div class="gantt-bar-area" style="width:200px;position:relative">'
            + '<span class="gantt-no-bar">\u2014</span></div></div>';
        }

        html += '</div>';  // data-row

        // If expanded, render children inline below this row
        if (isExpanded && hasChildren) {
          html += buildGanttRows(nodeObj._children, depth + 1, pathKey, axis);
        }
      }
      return html;
    }

    /** Main render: rebuilds #ganttContent entirely */
    function ganttRender() {
      const ganttContent = $('ganttContent');
      if (!ganttL1Key) {
        ganttContent.innerHTML = '<div class="gantt-placeholder">Select an L1 process to view the Gantt chart</div>';
        ganttUpdateBreadcrumb();
        return;
      }
      const l1Node = getRpL1Node(ganttL1Key);
      if (!l1Node || !Object.keys(l1Node._children).length) {
        ganttContent.innerHTML = '<div class="gantt-placeholder">No child processes found</div>';
        ganttUpdateBreadcrumb();
        return;
      }
      ganttUpdateBreadcrumb();

      const rootNodes = l1Node._children;

      // Axis is computed once from the full L1 envelope — it never shifts when rows expand
      const GANTT_LABEL_W = getGanttLabelW();
      const fullEnv = ganttNodeEnvelope(l1Node);
      let axis = null;
      if (fullEnv) {
        const viewW    = Math.max(ganttContent.clientWidth - GANTT_LABEL_W, 300);
        const step     = ganttTickStep(fullEnv.end - fullEnv.start, viewW);
        const axisMin  = Math.floor(fullEnv.start / step) * step;
        const axisMax  = Math.ceil(fullEnv.end   / step) * step + step;
        const pxPerU   = Math.max(viewW / (axisMax - axisMin), 8);
        const barAreaW = Math.ceil((axisMax - axisMin) * pxPerU);
        axis = { min: axisMin, max: axisMax, uom: fullEnv.uom, pxPerU, barAreaW, step };
      }

      const totalW = GANTT_LABEL_W + (axis ? axis.barAreaW : 200);
      let html = '<div class="gantt-grid" style="width:' + totalW + 'px">';

      // Sticky header row
      html += '<div class="gantt-header-row">';
      html += '<div class="gantt-th-label">Process<div class="gantt-col-resizer" title="Drag to resize"></div></div>';
      html += '<div class="gantt-th-axis" style="width:' + (axis ? axis.barAreaW : 200) + 'px">';
      html += '<div class="gantt-axis-inner" style="width:' + (axis ? axis.barAreaW : 200) + 'px">';
      if (axis) {
        for (let ti = 0; ; ti++) {
          const t = axis.min + ti * axis.step;
          if (t > axis.max + axis.step * 0.01) break;
          const px = Math.round((t - axis.min) * axis.pxPerU);
          html += '<span class="gantt-tick-label" style="left:' + px + 'px">' + escHtml(ganttTickLabel(axis.uom, t)) + '</span>';
          html += '<div class="gantt-tick-line" style="left:' + px + 'px"></div>';
        }
      } else {
        html += '<span style="position:absolute;left:12px;bottom:6px;font-size:.68rem;color:var(--txt4)">No timing data</span>';
      }
      html += '</div></div></div>';  // axis-inner + th-axis + header-row

      // Recursive data rows starting with L2 children
      html += buildGanttRows(rootNodes, 0, '', axis);
      html += '</div>';  // gantt-grid

      ganttContent.innerHTML = html;
    }

    /** Toggle expand/collapse. Collapsing a node also collapses all its descendants. */
    function ganttHandleClick(e) {
      const btn = e.target.closest('.gantt-expand-btn');
      if (!btn) return;
      const pathKey = btn.dataset.path;
      if (ganttExpandedPaths.has(pathKey)) {
        for (const p of [...ganttExpandedPaths]) {
          if (p === pathKey || p.startsWith(pathKey + '\x1E')) ganttExpandedPaths.delete(p);
        }
      } else {
        ganttExpandedPaths.add(pathKey);
      }
      ganttRender();
    }
    $('ganttContent').addEventListener('click', ganttHandleClick);

    function ganttUpdateBreadcrumb() {
      const bc = $('ganttBreadcrumb');
      bc.innerHTML = '';
      if (!ganttL1Key) return;
      const crumb = document.createElement('span');
      crumb.className = 'gantt-crumb current';
      crumb.textContent = ganttL1Key;
      bc.appendChild(crumb);
    }

    /** Return L1 keys for the Gantt chart. */
    function ganttGetFilteredL1Keys() {
      return getRpL1Keys();
    }

    function openGanttScreen() {
      // Close other panels
      ctrlPanel.classList.add('hidden');
      closeRolePanel();
      closeToolPanel();
      $('yearScreen').classList.add('hidden');
      closeOverviewScreen();
      $('ganttScreen').classList.remove('hidden');

      // L0 level no longer in use — always hide the L0 dropdown
      $('ganttL0Select').style.display = 'none';

      // Populate L1 dropdown
      const l1Keys = ganttGetFilteredL1Keys();
      const sel    = $('ganttL1Select');
      sel.innerHTML = '<option value="">\u2014 Select L1 process \u2014</option>';
      l1Keys.forEach(k => {
        const opt = document.createElement('option');
        opt.value = k; opt.textContent = k;
        if (k === ganttL1Key) opt.selected = true;
        sel.appendChild(opt);
      });
      if (!l1Keys.length) {
        sel.innerHTML = '<option value="">No data loaded</option>';
        sel.disabled = true;
      } else {
        sel.disabled = false;
      }
      // Reset ganttL1Key if it no longer exists in the filtered list
      if (ganttL1Key && !l1Keys.includes(ganttL1Key)) {
        ganttL1Key = null;
        ganttExpandedPaths.clear();
        sel.value = '';
      }
      ganttRender();
    }

    function closeGanttScreen() {
      $('ganttScreen').classList.add('hidden');
    }

    // ── YEAR OVERVIEW ──────────────────────────────────────────────────────
    const YEAR_MONTHS = ['Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'];
    const YEAR_INDENT_W = 16; // px indent per depth level
    let yearExpandedPaths = new Set(); // '\x1E'-joined path strings for expanded rows
    let yearView = 'year';      // 'year' | 'quarter' | 'month'
    let yearViewIndex = 0;      // quarter: 0–3, month: 0–11
    let yearMinLevel = null;    // null = All, or a number (e.g. 2 for L2+)
    let yearL0Filter = null;    // null = All, or a string key to show only that L0 subtree
    let rcData = [];            // parsed RefreshCalendar events
    let rcOverlayVisible = false; // whether overlay is shown

    const YEAR_QUARTER_NAMES = [
      'Q1 (Sep–Nov)', 'Q2 (Dec–Feb)',
      'Q3 (Mar–May)', 'Q4 (Jun–Aug)'
    ];

    // ── FULL OVERVIEW SCREEN ───────────────────────────────────────────────
    let overviewScale = 1.0;    // zoom level (0.5–2.0)
    let overviewPan = { x: 0, y: 0 };  // pan offset
    let overviewPanStart = null;        // track drag start
    let overviewL1Key = '';             // selected L1 filter ('' = all)

    function yearRenderSubPicker() {
      const el = $('yearSubPicker');
      if (!el) return;
      el.innerHTML = '';
      el.style.display = 'none';
    }

    /** Normalise Frequency column value to canonical key. */
    function yearNormFreq(raw) {
      if (!raw) return '';
      const s = String(raw).trim().toLowerCase();
      if (s.startsWith('q') || s === '4')  return 'quarterly';
      if (s.startsWith('m') || s === '12') return 'monthly';
      if (s.startsWith('a') || s === '1')  return 'annual';
      if (s.startsWith('w') || s === '52') return 'weekly';
      return s;
    }

    function yearUoMColors(uom) {
      switch (uom) {
        case 'months': return { fill: '#3E9B5E', stroke: '#2d7a4b', text: '#fff' };
        case 'weeks':  return { fill: '#7B5EA7', stroke: '#5e4580', text: '#fff' };
        case 'days':   return { fill: '#C97D2E', stroke: '#a06020', text: '#fff' };
        case 'hours':  return { fill: '#2E8B9A', stroke: '#236e7a', text: '#fff' };
        case 'years':  return { fill: '#B03A3A', stroke: '#8c2828', text: '#fff' };
        default:       return { fill: '#888888', stroke: '#666666', text: '#fff' };
      }
    }

    /** Bar colour keyed by Frequency value. */
    function yearFreqColors(freq) {
      switch (freq) {
        case 'quarterly': return { fill: '#C97D2E', stroke: '#a06020', text: '#fff' };
        case 'monthly':   return { fill: '#7B5EA7', stroke: '#5e4580', text: '#fff' };
        case 'annual':    return { fill: '#3E9B5E', stroke: '#2d7a4b', text: '#fff' };
        case 'weekly':    return { fill: '#2E8B9A', stroke: '#236e7a', text: '#fff' };
        default:          return { fill: '#888888', stroke: '#666666', text: '#fff' };
      }
    }

    /**
     * Walk all descendants of nodeObj and return { start, end, uom, freq } spanning all leaves.
     * UoM and Frequency are both determined by most-frequent value.
     */
    function yearNodeEnvelope(nodeObj) {
      let minStart = Infinity, maxEnd = -Infinity;
      const uomCounts = {}, freqCounts = {};
      function walk(n) {
        if (n._meta) {
          const s = n._meta.Start, e = n._meta.End;
          const u = ganttNormUoM(n._meta.Time_UoM || '');
          const f = yearNormFreq(n._meta.Frequency || '');
          if (s !== null && e !== null) {
            if (s < minStart) minStart = s;
            if (e > maxEnd) maxEnd = e;
            if (u) uomCounts[u] = (uomCounts[u] || 0) + 1;
            if (f) freqCounts[f] = (freqCounts[f] || 0) + 1;
          }
        }
        for (const child of Object.values(n._children || {})) walk(child);
      }
      walk(nodeObj);
      if (!isFinite(minStart)) return null;
      const uom  = Object.keys(uomCounts).sort((a, b) => uomCounts[b]  - uomCounts[a])[0]  || '';
      const freq = Object.keys(freqCounts).sort((a, b) => freqCounts[b] - freqCounts[a])[0] || '';
      return { start: minStart, end: maxEnd, uom, freq };
    }

    /** Count direct children whose envelope has quarterly frequency. */
    function countQuarterlyChildren(nodeObj) {
      let count = 0;
      for (const child of Object.values(nodeObj._children || {})) {
        const env = yearNodeEnvelope(child);
        if (env && env.freq === 'quarterly') count++;
      }
      return count;
    }

    /** Recursive HTML builder for year rows. */
    function buildYearRows(nodes, depth, parentPath) {
      let html = '';
      const lo = typeof levelOffset === 'number' ? levelOffset : 0;
      const minVisDepth = yearMinLevel !== null ? Math.max(0, yearMinLevel - lo) : 0;
      const indent = Math.max(0, depth - minVisDepth) * YEAR_INDENT_W;
      for (const [key, nodeObj] of Object.entries(nodes)) {
        // Filter to selected L0 process (depth 0 = L0 level relative to tree root)
        if (depth === 0 && yearL0Filter !== null && key !== yearL0Filter) continue;
        const pathKey  = parentPath ? parentPath + '\x1E' + key : key;
        const hasKids  = Object.keys(nodeObj._children || {}).length > 0;
        const isExpanded = yearExpandedPaths.has(pathKey);
        const env      = yearNodeEnvelope(nodeObj);
        const levelNum = depth + lo;
        const levelLbl = 'L' + levelNum;

        // If this row's level is below the selected min level, skip the row but still recurse
        if (yearMinLevel !== null && levelNum < yearMinLevel) {
          if (hasKids) html += buildYearRows(nodeObj._children, depth + 1, pathKey);
          continue;
        }

        // Label cell
        let labelCell = '<div class="year-label-inner" style="padding-left:' + indent + 'px">';
        if (hasKids) {
          labelCell += '<button class="year-expand-btn' + (isExpanded ? ' expanded' : '') + '" data-path="' + escHtml(pathKey) + '" aria-label="' + (isExpanded ? 'Collapse' : 'Expand') + '">'
            + (isExpanded ? '&#8722;' : '&#43;') + '</button>';
        } else {
          labelCell += '<span class="year-expand-spacer"></span>';
        }
        labelCell += '<span class="year-level-badge">' + escHtml(levelLbl) + '</span>';
        labelCell += '<span class="year-label-text" title="' + escHtml(key) + '">' + escHtml(key) + '</span>';
        labelCell += '</div>';

        // Bars cell: columns + optional bar overlay
        let barsCell = '<div class="year-bar-area">';
        // Grid lines between columns
        const _yearCols = yearView === 'quarter' ? 13 : yearView === 'month' ? 4 : 12;
        for (let m = 1; m < _yearCols; m++) {
          const leftPct = (m / _yearCols * 100).toFixed(4);
          barsCell += '<div class="year-month-line" style="left:' + leftPct + '%"></div>';
        }
        // Bar(s)
        if (env) {
          const freq = env.freq;
          const col  = freq ? yearFreqColors(freq) : yearUoMColors(env.uom);

          if (yearView === 'year') {
            // ── YEAR VIEW (12-month axis) ──────────────────────────────
            if (freq === 'quarterly') {
              const TOTAL_WEEKS = 52, WEEKS_PER_QTR = 13;
              const rawS = Math.max(1, Math.min(WEEKS_PER_QTR, Math.round(env.start)));
              const rawE = Math.max(rawS, Math.min(WEEKS_PER_QTR, Math.round(env.end)));
              // L0 with all 4 quarter processes → single full-width bar
              if (levelNum === 0 && countQuarterlyChildren(nodeObj) === 4) {
                barsCell += '<div class="year-bar" style="left:0%;width:100%;'
                  + 'background:' + col.fill + ';border:1px solid ' + col.stroke + ';color:' + col.text + '" '
                  + 'title="' + escHtml(key) + ' | Q1\u2013Q4 (annual quarterly)">'
                  + '<span class="year-bar-label">Q1\u2013Q4</span>'
                  + '</div>';
              } else {
              for (let q = 0; q < 4; q++) {
                const barStart = q * WEEKS_PER_QTR + rawS;
                const barEnd   = q * WEEKS_PER_QTR + rawE;
                const leftPct  = ((barStart - 1) / TOTAL_WEEKS * 100).toFixed(4);
                const widthPct = ((barEnd - barStart + 1) / TOTAL_WEEKS * 100).toFixed(4);
                const qLabel   = 'Q' + (q + 1) + ' | W' + rawS + '\u2013W' + rawE;
                barsCell += '<div class="year-bar" style="left:calc(' + leftPct + '% + 1px);width:calc(' + widthPct + '% - 2px);'
                  + 'background:' + col.fill + ';border:1px solid ' + col.stroke + ';color:' + col.text + '" '
                  + 'title="' + escHtml(key) + ' | ' + escHtml(qLabel) + ' (quarterly)">'
                  + (q === 0 ? '<span class="year-bar-label">Q1\u2013Q4 W' + rawS + '\u2013W' + rawE + '</span>' : '')
                  + '</div>';
              }
              }
            } else if (freq === 'monthly') {
              const WEEKS_PER_MONTH = 4;
              const rawS = Math.max(1, Math.min(WEEKS_PER_MONTH, Math.round(env.start)));
              const rawE = Math.max(rawS, Math.min(WEEKS_PER_MONTH, Math.round(env.end)));
              for (let m = 0; m < 12; m++) {
                const leftPct  = ((m + (rawS - 1) / WEEKS_PER_MONTH) / 12 * 100).toFixed(4);
                const widthPct = ((rawE - rawS + 1) / WEEKS_PER_MONTH / 12 * 100).toFixed(4);
                barsCell += '<div class="year-bar" style="left:calc(' + leftPct + '% + 1px);width:calc(' + widthPct + '% - 2px);'
                  + 'background:' + col.fill + ';border:1px solid ' + col.stroke + ';color:' + col.text + '" '
                  + 'title="' + escHtml(key) + ' | ' + escHtml(YEAR_MONTHS[m]) + ' W' + rawS + '\u2013W' + rawE + ' (monthly)">'
                  + (m === 0 ? '<span class="year-bar-label">Monthly W' + rawS + '\u2013W' + rawE + '</span>' : '')
                  + '</div>';
              }
            } else {
              // annual / no frequency: Start/End = month numbers (1–12)
              const s = Math.max(1, env.start);
              const e = Math.min(12, env.end);
              if (s <= e) {
                const leftPct  = ((s - 1) / 12 * 100).toFixed(4);
                const widthPct = ((e - s + 1) / 12 * 100).toFixed(4);
                const label    = YEAR_MONTHS[s - 1] + '\u2013' + YEAR_MONTHS[e - 1];
                barsCell += '<div class="year-bar" style="left:' + leftPct + '%;width:' + widthPct + '%;'
                  + 'background:' + col.fill + ';border:1px solid ' + col.stroke + ';color:' + col.text + '" '
                  + 'title="' + escHtml(key) + ' | ' + escHtml(label)
                  + (freq ? ' (' + escHtml(freq) + ')' : env.uom ? ' (' + escHtml(env.uom) + ')' : '') + '">'
                  + '<span class="year-bar-label">' + escHtml(label) + '</span>'
                  + '</div>';
              } else {
                barsCell += '<span class="year-no-bar">\u2014</span>';
              }
            }

          } else if (yearView === 'quarter') {
            // ── QUARTER VIEW (W1–W13 axis) ─────────────────────────────
            const QI = yearViewIndex;
            if (freq === 'quarterly') {
              const COLS = 13;
              const rawS = Math.max(1, Math.min(COLS, Math.round(env.start)));
              const rawE = Math.max(rawS, Math.min(COLS, Math.round(env.end)));
              const leftPct  = ((rawS - 1) / COLS * 100).toFixed(4);
              const widthPct = ((rawE - rawS + 1) / COLS * 100).toFixed(4);
              const label    = 'W' + rawS + '\u2013W' + rawE;
              barsCell += '<div class="year-bar" style="left:calc(' + leftPct + '% + 1px);width:calc(' + widthPct + '% - 2px);'
                + 'background:' + col.fill + ';border:1px solid ' + col.stroke + ';color:' + col.text + '" '
                + 'title="' + escHtml(key) + ' | Q' + (QI + 1) + ' ' + escHtml(label) + ' (quarterly)">'
                + '<span class="year-bar-label">' + escHtml(label) + '</span>'
                + '</div>';
            } else if (freq === 'monthly') {
              // 3 monthly bars within the 13-week quarter (each month ≈ 4 weeks)
              const WPM = 4, COLS = 13;
              const rawS = Math.max(1, Math.min(WPM, Math.round(env.start)));
              const rawE = Math.max(rawS, Math.min(WPM, Math.round(env.end)));
              for (let mi = 0; mi < 3; mi++) {
                const barS = mi * WPM + rawS;
                const barE = mi * WPM + rawE;
                if (barS > COLS) continue;
                const leftPct  = ((barS - 1) / COLS * 100).toFixed(4);
                const widthPct = ((rawE - rawS + 1) / COLS * 100).toFixed(4);
                const mName    = YEAR_MONTHS[QI * 3 + mi] || '';
                barsCell += '<div class="year-bar" style="left:calc(' + leftPct + '% + 1px);width:calc(' + widthPct + '% - 2px);'
                  + 'background:' + col.fill + ';border:1px solid ' + col.stroke + ';color:' + col.text + '" '
                  + 'title="' + escHtml(key) + ' | ' + escHtml(mName) + ' W' + rawS + '\u2013W' + rawE + ' (monthly)">'
                  + (mi === 0 ? '<span class="year-bar-label">W' + rawS + '\u2013W' + rawE + '</span>' : '')
                  + '</div>';
              }
            } else {
              // annual: check if this quarter's months overlap the annual span
              const qStart = QI * 3 + 1, qEnd = QI * 3 + 3;
              const s = Math.max(1, Math.round(env.start)), e = Math.min(12, Math.round(env.end));
              const oS = Math.max(s, qStart), oE = Math.min(e, qEnd);
              if (oS <= oE) {
                const barS = (oS - qStart) * 4 + 1;
                const barE = Math.min(13, (oE - qStart + 1) * 4);
                const leftPct  = ((barS - 1) / 13 * 100).toFixed(4);
                const widthPct = ((barE - barS + 1) / 13 * 100).toFixed(4);
                const label    = YEAR_MONTHS[oS - 1] + '\u2013' + YEAR_MONTHS[oE - 1];
                barsCell += '<div class="year-bar" style="left:' + leftPct + '%;width:' + widthPct + '%;'
                  + 'background:' + col.fill + ';border:1px solid ' + col.stroke + ';color:' + col.text + '" '
                  + 'title="' + escHtml(key) + ' | ' + escHtml(label) + ' (annual)">'
                  + '<span class="year-bar-label">' + escHtml(label) + '</span>'
                  + '</div>';
              } else {
                barsCell += '<span class="year-no-bar">\u2014</span>';
              }
            }

          } else {
            // ── MONTH VIEW (W1–W4 axis) ────────────────────────────────
            const MI = yearViewIndex; // 0–11
            if (freq === 'monthly') {
              const COLS = 4;
              const rawS = Math.max(1, Math.min(COLS, Math.round(env.start)));
              const rawE = Math.max(rawS, Math.min(COLS, Math.round(env.end)));
              const leftPct  = ((rawS - 1) / COLS * 100).toFixed(4);
              const widthPct = ((rawE - rawS + 1) / COLS * 100).toFixed(4);
              const label    = 'W' + rawS + '\u2013W' + rawE;
              barsCell += '<div class="year-bar" style="left:calc(' + leftPct + '% + 1px);width:calc(' + widthPct + '% - 2px);'
                + 'background:' + col.fill + ';border:1px solid ' + col.stroke + ';color:' + col.text + '" '
                + 'title="' + escHtml(key) + ' | ' + escHtml(YEAR_MONTHS[MI]) + ' ' + escHtml(label) + ' (monthly)">'
                + '<span class="year-bar-label">' + escHtml(label) + '</span>'
                + '</div>';
            } else if (freq === 'quarterly') {
              // Which weeks of this quarter does this month cover?
              const WEEKS_PER_QTR = 13;
              const monthInQtr = MI % 3;
              const qRawS = Math.max(1, Math.min(WEEKS_PER_QTR, Math.round(env.start)));
              const qRawE = Math.max(qRawS, Math.min(WEEKS_PER_QTR, Math.round(env.end)));
              const mWeekS = monthInQtr * 4 + 1;
              const mWeekE = monthInQtr * 4 + 4;
              const overlapS = Math.max(qRawS, mWeekS);
              const overlapE = Math.min(qRawE, mWeekE);
              if (overlapS <= overlapE) {
                const posS = overlapS - monthInQtr * 4;
                const posE = overlapE - monthInQtr * 4;
                const leftPct  = ((posS - 1) / 4 * 100).toFixed(4);
                const widthPct = ((posE - posS + 1) / 4 * 100).toFixed(4);
                const label    = 'W' + posS + '\u2013W' + posE;
                barsCell += '<div class="year-bar" style="left:calc(' + leftPct + '% + 1px);width:calc(' + widthPct + '% - 2px);'
                  + 'background:' + col.fill + ';border:1px solid ' + col.stroke + ';color:' + col.text + '" '
                  + 'title="' + escHtml(key) + ' | ' + escHtml(YEAR_MONTHS[MI]) + ' ' + escHtml(label) + ' (quarterly)">'
                  + '<span class="year-bar-label">' + escHtml(label) + '</span>'
                  + '</div>';
              } else {
                barsCell += '<span class="year-no-bar">\u2014</span>';
              }
            } else {
              // annual: full bar if this month is within [env.start, env.end]
              const monthNum = MI + 1; // 1=Sep … 12=Aug
              const s = Math.max(1, Math.round(env.start)), e = Math.min(12, Math.round(env.end));
              if (monthNum >= s && monthNum <= e) {
                barsCell += '<div class="year-bar" style="left:0%;width:100%;'
                  + 'background:' + col.fill + ';border:1px solid ' + col.stroke + ';color:' + col.text + '" '
                  + 'title="' + escHtml(key) + ' | ' + escHtml(YEAR_MONTHS[MI]) + ' (annual)">'
                  + '<span class="year-bar-label">' + escHtml(YEAR_MONTHS[MI]) + '</span>'
                  + '</div>';
              } else {
                barsCell += '<span class="year-no-bar">\u2014</span>';
              }
            }
          }
        } else {
          barsCell += '<span class="year-no-bar">\u2014</span>';
        }
        barsCell += '</div>';

        const rowExtraCls = (hasKids && isExpanded) ? ' year-row-parent' : '';
        html += '<div class="year-data-row' + rowExtraCls + '">'
          + '<div class="year-td-label">' + labelCell + '</div>'
          + '<div class="year-td-bars">' + barsCell + '</div>'
          + '</div>';

        if (hasKids && isExpanded) {
          html += buildYearRows(nodeObj._children, depth + 1, pathKey);
        }
      }
      return html;
    }

    function yearRender() {
      const el = $('yearContent');
      if (!el) return;
      if (!Object.keys(tree).length) {
        el.innerHTML = '<div class="year-placeholder">No data loaded</div>';
        return;
      }
      // Rebuild L0 filter dropdown options (preserves CSV/XLSX order)
      const sel = $('yearL0Select');
      if (sel) {
        const prev = sel.value;
        sel.innerHTML = '<option value="">All processes</option>';
        for (const key of Object.keys(tree)) {
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = key;
          sel.appendChild(opt);
        }
        sel.value = (yearL0Filter !== null && tree[yearL0Filter]) ? yearL0Filter : '';
      }
      yearRenderSubPicker();
      // Re-inject resize handle into header after render
      requestAnimationFrame(yearAttachResizeHandle);

      // Axis columns depend on view
      let axisCells;
      if (yearView === 'quarter') {
        const qi = yearViewIndex;
        axisCells = Array.from({length: 13}, (_, i) => {
          const mName = YEAR_MONTHS[qi * 3 + Math.floor(i / 4)];
          return '<div class="year-th-month" title="' + escHtml(mName || '') + '">W' + (i + 1) + '</div>';
        }).join('');
      } else if (yearView === 'month') {
        axisCells = ['W1','W2','W3','W4'].map(w =>
          '<div class="year-th-month">' + escHtml(w) + '</div>'
        ).join('');
      } else {
        axisCells = YEAR_MONTHS.map(m => '<div class="year-th-month">' + escHtml(m) + '</div>').join('');
      }

      let header = '<div class="year-header-row">'
        + '<div class="year-th-label">Process</div>'
        + '<div class="year-th-axis">' + axisCells + '</div>'
        + '</div>';

      const rows = buildYearRows(tree, 0, '');
      el.innerHTML = '<div class="year-grid">' + header + rows + '</div>';
      rcRenderOverlayLayer();
      rcUpdateToggleBtn();
    }

    function yearHandleClick(e) {
      const btn = e.target.closest('.year-expand-btn');
      if (!btn) return;
      const pathKey = btn.dataset.path;
      if (yearExpandedPaths.has(pathKey)) yearExpandedPaths.delete(pathKey);
      else yearExpandedPaths.add(pathKey);
      yearRender();
    }

    let _yearResizing = false;

    function yearAttachResizeHandle() {
      const header = $('yearContent') && $('yearContent').querySelector('.year-th-label');
      if (!header) return;
      if (header.querySelector('.year-col-resize')) return; // already attached
      const handle = document.createElement('div');
      handle.className = 'year-col-resize';
      handle.title = 'Drag to resize';
      header.appendChild(handle);

      handle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        _yearResizing = true;
        handle.classList.add('dragging');
        $('yearScreen').classList.add('col-resizing');
        const startX = e.clientX;
        const startW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--year-label-w'), 10) || 260;

        function onMove(ev) {
          if (!_yearResizing) return;
          const newW = Math.max(120, Math.min(600, startW + ev.clientX - startX));
          document.documentElement.style.setProperty('--year-label-w', newW + 'px');
        }
        function onUp() {
          _yearResizing = false;
          handle.classList.remove('dragging');
          $('yearScreen').classList.remove('col-resizing');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    function openYearScreen() {
      ctrlPanel.classList.add('hidden');
      closeRolePanel();
      closeToolPanel();
      $('ganttScreen').classList.add('hidden');
      closeOverviewScreen();
      yearExpandedPaths.clear();
      yearView = 'year';
      yearViewIndex = 0;
      yearMinLevel = null;
      yearL0Filter = null;
      document.querySelectorAll('#yearViewSeg .year-view-opt').forEach(b => {
        b.classList.toggle('active', b.dataset.view === 'year');
      });
      document.querySelectorAll('#yearLevelSeg .year-view-opt').forEach(b => {
        b.classList.toggle('active', b.dataset.lvl === '');
      });
      $('yearScreen').classList.remove('hidden');
      yearRender();
    }

    function closeYearScreen() {
      $('yearScreen').classList.add('hidden');
    }

    // ── FULL OVERVIEW FUNCTIONS ────────────────────────────────────────────

    // Navigate from overview: for L0–L4 nodes, drill into the node (show children).
    // For L5 pills, navigate to L4 level and auto-select the L5 node.
    function navigateFromOverview(pathArray, isL5Leaf) {
      const navPath = isL5Leaf ? pathArray.slice(0, -1) : pathArray;
      currentPath = navPath;
      closeOverviewScreen();
      render('none');
      if (isL5Leaf) {
        const l5Key = pathArray[pathArray.length - 1];
        requestAnimationFrame(function () {
          const nodeEl = document.querySelector('.node[data-key="' + l5Key.replace(/"/g, '\\"') + '"]');
          if (nodeEl) nodeEl.click();
        });
      }
      history.pushState(null, '', pathToHash(navPath));
    }

    function overviewRender() {
      const content = $('overviewContent');
      if (!content) return;
      content.innerHTML = '';

      if (!tree || Object.keys(tree).length === 0) {
        content.innerHTML = '<div class="ov-placeholder">No data loaded</div>';
        return;
      }

      // Apply zoom + pan
      content.style.transform = `translate(${overviewPan.x}px,${overviewPan.y}px) scale(${overviewScale})`;
      content.style.transformOrigin = '0 0';

      const S = SVG_LAYOUT;  // same layout constants as export (NW:200 NH:80 HGAP:28 VGAP:28 PAD:60)

      // Determine the subtree to render and the absolute depth of its root
      let subtree, rootAbsDepth;
      if (overviewL1Key) {
        subtree = tree[overviewL1Key] ? { [overviewL1Key]: tree[overviewL1Key] } : {};
        rootAbsDepth = levelOffset;
      } else {
        subtree = tree;
        rootAbsDepth = levelOffset;
      }

      if (!Object.keys(subtree).length) {
        content.innerHTML = '<div class="ov-placeholder">No data</div>';
        return;
      }

      const maxDepth = 6 - rootAbsDepth;

      // Measure layout — horizontal spread, except leaf level which stacks vertically
      function measure(nodes, depth) {
        if (depth >= maxDepth) return { totalW: 0, totalH: 0, items: [] };
        const keys = Object.keys(nodes);
        if (!keys.length) return { totalW: 0, totalH: 0, items: [] };

        // Vertical if all nodes at this depth are leaves (no children)
        const isVert = keys.every(k => !Object.keys(nodes[k]._children || {}).length);

        if (isVert) {
          // Stack siblings top-to-bottom
          const items = [];
          let totalH = 0, maxW = 0;
          for (const key of keys) {
            const nodeObj = nodes[key];
            items.push({ key, nodeObj, child: { totalW: 0, totalH: 0, items: [] }, subtreeW: S.NW, x: 0, y: totalH });
            totalH += S.NH + S.VGAP;
            maxW = Math.max(maxW, S.NW);
          }
          const finalH = Math.max(0, totalH - S.VGAP);
          items.forEach(it => { it.subtreeW = maxW; });
          return { totalW: maxW, totalH: finalH, items };
        }

        // Horizontal spread
        const items = [];
        let totalW = 0, maxChildH = 0;
        for (const key of keys) {
          const nodeObj = nodes[key];
          const child = measure(nodeObj._children || {}, depth + 1);
          const itemW = Math.max(S.NW, child.totalW);
          items.push({ key, nodeObj, child, subtreeW: itemW, x: totalW, y: 0 });
          totalW += itemW + S.HGAP;
          maxChildH = Math.max(maxChildH, child.totalH);
        }
        const finalW = Math.max(0, totalW - S.HGAP);
        const totalH = S.NH + (maxChildH > 0 ? S.VGAP + maxChildH : 0);
        return { totalW: finalW, totalH, items };
      }

      const measured = measure(subtree, 0);
      const canvasW = measured.totalW + S.PAD * 2;
      const canvasH = measured.totalH + S.PAD * 2;

      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:' + canvasW + 'px;height:' + canvasH + 'px;';

      // Render nodes at absolute coordinates — mirrors renderLevel() in buildSvgString()
      function renderNodes(items, depth, xBase, yBase, pathSoFar) {
        const absLevel = rootAbsDepth + depth;
        for (const item of items) {
          const x = xBase + item.x;
          const y = yBase + item.y;
          const w = item.subtreeW;
          const ci = Math.min(absLevel, EXP_FILLS.length - 1);
          const navPath = pathSoFar.concat(item.key);
          const isLeaf = item.child.items.length === 0;
          const atL5   = absLevel >= 4;

          const el = document.createElement('div');
          el.title = item.key + (item.nodeObj._desc ? '\n' + item.nodeObj._desc : '');
          el.style.position   = 'absolute';
          el.style.left       = x + 'px';
          el.style.top        = y + 'px';
          el.style.width      = w + 'px';
          el.style.height     = S.NH + 'px';
          el.style.background = EXP_FILLS[ci];
          el.style.border     = '1.5px solid ' + EXP_STROKES[ci];
          el.style.borderRadius = S.CORNER + 'px';
          el.style.boxSizing  = 'border-box';
          el.style.display    = 'flex';
          el.style.alignItems = 'center';
          el.style.justifyContent = 'center';
          el.style.textAlign  = 'center';
          el.style.padding    = '0 10px';
          el.style.fontSize   = '12px';
          el.style.fontWeight = '600';
          el.style.color      = EXP_TEXTS[ci];
          el.style.lineHeight = '1.3';
          el.style.wordBreak  = 'break-word';
          el.style.cursor     = 'pointer';
          el.style.userSelect = 'none';
          el.style.overflow   = 'hidden';
          el.style.transition = 'filter .12s';
          el.textContent = item.key;
          const _ovType = String((item.nodeObj._meta && item.nodeObj._meta.Type) || '').trim().toLowerCase();
          if (_ovType === 'system' || _ovType === 'system activity') el.setAttribute('data-ov-type', 'sysactivity');
          else if (_ovType === 'meeting') el.setAttribute('data-ov-type', 'meeting');
          el.addEventListener('mouseenter', function () { this.style.filter = 'brightness(.88)'; });
          el.addEventListener('mouseleave', function () { this.style.filter = ''; });
          el.addEventListener('click', (function (p, leaf, l5) {
            return function (e) { e.stopPropagation(); navigateFromOverview(p, leaf && l5); };
          })(navPath, isLeaf, atL5));

          wrap.appendChild(el);

          if (item.child.items.length > 0) {
            renderNodes(item.child.items, depth + 1, x, y + S.NH + S.VGAP, navPath);
          }
        }
      }

      renderNodes(measured.items, 0, S.PAD, S.PAD, []);
      content.appendChild(wrap);
    }

    function openOverviewScreen() {
      $('ganttScreen').classList.add('hidden');
      $('yearScreen').classList.add('hidden');
      $('rolePanel').classList.remove('open');
      $('toolPanel').classList.remove('open');
      clearInfoPanel();
      
      overviewScale = 1.0;
      overviewPan = { x: 0, y: 0 };
      overviewL1Key = '';

      // Reset zoom label
      updateOverviewZoomLabel();

      // L0 level no longer in use — always hide the L0 dropdown
      $('ovL0Select').style.display = 'none';

      // Populate L1 selector
      const sel = $('ovL1Select');
      const l1Keys = getRpL1Keys();
      sel.innerHTML = '<option value="">— All L1 processes —</option>';
      l1Keys.forEach(function (k) {
        const opt = document.createElement('option');
        opt.value = k; opt.textContent = k;
        sel.appendChild(opt);
      });
      sel.disabled = l1Keys.length === 0;

      $('overviewScreen').classList.remove('hidden');
      overviewRender();

      // Set focus to canvas
      $('overviewCanvas').focus();
    }

    function closeOverviewScreen() {
      $('overviewScreen').classList.add('hidden');
    }

    // Zoom controls
    function updateOverviewZoomLabel() {
      const lbl = $('overviewZoomLabel');
      if (lbl) lbl.textContent = Math.round(overviewScale * 100) + '%';
    }

    $('btnOverviewZoomPlus').addEventListener('click', function() {
      overviewScale = Math.min(1.2, overviewScale + 0.1);
      overviewRender();
      updateOverviewZoomLabel();
    });

    $('btnOverviewZoomMinus').addEventListener('click', function() {
      overviewScale = Math.max(0.7, overviewScale - 0.1);
      overviewRender();
      updateOverviewZoomLabel();
    });

    $('btnOverviewClose').addEventListener('click', closeOverviewScreen);

    // ── PAN & WHEEL on overview canvas ────────────────────────────────────
    (function () {
      const canvas  = $('overviewCanvas');
      const content  = $('overviewContent');
      const DRAG_THRESHOLD = 5; // px — below this is treated as a click
      let pending   = false;  // mousedown recorded, waiting to see if it's a drag
      let dragging  = false;  // threshold crossed — actively panning
      let startX    = 0, startY = 0;
      let startPanX = 0, startPanY = 0;

      canvas.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        // Don't intercept buttons/selects inside the toolbar
        if (e.target.closest('.overview-toolbar')) return;
        pending   = true;
        dragging  = false;
        startX    = e.clientX;
        startY    = e.clientY;
        startPanX = overviewPan.x;
        startPanY = overviewPan.y;
      });

      window.addEventListener('mousemove', function (e) {
        if (!pending && !dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!dragging && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;

        if (!dragging) {
          // Threshold crossed — become a pan; suppress the eventual click on any node
          dragging = true;
          canvas.classList.add('panning');
        }
        overviewPan.x = startPanX + (e.clientX - startX);
        overviewPan.y = startPanY + (e.clientY - startY);
        content.style.transform = `translate(${overviewPan.x}px,${overviewPan.y}px) scale(${overviewScale})`;
      });

      window.addEventListener('mouseup', function () {
        pending  = false;
        dragging = false;
        canvas.classList.remove('panning');
      });

      // Suppress click on nodes when a drag just finished
      canvas.addEventListener('click', function (e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
          e.stopPropagation();
        }
      }, true); // capture phase so it runs before node click handlers

      // Touch pan
      canvas.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        pending   = true;
        dragging  = false;
        startX    = e.touches[0].clientX;
        startY    = e.touches[0].clientY;
        startPanX = overviewPan.x;
        startPanY = overviewPan.y;
      }, { passive: true });

      canvas.addEventListener('touchmove', function (e) {
        if (!pending || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (!dragging && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
        dragging = true;
        overviewPan.x = startPanX + dx;
        overviewPan.y = startPanY + dy;
        content.style.transform = `translate(${overviewPan.x}px,${overviewPan.y}px) scale(${overviewScale})`;
      }, { passive: true });

      canvas.addEventListener('touchend', function () { pending = false; dragging = false; });

      // Ctrl+wheel or pinch: zoom keeping pointer position fixed
      canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        const delta     = e.deltaY < 0 ? 0.1 : -0.1;
        const newScale  = Math.min(1.2, Math.max(0.7, overviewScale + delta));
        if (newScale === overviewScale) return;

        // Keep the point under the cursor stationary
        const rect  = canvas.getBoundingClientRect();
        const mx    = e.clientX - rect.left;
        const my    = e.clientY - rect.top;
        overviewPan.x = mx - (mx - overviewPan.x) * (newScale / overviewScale);
        overviewPan.y = my - (my - overviewPan.y) * (newScale / overviewScale);
        overviewScale = newScale;
        content.style.transform = `translate(${overviewPan.x}px,${overviewPan.y}px) scale(${overviewScale})`;
        updateOverviewZoomLabel();
      }, { passive: false });
    })();

    $('ovL0Select').addEventListener('change', function () {
      overviewPan = { x: 0, y: 0 };
      overviewRender();
    });

    $('ovL1Select').addEventListener('change', function () {
      overviewL1Key = this.value;
      overviewPan = { x: 0, y: 0 };
      overviewRender();
    });

    // ── Views & Lookup dropdowns (mutually exclusive) ─────────────────────
    (function () {
      // Close helpers exposed so each dropdown can close the other
      function closeViewsMenu() {
        $('navViewsMenu').classList.add('hidden');
        $('btnViews').classList.remove('views-open');
      }
      function closeLookupMenu() {
        $('navLookupMenu').classList.add('hidden');
        $('btnLookup').classList.remove('views-open');
      }

      // ── Views ──
      const btnViews = $('btnViews');
      const btnOv    = $('btnViewsOverview');
      const btnTl    = $('btnViewsTimeline');

      function updateViewsActive() {
        btnOv.classList.toggle('views-active', !$('overviewScreen').classList.contains('hidden'));
        btnTl.classList.toggle('views-active', !$('yearScreen').classList.contains('hidden'));
      }

      btnViews.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = !$('navViewsMenu').classList.contains('hidden');
        if (isOpen) { closeViewsMenu(); return; }
        closeLookupMenu();
        updateViewsActive();
        $('navViewsMenu').classList.remove('hidden');
        btnViews.classList.add('views-open');
      });

      btnOv.addEventListener('click', function () {
        closeViewsMenu();
        if ($('overviewScreen').classList.contains('hidden')) openOverviewScreen();
        else closeOverviewScreen();
      });

      btnTl.addEventListener('click', function () {
        closeViewsMenu();
        if ($('yearScreen').classList.contains('hidden')) openYearScreen();
        else closeYearScreen();
      });

      // ── Lookup ──
      const btnLookup = $('btnLookup');

      function updateLookupActive() {
        $('btnRoleLookup').classList.toggle('views-active', $('rolePanel').classList.contains('open'));
        $('btnToolLookup').classList.toggle('views-active', $('toolPanel').classList.contains('open'));
      }

      btnLookup.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = !$('navLookupMenu').classList.contains('hidden');
        if (isOpen) { closeLookupMenu(); return; }
        closeViewsMenu();
        updateLookupActive();
        $('navLookupMenu').classList.remove('hidden');
        btnLookup.classList.add('views-open');
      });

      // Close lookup menu when a panel item is clicked (they stopPropagation)
      $('btnRoleLookup').addEventListener('click', closeLookupMenu);
      $('btnToolLookup').addEventListener('click', closeLookupMenu);

      // ── Close both on outside click ──
      document.addEventListener('click', function (e) {
        if (!$('navViewsDrop').contains(e.target)) closeViewsMenu();
        if (!$('navLookupDrop').contains(e.target)) closeLookupMenu();
      });
    }());

    $('btnYearClose').addEventListener('click', closeYearScreen);

    (function () {
      const btn = $('btnYearLegend'), pop = $('yearLegendPop');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const open = !pop.classList.contains('hidden');
        pop.classList.toggle('hidden', open);
        btn.classList.toggle('active', !open);
      });
      document.addEventListener('click', function (e) {
        if (!pop.classList.contains('hidden') && !btn.contains(e.target) && !pop.contains(e.target)) {
          pop.classList.add('hidden');
          btn.classList.remove('active');
        }
      });
    })();
    $('yearContent').addEventListener('click', yearHandleClick);

    $('yearViewSeg').addEventListener('click', function (e) {
      const btn = e.target.closest('.year-view-opt');
      if (!btn) return;
      yearView = btn.dataset.view;
      yearViewIndex = 0;
      document.querySelectorAll('#yearViewSeg .year-view-opt').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
      yearRender();
    });

    $('yearLevelSeg').addEventListener('click', function (e) {
      const btn = e.target.closest('.year-view-opt');
      if (!btn) return;
      yearMinLevel = btn.dataset.lvl === '' ? null : parseInt(btn.dataset.lvl, 10);
      document.querySelectorAll('#yearLevelSeg .year-view-opt').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
      yearRender();
    });

    $('yearL0Select').addEventListener('change', function () {
      yearL0Filter = this.value === '' ? null : this.value;
      yearRender();
    });

    $('yearSubPicker').addEventListener('click', function (e) {
      const btn = e.target.closest('.year-sub-btn');
      if (!btn) return;
      yearViewIndex = parseInt(btn.dataset.idx, 10);
      yearRenderSubPicker();
      yearRender();
    });

    $('btnGanttClose').addEventListener('click', closeGanttScreen);

    /** Build an SVG of the fully-expanded Gantt for the current L1 and download as JPEG */
    function exportGanttAsJpeg() {
      if (!ganttL1Key) { showExportToast('Select an L1 process first'); return; }
      const l1Node = getRpL1Node(ganttL1Key);
      if (!l1Node || !Object.keys(l1Node._children).length) { showExportToast('No data to export'); return; }

      showExportToast('Building image\u2026');

      const PAD       = 24;
      const LABEL_W   = getGanttLabelW();
      const INDENT_W  = GANTT_INDENT_W;
      const ROW_H     = GANTT_ROW_H;
      const HEADER_H  = 40;
      const FF        = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

      // Build axis from the full L1 envelope using a generous bar area width
      const fullEnv = ganttNodeEnvelope(l1Node);
      let axis = null;
      if (fullEnv) {
        const hintW   = 900;
        const step    = ganttTickStep(fullEnv.end - fullEnv.start, hintW);
        const axisMin = Math.floor(fullEnv.start / step) * step;
        const axisMax = Math.ceil(fullEnv.end   / step) * step + step;
        const pxPerU  = Math.max(hintW / (axisMax - axisMin), 8);
        const barAreaW = Math.ceil((axisMax - axisMin) * pxPerU);
        axis = { min: axisMin, max: axisMax, uom: fullEnv.uom, pxPerU, barAreaW, step };
      }

      const barAreaW = axis ? axis.barAreaW : 600;
      const totalW   = PAD + LABEL_W + barAreaW + PAD;

      // Collect rows up to L3 (depth 0 = L2, depth 1 = L3); children always follow their parent
      const rowData = [];
      function collectRows(nodes, depth) {
        for (const key of Object.keys(nodes)) {
          const nodeObj = nodes[key];
          const env = axis ? ganttNodeEnvelope(nodeObj) : null;
          rowData.push({ key, depth, env });
          if (depth < 1 && Object.keys(nodeObj._children).length) collectRows(nodeObj._children, depth + 1);
        }
      }
      collectRows(l1Node._children, 0);

      const totalH = PAD + HEADER_H + rowData.length * ROW_H + PAD;

      const defs = [];
      const parts = [];

      // White background
      parts.push('<rect width="' + totalW + '" height="' + totalH + '" fill="#ffffff"/>');

      // Header background
      parts.push('<rect x="0" y="' + PAD + '" width="' + totalW + '" height="' + HEADER_H + '" fill="#f5f6f8"/>');

      // "Process" column header label
      parts.push(
        '<text x="' + (PAD + 10) + '" y="' + (PAD + HEADER_H / 2 + 4) + '"' +
        ' font-size="10" font-weight="700" letter-spacing="0.5" fill="#888"' +
        ' font-family="' + FF + '">PROCESS</text>'
      );

      // Axis ticks in header
      if (axis) {
        for (let ti = 0; ; ti++) {
          const t = axis.min + ti * axis.step;
          if (t > axis.max + axis.step * 0.01) break;
          const px = PAD + LABEL_W + Math.round((t - axis.min) * axis.pxPerU);
          const lbl = escHtml(ganttTickLabel(axis.uom, t));
          parts.push('<line x1="' + px + '" y1="' + (PAD + HEADER_H - 8) + '" x2="' + px + '" y2="' + (PAD + HEADER_H) + '" stroke="#ccc" stroke-width="1"/>');
          parts.push(
            '<text x="' + px + '" y="' + (PAD + HEADER_H - 12) + '" text-anchor="middle"' +
            ' font-size="10" fill="#999" font-family="' + FF + '">' + lbl + '</text>'
          );
        }
      } else {
        parts.push(
          '<text x="' + (PAD + LABEL_W + 12) + '" y="' + (PAD + HEADER_H / 2 + 4) + '"' +
          ' font-size="10" fill="#ccc" font-family="' + FF + '">No timing data</text>'
        );
      }

      // Header bottom border + label/bar separator
      parts.push('<line x1="0" y1="' + (PAD + HEADER_H) + '" x2="' + totalW + '" y2="' + (PAD + HEADER_H) + '" stroke="#d0d0d0" stroke-width="2"/>');
      parts.push('<line x1="' + (PAD + LABEL_W) + '" y1="' + PAD + '" x2="' + (PAD + LABEL_W) + '" y2="' + (PAD + HEADER_H + rowData.length * ROW_H) + '" stroke="#d0d0d0" stroke-width="1"/>');

      // Rows
      rowData.forEach(function(row, i) {
        const rowY     = PAD + HEADER_H + i * ROW_H;
        const colorIdx = Math.min(row.depth, GANTT_BAR_FILLS.length - 1);

        // Alternating row background
        if (i % 2 === 1) {
          parts.push('<rect x="0" y="' + rowY + '" width="' + totalW + '" height="' + ROW_H + '" fill="#fafafa"/>');
        }

        // Row divider
        parts.push('<line x1="0" y1="' + (rowY + ROW_H) + '" x2="' + totalW + '" y2="' + (rowY + ROW_H) + '" stroke="#ececec" stroke-width="1"/>');

        // Vertical grid lines in bar area
        if (axis) {
          for (let ti = 0; ; ti++) {
            const t = axis.min + ti * axis.step;
            if (t > axis.max + axis.step * 0.01) break;
            const px = PAD + LABEL_W + Math.round((t - axis.min) * axis.pxPerU);
            parts.push('<line x1="' + px + '" y1="' + rowY + '" x2="' + px + '" y2="' + (rowY + ROW_H) + '" stroke="#ebebeb" stroke-width="1"/>');
          }
        }

        // Label text (clipped to label column)
        const indent = 10 + row.depth * INDENT_W;
        const labelX = PAD + indent;
        const labelY = rowY + ROW_H / 2 + 4;
        const clipId = 'lc' + i;
        defs.push('<clipPath id="' + clipId + '"><rect x="' + PAD + '" y="' + rowY + '" width="' + (LABEL_W - indent - 4) + '" height="' + ROW_H + '"/></clipPath>');
        parts.push(
          '<text x="' + labelX + '" y="' + labelY + '"' +
          ' clip-path="url(#' + clipId + ')" font-size="12" fill="#333"' +
          ' font-family="' + FF + '">' + escHtml(row.key) + '</text>'
        );

        // Bar
        if (axis && row.env) {
          const barX = PAD + LABEL_W + Math.round((row.env.start - axis.min) * axis.pxPerU);
          const barW = Math.max(4, Math.round((row.env.end - row.env.start) * axis.pxPerU));
          const barY = rowY + Math.round((ROW_H - 18) / 2);
          const fill   = GANTT_BAR_FILLS[colorIdx];
          const stroke = GANTT_BAR_STROKES[colorIdx];
          const txt    = GANTT_BAR_TEXTS[colorIdx];
          parts.push(
            '<rect x="' + barX + '" y="' + barY + '" width="' + barW + '" height="18"' +
            ' rx="4" ry="4" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1"/>'
          );
          if (barW > 32 && row.depth === 0) {
            const bcId = 'bc' + i;
            defs.push('<clipPath id="' + bcId + '"><rect x="' + (barX + 2) + '" y="' + barY + '" width="' + (barW - 4) + '" height="18"/></clipPath>');
            parts.push(
              '<text x="' + (barX + barW / 2) + '" y="' + (barY + 12) + '" text-anchor="middle"' +
              ' clip-path="url(#' + bcId + ')" font-size="10" font-weight="600"' +
              ' fill="' + txt + '" font-family="' + FF + '">' + escHtml(row.key) + '</text>'
            );
          }
        }
      });

      const svgStr =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + totalW + '" height="' + totalH + '"' +
        ' viewBox="0 0 ' + totalW + ' ' + totalH + '">\n' +
        (defs.length ? '  <defs>\n    ' + defs.join('\n    ') + '\n  </defs>\n' : '') +
        parts.map(function(s) { return '  ' + s; }).join('\n') +
        '\n</svg>';

      const sanitize = function(s) { return s.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''); };
      downloadJPEG(svgStr, totalW, totalH, 'Gantt - ' + sanitize(ganttL1Key) + '.jpg');
    }

    $('btnGanttExport').addEventListener('click', exportGanttAsJpeg);

    $('ganttL1Select').addEventListener('change', function () {
      ganttL1Key = this.value || null;
      ganttExpandedPaths.clear();
      ganttRender();
    });

    // Drag-to-resize the gantt label column
    $('ganttContent').addEventListener('mousedown', function (e) {
      const handle = e.target.closest('.gantt-col-resizer');
      if (!handle) return;
      e.preventDefault();
      handle.classList.add('dragging');
      const startX   = e.clientX;
      const startW   = getGanttLabelW();
      function onMove(ev) {
        const w = Math.min(600, Math.max(80, startW + ev.clientX - startX));
        document.documentElement.style.setProperty('--gantt-label-w', w + 'px');
      }
      function onUp() {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        ganttRender();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // ── ROLE LOOKUP ────────────────────────────────────────────────────────
    let activeRoleFilter = null; // { l1Key, roleName, selectedPath } | null
    let rolePanelOpen = false;
    const rpRasciFilter = new Set(); // selected RASCI columns; empty = all applicable

    // ── TOOL LOOKUP ────────────────────────────────────────────────────────
    let activeToolFilter = null; // { toolName, funcName, selectedPath } | null
    let toolPanelOpen = false;

    /** Collect all L1 keys from the tree. */
    function getRpL1Keys() {
      if (!Object.keys(tree).length) return [];
      return Object.keys(tree);
    }

    /** Get the node object for a given L1 key. */
    function getRpL1Node(l1Key) {
      return tree[l1Key] || null;
    }

    /** Columns to iterate given current rpRasciFilter (empty = all). */
    function rpActiveCols() { return rpRasciFilter.size ? rpRasciFilter : ['R','A','S','C','I']; }

    /** Walk a subtree and collect all unique role names from active RASCI columns. */
    function collectRoleNames(node, out) {
      for (const [, child] of Object.entries(node)) {
        if (child._meta) {
          for (const col of rpActiveCols()) {
            const val = child._meta[col];
            if (!val) continue;
            for (const name of splitSemicolon(val)) {
              out.add(name);
            }
          }
        }
        collectRoleNames(child._children, out);
      }
    }

    function getRpRoleNames(l1Key) {
      const l1Node = getRpL1Node(l1Key);
      if (!l1Node) return [];
      const out = new Set();
      // Include the L1 node itself
      if (l1Node._meta) {
        for (const col of rpActiveCols()) {
          const val = l1Node._meta[col];
          if (!val) continue;
          for (const name of splitSemicolon(val)) out.add(name);
        }
      }
      collectRoleNames(l1Node._children, out);
      return Array.from(out); // order follows first-occurrence in the XLSX/CSV row sequence
    }

    /** Count unique process nodes (nodes with _meta) that contain each role under l1Key. */
    function getRpRoleCounts(l1Key) {
      const l1Node = getRpL1Node(l1Key);
      if (!l1Node) return {};
      const counts = {};
      function countInNode(node) {
        if (node._meta) {
          const seen = new Set();
          for (const col of rpActiveCols()) {
            const val = node._meta[col];
            if (!val) continue;
            for (const name of splitSemicolon(val)) {
              if (!seen.has(name)) { seen.add(name); counts[name] = (counts[name] || 0) + 1; }
            }
          }
        }
        for (const child of Object.values(node._children || {})) countInNode(child);
      }
      countInNode(l1Node);
      return counts;
    }

    /**
     * Recursively search for all leaf nodes (nodes with _meta) under a given subtree
     * where the roleName appears in any RASCI column.
     * Returns array of { path: string[], rasciHits: string[] }
     */
    function rpSearchInNode(node, roleName, path, results) {
      for (const [key, child] of Object.entries(node)) {
        const childPath = path.concat(key);
        if (child._meta) {
          const hits = [];
          for (const col of rpActiveCols()) {
            const val = child._meta[col];
            if (!val) continue;
            const names = splitSemicolon(val);
            if (names.some(n => n.toLowerCase() === roleName.toLowerCase())) hits.push(col);
          }
          if (hits.length) results.push({ path: childPath, rasciHits: hits });
        }
        rpSearchInNode(child._children, roleName, childPath, results);
      }
    }

    function rpSearch(l1Key, roleName) {
      const l1Node = getRpL1Node(l1Key);
      if (!l1Node) return [];
      const results = [];
      const basePath = [l1Key];
      // Check L1 node itself
      if (l1Node._meta) {
        const hits = [];
        for (const col of rpActiveCols()) {
          const val = l1Node._meta[col];
          if (!val) continue;
          const names = splitSemicolon(val);
          if (names.some(n => n.toLowerCase() === roleName.toLowerCase())) hits.push(col);
        }
        if (hits.length) results.push({ path: basePath, rasciHits: hits });
      }
      rpSearchInNode(l1Node._children, roleName, basePath, results);
      return results;
    }

    /**
     * Returns true if the given subtree node or any of its descendants contain the roleName
     * in any RASCI column.
     */
    function subtreeContainsRole(nodeObj, roleName) {
      if (nodeObj._meta) {
        for (const col of rpActiveCols()) {
          const val = nodeObj._meta[col];
          if (!val) continue;
          if (splitSemicolon(val).some(n => n.toLowerCase() === roleName.toLowerCase())) return true;
        }
      }
      for (const child of Object.values(nodeObj._children)) {
        if (subtreeContainsRole(child, roleName)) return true;
      }
      return false;
    }

    function _applyHighlights(filter, panelOpen, cssClass) {
      const nodes = flowContainer.querySelectorAll('.node');
      if (!panelOpen || !filter || !filter.selectedPath) {
        nodes.forEach(el => el.classList.remove(cssClass));
        return;
      }
      const selectedKey = filter.selectedPath.join('\x00');
      nodes.forEach(el => {
        const key = el.getAttribute('data-key');
        if (!key) { el.classList.remove(cssClass); return; }
        const fullPathKey = currentPath.concat(key).join('\x00');
        el.classList.toggle(cssClass, fullPathKey === selectedKey);
      });
    }

    function applyRoleHighlights() { _applyHighlights(activeRoleFilter, rolePanelOpen, 'role-match'); }

    // ── Role panel DOM wiring ───────────────────────────────────────────────
    const rolePanel    = $('rolePanel');
    const rpL1Select   = $('rpL1');
    const rpRoleBtn     = $('rpRoleBtn');
    const rpRoleBtnText = $('rpRoleBtnText');
    const rpRoleList    = $('rpRoleList');
    let   rpRoleValue   = '';
    const rpResults    = $('rpResults');
    const btnRoleLookup = $('btnRoleLookup');

    function openRolePanel() {
      // Close controls panel, tool panel and overlay screens if open
      ctrlPanel.classList.add('hidden');
      closeToolPanel();
      $('yearScreen').classList.add('hidden');
      $('ganttScreen').classList.add('hidden');
      rolePanelOpen = true;
      rolePanel.classList.add('open');
      // Populate L1 dropdown
      const keys = getRpL1Keys();
      rpL1Select.innerHTML = '<option value="">— Select L1 process —</option>';
      keys.forEach(k => {
        const opt = document.createElement('option');
        opt.value = k; opt.textContent = k;
        // Restore selection if filter is active
        if (activeRoleFilter && activeRoleFilter.l1Key === k) opt.selected = true;
        rpL1Select.appendChild(opt);
      });
      if (!keys.length) {
        rpL1Select.innerHTML = '<option value="">No data loaded</option>';
        rpL1Select.disabled = true;
      } else {
        rpL1Select.disabled = false;
      }
      // If a filter is active, restore role dropdown, results, and highlight
      if (activeRoleFilter && activeRoleFilter.roleName) {
        populateRpRoles(activeRoleFilter.l1Key, activeRoleFilter.roleName);
        const results = rpSearch(activeRoleFilter.l1Key, activeRoleFilter.roleName);
        renderRpResults(results, activeRoleFilter.l1Key, activeRoleFilter.roleName);
        // Re-mark the previously active result
        if (activeRoleFilter.selectedPath) {
          const selectedKey = activeRoleFilter.selectedPath.join('\x00');
          rpResults.querySelectorAll('.rp-result-item').forEach(btn => {
            const pathEl = btn.querySelector('.rp-result-path');
            const nameEl = btn.querySelector('.rp-result-name');
            // Reconstruct the path from UI elements to match
            const resultName = nameEl ? nameEl.textContent : '';
            const resultPath = pathEl ? pathEl.textContent.split(' › ') : [resultName];
            if (resultPath.join('\x00') === selectedKey) btn.classList.add('rp-result-active');
          });
          applyRoleHighlights();
        }
      }
    }

    function populateRpRoles(l1Key, restoreRole) {
      const names  = getRpRoleNames(l1Key);
      const counts = getRpRoleCounts(l1Key);
      rpRoleList.innerHTML = '';
      rpRoleValue = '';
      rpRoleBtnText.textContent = '— Select role —';
      rpRoleBtn.setAttribute('aria-expanded', 'false');
      rpRoleList.hidden = true;
      if (!names.length) { rpRoleBtn.disabled = true; return; }
      names.forEach(n => {
        const li = document.createElement('li');
        li.className = 'rp-role-opt';
        li.setAttribute('role', 'option');
        li.setAttribute('data-value', n);
        li.setAttribute('aria-selected', restoreRole && n === restoreRole ? 'true' : 'false');
        const nameSpan = document.createElement('span');
        nameSpan.className = 'rp-role-opt-name';
        nameSpan.textContent = n;
        li.appendChild(nameSpan);
        const cntSpan = document.createElement('span');
        cntSpan.className = 'rp-role-opt-count';
        cntSpan.textContent = '[' + (counts[n] || 0) + ']';
        li.appendChild(cntSpan);
        li.addEventListener('click', () => {
          rpRoleList.querySelectorAll('.rp-role-opt').forEach(el => el.setAttribute('aria-selected', 'false'));
          li.setAttribute('aria-selected', 'true');
          rpRoleValue = n;
          rpRoleBtnText.textContent = n;
          rpRoleBtn.setAttribute('aria-expanded', 'false');
          rpRoleList.hidden = true;
          const l1 = rpL1Select.value;
          if (!l1 || !rpRoleValue) { activeRoleFilter = null; applyRoleHighlights(); rpResults.innerHTML = ''; return; }
          const results = rpSearch(l1, rpRoleValue);
          activeRoleFilter = { l1Key: l1, roleName: rpRoleValue, selectedPath: null };
          renderRpResults(results, l1, rpRoleValue);
          applyRoleHighlights();
        });
        rpRoleList.appendChild(li);
      });
      if (restoreRole) { rpRoleValue = restoreRole; rpRoleBtnText.textContent = restoreRole; }
      rpRoleBtn.disabled = false;
    }

    function renderRpResults(results, l1Key, roleName) {
      rpResults.innerHTML = '';
      if (!results.length) {
        const empty = document.createElement('div');
        empty.className = 'rp-empty';
        empty.textContent = 'No processes found for "' + roleName + '" in ' + l1Key;
        rpResults.appendChild(empty);
        return;
      }
      // Count line
      const frag = document.createDocumentFragment();
      const countEl = document.createElement('div');
      countEl.className = 'rp-count';
      countEl.textContent = results.length + ' process' + (results.length !== 1 ? 'es' : '');
      frag.appendChild(countEl);

      results.forEach(res => {
        const btn = document.createElement('button');
        btn.className = 'rp-result-item';

        const nameEl = document.createElement('div');
        nameEl.className = 'rp-result-name';
        nameEl.textContent = res.path[res.path.length - 1];
        btn.appendChild(nameEl);

        if (res.rasciHits.length) {
          const badgesEl = document.createElement('div');
          badgesEl.className = 'rp-result-badges';
          res.rasciHits.forEach(col => {
            const badge = document.createElement('span');
            badge.className = 'rp-badge';
            badge.textContent = col;
            badgesEl.appendChild(badge);
          });
          btn.appendChild(badgesEl);
        }

        if (res.path.length > 1) {
          const pathEl = document.createElement('div');
          pathEl.className = 'rp-result-path';
          pathEl.textContent = res.path.join(' › ');
          btn.appendChild(pathEl);
        }

        btn.addEventListener('click', () => {
          // Mark this result as selected in the panel
          rpResults.querySelectorAll('.rp-result-item').forEach(b => b.classList.remove('rp-result-active'));
          btn.classList.add('rp-result-active');
          // Set the selected path so only this node gets the amber highlight
          if (activeRoleFilter) activeRoleFilter.selectedPath = res.path;
          // Navigate to the parent level of this process, then highlight the node
          const target = res.path[res.path.length - 1];
          const parentPath = res.path.slice(0, -1);
          history.pushState(null, '', pathToHash(parentPath));
          currentPath = parentPath;
          render('none');
          updateNav();
          requestAnimationFrame(() => {
            for (const n of flowContainer.querySelectorAll('.node')) {
              if (n.getAttribute('data-key') === target) {
                n.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
                n.focus();
                break;
              }
            }
          });
        });

        frag.appendChild(btn);
      });
      rpResults.appendChild(frag);
    }

    function closeRolePanel() {
      rolePanelOpen = false;
      rolePanel.classList.remove('open');
      applyRoleHighlights();
    }

    btnRoleLookup.addEventListener('click', e => {
      e.stopPropagation();
      if (rolePanel.classList.contains('open')) {
        closeRolePanel();
      } else {
        openRolePanel();
      }
    });

    $('btnRolePanelClose').addEventListener('click', () => {
      closeRolePanel();
    });

    // Close panel on outside click
    document.addEventListener('click', e => {
      if (!rolePanel.classList.contains('open')) return;
      if (!rolePanel.contains(e.target) && e.target !== btnRoleLookup) {
        closeRolePanel();
      }
    });

    rpL1Select.addEventListener('change', () => {
      const l1Key = rpL1Select.value;
      rpResults.innerHTML = '';
      if (!l1Key) {
        rpRoleList.innerHTML = '';
        rpRoleList.hidden = true;
        rpRoleBtnText.textContent = '— Select role —';
        rpRoleBtn.disabled = true;
        rpRoleBtn.setAttribute('aria-expanded', 'false');
        rpRoleValue = '';
        activeRoleFilter = null;
        applyRoleHighlights();
        return;
      }
      populateRpRoles(l1Key, null);
    });

    rpRoleBtn.addEventListener('click', e => {
      if (rpRoleBtn.disabled) return;
      e.stopPropagation();
      const isOpen = !rpRoleList.hidden;
      rpRoleList.hidden = isOpen;
      rpRoleBtn.setAttribute('aria-expanded', String(!isOpen));
    });

    $('rpRasciToggles').addEventListener('click', e => {
      const btn = e.target.closest('.rp-rasci-btn');
      if (!btn) return;
      const col = btn.getAttribute('data-col');
      if (rpRasciFilter.has(col)) {
        rpRasciFilter.delete(col);
        btn.classList.remove('active');
      } else {
        rpRasciFilter.add(col);
        btn.classList.add('active');
      }
      // Repopulate role dropdown with updated names/counts
      const l1Key = rpL1Select.value;
      if (!l1Key) return;
      const prevRole = rpRoleValue;
      populateRpRoles(l1Key, prevRole || null);
      // If a role is selected, re-run search
      if (prevRole) {
        const results = rpSearch(l1Key, prevRole);
        activeRoleFilter = { l1Key, roleName: prevRole, selectedPath: null };
        renderRpResults(results, l1Key, prevRole);
        applyRoleHighlights();
      }
    });

    document.addEventListener('click', e => {
      if (!rpRoleList.hidden && !$('rpRoleWrap').contains(e.target)) {
        rpRoleList.hidden = true;
        rpRoleBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // ── TOOL LOOKUP ────────────────────────────────────────────────────────

    /** Parse tool display label from formats: (Display Name)https://... or plain text */
    function extractToolName(s) {
      const parsed = parseErpLink(s);
      return parsed ? parsed.label : s;
    }

    /** Walk the entire tree and collect unique tool labels (display names, not raw URLs). */
    function collectAllToolNames() {
      const out = new Set();
      function walk(node) {
        for (const child of Object.values(node)) {
          if (child._meta && child._meta.Tool) {
            for (const part of splitSemicolon(child._meta.Tool)) {
              out.add(extractToolName(part));
            }
          }
          walk(child._children);
        }
      }
      walk(tree);
      return Array.from(out); // order follows first-occurrence in the XLSX/CSV row sequence
    }

    /** Walk the tree and collect unique Tool_function values for a given tool name. */
    function collectFuncNamesForTool(toolName) {
      const out = new Set();
      function walk(node) {
        for (const child of Object.values(node)) {
          if (child._meta && child._meta.Tool) {
            const toolNames = splitSemicolon(child._meta.Tool).map(extractToolName);
            if (toolNames.some(n => n.toLowerCase() === toolName.toLowerCase())) {
              const fn = child._meta.Tool_function ? String(child._meta.Tool_function).trim() : '';
              if (fn) out.add(fn);
            }
          }
          walk(child._children);
        }
      }
      walk(tree);
      return Array.from(out); // order follows first-occurrence in the XLSX/CSV row sequence
    }

    /** Walk the tree and return all nodes matching toolName + funcName, with their full paths. */
    function tlSearch(toolName, funcName) {
      const results = [];
      function walk(node, path) {
        for (const [key, child] of Object.entries(node)) {
          const childPath = path.concat(key);
          if (child._meta && child._meta.Tool) {
            const toolNames = splitSemicolon(child._meta.Tool).map(extractToolName);
            if (toolNames.some(n => n.toLowerCase() === toolName.toLowerCase())) {
              const fn = child._meta.Tool_function ? String(child._meta.Tool_function).trim() : '';
              if (fn.toLowerCase() === funcName.toLowerCase()) {
                results.push({ path: childPath });
              }
            }
          }
          walk(child._children, childPath);
        }
      }
      walk(tree, []);
      return results;
    }

    function applyToolHighlights() { _applyHighlights(activeToolFilter, toolPanelOpen, 'tool-match'); }

    // ── Tool panel DOM wiring ───────────────────────────────────────────────
    const toolPanel     = $('toolPanel');
    const tlToolSelect  = $('tlTool');
    const tlFuncSelect  = $('tlFunc');
    const tlResults     = $('tlResults');
    const btnToolLookup = $('btnToolLookup');

    function openToolPanel() {
      ctrlPanel.classList.add('hidden');
      closeRolePanel();
      $('yearScreen').classList.add('hidden');
      $('ganttScreen').classList.add('hidden');
      toolPanelOpen = true;
      toolPanel.classList.add('open');
      const names = collectAllToolNames();
      tlToolSelect.innerHTML = '<option value="">\u2014 Select tool \u2014</option>';
      names.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n; opt.textContent = n;
        if (activeToolFilter && activeToolFilter.toolName === n) opt.selected = true;
        tlToolSelect.appendChild(opt);
      });
      if (!names.length) {
        tlToolSelect.innerHTML = '<option value="">No data loaded</option>';
        tlToolSelect.disabled = true;
      } else {
        tlToolSelect.disabled = false;
      }
      if (activeToolFilter && activeToolFilter.funcName) {
        populateTlFuncs(activeToolFilter.toolName, activeToolFilter.funcName);
        const results = tlSearch(activeToolFilter.toolName, activeToolFilter.funcName);
        renderTlResults(results, activeToolFilter.toolName, activeToolFilter.funcName);
        if (activeToolFilter.selectedPath) {
          const selectedKey = activeToolFilter.selectedPath.join('\x00');
          tlResults.querySelectorAll('.rp-result-item').forEach(btn => {
            const pathEl = btn.querySelector('.rp-result-path');
            const nameEl = btn.querySelector('.rp-result-name');
            const resultName = nameEl ? nameEl.textContent : '';
            const resultPath = pathEl ? pathEl.textContent.split(' \u203a ') : [resultName];
            if (resultPath.join('\x00') === selectedKey) btn.classList.add('rp-result-active');
          });
          applyToolHighlights();
        }
      }
    }

    function populateTlFuncs(toolName, restoreFunc) {
      const funcs = collectFuncNamesForTool(toolName);
      tlFuncSelect.innerHTML = '<option value="">\u2014 Select functionality \u2014</option>';
      funcs.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f; opt.textContent = f;
        if (restoreFunc && f === restoreFunc) opt.selected = true;
        tlFuncSelect.appendChild(opt);
      });
      tlFuncSelect.disabled = funcs.length === 0;
    }

    function renderTlResults(results, toolName, funcName) {
      tlResults.innerHTML = '';
      if (!results.length) {
        const empty = document.createElement('div');
        empty.className = 'rp-empty';
        empty.textContent = 'No processes found for "' + funcName + '" in ' + toolName;
        tlResults.appendChild(empty);
        return;
      }
      const countEl = document.createElement('div');
      countEl.className = 'rp-count';
      countEl.textContent = results.length + ' process' + (results.length !== 1 ? 'es' : '');
      tlResults.appendChild(countEl);
      results.forEach(res => {
        const btn = document.createElement('button');
        btn.className = 'rp-result-item';
        const nameEl = document.createElement('div');
        nameEl.className = 'rp-result-name';
        nameEl.textContent = res.path[res.path.length - 1];
        btn.appendChild(nameEl);
        if (res.path.length > 1) {
          const pathEl = document.createElement('div');
          pathEl.className = 'rp-result-path';
          pathEl.textContent = res.path.join(' \u203a ');
          btn.appendChild(pathEl);
        }
        btn.addEventListener('click', () => {
          tlResults.querySelectorAll('.rp-result-item').forEach(b => b.classList.remove('rp-result-active'));
          btn.classList.add('rp-result-active');
          if (activeToolFilter) activeToolFilter.selectedPath = res.path;
          const target = res.path[res.path.length - 1];
          const parentPath = res.path.slice(0, -1);
          // Auto-enable system lane when navigating to an L4 node
          if ((levelOffset + parentPath.length) === 4) {
            erpLaneVisible = true;
            $('cpErpOn').classList.add('active');
            $('cpErpOff').classList.remove('active');
            selectedKey = '';
            clearInfoPanel();
          }
          history.pushState(null, '', pathToHash(parentPath));
          currentPath = parentPath;
          render('none');
          updateNav();
          requestAnimationFrame(() => {
            for (const n of flowContainer.querySelectorAll('.node')) {
              if (n.getAttribute('data-key') === target) {
                n.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
                n.focus();
                break;
              }
            }
            // Auto-select the matching system lane node to open the details pane
            if (erpLaneVisible) {
              const erpNode = flowContainer.querySelector('.erp-node[data-key="' + target + '"]');
              if (erpNode && !erpNode.classList.contains('erp-empty')) {
                flowContainer.querySelectorAll('.erp-node').forEach(n => n.classList.remove('erp-selected'));
                flowContainer.querySelectorAll('.node').forEach(n => n.classList.remove('node-selected'));
                selectedKey = '';
                erpNode.classList.add('erp-selected');
                let cur = tree;
                for (const k of parentPath) cur = (cur[k] || {})._children || {};
                const nodeObj = cur[target];
                if (nodeObj) updateErpPanel(target, nodeObj._meta || {});
              }
            }
          });
        });
        tlResults.appendChild(btn);
      });
    }

    function closeToolPanel() {
      toolPanelOpen = false;
      toolPanel.classList.remove('open');
      applyToolHighlights();
    }

    btnToolLookup.addEventListener('click', e => {
      e.stopPropagation();
      if (toolPanel.classList.contains('open')) {
        closeToolPanel();
      } else {
        openToolPanel();
      }
    });

    $('btnToolPanelClose').addEventListener('click', () => {
      closeToolPanel();
    });

    document.addEventListener('click', e => {
      if (!toolPanel.classList.contains('open')) return;
      if (!toolPanel.contains(e.target) && e.target !== btnToolLookup) {
        closeToolPanel();
      }
    });

    tlToolSelect.addEventListener('change', () => {
      const toolName = tlToolSelect.value;
      tlResults.innerHTML = '';
      if (!toolName) {
        tlFuncSelect.innerHTML = '<option value="">\u2014 Select functionality \u2014</option>';
        tlFuncSelect.disabled = true;
        activeToolFilter = null;
        applyToolHighlights();
        return;
      }
      populateTlFuncs(toolName, null);
    });

    tlFuncSelect.addEventListener('change', () => {
      const toolName = tlToolSelect.value;
      const funcName = tlFuncSelect.value;
      if (!toolName || !funcName) {
        activeToolFilter = null;
        applyToolHighlights();
        tlResults.innerHTML = '';
        return;
      }
      const results = tlSearch(toolName, funcName);
      activeToolFilter = { toolName, funcName, selectedPath: null };
      renderTlResults(results, toolName, funcName);
      applyToolHighlights();
    });

    // ── INFO PANEL ─────────────────────────────────────────────────────────
    function updateInfoPanel(name, meta, desc) {
      ipName.textContent = altLabel(name);
      const rawType = (meta && meta.Type) ? String(meta.Type).trim() : '';
      const rawTypeLc = rawType.toLowerCase();
      const isSysActivity = rawTypeLc === 'system' || rawTypeLc === 'system activity';
      const isHumanActivity = rawTypeLc === 'human activity';
      ipType.textContent = isSysActivity ? 'System activity' : rawType;
      ipType.classList.toggle('ip-type-sysactivity', isSysActivity);
      ipType.classList.toggle('ip-type-humanactivity', isHumanActivity);

      // Description directly under header — no card
      const effectiveDesc = (desc && desc.trim())
        || (meta && meta.L4_Desc && String(meta.L4_Desc).trim())
        || '';
      $('ipDesc').textContent = effectiveDesc;

      if (meta) {
        // helper: build a grid card
        function buildGridCard(title, fields, data, maxLen, collapseId, isCollapsed) {
          const toggleBtn = collapseId
            ? '<button class="ip-card-toggle" id="' + collapseId + 'Toggle" title="Toggle">' + (isCollapsed ? '&#9660;' : '&#9650;') + '</button>'
            : '';
          let g = '<div class="ip-card' + (collapseId && isCollapsed ? ' ip-collapsed' : '') + '"' + (collapseId ? ' id="' + collapseId + '"' : '') + '>'
                + '<div class="ip-card-head"><span>' + escHtml(title) + '</span>' + toggleBtn + '</div>'
                + '<div class="ip-card-body"><div class="ip-grid-cols">';
          for (const f of fields) {
            g += '<div class="ip-grid-col" data-field="' + escHtml(f) + '">'
               + '<div class="ip-grid-col-head">' + escHtml(f) + '</div>'
               + '<div class="ip-grid-col-body">';
            for (let i = 0; i < maxLen; i++) {
              const val = data[f][i] || '';
              g += '<div class="ip-grid-cell" data-val="' + escHtml(val) + '">' + escHtml(val) + '</div>';
            }
            g += '</div></div>';
          }
          g += '</div></div></div>';
          return g;
        }

        // Top row: RASCI (left) and SIPOC (right) side-by-side
        // Shown at all levels including L4 (now the leaf/process step level)
        const currentLevel = levelOffset + currentPath.length;
        const showRasciSipoc = true;

        let topHtml = '';
        if (showRasciSipoc) {
        const RASCI_FIELDS = ['R','A','S','C','I'];
        const rasciData = {};
        let rasciMax = 0;
        for (const f of RASCI_FIELDS) {
          const names = meta[f] ? splitSemicolon(meta[f]) : [];
          rasciData[f] = names;
          if (names.length) { rasciMax = Math.max(rasciMax, names.length); }
        }
        let rasciCard = buildGridCard('RASCI', RASCI_FIELDS, rasciData, Math.max(1, rasciMax),
          presentMode ? 'ipRasciCard' : null, ipRasciCollapsed);

        const IO_FIELDS = ['Supplier','Input','Output','Customer'];
        const ioData = {};
        let ioMax = 0;
        for (const f of IO_FIELDS) {
          const names = meta[f] ? splitSemicolon(meta[f]) : [];
          ioData[f] = names;
          if (names.length) { ioMax = Math.max(ioMax, names.length); }
        }
        let sipocCard = buildGridCard('SIPOC', IO_FIELDS, ioData, Math.max(1, ioMax),
          presentMode ? 'ipSipocCard' : null, ipSipocCollapsed);

        topHtml = '<div class="ip-row-top">'
            + '<div class="ip-top-card">' + rasciCard + '</div>'
            + '<div class="ip-top-card">' + sipocCard + '</div>'
            + '</div>';
        }
        const atL4forPanel = (levelOffset + currentPath.length) === 4;
        const RIGHT_FIELDS = atL4forPanel
          ? ['KPI', 'Goal', 'Tool', 'Documentation', 'BPO', 'BPE', 'SME']
          : ['KPI', 'Goal', 'Tool', 'Documentation'];
        let rightRows = '';
        for (const f of RIGHT_FIELDS) {
          const v = meta[f];
          if (!v || String(v).trim() === '') continue;
          const vStr = String(v).trim();
          let valHtml;
          if (f === 'Tool' || f === 'Documentation') {
            valHtml = '<div class="ip-tool-links">' + splitSemicolon(vStr).map(p => linkPartToHtml(p, 'ip-text')).join('') + '</div>';
          } else if (f === 'Goal' || f === 'KPI') {
            const parts = splitSemicolon(vStr);
            if (parts.length > 1) {
              valHtml = '<div class="ip-tool-links">' + parts.map(p => '<span class="ip-meta-val">' + escHtml(p) + '</span>').join('') + '</div>';
            } else {
              valHtml = '<span class="ip-meta-val">' + escHtml(parts[0] || vStr) + '</span>';
            }
          } else {
            valHtml = '<span class="ip-meta-val">' + escHtml(vStr) + '</span>';
          }
          rightRows += '<div class="ip-meta-row">'
                     + '<span class="ip-meta-label">' + escHtml(f) + '</span>'
                     + valHtml
                     + '</div>';
        }
        let bottomCard = rightRows ? '<div class="ip-card' + (ipBottomCollapsed ? ' ip-collapsed' : '') + '" id="ipBottomCard"><div class="ip-card-head"><span>Details</span><button class="ip-card-toggle" id="ipBottomToggle" title="Toggle">' + (ipBottomCollapsed ? '&#9660;' : '&#9650;') + '</button></div><div class="ip-card-body">' + rightRows + '</div></div>' : '';

        ipTable.innerHTML = topHtml + (bottomCard ? '<div class="ip-row-bottom">' + bottomCard + '</div>' : '');
        const ipBottomToggleEl = document.getElementById('ipBottomToggle');
        if (ipBottomToggleEl) {
          ipBottomToggleEl.addEventListener('click', function () {
            ipBottomCollapsed = !ipBottomCollapsed;
            const card = document.getElementById('ipBottomCard');
            if (card) card.classList.toggle('ip-collapsed', ipBottomCollapsed);
            this.innerHTML = ipBottomCollapsed ? '&#9660;' : '&#9650;';
          });
        }

        // Wire RASCI / SIPOC toggles (only rendered in presentation mode)
        ['ipRasciCard', 'ipSipocCard'].forEach(cardId => {
          const toggleEl = document.getElementById(cardId + 'Toggle');
          if (!toggleEl) return;
          toggleEl.addEventListener('click', function () {
            if (cardId === 'ipRasciCard') ipRasciCollapsed = !ipRasciCollapsed;
            else                          ipSipocCollapsed  = !ipSipocCollapsed;
            const card = document.getElementById(cardId);
            const collapsed = cardId === 'ipRasciCard' ? ipRasciCollapsed : ipSipocCollapsed;
            if (card) card.classList.toggle('ip-collapsed', collapsed);
            this.innerHTML = collapsed ? '&#9660;' : '&#9650;';
          });
        });

        // Post-process: cross-reference links between Input ↔ Output cells
        if (showRasciSipoc && (_inputIndex.size || _outputIndex.size)) {
          const nodePath = [...currentPath, name];
          const nodePathKey = nodePath.join('|');
          const currentDfsIdx = _dfsPathList.findIndex(p => p.join('|') === nodePathKey);
          function addSipocLink(cell, targetPath, tooltipText) {
            const btn = document.createElement('button');
            btn.className = 'sipoc-link-btn';
            btn.title = tooltipText;
            btn.setAttribute('aria-label', tooltipText);
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              currentPath = targetPath.slice(0, -1);
              render('none');
              requestAnimationFrame(function() {
                const targetKey = targetPath[targetPath.length - 1];
                selectedKey = targetKey;
                const allNodes = Array.from(flowContainer.querySelectorAll('.node'));
                allNodes.forEach(function(n) {
                  n.classList.toggle('node-selected', n.getAttribute('data-key') === targetKey);
                });
                const targetEl = allNodes.find(function(n) { return n.getAttribute('data-key') === targetKey; });
                if (targetEl) focusNode(targetEl, allNodes.indexOf(targetEl));
                const targetNode = getNodeAtPath(targetPath);
                if (targetNode) updateInfoPanel(targetKey, targetNode._meta, targetNode._desc);
              });
            });
            cell.appendChild(btn);
          }
          // Input cells → link back to the closest preceding step whose Output matches
          if (_outputIndex.size && currentDfsIdx >= 0) {
            ipTable.querySelectorAll('[data-field="Input"] .ip-grid-cell').forEach(function(cell) {
              const val = (cell.dataset.val || '').trim();
              if (!val) return;
              const matches = _outputIndex.get(val.toLowerCase());
              if (!matches) return;
              const preceding = matches.filter(m => m.path.join('|') !== nodePathKey && m.dfsIdx < currentDfsIdx);
              if (!preceding.length) return;
              const best = preceding[preceding.length - 1];
              addSipocLink(cell, best.path, 'Output of: ' + best.path[best.path.length - 1]);
            });
          }
          // Output cells → link forward to the first following step whose Input matches
          if (_inputIndex.size && currentDfsIdx >= 0) {
            ipTable.querySelectorAll('[data-field="Output"] .ip-grid-cell').forEach(function(cell) {
              const val = (cell.dataset.val || '').trim();
              if (!val) return;
              const matches = _inputIndex.get(val.toLowerCase());
              if (!matches) return;
              const following = matches.filter(m => m.path.join('|') !== nodePathKey && m.dfsIdx > currentDfsIdx);
              if (!following.length) return;
              addSipocLink(cell, following[0].path, 'Input of: ' + following[0].path[following[0].path.length - 1]);
            });
          }
        }
      } else {
        ipTable.innerHTML = '';
      }

      ipContent.style.display = 'flex';
      ipPlaceholder.style.display = 'none';
      requestAnimationFrame(adjustPadding);
    }

    function clearInfoPanel() {
      ipContent.style.display = 'none';
      ipPlaceholder.style.display = 'flex';
      ipTable.innerHTML = ''; ipName.textContent = ''; ipType.textContent = ''; ipType.className = 'ip-type'; $('ipDesc').textContent = '';
      requestAnimationFrame(adjustPadding);
    }

    function updateErpPanel(l5Name, meta) {
      const erpStep = meta.Tool_function ? String(meta.Tool_function).trim() : '';
      const erpTx   = meta.Tool_navigation ? String(meta.Tool_navigation).trim() : '';
      const erpDesc = meta.Tool_desc ? String(meta.Tool_desc).trim() : '';

      $('ipName').textContent = erpStep || l5Name;
      $('ipType').textContent = 'System Process';
      $('ipDesc').textContent = erpDesc;
      $('ipDesc').style.display = erpDesc ? '' : 'none';

      // Build transaction row + linked business step row
      let rows = '';
      const erpTool = meta.Tool ? String(meta.Tool).trim() : '';
      if (erpTool) {
        rows += '<div class="ip-meta-row"><span class="ip-meta-label">Tool</span><div class="ip-tool-links">' + parseErpPanelLink(erpTool) + '</div></div>';
      }
      if (erpTx) {
        rows += '<div class="ip-meta-row"><span class="ip-meta-label">Navigation</span><div class="ip-tool-links">' + parseErpPanelLink(erpTx) + '</div></div>';
      }

      const rightCol = '<div class="ip-card">' + rows + '</div>';

      $('ipTable').innerHTML = '<div class="ip-single">' + rightCol + '</div>';
      ipContent.style.display = 'flex';
      ipPlaceholder.style.display = 'none';
      requestAnimationFrame(adjustPadding);
    }

    function adjustPadding() {
      const h = infoPanel.offsetHeight;
      mainEl.style.paddingBottom = (h + 16) + 'px';
      levelLabel.style.bottom = (h + 10) + 'px';
    }

    // ── THEME ──────────────────────────────────────────────────────────────
    function applyTheme(light) {
      root.classList.toggle('light', light);
      localStorage.setItem('pfTheme', light ? 'light' : 'dark');
      $('cpThemeDark').classList.toggle('active', !light);
      $('cpThemeLight').classList.toggle('active', light);
    }
    $('cpThemeDark').addEventListener('click',  () => applyTheme(false));
    $('cpThemeLight').addEventListener('click', () => applyTheme(true));

    // Import screen theme toggle — swaps icon to reflect current mode
    (function () {
      const SUN  = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
      const MOON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
      function syncImpIcon() {
        const isLight = document.documentElement.classList.contains('light');
        $('impThemeIcon').innerHTML = isLight ? MOON : SUN;
        $('impThemeToggle').title = isLight ? 'Switch to dark mode' : 'Switch to light mode';
      }
      $('impThemeToggle').addEventListener('click', function () {
        const isLight = document.documentElement.classList.contains('light');
        applyTheme(!isLight);
        syncImpIcon();
      });
      // Keep icon in sync whenever the overlay opens
      const orig = window.__pfShowImportOverlay;
      window.__pfShowImportOverlay = function () {
        syncImpIcon();
        if (typeof orig === 'function') orig();
      };
      syncImpIcon();
    })();

    $('cpErpOn').addEventListener('click', () => {
      erpLaneVisible = true;
      $('cpErpOn').classList.add('active');
      $('cpErpOff').classList.remove('active');
      selectedKey = '';
      clearInfoPanel();
      render('none');
    });
    $('cpErpOff').addEventListener('click', () => {
      erpLaneVisible = false;
      $('cpErpOff').classList.add('active');
      $('cpErpOn').classList.remove('active');
      render('none');
    });

    // ── HIGHLIGHT TYPE TOGGLES ──────────────────────────────────────────────
    $('cpHlSysOn').addEventListener('click', () => {
      highlightSysActivity = true;
      $('cpHlSysOn').classList.add('active');
      $('cpHlSysOff').classList.remove('active');
      document.body.classList.add('hl-sysactivity');
    });
    $('cpHlSysOff').addEventListener('click', () => {
      highlightSysActivity = false;
      $('cpHlSysOff').classList.add('active');
      $('cpHlSysOn').classList.remove('active');
      document.body.classList.remove('hl-sysactivity');
    });
    $('cpHlMeetOn').addEventListener('click', () => {
      highlightMeeting = true;
      $('cpHlMeetOn').classList.add('active');
      $('cpHlMeetOff').classList.remove('active');
      document.body.classList.add('hl-meeting');
    });
    $('cpHlMeetOff').addEventListener('click', () => {
      highlightMeeting = false;
      $('cpHlMeetOff').classList.add('active');
      $('cpHlMeetOn').classList.remove('active');
      document.body.classList.remove('hl-meeting');
    });

    // ── CONTROLS PANEL ─────────────────────────────────────────────────────
    const ctrlPanel  = $('ctrlPanel');
    const btnControls = $('btnControls');
  btnControls.addEventListener('click', e => {
      e.stopPropagation();
      ctrlPanel.classList.toggle('hidden');
    });
    $('btnControlsClose').addEventListener('click', () => ctrlPanel.classList.add('hidden'));
    document.addEventListener('click', e => {
      if (!ctrlPanel.classList.contains('hidden') &&
          !ctrlPanel.contains(e.target) && e.target !== btnControls) {
        ctrlPanel.classList.add('hidden');
      }
    });
    btnReset.addEventListener('click', () => {
      _sessionData = null;
      showNoData();
    });

    $('btnSave').addEventListener('click', savePage);
    function savePage() {
      const raw = (_sessionData ? _sessionData.raw : null) ||
        (window.__PF_EMBED__ ? window.__PF_EMBED__.d : null);
      const sig = (_sessionData ? _sessionData.sig : null) ||
        (window.__PF_EMBED__ ? window.__PF_EMBED__.s : null);
      if (!raw || !sig) { showExportToast('No data to save'); return; }

      // Clone the live DOM — no fetch needed, works on file:// URLs
      const clone = document.documentElement.cloneNode(true);

      // Remove the runtime-appended resizer (not in original HTML)
      const resizer = clone.querySelector('#hierResizer');
      if (resizer) resizer.remove();

      // Ensure modals are closed in the saved file
      clone.querySelector('#exportModal').className = 'exp-overlay hidden';
      clone.querySelector('#becOverlay').className = 'bec-overlay hidden';
      clone.querySelector('#ctrlPanel').className = 'hidden';
      clone.querySelector('#importOverlay').className = 'imp-overlay hidden';

      // Build metadata
      const topKeys = Object.keys(tree);
      const name = topKeys.length ? topKeys[0] : 'ProcessFlow';
      const dt = new Date();
      const rows = JSON.parse(raw);
      const l1s = new Set(rows.map(r => r.L1).filter(Boolean)).size;
      const l2s = new Set(rows.map(r => r.L2).filter(Boolean)).size;
      const l3s = new Set(rows.map(r => r.L3).filter(Boolean)).size;
      const l4s = new Set(rows.map(r => r.L4).filter(Boolean)).size;
      const meta = {
        name,
        savedAt: dt.toISOString(),
        rows: rows.length,
        l1Count: l1s,
        l2Count: l2s,
        l3Count: l3s,
        l4Count: l4s,
        // Preserve original creation date if re-saving
        createdAt: (window.__PF_EMBED__ && window.__PF_EMBED__.meta && window.__PF_EMBED__.meta.createdAt)
          || dt.toISOString()
      };

      // Inject the data + metadata into the embed slot
      clone.querySelector('#pfEmbedData').textContent =
        'window.__PF_EMBED__=' + JSON.stringify({ d: raw, s: sig, meta }) + ';';

      const html = '<!DOCTYPE html>\n' + clone.outerHTML;

      // Build filename from the top-level process name
      const dateStr = dt.getFullYear() + '-' +
        String(dt.getMonth() + 1).padStart(2,'0') + '-' +
        String(dt.getDate()).padStart(2,'0');
      let fname = 'Business Process ' + dateStr + '.html';

      const blob = new Blob([html], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      showExportToast('Saved ' + fname);
    }

    function initInfoDropdown() {
      const btn = $('btnInfo');
      const dropdown = $('infoDropdown');
      const m = window.__PF_EMBED__.meta || {};

      function fmt(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' })
          + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      }

      const n = v => v != null && v !== 0 ? v : '—';
      const rows = [
        ['Saved',        fmt(m.savedAt)],
        ['Rows',         n(m.rows)],
        ['L1 processes', n(m.l1Count)],
        ['L2 processes', n(m.l2Count)],
        ['L3 processes', n(m.l3Count)],
        ['L4 processes', n(m.l4Count)],
      ];
      dropdown.innerHTML = rows.map(([l, v]) =>
        '<div class="info-row"><span class="info-lbl">' + l + '</span><span class="info-val">' + v + '</span></div>'
      ).join('');

      function positionDropdown() {
        const r = btn.getBoundingClientRect();
        dropdown.style.top  = (r.bottom + 6) + 'px';
        dropdown.style.left = (r.right - 320) + 'px';
      }
      btn.addEventListener('click', e => {
        e.stopPropagation();
        positionDropdown();
        dropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', () => dropdown.classList.add('hidden'));
    }

    // ── ZOOM ───────────────────────────────────────────────────────────────
    function setZoom(z) {
      zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 20) / 20));
      const ps = presentMode ? presentScale : 1;
      root.style.setProperty('--nw',  (BASE.nw * zoomLevel * ps) + 'px');
      root.style.setProperty('--nh',  (BASE.nh * zoomLevel * ps) + 'px');
      root.style.setProperty('--nfs', (BASE.fs * zoomLevel * ps) + 'rem');
      root.style.setProperty('--cw',  (BASE.cw * zoomLevel * ps) + 'px');
      root.style.setProperty('--nw-v', (BASE.nwv * zoomLevel * ps) + 'px');
      root.style.setProperty('--pscale', ps);
      zoomLabel.textContent   = Math.round(zoomLevel * 100) + '%';
      btnZoomIn.disabled  = zoomLevel >= ZOOM_MAX;
      btnZoomOut.disabled = zoomLevel <= ZOOM_MIN;
    }
    btnZoomIn.addEventListener('click',  () => setZoom(zoomLevel + ZOOM_STEP));
    btnZoomOut.addEventListener('click', () => setZoom(zoomLevel - ZOOM_STEP));

    // ── PRESENTATION MODE ──────────────────────────────────────────────────
    function setPresentScale(s) {
      presentScale = Math.min(3.0, Math.max(1.0, Math.round(s * 10) / 10));
      const slider = $('presentScaleSlider');
      const label  = $('presentScaleLabel');
      if (slider) slider.value = presentScale;
      if (label)  label.textContent = presentScale.toFixed(1) + '×';
      if (presentMode) setZoom(zoomLevel);
    }
    function togglePresentMode() {
      presentMode = !presentMode;
      if (presentMode) { ipRasciCollapsed = true; ipSipocCollapsed = true; }
      document.documentElement.classList.toggle('present', presentMode);
      setZoom(zoomLevel);
      const slider = $('presentScaleSlider');
      if (slider) slider.disabled = !presentMode;
      $('cpPresentOn').classList.toggle('active', presentMode);
      $('cpPresentOff').classList.toggle('active', !presentMode);
      // Refresh info panel so toggles appear/disappear immediately
      const selNode = flowContainer.querySelector('.node-selected, .node.leaf[data-key="' + selectedKey + '"]');
      if (selNode) selNode.dispatchEvent(new Event('focus'));
      else if (selectedKey) {
        const anyNode = flowContainer.querySelector('.node[data-key="' + CSS.escape(selectedKey) + '"]');
        if (anyNode) anyNode.dispatchEvent(new Event('focus'));
      }
    }
    $('presentScaleSlider').addEventListener('input', e => setPresentScale(+e.target.value));
    $('cpPresentOn').addEventListener('click',  () => { if (!presentMode) togglePresentMode(); });
    $('cpPresentOff').addEventListener('click', () => { if (presentMode)  togglePresentMode(); });

    // Scroll to zoom (no modifier needed); Ctrl+scroll also works
    flowContainer.addEventListener('wheel', e => {
      e.preventDefault();
      setZoom(zoomLevel + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    }, { passive: false });

    // Click-drag pan
    (function initPan() {
      let panning = false, startX = 0, startScroll = 0;
      flowContainer.addEventListener('mousedown', e => {
        // Only pan on left-click on the container/level background (not on nodes)
        if (e.button !== 0) return;
        if (e.target.closest('.node')) return;
        panning = true;
        startX = e.clientX;
        startScroll = flowContainer.scrollLeft;
        flowContainer.classList.add('panning');
        e.preventDefault();
      });
      document.addEventListener('mousemove', e => {
        if (!panning) return;
        flowContainer.scrollLeft = startScroll - (e.clientX - startX);
      });
      document.addEventListener('mouseup', () => {
        if (!panning) return;
        panning = false;
        flowContainer.classList.remove('panning');
      });
    })();

    // ── KEYBOARD ───────────────────────────────────────────────────────────
    function focusNode(node, idx) {
      lastFocusedIdx = idx;
      // roving tabindex: reset all siblings, activate target
      const level = node.closest('.flow-level');
      if (level) level.querySelectorAll('.node').forEach(n => n.setAttribute('tabindex', '-1'));
      node.setAttribute('tabindex', '0');
      node.focus({ preventScroll: true });
      node.scrollIntoView({ behavior:'smooth', inline:'center', block:'nearest' });
    }

    document.addEventListener('keydown', e => {
      if (e.target === searchInput || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      // ── ERP lane keyboard navigation ──────────────────────────────────
      if (document.activeElement && document.activeElement.getAttribute('data-erp') === '1') {
        const erpNodes = Array.from(flowContainer.querySelectorAll('.erp-node:not(.erp-empty)'));
        const erpIdx = erpNodes.indexOf(document.activeElement);
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const next = erpNodes[Math.min(erpIdx + 1, erpNodes.length - 1)];
          if (next) { next.focus(); next.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const prev = erpNodes[Math.max(erpIdx - 1, 0)];
          if (prev) { prev.focus(); prev.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const key = document.activeElement.getAttribute('data-key');
          const bizNodes = Array.from(flowContainer.querySelectorAll('.node'));
          const bizNode = bizNodes.find(n => n.getAttribute('data-key') === key)
                       || bizNodes[Math.min(Math.max(erpIdx, 0), bizNodes.length - 1)];
          if (bizNode) focusNode(bizNode, bizNodes.indexOf(bizNode));
          return;
        }
        return; // swallow other keys while in ERP lane
      }

      // ── ‹ / › sibling-group nav button focus handling ────────────────
      if (document.activeElement && document.activeElement.classList.contains('node-nav-btn')) {
        const btn = document.activeElement;
        const isPrev = btn.classList.contains('node-nav-prev');
        const isNext = btn.classList.contains('node-nav-next');
        if ((e.key === 'ArrowLeft' && isNext) || (e.key === 'ArrowRight' && isPrev)) {
          // step back into the node row
          e.preventDefault();
          const level2 = flowContainer.querySelector('.flow-level');
          if (level2) {
            const ns = Array.from(level2.querySelectorAll('.node'));
            if (ns.length) focusNode(isPrev ? ns[0] : ns[ns.length - 1], isPrev ? 0 : ns.length - 1);
          }
          return;
        }
        if ((e.key === 'ArrowLeft' && isPrev) || (e.key === 'ArrowRight' && isNext)) {
          e.preventDefault();
          btn.click(); // trigger cross-parent navigation
          return;
        }
      }

      const level = flowContainer.querySelector('.flow-level');
      if (!level) return;
      const nodes = Array.from(level.querySelectorAll('.node'));
      if (!nodes.length) return;
      // Use activeElement if it's a node in this level, otherwise fall back to lastFocusedIdx
      const activeIdx = nodes.indexOf(document.activeElement);
      const cur = activeIdx >= 0 ? activeIdx : Math.min(lastFocusedIdx, nodes.length - 1);

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          if (cur >= nodes.length - 1) {
            // at last node — try to focus the › button
            const nextBtn = level.querySelector('.node-nav-next');
            if (nextBtn) { nextBtn.focus(); nextBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); break; }
          }
          focusNode(nodes[Math.min(cur+1, nodes.length-1)], Math.min(cur+1, nodes.length-1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (cur <= 0) {
            // at first node — try to focus the ‹ button
            const prevBtn = level.querySelector('.node-nav-prev');
            if (prevBtn) { prevBtn.focus(); prevBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); break; }
          }
          focusNode(nodes[Math.max(cur-1, 0)], Math.max(cur-1, 0));
          break;
        case 'ArrowDown':
          e.preventDefault();
          if ((levelOffset + currentPath.length) === 4 && erpLaneVisible) {
            // Enter system lane: focus the ERP node matching the current business node
            const bizKey = nodes[cur] ? nodes[cur].getAttribute('data-key') : null;
            const erpNodes = Array.from(flowContainer.querySelectorAll('.erp-node:not(.erp-empty)'));
            const erpTarget = (bizKey && erpNodes.find(n => n.getAttribute('data-key') === bizKey)) || erpNodes[0];
            if (erpTarget) { erpTarget.focus(); erpTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }
          } else if (nodes[cur] && nodes[cur].classList.contains('has-children')) {
            drillInto(nodes[cur].getAttribute('data-key'));
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          goUp();
          break;
        case 'Enter':
          if (nodes[cur] && nodes[cur].classList.contains('has-children')) { e.preventDefault(); drillInto(nodes[cur].getAttribute('data-key')); }
          break;
        case 'Escape':
          e.preventDefault(); goHome(); break;
        case 'Backspace':
          e.preventDefault(); goUp(); break;
        case ',': {
          if (currentPath.length === 0) break;
          e.preventDefault();
          const _targetDepth = currentPath.length;
          for (let _lvl = currentPath.length; _lvl >= 1; _lvl--) {
            const _anPath = currentPath.slice(0, _lvl - 1);
            const _sibKeys = Object.keys(getNodesAtPath(_anPath));
            const _curIdx = _sibKeys.indexOf(currentPath[_lvl - 1]);
            if (_curIdx > 0) {
              let _newPath = _anPath.concat(_sibKeys[_curIdx - 1]);
              while (_newPath.length < _targetDepth) {
                const _ch = Object.keys(getNodesAtPath(_newPath));
                if (!_ch.length) break;
                _newPath = _newPath.concat(_ch[_ch.length - 1]);
              }
              currentPath = _newPath;
              selectedKey = ''; clearInfoPanel(); render('left');
              break;
            }
          }
          break;
        }
        case '.': {
          if (currentPath.length === 0) break;
          e.preventDefault();
          const _targetDepth2 = currentPath.length;
          for (let _lvl2 = currentPath.length; _lvl2 >= 1; _lvl2--) {
            const _anPath2 = currentPath.slice(0, _lvl2 - 1);
            const _sibKeys2 = Object.keys(getNodesAtPath(_anPath2));
            const _curIdx2 = _sibKeys2.indexOf(currentPath[_lvl2 - 1]);
            if (_curIdx2 < _sibKeys2.length - 1) {
              let _newPath2 = _anPath2.concat(_sibKeys2[_curIdx2 + 1]);
              while (_newPath2.length < _targetDepth2) {
                const _ch2 = Object.keys(getNodesAtPath(_newPath2));
                if (!_ch2.length) break;
                _newPath2 = _newPath2.concat(_ch2[0]);
              }
              currentPath = _newPath2;
              selectedKey = ''; clearInfoPanel(); render('right');
              break;
            }
          }
          break;
        }
        case 'e': case 'E':
          e.preventDefault(); openExportModal(); break;
        case 'b': case 'B':
          e.preventDefault(); $('btnBulkExport').click(); break;
        case '/':
          e.preventDefault(); searchInput.focus(); searchInput.select(); break;
        case 'g': case 'G':
          e.preventDefault();
          if ($('ganttScreen').classList.contains('hidden')) openGanttScreen();
          else closeGanttScreen();
          break;
        case 'n': case 'N':
          e.preventDefault();
          if (typeof window.__pfShowImportOverlay === 'function') window.__pfShowImportOverlay();
          break;
        case 's': case 'S':
          e.preventDefault(); savePage(); break;
        case 'c': case 'C': {
          e.preventDefault();
          ctrlPanel.classList.toggle('hidden');
          break;
        }
        case 'p': case 'P':
          e.preventDefault(); togglePresentMode(); break;
        case 'm': case 'M': {
          e.preventDefault();
          const isLightNow = document.documentElement.classList.contains('light');
          applyTheme(!isLightNow);
          break;
        }
        case 'd': case 'D': {
          e.preventDefault();
          const ipBottomToggleEl = document.getElementById('ipBottomToggle');
          if (ipBottomToggleEl) {
            ipBottomCollapsed = !ipBottomCollapsed;
            const card = document.getElementById('ipBottomCard');
            if (card) card.classList.toggle('ip-collapsed', ipBottomCollapsed);
            ipBottomToggleEl.innerHTML = ipBottomCollapsed ? '&#9660;' : '&#9650;';
          }
          break;
        }
        case 't': case 'T': {
          const atL5 = (levelOffset + currentPath.length) === 4;
          if (!atL5) break;
          e.preventDefault();
          erpLaneVisible = !erpLaneVisible;
          $('cpErpOn').classList.toggle('active', erpLaneVisible);
          $('cpErpOff').classList.toggle('active', !erpLaneVisible);
          if (!erpLaneVisible) { selectedKey = ''; clearInfoPanel(); }
          render('none');
          break;
        }
        case '1': case '2': case '3': case '4': case '5': {
          e.preventDefault();
          const targetLevel = parseInt(e.key, 10);
          const targetDepth = targetLevel - levelOffset; // how many path segments needed
          if (targetDepth < 0) break; // level not available with this dataset's offset
          // Walk tree from root, picking the first child at each step
          let node = tree;
          const newPath = [];
          for (let i = 0; i < targetDepth; i++) {
            const firstKey = Object.keys(node)[0];
            if (!firstKey) break;
            newPath.push(firstKey);
            node = node[firstKey]._children;
          }
          if (newPath.length !== targetDepth) break; // not enough depth in tree
          const dir = newPath.length > currentPath.length ? 'right' : newPath.length < currentPath.length ? 'left' : 'none';
          history.pushState(null, '', pathToHash(newPath));
          currentPath = newPath;
          render(dir);
          break;
        }
      }
    });

    // ── EXPORT MODAL ───────────────────────────────────────────────────────
    const exportModal  = $('exportModal');
    const expLvlChecks = $('expLevelChecks');
    let expSel  = [null, null, null];  // selected key in each picker column
    let expPath = [];                  // derived from expSel

    function updateExpPath() {
      expPath = [];
      for (let i = 0; i < 3; i++) {
        if (expSel[i] !== null) expPath.push(expSel[i]);
        else break;
      }
    }

    function getPickerNodes(colIdx) {
      // col 0 → tree root; col N → children of expSel[N-1]
      let cur = tree;
      for (let i = 0; i < colIdx; i++) {
        if (!expSel[i] || !cur[expSel[i]]) return {};
        cur = cur[expSel[i]]._children;
      }
      return cur;
    }

    function buildPickerCol(colIdx) {
      const col = $('expCol' + colIdx);
      if (!col) return;
      col.innerHTML = '';

      const absLevel = levelOffset + colIdx;
      const hdr = document.createElement('div');
      hdr.className = 'exp-col-header';
      hdr.textContent = 'L' + absLevel;
      col.appendChild(hdr);

      const nodes = getPickerNodes(colIdx);
      const keys  = Object.keys(nodes);
      if (!keys.length) {
        const empty = document.createElement('div');
        empty.className = 'exp-col-empty';
        empty.textContent = colIdx === 0 ? 'No data' : '—';
        col.appendChild(empty);
        return;
      }
      keys.forEach(key => {
        const item = document.createElement('div');
        item.className = 'exp-col-item' + (key === expSel[colIdx] ? ' selected' : '');
        item.textContent = key;
        item.title = key;
        item.addEventListener('click', () => {
          // Toggle: clicking the already-selected item clears it and deeper cols
          if (expSel[colIdx] === key) {
            expSel[colIdx] = null;
          } else {
            expSel[colIdx] = key;
          }
          // Clear all deeper selections
          for (let j = colIdx + 1; j < 3; j++) expSel[j] = null;
          updateExpPath();
          // Rebuild this and deeper columns
          for (let j = colIdx; j < 3; j++) buildPickerCol(j);
          buildLevelChecks();
        });
        col.appendChild(item);
      });
    }

    function buildAllPickerCols() {
      for (let i = 0; i < 3; i++) buildPickerCol(i);
    }

    function buildLevelChecks() {
      expLvlChecks.innerHTML = '';
      const startAbsLevel = levelOffset + expPath.length;
      const maxAbs = 4;   // absolute L4 is always the ceiling
      for (let abs = startAbsLevel; abs <= maxAbs; abs++) {
        const row = document.createElement('label');
        row.className = 'exp-level-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = true; cb.dataset.abs = abs;
        cb.addEventListener('change', () => {
          if (!cb.checked) {
            expLvlChecks.querySelectorAll('input[type=checkbox]').forEach(c => {
              if (parseInt(c.dataset.abs) > abs) c.checked = false;
            });
          } else {
            expLvlChecks.querySelectorAll('input[type=checkbox]').forEach(c => {
              if (parseInt(c.dataset.abs) < abs) c.checked = true;
            });
          }
        });
        const lvlSpan = document.createElement('span');
        lvlSpan.className = 'exp-lv-label';
        lvlSpan.textContent = 'L' + abs;
        const nameSpan = document.createElement('span');
        nameSpan.className = 'exp-lv-name';
        nameSpan.textContent = abs === startAbsLevel
          ? (expPath.length ? expPath[expPath.length - 1] : 'All processes')
          : '';
        row.appendChild(cb); row.appendChild(lvlSpan); row.appendChild(nameSpan);
        expLvlChecks.appendChild(row);
      }
    }

    function openExportModal() {
      if (!Object.keys(tree).length) return;
      // Pre-select from currentPath (up to 3 levels)
      expSel = [null, null, null];
      for (let i = 0; i < 3 && i < currentPath.length; i++) expSel[i] = currentPath[i];
      updateExpPath();
      buildAllPickerCols();
      buildLevelChecks();
      exportModal.classList.remove('hidden');
    }

    $('btnExpCancel').addEventListener('click', () => exportModal.classList.add('hidden'));
    exportModal.addEventListener('click', e => { if (e.target === exportModal) exportModal.classList.add('hidden'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !exportModal.classList.contains('hidden')) exportModal.classList.add('hidden'); });

    $('btnExpGo').addEventListener('click', () => {
      let maxCheckedAbs = levelOffset + expPath.length;
      expLvlChecks.querySelectorAll('input[type=checkbox]').forEach(c => {
        if (c.checked) maxCheckedAbs = Math.max(maxCheckedAbs, parseInt(c.dataset.abs));
      });
      exportModal.classList.add('hidden');
      exportSVG(expPath, maxCheckedAbs);
    });

    // ── SVG EXPORT ─────────────────────────────────────────────────────────
    const SVG_LAYOUT = { NW: 200, NH: 80, HGAP: 28, VGAP: 28, VLEAF: 28, PAD: 60, FONT: 13, SMALL_FONT: 11, CORNER: 8 };
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

    function buildSvgString(exportPath, maxAbsLevel, leafHorizontalOrOrientations) {
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

      let subtree = getNodesAtPath(usePath);
      if (usePath.length > 0) {
        const i = usePath.length - 1;
        let cur = tree;
        for (let j = 0; j < i; j++) cur = cur[usePath[j]]._children;
        const nodeObj = cur[usePath[i]];
        subtree = { [usePath[i]]: { _children: subtree, _meta: nodeObj._meta, _desc: nodeObj._desc } };
      }
      if (!Object.keys(subtree).length) return null;
      const S = SVG_LAYOUT;

      const exportRootAbsDepth = Math.max(0, usePath.length - 1) + levelOffset;
      const maxExportLevel     = Math.min(useMaxAbs - exportRootAbsDepth + 1,
                                          6 - exportRootAbsDepth);

      function isVertical(depth) {
        const abs = exportRootAbsDepth + depth;
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

        if (isVertical(depth)) {
          // Stack siblings top-to-bottom
          const items = [];
          let totalH = 0, maxW = 0;
          keys.forEach(key => {
            const nodeObj = nodes[key];
            const child   = measure(nodeObj._children, depth + 1);
            const itemW   = Math.max(S.NW, child.totalW);
            const itemH   = S.NH + (child.totalH > 0 ? S.VGAP + child.totalH : 0);
            items.push({ key, nodeObj, child, subtreeW: itemW, subtreeH: itemH, x: 0, y: totalH });
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
          keys.forEach(key => {
            const nodeObj = nodes[key];
            const child   = measure(nodeObj._children, depth + 1);
            const itemW   = Math.max(S.NW, child.totalW);
            items.push({ key, nodeObj, child, subtreeW: itemW, subtreeH: 0, x: totalW, y: 0 });
            totalW   += itemW + S.HGAP;
            maxChildH = Math.max(maxChildH, child.totalH);
          });
          const finalW = Math.max(0, totalW - S.HGAP);
          const totalH = S.NH + (maxChildH > 0 ? S.VGAP + maxChildH : 0);
          items.forEach(it => { it.subtreeH = totalH; });
          return { totalW: finalW, totalH, items };
        }
      }

      const parts = { rects: [], texts: [], labels: [] };
      let svgW = 0, svgH = 0;
      const labeledLevels = new Set();
      const FF = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

      function drawNode(nodeX, nodeY, nodeW, nodeH, cx, key, absLevel) {
        const ci = Math.min(absLevel, EXP_FILLS.length - 1);
        svgW = Math.max(svgW, nodeX + nodeW + S.PAD);
        svgH = Math.max(svgH, nodeY + nodeH + S.PAD);
        parts.rects.push(
          '<rect x="' + nodeX + '" y="' + nodeY + '" width="' + nodeW + '" height="' + nodeH +
          '" rx="' + S.CORNER + '" ry="' + S.CORNER +
          '" fill="' + EXP_FILLS[ci] + '" stroke="' + EXP_STROKES[ci] + '" stroke-width="1.5"/>'
        );
        const textColor = EXP_TEXTS[ci];
        const lines = wrapText(key, nodeW - 20, S.FONT);
        const lh = S.FONT * 1.4;
        const textStartY = nodeY + nodeH / 2 - (lines.length * lh) / 2 + S.FONT;
        lines.forEach((ln, li) => {
          parts.texts.push(
            '<text x="' + cx + '" y="' + (textStartY + li * lh) + '" text-anchor="middle"' +
            ' fill="' + textColor + '" font-size="' + S.FONT + '" font-family="' + FF + '">' +
            escHtml(ln) + '</text>'
          );
        });
      }

      // renderLevel: positions items at absolute (xBase+item.x, yBase+item.y)
      function renderLevel(items, depth, xBase, yBase) {
        const absLevelBase = exportRootAbsDepth + depth;
        items.forEach(item => {
          const absX  = xBase + item.x;
          const absY  = yBase + item.y;
          const nodeW = item.subtreeW;   // fill the full allocated width
          const nodeH = S.NH;
          const nodeX = absX;
          const cx    = absX + nodeW / 2;
          const nodeY = absY;

          if (!labeledLevels.has(depth)) {
            labeledLevels.add(depth);
            const ci = Math.min(absLevelBase, EXP_FILLS.length - 1);
            parts.labels.push(
              '<text x="' + (S.PAD - 10) + '" y="' + (nodeY + nodeH / 2 + 4) + '" text-anchor="end"' +
              ' fill="' + EXP_FILLS[ci] + '"' +
              ' font-size="11" font-weight="700" letter-spacing="0.5" font-family="' + FF + '">' +
              'L' + absLevelBase + '</text>'
            );
          }

          drawNode(nodeX, nodeY, nodeW, nodeH, cx, item.key, absLevelBase);

          if (item.child.items.length > 0) {
            // Children start at the same x as the parent — they already fill that space
            const childXBase = absX;
            const childYBase = absY + S.NH + S.VGAP;
            renderLevel(item.child.items, depth + 1, childXBase, childYBase);
          }
        });
      }

      const measured = measure(subtree, 0);
      svgW = measured.totalW + S.PAD * 2;
      svgH = measured.totalH + S.PAD * 2;
      renderLevel(measured.items, 0, S.PAD, S.PAD);

      return {
        svg: '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgW + '" height="' + svgH + '"' +
          ' viewBox="0 0 ' + svgW + ' ' + svgH + '">\n' +
          '  <rect width="' + svgW + '" height="' + svgH + '" fill="none"/>\n' +
          parts.labels.map(s => '  ' + s).join('\n') + '\n' +
          parts.rects.map(s => '  ' + s).join('\n') + '\n' +
          parts.texts.map(s => '  ' + s).join('\n') + '\n' +
          '</svg>',
        svgW, svgH
      };
    }

    function exportSVG(exportPath, maxAbsLevel) {
      const usePath   = exportPath !== undefined ? exportPath : [...currentPath];
      const useMaxAbs = maxAbsLevel !== undefined ? maxAbsLevel : 5;
      const result    = buildSvgString(usePath, useMaxAbs);
      if (!result) return;
      const { svg, svgW, svgH } = result;

      const label    = usePath.length ? usePath[usePath.length-1] : 'All';
      const fileBase = 'processflow-' + label.replace(/[^a-z0-9]/gi,'-').toLowerCase();

      const fmtEl = exportModal.querySelector('input[name="expFmt"]:checked');
      const fmt   = fmtEl ? fmtEl.value : 'svg';

      if (fmt === 'jpeg') {
        downloadJPEG(svg, svgW, svgH, fileBase + '.jpg');
      } else {
        const blob = new Blob([svg], { type:'image/svg+xml' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = fileBase + '.svg';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        showExportToast('Exported SVG');
      }
    }

    function svgToJpegBlob(svgStr, svgW, svgH) {
      return new Promise(resolve => {
        const scale = 300 / 96;
        const cw = Math.round(svgW * scale), ch = Math.round(svgH * scale);
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch);
        const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const img  = new Image();
        img.onload  = () => { ctx.drawImage(img, 0, 0, cw, ch); URL.revokeObjectURL(url); canvas.toBlob(resolve, 'image/jpeg', 0.95); };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
      });
    }


    // ── BULK EXPORT CONFIG ─────────────────────────────────────────────────────
    const BEC_ROWS     = 5;
    const BEC_LEVELS   = ['L1','L2','L3','L4','L5'];
    const becOverlay   = $('becOverlay');
    const becBody      = $('becBody');

    function becAbsLevels() {
      // Returns absolute level numbers present in the tree (e.g. [0,1,2,3,4])
      const maxAbs = 4;
      const present = [];
      for (let i = 0; i <= maxAbs; i++) {
        const lKey = 'L' + i;
        if (_sessionData || window.__PF_EMBED__) {
          // derive from levelOffset + tree depth
        }
        present.push(i);
      }
      // Trim to actually-used levels based on current tree depth
      function treeDepth(node, d) {
        let max = d;
        for (const k of Object.keys(node)) max = Math.max(max, treeDepth(node[k]._children, d + 1));
        return max;
      }
      const depth = Object.keys(tree).length ? treeDepth(tree, levelOffset) : 4;
      return present.filter(i => i >= levelOffset && i <= Math.min(depth, 4));
    }

    function becBuildRows() {
      const levels = becAbsLevels();
      becBody.innerHTML = '';
      for (let r = 0; r < BEC_ROWS; r++) {
        const tr = document.createElement('tr');

        // Row number
        const tdNum = document.createElement('td');
        tdNum.className = 'bec-row-num';
        tdNum.textContent = r + 1;
        tr.appendChild(tdNum);

        // L0 filter dropdown
        const tdL0 = document.createElement('td');
        tdL0.className = 'bec-l0-cell';
        const l0Sel = document.createElement('select');
        l0Sel.dataset.row = r;
        const allOpt = document.createElement('option');
        allOpt.value = ''; allOpt.textContent = 'All';
        l0Sel.appendChild(allOpt);
        Object.keys(tree).forEach(key => {
          const opt = document.createElement('option');
          opt.value = key; opt.textContent = key;
          l0Sel.appendChild(opt);
        });
        tdL0.appendChild(l0Sel);
        tr.appendChild(tdL0);

        // Combined level pills: each pill has a checkbox + inline H/V toggle
        const tdLevels = document.createElement('td');
        tdLevels.className = 'bec-levels-cell';
        levels.forEach(abs => {
          const cbId  = 'bec_r' + r + '_l' + abs;
          const hId   = 'bec_r' + r + '_l' + abs + '_h';
          const vId   = 'bec_r' + r + '_l' + abs + '_v';

          const pill = document.createElement('span');
          pill.className = 'bec-level-pill';
          pill.dataset.row = r; pill.dataset.abs = abs;

          // Checkbox (hidden) + label as the level name toggle
          const cb = document.createElement('input');
          cb.type = 'checkbox'; cb.className = 'bec-level-cb';
          cb.id = cbId; cb.dataset.row = r; cb.dataset.abs = abs;
          cb.addEventListener('change', () => {
            pill.classList.toggle('active', cb.checked);
          });

          const lbl = document.createElement('label');
          lbl.htmlFor = cbId; lbl.className = 'bec-level-label';
          lbl.textContent = 'L' + abs;

          // Inline H/V segmented control
          const orient = document.createElement('span');
          orient.className = 'bec-pill-orient';
          orient.innerHTML =
            '<input type="radio" name="bec_orient_r' + r + '_l' + abs + '" id="' + hId + '" value="h" checked>' +
            '<label for="' + hId + '">H</label>' +
            '<input type="radio" name="bec_orient_r' + r + '_l' + abs + '" id="' + vId + '" value="v">' +
            '<label for="' + vId + '">V</label>';

          pill.appendChild(cb);
          pill.appendChild(lbl);
          pill.appendChild(orient);
          tdLevels.appendChild(pill);
        });
        tr.appendChild(tdLevels);

        // Format selector
        const tdFmt = document.createElement('td');
        tdFmt.className = 'bec-fmt-cell';
        const sel = document.createElement('select');
        sel.dataset.row = r;
        ['JPEG','SVG','PNG'].forEach(f => {
          const opt = document.createElement('option');
          opt.value = f.toLowerCase(); opt.textContent = f;
          sel.appendChild(opt);
        });
        tdFmt.appendChild(sel);
        tr.appendChild(tdFmt);

        becBody.appendChild(tr);
      }
    }

    function becGetConfig(rowIdx) {
      // Returns { levels: [abs,...], orientations: {abs: 'h'|'v'}, format: 'jpeg'|'svg'|'png' }
      // or null if no levels checked
      const levels = [];
      const orientations = {};
      becBody.querySelectorAll('.bec-level-pill[data-row="' + rowIdx + '"]').forEach(pill => {
        const abs = parseInt(pill.dataset.abs);
        const cb  = pill.querySelector('.bec-level-cb');
        if (cb && cb.checked) levels.push(abs);
        const checkedOrient = pill.querySelector('input[type="radio"]:checked');
        orientations[abs] = checkedOrient ? checkedOrient.value : 'h';
      });
      if (!levels.length) return null;
      const selects = becBody.querySelectorAll('select[data-row="' + rowIdx + '"]');
      const l0SelEl = selects[0];
      const fmtSel = selects[1];
      const l0Filter = (l0SelEl && l0SelEl.value) ? l0SelEl.value : null;
      const format = fmtSel ? fmtSel.value : 'jpeg';
      return { levels, orientations, format, l0Filter };
    }

    function becGetAllPathsAtAbsLevel(absLevel) {
      // Returns all paths whose final node sits at the given absolute level
      const paths = [];
      function walk(node, path) {
        const curAbs = levelOffset + path.length;
        if (curAbs === absLevel) { paths.push([...path]); return; }
        if (curAbs > absLevel) return;
        for (const key of Object.keys(node)) walk(node[key]._children, path.concat(key));
      }
      walk(tree, []);
      return paths;
    }

    async function becSvgToBlob(result, format) {
      if (format === 'svg') return new Blob([result.svg], { type: 'image/svg+xml' });
      if (format === 'jpeg') return await svgToJpegBlob(result.svg, result.svgW, result.svgH);
      if (format === 'png') {
        const scale = 2;
        return await new Promise(resolve => {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(result.svgW * scale);
          canvas.height = Math.round(result.svgH * scale);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          const svgBlob = new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          const img = new Image();
          img.onload = () => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url); canvas.toBlob(resolve, 'image/png'); };
          img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
          img.src = url;
        });
      }
      return null;
    }

    async function becRunExport() {
      const configs = [];
      for (let r = 0; r < BEC_ROWS; r++) {
        const cfg = becGetConfig(r);
        if (cfg) configs.push({ rowIdx: r + 1, ...cfg });
      }
      if (!configs.length) { showExportToast('No rows configured'); return; }

      // Ask user to pick a folder
      let dirHandle;
      try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (e) {
        // User cancelled
        return;
      }

      const btnRun = $('becRun');
      btnRun.disabled = true;
      showExportToast('Exporting…');

      const sanitize = s => String(s).replace(/[^a-z0-9 _-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const extMap = { svg: '.svg', jpeg: '.jpg', png: '.png' };
      let count = 0;

      for (const cfg of configs) {
        const maxAbsLevel = Math.max(...cfg.levels);
        const minAbsLevel = Math.min(...cfg.levels);
        // Collect paths one level deeper so buildSvgString roots the diagram
        // exactly at minAbsLevel (not at its parent).
        let paths = becGetAllPathsAtAbsLevel(minAbsLevel + 1);
        if (cfg.l0Filter) paths = paths.filter(p => p[0] === cfg.l0Filter);
        if (!paths.length) continue;

        const rowPrefix = 'R' + String(cfg.rowIdx).padStart(2, '0') + ' - ';

        // Write files directly into chosen directory
        for (const path of paths) {
          // Pass the full orientations map so every selected level uses its own H/V setting
          const result = buildSvgString(path, maxAbsLevel, cfg.orientations);
          if (!result) continue;

          const nameParts = path.map(sanitize);
          const fname = rowPrefix + (nameParts.join(' - ') || 'export') + extMap[cfg.format];
          const blob = await becSvgToBlob(result, cfg.format);
          if (!blob) continue;

          const fileHandle = await dirHandle.getFileHandle(fname, { create: true });
          const writable  = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          count++;
        }
      }

      showExportToast('Exported ' + count + ' files');
      btnRun.disabled = false;
      becOverlay.classList.add('hidden');
    }

    function openBulkExportConfig() {
      if (!Object.keys(tree).length) { showExportToast('No data loaded'); return; }
      becBuildRows();
      becOverlay.classList.remove('hidden');
    }

    $('btnBulkExport').addEventListener('click', openBulkExportConfig);
    $('becClose').addEventListener('click', () => becOverlay.classList.add('hidden'));
    $('becCancel').addEventListener('click', () => becOverlay.classList.add('hidden'));
    $('becRun').addEventListener('click', becRunExport);
    becOverlay.addEventListener('click', e => { if (e.target === becOverlay) becOverlay.classList.add('hidden'); });

    function downloadJPEG(svgString, svgW, svgH, filename) {
      const scale = 300 / 96;   // 300 PPI based on 96 PPI screen baseline
      const cw = Math.round(svgW * scale);
      const ch = Math.round(svgH * scale);

      const canvas = document.createElement('canvas');
      canvas.width  = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);

      const blob = new Blob([svgString], { type:'image/svg+xml;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const img  = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        canvas.toBlob(jpgBlob => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(jpgBlob);
          a.download = filename;
          document.body.appendChild(a); a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(a.href);
          showExportToast('Exported JPEG');
        }, 'image/jpeg', 0.95);
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
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

    // ── UTILS ──────────────────────────────────────────────────────────────
    /** For alternative nodes (containing ' ~'), return only the label after the '~'. */
    function altLabel(name) { const i = String(name).indexOf(' ~'); return i !== -1 ? name.substring(i + 2).trim() : name; }
    function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
    /** Split a semicolon-separated string into trimmed, non-empty parts. */
    function splitSemicolon(s) { return String(s).split(';').map(v => v.trim()).filter(Boolean); }
    /** Convert a single link string to an HTML anchor or plain span. */
    function linkPartToHtml(p, textClass) {
      const parsed = parseErpLink(p);
      if (parsed) return '<a href="' + escHtml(parsed.url) + '" target="_blank" rel="noopener noreferrer" class="ip-tool-link">' + escHtml(parsed.label) + '</a>';
      return '<span' + (textClass ? ' class="' + escHtml(textClass) + '"' : '') + '>' + escHtml(p) + '</span>';
    }
    /** Parse a single ERP link field: supports "(Display Name)https://..." or bare URL. */
    function parseErpLink(raw) {
      const s = raw ? String(raw).trim() : '';
      if (!s) return null;
      const named = s.match(/^\((.+?)\)(https?:\/\/.+)$/i);
      if (named) return { url: named[2], label: named[1] };
      if (/^https?:\/\//i.test(s)) return { url: s, label: s };
      return null;
    }
    /** Parse a semicolon-separated link field into HTML anchors (used in ERP info panel). */
    function parseErpPanelLink(raw) {
      return splitSemicolon(raw).map(p => linkPartToHtml(p, null)).join('');
    }

    // ── EMPTY STATE ────────────────────────────────────────────────────────
    function showNoData() {
      flowContainer.innerHTML = '';
      btnHome.disabled = true; btnUp.classList.add('hidden');
      levelLabel.textContent = ''; levelInfo.textContent = '';
      pathTree.innerHTML = ''; pathTree.classList.add('empty');
      rcData = []; rcOverlayVisible = false;
      if (typeof window.__pfShowImportOverlay === 'function') {
        window.__pfShowImportOverlay();
      }
    }

    // ── INIT ───────────────────────────────────────────────────────────────
    async function loadAndRender() {
      const rows = await loadData();
      if (!rows || !rows.length) { showNoData(); return; }
      tree = buildTree(rows);
      if (!Object.keys(tree).length) { showNoData(); return; }
      buildOutputIndex(tree);

      autoSizeNodes(tree);
      currentPath = [];

      const hashPath = hashToPath(location.hash);
      if (hashPath.length && isValidPath(hashPath)) currentPath = hashPath;

      setZoom(1.0);
      render('right');
    }
    async function init() {
      applyTheme(localStorage.getItem('pfTheme') !== 'dark');
      if (window.__PF_EMBED__) {
        $('btnSave').style.display = 'none';
        $('btnReset').style.display = 'none';
        $('infoWrap').style.display = 'block';
        initInfoDropdown();
      }
      btnHome.addEventListener('click', goHome);
      btnUp.addEventListener('click', goUp);
      await loadAndRender();
    }

    // ── REFRESH CALENDAR RENDER HELPERS ───────────────────────────────────
    // Start/End are week-of-month numbers (1–4).
    // Type: 'Period' = coloured overlay box; 'Milestone' = vertical line.

    function rcWeekToAxisPct(fiscalMonthIdx, weekNum) {
      // Returns left% for the START of weekNum (1-based) within fiscalMonthIdx.
      // Returns null when the month is not in the visible view range.
      if (yearView === 'year') {
        return (fiscalMonthIdx + (weekNum - 1) / 4) / 12 * 100;
      }
      if (yearView === 'quarter') {
        const qStart = yearViewIndex * 3;
        if (fiscalMonthIdx < qStart || fiscalMonthIdx > qStart + 2) return null;
        const relMonth = fiscalMonthIdx - qStart;
        return ((relMonth * 4) + (weekNum - 1)) / 13 * 100;
      }
      if (yearView === 'month') {
        if (fiscalMonthIdx !== yearViewIndex) return null;
        return (weekNum - 1) / 4 * 100;
      }
      return null;
    }

    function rcWeekEndPct(fiscalMonthIdx, weekNum) {
      // Returns right-edge % for weekNum (1-based) within fiscalMonthIdx.
      if (yearView === 'year') {
        return (fiscalMonthIdx + weekNum / 4) / 12 * 100;
      }
      if (yearView === 'quarter') {
        const relMonth = fiscalMonthIdx - yearViewIndex * 3;
        return ((relMonth * 4) + weekNum) / 13 * 100;
      }
      if (yearView === 'month') {
        return weekNum / 4 * 100;
      }
      return null;
    }

    function rcExpandEvents(entry) {
      const results = [];
      const ws = entry.weekStart || 1;
      const we = entry.weekEnd || ws;

      function addForMonth(fi) {
        if (entry.type === 'Period') {
          const left = rcWeekToAxisPct(fi, ws);
          if (left === null) return;
          const right = rcWeekEndPct(fi, we);
          results.push({ left: left, width: Math.max((right || left) - left, 0.15) });
        } else { // Milestone — position at the END of the specified week
          const left = rcWeekEndPct(fi, ws);
          if (left === null) return;
          results.push({ left: left, width: 0 });
        }
      }

      if (entry.freq === 'monthly') {
        for (let i = 0; i < 12; i++) addForMonth(i);
      } else if (entry.freq === 'quarterly') {
        for (let q = 0; q < 4; q++) addForMonth(q * 3);
      } else if (entry.freq === 'annual') {
        addForMonth(0);
      } else {
        addForMonth(0); // fallback: show at first fiscal month
      }
      return results;
    }

    function rcRenderOverlayLayer() {
      const container = $('yearContent');
      const old = container && container.querySelector('.rc-overlay-layer');
      if (old) old.remove();
      if (!container || !rcData.length || !rcOverlayVisible) return;
      const grid = container.querySelector('.year-grid');
      if (!grid) return;
      const layer = document.createElement('div');
      layer.className = 'rc-overlay-layer';
      rcData.forEach(function (entry) {
        rcExpandEvents(entry).forEach(function (ev) {
          const div = document.createElement('div');
          div.className = 'rc-overlay-item ' + (entry.type === 'Period' ? 'rc-period-' + (entry.colorKey || 'default') : 'rc-type-refresh');
          div.style.left = ev.left.toFixed(4) + '%';
          if (entry.type === 'Period') div.style.width = ev.width.toFixed(4) + '%';
          div.title = entry.name;
          layer.appendChild(div);
        });
      });
      grid.appendChild(layer);
    }

    function rcUpdateToggleBtn() {
      const btn = $('btnRcToggle');
      if (!btn) return;
      const hasData = rcData.length > 0;
      btn.disabled = !hasData;
      btn.classList.toggle('active', rcOverlayVisible && hasData);
      btn.title = hasData
        ? (rcOverlayVisible ? 'Hide refresh calendar overlay' : 'Show refresh calendar overlay')
        : 'No RefreshCalendar sheet found in loaded file';
    }

    // ── IMPORT OVERLAY ─────────────────────────────────────────────────────
    (function () {
      const PREVIEW_COLS = ['L1','L2','L3','L4','L5'];
      const L_COLS       = new Set(['L0','L1','L2','L3','L4','L5']);
      const PREVIEW_ROWS = 5;

      let impParsedRows = null;

      const impOverlay        = document.getElementById('importOverlay');
      const impUploadArea     = document.getElementById('impUploadArea');
      const impFileInput      = document.getElementById('impFileInput');
      const impStatus         = document.getElementById('impStatus');
      const impStatusIcon     = document.getElementById('impStatusIcon');
      const impStatusText     = document.getElementById('impStatusText');
      const impSectionPreview = document.getElementById('impSectionPreview');
      const impPreviewMeta    = document.getElementById('impPreviewMeta');
      const impPreviewTable   = document.getElementById('impPreviewTable');
      const impPreviewMore    = document.getElementById('impPreviewMore');
      const impBtnImport      = document.getElementById('impBtnImport');
      const impBtnLabel       = document.getElementById('impBtnLabel');

      function impShowStatus(type, icon, msg) {
        impStatus.className = 'imp-status ' + type;
        impStatusIcon.innerHTML = icon;
        impStatusText.textContent = msg;
      }
      function impShowSpinner(msg) {
        impStatus.className = 'imp-status info';
        impStatusIcon.innerHTML = '<div class="imp-spinner"></div>';
        impStatusText.textContent = msg;
      }

      // ── CSV PARSER (RFC 4180, auto-detects , or ; delimiter) ────────────
      function parseCSV(text) {
        // Strip UTF-8 BOM if present, normalise line endings
        const src = (text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)
                      .replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        // Auto-detect delimiter: count ; vs , in the first line
        const firstLine = src.slice(0, src.indexOf('\n') < 0 ? undefined : src.indexOf('\n'));
        const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

        const rows = [];
        let headers = null;
        let pos = 0;
        const len = src.length;

        while (pos < len) {
          const fields = [];
          // Read all fields for this row
          while (pos < len) {
            if (src[pos] === '"') {
              pos++; // skip opening quote
              let val = '';
              while (pos < len) {
                if (src[pos] === '"') {
                  pos++;
                  if (pos < len && src[pos] === '"') { val += '"'; pos++; } // escaped ""
                  else break; // end of quoted field
                } else {
                  val += src[pos++];
                }
              }
              fields.push(val);
            } else {
              const start = pos;
              while (pos < len && src[pos] !== delim && src[pos] !== '\n') pos++;
              fields.push(src.slice(start, pos));
            }
            if (pos >= len || src[pos] === '\n') break; // end of row
            if (src[pos] === delim) pos++;              // skip delimiter → next field
          }
          if (pos < len && src[pos] === '\n') pos++;    // skip newline

          // Skip blank lines
          if (fields.length === 1 && fields[0] === '') continue;

          if (!headers) {
            headers = fields;
          } else {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = i < fields.length ? fields[i] : ''; });
            if (Object.values(obj).some(v => v !== '')) rows.push(obj);
          }
        }
        return rows;
      }

      // ── DRAG / DROP / FILE INPUT ─────────────────────────────────────────
      impUploadArea.addEventListener('dragover', e => { e.preventDefault(); impUploadArea.classList.add('drag-over'); });
      impUploadArea.addEventListener('dragleave', () => impUploadArea.classList.remove('drag-over'));
      impUploadArea.addEventListener('drop', e => {
        e.preventDefault(); impUploadArea.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) impHandleFile(e.dataTransfer.files[0]);
      });
      impFileInput.addEventListener('change', () => { if (impFileInput.files[0]) impHandleFile(impFileInput.files[0]); });

      function impHandleFile(file) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
          impShowStatus('error', '✕', 'Please select a valid .csv file.'); return;
        }
        impSectionPreview.classList.remove('visible');
        impBtnImport.disabled = true;
        impParsedRows = null;
        impShowSpinner('Reading ' + file.name + '…');

        const reader = new FileReader();
        reader.onerror = () => impShowStatus('error', '✕', 'Could not read the file.');
        reader.onload = ev => {
          setTimeout(() => {
            try {
              const rows = parseCSV(ev.target.result);
              if (!rows.length) { impShowStatus('error', '✕', 'No data rows found in the file.'); return; }
              if (!('L1' in rows[0])) { impShowStatus('error', '✕', 'Column "L1" not found. Please use the correct process map template.'); return; }
              impParsedRows = rows;
              impStatus.className = 'imp-status hidden';
              impShowPreview(rows);
            } catch (err) { impShowStatus('error', '✕', 'Parse error: ' + err.message); }
          }, 30);
        };
        reader.readAsText(file, 'UTF-8');
      }

      // ── REFRESH CALENDAR (uploaded from Year Overview toolbar) ──────────

      function parseRefreshCalendarCSV(text) {
        let rows;
        try { rows = parseCSV(text); } catch (_) { return []; }
        return rows.map(function (r) {
          const name = String(r['Name'] || '').trim();
          if (!name) return null;
          const rawType = String(r['Type'] || '').trim().toLowerCase();
          const type = rawType.startsWith('milestone') ? 'Milestone' : 'Period';
          const rawFreq = String(r['Frequency'] || '').trim().toLowerCase();
          const freq = ['monthly', 'quarterly', 'annual'].includes(rawFreq) ? rawFreq : '';
          const weekStart = parseInt(r['Start']) || 1;
          const weekEnd   = parseInt(r['End'])   || weekStart;
          const nameLow = name.toLowerCase();
          const colorKey = nameLow.startsWith('open')   ? 'open'
                         : nameLow.startsWith('slush')  ? 'slush'
                         : nameLow.startsWith('freeze') ? 'freeze'
                         : 'default';
          return { name, type, weekStart, weekEnd, freq, colorKey };
        }).filter(Boolean);
      }

      const rcCsvFileInput = document.getElementById('rcCsvFileInput');
      const btnRcUpload    = document.getElementById('btnRcUpload');
      if (btnRcUpload) btnRcUpload.addEventListener('click', () => rcCsvFileInput.click());
      if (rcCsvFileInput) {
        rcCsvFileInput.addEventListener('change', () => {
          const file = rcCsvFileInput.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = ev => {
            rcData = parseRefreshCalendarCSV(ev.target.result);
            rcOverlayVisible = false;
            rcRenderOverlayLayer();
            rcUpdateToggleBtn();
            rcCsvFileInput.value = '';
          };
          reader.readAsText(file, 'UTF-8');
        });
      }

      $('btnRcToggle').addEventListener('click', function () {
        if (!rcData.length) return;
        rcOverlayVisible = !rcOverlayVisible;
        rcRenderOverlayLayer();
        rcUpdateToggleBtn();
      });

      // ── END REFRESH CALENDAR ────────────────────────────────────────────

      function impShowPreview(rows) {
        const available = PREVIEW_COLS.filter(c => rows.some(r => r[c] !== ''));
        const l1Count = new Set(rows.map(r => r.L1).filter(Boolean)).size;
        impPreviewMeta.innerHTML =
          '<strong>' + rows.length + '</strong> rows · ' +
          '<strong>' + l1Count + '</strong> L1 processes';

        let thead = '<thead><tr>';
        available.forEach(c => { thead += '<th>' + impEsc(c) + '</th>'; });
        thead += '</tr></thead>';
        let tbody = '<tbody>';
        rows.slice(0, PREVIEW_ROWS).forEach(row => {
          tbody += '<tr>';
          available.forEach(c => {
            const val = row[c] != null ? String(row[c]) : '';
            tbody += '<td class="' + (L_COLS.has(c) ? 'l-col' : '') + '" title="' + impEsc(val) + '">' +
              impEsc(val.length > 28 ? val.slice(0, 26) + '…' : val) + '</td>';
          });
          tbody += '</tr>';
        });
        tbody += '</tbody>';
        impPreviewTable.innerHTML = thead + tbody;

        if (rows.length > PREVIEW_ROWS) {
          impPreviewMore.textContent = '+ ' + (rows.length - PREVIEW_ROWS) + ' more rows not shown';
          impPreviewMore.classList.remove('hidden');
        } else {
          impPreviewMore.classList.add('hidden');
        }
        impBtnLabel.textContent = 'Import ' + rows.length + ' rows →';
        impBtnImport.disabled = false;
        impSectionPreview.classList.add('visible');
      }

      async function impComputeSig(json) {
        const data = new TextEncoder().encode(SIGN_SALT + json);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
      }

      impBtnImport.addEventListener('click', async () => {
        if (!impParsedRows) return;
        impBtnImport.disabled = true;
        try {
          const json = JSON.stringify(impParsedRows);
          const sig  = await impComputeSig(json);
          _sessionData = { raw: json, sig };
        } catch (_) {
          impShowStatus('error', '✕', 'File is too large to store in the browser. Try a smaller spreadsheet.');
          impBtnImport.disabled = false;
          return;
        }
        impShowStatus('success', '✓', 'Imported ' + impParsedRows.length + ' rows. Loading…');
        setTimeout(() => {
          impOverlay.classList.add('hidden');
          history.replaceState(null, '', location.pathname + location.search);
          loadAndRender();
        }, 400);
      });

      function impEsc(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }

      window.__pfShowImportOverlay = function () {
        impOverlay.classList.remove('hidden');
        impSectionPreview.classList.remove('visible');
        impStatus.className = 'imp-status hidden';
        impBtnImport.disabled = true;
        impFileInput.value = '';
        impParsedRows = null;
      };

      document.addEventListener('keydown', function (e) {
        if (impOverlay.classList.contains('hidden')) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if ((e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          impFileInput.click();
        }
      });
    })();

    init();
  })();
