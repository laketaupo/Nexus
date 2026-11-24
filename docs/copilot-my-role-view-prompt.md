# Prompt: build the "My role" view

> Paste everything below the line into your coding agent (GitHub Copilot Chat / Copilot agent mode). It is a self-contained specification of a working reference implementation (Nexus). It describes data, behaviour and UI, not a framework, so build it in the conventions of the target codebase.

---

## 0. Your role and how to work

You are adding a view called **My role** to an existing application that shows a hierarchical business-process model (levels L1 to L4). A user picks their role once. The view then shows the **whole** process tree with the branches where that role takes part highlighted and opened, and everything else dimmed and collapsed, so the user does not have to browse all processes to find their own work. The role's RASCI letters (Responsible, Accountable, Supportive, Consulted, Informed) are shown only on the steps (the lowest level).

- Follow this codebase's conventions: framework, components, state management, styling tokens, i18n, tests, folder layout. Reuse existing primitives (select, segmented control, buttons, icons) instead of building new ones.
- Keep the data logic (collect roles, letters per step, step counts, default open state) in a small framework-free module with unit tests. Keep the UI a thin layer on top.
- No new dependencies are needed.
- Before writing code, read the existing data model, the existing process view and the place where other views are opened, then post a short plan mapping each section below to files. Build in the order of section 8.
- If something here conflicts with how the codebase already works, keep the codebase's way and note the deviation. Ask me before changing the data model.

---

## 1. Data the view depends on

### 1.1 Source rows

The data comes from flat rows (CSV with `;` as separator in the reference). Each row describes one step and repeats its ancestors. The view uses only these columns:

| Column | Meaning |
|---|---|
| `L1`, `L2`, `L3`, `L4` | Process name at each level. A row may stop early (empty deeper levels). |
| `L1_code` … `L4_code` | Optional code per level, such as `1`, `1.1`, `1.1.1`, `1.1.1.1`. |
| `L4_Desc` | Optional one-line description of the step. |
| `R`, `A`, `S`, `C`, `I` | RASCI. Each cell holds zero or more role names separated by `;`, e.g. `Demand Planner; Supply Planner`. |

**Decision: no new columns.** RASCI per step is already stored as one column per letter, with role names as values. A role can appear in several letters of the same step (e.g. both `R` and `A`), which gives several badges on that step. Do not add a role column or a swimlane field for this view. If your codebase stores RASCI differently (for example one `Role` column plus a `RASCI` letter column, or a matrix with one column per role), write an adapter that produces the same shape as section 1.2 and keep the rest unchanged.

### 1.2 Tree shape

Rows are folded into a tree keyed by name, in first-occurrence (row) order:

```
node = {
  name:     string,         // the level's name (map key in the reference)
  code:     string,         // first non-empty Lx_code for this node, may be ''
  children: ordered map name -> node,
  meta:     { R, A, S, C, I, L4_Desc, ... } | null   // only on the node a row ends on
}
```

A **step** is a node without children (normally L4; a row that stops at L3 makes an L3 step). Only steps carry RASCI. Parents (L1 to L3) never show letters, only counts.

### 1.3 Role matching

- Split each RASCI cell on `;`, trim, drop empties.
- Compare role names case-insensitively; display the first spelling seen.
- `lettersFor(step, role)` = the letters, in the order R, A, S, C, I, whose cell contains the role.

---

## 2. Logic (framework-free module)

```
collectRoles(tree)            -> [{ name, stepCount }] sorted A to Z
                                 stepCount = number of steps where the role has at least one letter
lettersFor(step, role)        -> ['R','A',...]  (all letters, ignores filter)
shownLetters(step, role, F)   -> lettersFor filtered to F; F empty = all letters
countSteps(node, role, F)     -> number of steps in the subtree (node itself included if it is a step)
                                 with at least one shown letter
letterTotals(tree, role)      -> { R:n, A:n, S:n, C:n, I:n }  counts over ALL letters (not filtered)
involvedSteps(tree, role)     -> number of steps with any letter (not filtered)
defaultOpen(tree, role, F)    -> set of parent paths where countSteps > 0
```

Use the full path (names joined by a separator that cannot appear in names, e.g. `\u0000`) as the identity of a node, not the name alone, because names can repeat under different parents.

---

## 3. State and persistence

```
state = {
  role:    string,             // '' = none chosen
  mode:    'all' | 'mine',     // Whole process | Only my steps
  letters: string[]            // letter filter, subset of R A S C I, kept in R A S C I order; [] = all
}
```

- Save `state` to local storage under one key (reference: `nexus.myrole.v1`) on every change, and load it on startup. Wrap reads and writes in try/catch; ignore invalid values. Do not persist in read-only/embedded exports.
- If the saved role does not occur in the current data, treat it as no role chosen (keep the saved value; it comes back when the data has that role again).
- The expanded/collapsed state lives in memory only. It is reset to `defaultOpen` whenever the role or the letter filter changes and when the view is opened. Toggling a branch by hand must not reset other branches.

---

## 4. Where the view lives

- Add **My role** as an item in the existing **Views** menu, next to the other views (reference: Overview, Timeline, System Overview, Responsible Overview, My role). Mark it active while open; clicking it again closes it.
- It is a full-screen overlay below the top navigation bar, like the other views. Opening it closes the other views and side panels; opening any other view, going home or opening a step detail closes it.
- **Escape** closes it. While it is open, the process view's arrow-key navigation must not react.

---

## 5. UI

### 5.1 Toolbar (one row, wraps on narrow screens)

1. Title with a person icon: **My role**.
2. **Role select**: placeholder `— Select your role —`, then every role A to Z as `Name  (stepCount)`. Disabled with `No roles in data` when there are none.
3. **Segmented control**: `Whole process` | `Only my steps` (mode `all` | `mine`).
4. Spacer, then a **Close** button.

### 5.2 Empty states (centered, muted)

- No data loaded: **No data loaded** / Import a file first.
- No role chosen: **Pick your role** / Choose a role above to see where it takes part in the process.
- Filter leaves nothing: **No steps match** / This role has none of the selected letters. In `mine` mode nothing else is shown; in `all` mode the dimmed tree is still shown below it.

### 5.3 Hero (above the tree, bottom border as separator)

- Left: small uppercase kicker `MY ROLE`, the role name large and bold, and a subline:
  - no filter: `Involved in N steps`
  - with filter: `X of N steps as Responsible or Accountable` (X = steps matching the filter).
- Right: five **letter chips**, one per letter, each with the round badge, the full word and the total from `letterTotals`. Chips with 0 are faded. Clicking a chip toggles that letter in the filter (multi-select, OR logic). While a filter is active, unselected chips fade and a `Show all letters` link clears the filter. The chips are the "filter by letter" feature; there is no separate control.

### 5.4 The tree

A nested list in data order, indented per level with a thin vertical guide line on the left of each child list. Every row shows the code followed by an en dash and the name, e.g. `1 – S&OP`, `1.1 – 1. Prepare data`, `1.1.1 – Close the previous period`, `1.1.1.1 – Load sales and shipment actuals`. Without a code, show just the name.

**Parent rows (L1 to L3)**
- A chevron (right when closed, rotated down when open), code, name. No frame, no background box, no card. L1 rows are slightly larger.
- **Involved** (countSteps > 0): code in the accent colour and bold, name semi-bold, and on the right a count in the accent colour: `1 step` / `N steps`.
- **Not involved**: the whole row at about 40% opacity (80% on hover), no count, collapsed by default.
- Clicking a parent row toggles it open/closed (also for dimmed rows, so the user can look at context). Keep the scroll position and keep focus on the clicked row after re-rendering.

**Step rows (L4)**
- **Involved** (at least one shown letter): a card. Surface background, thin border, small shadow, rounded corners and a 4 px **left accent bar**. The bar takes the colour of the most significant letter the role holds on that step, in priority A, R, S, C, I. Contents: code (accent colour, bold), name (semi-bold) with the `L4_Desc` underneath in small muted text (hidden on phones), the round letter badges (one per shown letter, in R A S C I order, tooltip = full word), and a `›` on the right. Hover: border in accent colour and a 2 px shift to the right.
- **Not involved**: a plain dimmed row (code and name, no card, no badges).
- Clicking any step (card or plain) closes My role and opens that step in the normal process view: navigate to the step's parent level, scroll the step into view, focus it and give it a short highlight (reference: a 3 px accent ring that fades out over about 2.4 s).

**Modes**
- `Whole process`: every L1 to L4 node is listed; involved branches open, the rest dimmed and collapsed.
- `Only my steps`: only nodes with countSteps > 0 are listed (parents and steps). Steps without a shown letter are hidden.

### 5.5 Letter badge colours

Round, 22 px, white bold letter. Use the codebase's colour tokens if it has them; reference values that work on light and dark themes:

| Letter | Word | Colour |
|---|---|---|
| R | Responsible | `#2f7fd6` |
| A | Accountable | `#c2410c` |
| S | Supportive | `#15803d` |
| C | Consulted | `#a16207` |
| I | Informed | `#6b7280` |

### 5.6 Layout

Content column max 980 px wide, centered, comfortable padding (smaller on phones, indentation reduced). Must work in light and dark theme and at 390 px width without horizontal scroll. Rows and cards are buttons (keyboard focusable, visible focus ring); parent rows expose `aria-expanded`; chips expose `aria-pressed`.

---

## 6. Edge cases

- Role names with different casing or extra spaces are the same role.
- A role in several letters on one step: one card, several badges, counted once in `stepCount` and `countSteps`, but once per letter in `letterTotals`.
- Duplicate names under different parents: identify nodes by full path.
- A row that ends at L3 (no L4): that L3 node is a step and gets a card.
- Data reloaded or replaced while the role is saved: rebuild the role list; an unknown saved role shows the Pick your role state.
- Storage unavailable (private mode): the view works, the choice is just not remembered.

---

## 7. Acceptance criteria

1. Views menu has **My role**; it opens a full-screen view and toggles closed; Escape closes it.
2. The role list holds every name from R/A/S/C/I across the data, A to Z, each with its step count.
3. After choosing a role and reloading the app, the same role, mode and letter filter are restored.
4. Whole process: all L1 branches are listed with codes like `1 – S&OP`; branches with the role are open with accent-coloured codes, bold names and `N steps`; other branches are dimmed and collapsed and can be opened by clicking.
5. L1 to L3 rows have no frame or background; only involved L4 steps are cards with a left accent bar and round letter badges.
6. Only my steps hides every branch and step without the role.
7. Clicking the A chip shows only steps where the role is Accountable, the subline reads `X of N steps as Accountable`, and `Show all letters` resets it. Selecting R and A shows steps with R or A.
8. Clicking a step card opens the normal process view at that step's level with the step highlighted.
9. Works in light and dark theme and on a 390 px wide screen.
10. Unit tests cover collectRoles, lettersFor (case-insensitive, multi-letter), countSteps with and without a filter, and defaultOpen.

---

## 8. Build order

1. Logic module and its unit tests (section 2).
2. State and persistence (section 3).
3. View shell: menu item, overlay, toolbar, open/close rules, Escape (sections 4 and 5.1).
4. Hero and letter chips (5.3), empty states (5.2).
5. Tree with parent rows, step cards, modes and expand/collapse (5.4, 5.5).
6. Open step in process view with highlight (5.4).
7. Responsive and theme check (5.6), then walk through section 7.
