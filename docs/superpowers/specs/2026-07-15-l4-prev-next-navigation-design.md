# L4 Process View: Prev/Next Navigation

## Problem

When viewing an L4 process in the full-screen detail view (`#detailScreen`), there is no way to move to the next or previous sibling process without leaving the screen, going back to the L4 grid, and clicking another node.

## Goal

Let a user step through sibling L4 processes (same L3 parent) directly from within the detail view, via floating carousel arrows and left/right arrow keys.

## Scope

- Applies only to the L4 detail screen (`#detailScreen`, rendered by `renderDetailScreen`).
- Siblings are the nodes returned by `getNodesAtPath(currentPath)` for the current L3 parent.
- Only siblings that are themselves detail-view leaves (no children) are included in the Prev/Next sequence — siblings with children open a drill-down grid instead of this detail view, so they're excluded.
- Order follows the existing display order of `getNodesAtPath(currentPath)`.

## Behavior

- **Edge handling:** stop at the group edge. On the first eligible sibling, the Prev arrow is hidden. On the last, the Next arrow is hidden. No wraparound, no crossing into a different L3 parent's siblings.
- **Controls:** two floating arrow buttons (`‹` / `›`), vertically centered, pinned to the left/right edges of `#detailScreen`, styled consistently with the existing `.dt-btn` toolbar button.
- **Keyboard:** `ArrowLeft` / `ArrowRight` trigger the same navigation while `#detailScreen` is open and focus is not inside a text input/select/textarea.
- **Action:** clicking an arrow (or pressing the key) calls the existing `openDetailScreen(siblingName, sibling._meta, sibling._desc)` for the target sibling. `currentPath` does not change — the screen re-renders in place (breadcrumbs, code chip, RASCI/SIPOC, etc. all update via the existing `renderDetailScreen` logic).

## Implementation Sketch

1. **HTML** — add two `<button>` elements inside `#detailScreen` (e.g. `#dsNavPrev`, `#dsNavNext`).
2. **CSS** — `position: absolute`, vertically centered, edge-pinned within `#detailScreen`; reuse `.dt-btn`-style theming for hover/active states; a `.hidden` class to suppress the arrow at a sequence edge.
3. **JS**
   - A helper `updateDetailNav(currentName)`, called at the end of `renderDetailScreen`, that:
     - Computes the filtered sibling list (no-children nodes) from `getNodesAtPath(currentPath)`.
     - Finds the current node's index in that list.
     - Shows/hides and wires `onclick` for `#dsNavPrev`/`#dsNavNext` to call `openDetailScreen` with the adjacent sibling's name/meta/desc, or hides the button at an edge.
   - A guard at the top of the existing global `keydown` listener (~line 7435) that, when `#detailScreen` is visible, handles `ArrowLeft`/`ArrowRight` by clicking the corresponding nav button (if present) and returns early — preventing the keys from also driving the background flow-node navigation.

## Out of Scope

- Crossing between different L3 parents (matches existing sibling-group navigation elsewhere in the app, which already stops at group edges rather than crossing).
- Any change to the L4 grid view itself, ERP lane navigation, or `renderDetailScreen`'s internal layout.

## Testing

- Open an L4 process with multiple detail-view siblings; verify Prev/Next arrows appear correctly and are hidden at the first/last sibling.
- Verify siblings that have children are skipped in the Prev/Next sequence.
- Verify arrow-key navigation matches click navigation, and does not interfere with typing in the search box or other inputs.
- Verify breadcrumbs, code chip, and all detail panels update correctly after navigating.
