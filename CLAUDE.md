# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gantt Project Manager — a zero-build vanilla JavaScript web app for creating Gantt charts optimized for PowerPoint export. No npm, no bundler, no framework. Opens directly in Chrome/Edge via `index.html`.

Documentation is in Italian (design.md for requirements, tecstack.md for architecture).

## Development

**No build step.** Open `index.html` in Chrome or Edge. No server required (works from `file://`).

**No automated tests, linting, or formatting.** Validation is manual in the browser.

## Architecture

Global namespace pattern: all modules attach to a single `App` object defined in `app.js`.

### Script loading order (sequential, in index.html)

1. `app.js` — Global `App` namespace, state (includes `dashboardSearch`, `dashboardSort`, `dashboardViewMode`, `dashboardClientFilter`), constants (colors, layout dimensions, Italian month names)
2. `utils.js` — Pure helpers: date math, ID generation (`generateId`), `deepClone`, `debounce`
3. `dependencies.js` — Dependency graph logic for activity relationships (FS/FF/SS/SF types with offset)
4. `workspace.js` — File System Access API wrapper + IndexedDB for persisting DirectoryHandle
5. `storage.js` — Persistence abstraction over FS Access API and localStorage fallback
6. `gantt.js` — SVG rendering engine (1920×1080 canvas, month-based timeline, bars, milestones, baseline ghost bars)
7. `drag.js` — Interactive drag system for activity bars, segments, milestones, and layout resize handles
8. `ui.js` — Dashboard rendering (grid/list views, search, sort, client filter), modal system, settings panels, versions panel, toast notifications
9. `exporter.js` — SVG and PNG (3840×2160) export via Canvas API
10. `actions.js` — Business logic coordinator: CRUD for projects/phases/activities/milestones/snapshots + `duplicateProject()` with deep clone and ID remapping
11. `main.js` — DOMContentLoaded init, 20+ window-scope functions bound to `onclick` handlers

### Data flow

```
User onclick → window function (main.js) → App.Actions (mutate state) → App.Storage.save() → App.UI.render*()
```

### Persistence

- **Primary:** File System Access API writes `.gantt.json` files to a user-selected local directory (Chrome/Edge only)
- **Handle storage:** IndexedDB stores the DirectoryHandle between sessions
- **Fallback:** localStorage for browsers without FS Access API
- Auto-save on every modification via `App.Actions.saveAndRender()` (immediate save + re-render)
- File naming: `<sanitized project title>.gantt.json` via `App.Workspace.sanitizeFileName()`

### Data model

Projects contain: `phases[]` (each with `activities[]`), `steeringMilestones[]`, `snapshots[]` (for versioning/baseline), and `client` (optional string). Files use `_type: "gantt_project"` and `_version: 1` markers. `_lastSaved` (ISO timestamp) is set on every save and used for dashboard sorting.

#### Activity segments

Activities support an optional `segments[]` array for representing split/resumed work periods on the same row:

```javascript
{
    id: 'act_...',
    name: '...',
    startDate: '2024-01-01',
    endDate: '2024-06-01',
    progress: 50,
    hasMilestone: false,
    segments: [  // optional, can be undefined/[]
        {
            startDate: '2024-08-01',
            endDate: '2024-12-01',
            progress: 0,
            hasMilestone: false,        // diamond at segment end
            includeInPhase: true        // include in phase summary bar calculation
        }
    ]
}
```

Segments are rendered as additional bars on the same Y row as the main activity. They support drag move/resize, progress tracking, end milestones, and baseline ghost bars. The `includeInPhase` flag controls whether the segment's dates contribute to the phase summary bar (`getPhaseRange()`). Segments without dates are discarded on save. `getMonthRange()` always includes all segment dates for timeline expansion regardless of `includeInPhase`.

### Gantt rendering (gantt.js)

SVG rendered at fixed 1920×1080 (default). Left panel is 380px wide (default). Layers rendered in order: header → left panel → grid → panel grip → month grips → steering row → phases/activities → today line → bottom grip → baseline overlay. Coordinate conversion via `dateToX()` / `xToDate()` maps between calendar dates and pixel positions.

`computeLayout(project)` returns the central layout object used by both rendering and drag: `{ months, range, timelineX, timelineWidth, monthWidth, svgWidth, steeringY, phaseLayouts[], totalHeight }`. Phase rows are equalized to the tallest phase height.

Per-project layout overrides (monthWidth, leftPanelWidth, svgHeight) are stored in `App.state` and persisted to localStorage with keys `gantt_monthWidth_<projectId>`, `gantt_leftPanelWidth_<projectId>`, `gantt_svgHeight_<projectId>`.

`App.Gantt.render(project, container)` returns the SVG element. It is used both for live rendering (into `#gantt-svg-container`) and for offscreen export (`App.Exporter` passes a detached div).

### Drag system (drag.js)

`App.Drag` handles interactive drag on the SVG via mousedown/mousemove/mouseup. Supported drag types:

- **Activity bars**: move, resize-left, resize-right — identified by `data-drag` + `data-activity-id` attributes
- **Segments**: same as activity bars, distinguished by `data-segment-idx` attribute; updates `act.segments[idx]` dates
- **Steering milestones**: `data-drag="move-milestone"` + `data-ms-id` — moves the milestone date horizontally; visual feedback via `translate` on the `<g>` group
- **Panel/month/bottom resize**: structural layout adjustments

All drags snap to day boundaries via `xToDate()`→`dateToX()` round-trip. Escape cancels. A 300ms `_justDragged` flag prevents dblclick from firing after drag end.

### Dashboard (ui.js)

The dashboard supports two view modes (`grid` / `list`), search by title/client, sort (name, date, last update), and client filter dropdown. View mode is persisted to localStorage (`gantt_dashboardViewMode`).

Project cards display: status badge (computed by `_getProjectStatus()`), weighted progress bar, phase progress circles, and a three-dot menu opening `showProjectOptionsPanel()`.

Global settings panel (`showGlobalSettingsPanel()`) provides access to workspace, theme, today date, and import from a single entry point.

### UI design

- **Toolbar**: white background, primary-colored brand text, gray separator lines, `box-shadow: var(--shadow-sm)`. Same style on both dashboard and Gantt views.
- **Buttons (`.btn`)**: gray text (`--gray-700`), transparent/white background, gray border. On hover: primary color text, `--primary-light` border.
- **Dashboard content**: white "paper" panel (`<div class="dashboard-content">`) at full height with side shadows over `--gray-50` body background. Max-width 1200px, centered.

### Dependencies (dependencies.js)

Activities support a `dependencies[]` array with predecessor relationships. Each dependency specifies `predecessorId`, `fromPoint` (start/end), `toPoint` (start/end), and `offsetDays`. Rendered as SVG arrows in the Gantt chart. Managed via a dedicated side panel (`#deps-panel`). Arrow visibility controlled by `App.state.showDependencyArrows`.

When an activity is dragged, `cascadeDependents()` BFS-propagates the date shift to all downstream dependents, preserving offsets. `recalcOwnOffsets()` recalculates offsets when an activity's own dates change (e.g., resize). `hasCircularDependency()` prevents cycles before adding new dependencies.

### Key conventions

- IDs generated via `App.Utils.generateId(prefix)` with prefixes: `proj_`, `phase_`, `act_`, `ms_`, `snap_`
- All UI event handlers are window-scope functions defined in `main.js`
- Modals use a generic `App.UI.showModal()` / `App.UI.closeModal()` pattern; `_initSegmentButtons()` wires segment add/remove via event delegation after modal render
- Settings panels use `App.UI.openSettingsPanel(title)` / `App.UI.closeSettingsPanel()` for slide-in panels (project options, global settings, theme, dependencies)
- HTML escaping via `App.UI.escapeHtml()` and `App.UI.escapeAttr()` for XSS prevention
- CSS uses custom properties for theming (colors, shadows, radii) defined in `:root`
- SVG Gantt theme colors come from `App.DEFAULTS_THEME` merged with `App.state.theme` overrides (persisted in `gantt_theme` localStorage key)
- All dates stored as `'YYYY-MM-DD'` strings, parsed via `App.Utils.parseDate()` (appends `T00:00:00` to avoid timezone issues)
- UI text and labels are in Italian

### localStorage keys

Global: `gantt_projects` (fallback storage), `gantt_customToday`, `gantt_theme`, `gantt_showDependencyArrows`, `gantt_dashboardViewMode`, `gantt_toolsPanelCollapsed`. Per-project: `gantt_monthWidth_<id>`, `gantt_leftPanelWidth_<id>`, `gantt_svgHeight_<id>`.
