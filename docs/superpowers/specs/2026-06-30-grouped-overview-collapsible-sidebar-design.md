# Grouped overview + collapsible sidebar — design

Date: 2026-06-30
Status: Approved (pending spec review)
Area: `packages/ui` (+ one `packages/api` typing change)

## Goal

Bring the queue **grouping** that already exists in the left sidebar to the **main overview list**, as an opt-in view, and let the sidebar itself be collapsed. Search is intentionally left where it is (the term is already app-wide state; only the input renders in the sidebar). No sidebar removal.

## Constraints & decisions

- **Group depth in overview:** full nesting — mirror the sidebar tree, nested collapsible sub-sections all the way down.
- **Collapse state:** the overview keeps its **own** persisted collapse state, independent of the sidebar.
- **Sidebar-collapse control:** lives in the **top header**, always reachable.
- **View toggle:** a standalone **`Flat | Grouped`** segmented control in the overview header.
- **Default view** comes from init config (`UIConfig`), off by default; the user's choice then persists in `board-settings`.
- **Cmd/Ctrl+K** focuses the search input (expanding the sidebar first if collapsed).
- Search is **not** moved.

## Reuse (what already exists)

- `packages/ui/src/utils/toTree.ts` — `toTree(queues, sort)` derives the group tree by splitting `queue.name` on its `delimiter`; `collectGroupPaths(tree)` enumerates group paths; `sortTree` orders groups-first then alphabetical. **Reused as-is** for the overview.
- `packages/ui/src/hooks/useMenuState.ts` — persisted (`bull-board:menu-state`) collapse store keyed by group path. **Refactored into a factory** so the overview gets a sibling store without duplicating logic.
- `packages/ui/src/components/QueueCard/QueueCard.tsx` — rendered unchanged as the leaf of the overview tree.
- `OverviewDropDownActions` exposes `actions.pauseAll` / `actions.resumeAll`; per-queue pause/resume already exist on `QueueActions`. Group bulk actions reuse these scoped to a group's leaves.
- Config flow: `UIConfig` (`packages/api/typings/app.d.ts`) → `entryPoint.ts` serializes into `index.ejs#__UI_CONFIG__` → `index.tsx` parses and seeds the settings store / provides context. Adding an option needs no new serialization wiring.

## Components & changes

### Units (each one purpose, clear interface)

1. **`createCollapseStore(persistKey)`** (refactor of `useMenuState`)
   - What: factory returning a zustand persisted store with `{ state, isMenuOpen(path, defaultOpen?), toggleMenu(path), expandAll(paths), collapseAll(paths) }`.
   - Used by: `useMenuState = createCollapseStore('bull-board:menu-state')` (unchanged behavior) and `useOverviewState = createCollapseStore('bull-board:overview-state')`.
   - Depends on: zustand `persist`. No other change to sidebar behavior; keys stay distinct so the two views never collide.

2. **`OverviewTree`** (new) — `packages/ui/src/components/OverviewTree/`
   - What: recursive renderer that takes the `AppQueueTreeNode` tree and renders group nodes as collapsible `<section>`s and leaf nodes as `<QueueCard>` inside the existing `.overview` grid.
   - Interface: `<OverviewTree tree={node} level={0} parentPath="" searchActive={boolean} />`.
   - Group node renders a header `<button>` (chevron + group name + aggregate status counts) controlling an expand/collapse region. Leaf children of a node render together in one `.overview` grid; sub-group children render as nested `<OverviewTree>`. Ungrouped (delimiter-less) queues are leaf children of root → render as a top-level grid with no header.
   - Collapse open/closed via `useOverviewState`. When `searchActive`, groups force-expanded regardless of stored state (see Search behavior).
   - Depends on: `useOverviewState`, `QueueCard`, `toTree` output, i18n.

3. **`ViewToggle`** (new) — `Flat | Grouped` segmented control
   - What: two-button segmented control reading/writing `settings.overview.grouped` via `useSettingsStore`.
   - Rendered in the overview header **only when groups exist** (`collectGroupPaths(tree).length > 0`), mirroring how the sidebar hides its expand/collapse-all buttons when `!hasGroups`.
   - Alongside it (only in Grouped mode, only when groups exist): **expand-all / collapse-all** buttons reusing `collectGroupPaths` + `useOverviewState.expandAll/collapseAll`.

4. **`SidebarToggle`** (new) — header button
   - What: button in `HeaderActions` toggling `settings.sidebarCollapsed`. Icon reflects state; `aria-expanded` + `aria-controls` pointing at the sidebar; tooltip; `focus-visible`.
   - Hidden/irrelevant on mobile (sidebar already off there).

5. **`useSearchHotkey`** (new hook)
   - What: global `keydown` listener for `(meta|ctrl)+K`. `preventDefault`, set `sidebarCollapsed = false` if collapsed, then focus `#search-queues`. Cleans up on unmount. Mounted once in `App`.

### Edited files

- `packages/api/typings/app.d.ts` — extend `UIConfig` with `overview?: Partial<{ groupByDelimiter: boolean }>`.
- `packages/api/src/index.ts` — no required change (whole `uiConfig` already passes through); optionally document the default.
- `packages/ui/src/index.tsx` — seed settings from config, same pattern as `sortQueues`:
  `if (uiConfig.overview?.groupByDelimiter != null) useSettingsStore.setState({ overview: { grouped: uiConfig.overview.groupByDelimiter } })`.
- `packages/ui/src/hooks/useSettings.ts` — add `overview: { grouped: boolean }` (default `false`) and `sidebarCollapsed: boolean` (default `false`) to `SettingsState` + initial values.
- `packages/ui/src/hooks/useMenuState.ts` — replace body with `createCollapseStore('bull-board:menu-state')`; add `useOverviewState`.
- `packages/ui/src/pages/OverviewPage/OverviewPage.tsx` — when `settings.overview.grouped` and groups exist, build `toTree(filteredQueues, sortQueues)` and render `<OverviewTree>`; otherwise the current flat grid. Header gains `<ViewToggle>` + expand/collapse-all (conditional).
- `packages/ui/src/App.tsx` + layout CSS — keep `<Menu>` mounted; drive collapse via a `data-sidebar-collapsed` attribute / CSS so the aside slides out (`transform: translateX(-100%)`, `--menu-width → 0`) and `main` padding transitions to full width. Mount `useSearchHotkey`.
- `packages/ui/src/components/Header/HeaderActions/*` — add `<SidebarToggle>`.
- i18n locale files — new keys: view toggle labels (`Flat` / `Grouped`), sidebar toggle tooltip, group bulk-action labels (reuse existing `QUEUE.ACTIONS.PAUSE_ALL` / `RESUME_ALL` where they fit).

## Folded-in refinements

- **`hasGroups` gating** (correctness): the `Flat | Grouped` toggle and expand/collapse-all only render when at least one group exists; expand/collapse-all only in Grouped mode.
- **Aggregate group counts:** each overview group header shows the group's rolled-up status counts (active / failed / paused, etc.), summed from the leaves' `queue.counts`. Helper mirrors `countQueues`/`countPausedQueues` in `MenuTree`, generalized to sum the `counts` object.
- **⌘K hint:** small right-aligned `⌘K` affordance inside the search input (platform-aware label: `⌘K` on mac, `Ctrl K` elsewhere).
- **Sticky group headers:** top-level group headers `position: sticky` within the scroll container while their section is in view. Kept subtle (background + bottom hairline) to avoid busy-ness; disabled under reduced-motion is N/A (no motion), but z-index uses the semantic scale.
- **Group bulk actions:** each group header carries pause-all / resume-all for that group's leaves, reusing the existing per-queue pause/resume actions and the existing `useConfirm` modal (gated by `confirmQueueActions`). Read-only queues excluded; the control hides if every leaf is read-only.
- **Search auto-expand:** while `searchTerm` is non-empty, `OverviewTree` force-expands all groups so matches are visible; stored collapse state is untouched and restored when the term clears.
- **A11y:** every new control is a real `<button>` with `aria-expanded`/`aria-controls`, tooltips, and `focus-visible` rings consistent with existing controls.
- **Reduced-motion:** `@media (prefers-reduced-motion: reduce)` fallbacks for the sidebar slide, chevron rotation, and section expand/collapse (crossfade or instant).

## Styling notes (product register)

- The overview group header is styled for the **content** area (light/dark theme tokens: `--accent-color`, `--card-*`), **not** the sidebar's hardcoded dark palette. Body/label contrast verified ≥4.5:1 in both themes.
- Reuse existing control vocabulary (`Button`, dropdown styles, chevron icon). No new affordance shapes. Motion 150–250ms, ease-out.
- Nested groups indent using the same `calc()` step approach as `MenuTree`'s `--level`.

## Out of scope

- Moving search out of the sidebar.
- Removing the sidebar.
- Any new backend endpoint (group bulk actions reuse existing per-queue actions).

## Testing

- `packages/ui` has no component test harness today; adapter contract tests in `packages/test-utils` cover server adapters, not UI. Verification is manual via the dev server (`docker compose -f docker-compose.redis.yml up -d`, then the example server) across: no-delimiter queues (toggle hidden), delimited queues (grouped sections, nesting, aggregate counts), collapse persistence per view, sidebar collapse + ⌘K, search auto-expand, dark mode, mobile, and `prefers-reduced-motion`.
- Pure helpers (`createCollapseStore`, the count-aggregation helper) are unit-testable; add a small jest spec if a UI test setup is introduced, otherwise cover via manual verification.
- Lint with oxlint before completion.
