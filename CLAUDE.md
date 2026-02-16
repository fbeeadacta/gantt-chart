# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gantt Project Manager — a zero-build vanilla JavaScript web app for creating Gantt charts optimized for PowerPoint export. No npm, no bundler, no framework. Opens directly in Chrome/Edge via `index.html`.

Documentation is in Italian (design.md for requirements). Note: `tecstack.md` describes a different project and is not relevant.

## Development

**No build step.** Open `index.html` in Chrome or Edge. No server required (works from `file://`).

**No automated tests, linting, or formatting.** Validation is manual in the browser.

## Architecture

Global namespace pattern: all modules attach to a single `App` object defined in `app.js`.

### Script loading order (sequential, in index.html)

1. `app.js` — Global `App` namespace, state, constants (colors, layout dimensions, Italian month names)
2. `utils.js` — Pure helpers: date math, ID generation (`generateId`), `deepClone`, `debounce`, `calculatePlannedDuration()`, timeline period generators (`getTimePeriods`, `getISOWeek`, `getWeeksList`, `getQuartersList`)
3. `dependencies.js` — Dependency graph logic for activity relationships (FS/FF/SS/SF types with offset) + critical path (CPM forward/backward pass with topological sort)
4. `workspace.js` — File System Access API wrapper + IndexedDB for persisting DirectoryHandle
5. `storage.js` — Persistence abstraction over FS Access API and localStorage fallback
6. `gantt.js` — SVG rendering engine (1920×1080 canvas, multi-unit timeline, bars, milestones, baseline ghost bars)
7. `planning.js` — Activity duration planning view: subtask effort estimation, collaborator pool with availability, drag-and-drop assignment, real-time calendar duration calculation
8. `drag.js` — Interactive drag system for activity bars, segments, milestones, and layout resize handles
9. `history.js` — Undo/redo stack (max 30 states), snapshots of project data, pause mechanism during restore
10. `ui.js` — Dashboard rendering (grid/list views, search, sort, client filter), modal system, settings panels, versions panel, toast notifications, planning view rendering
11. `exporter.js` — SVG and PNG (3840×2160) export via Canvas API
12. `actions.js` — Business logic coordinator: CRUD for projects/phases/activities/milestones/snapshots + `duplicateProject()` with deep clone and ID remapping (including collaborators and planning data)
13. `main.js` — DOMContentLoaded init, 20+ window-scope functions bound to `onclick` handlers, keyboard shortcuts

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

### Views

Three views controlled by `App.UI.showView(view)`:

- **`dashboard`** — Project list (grid/list modes, search, sort, client filter)
- **`gantt`** — Gantt chart editor with SVG rendering
- **`planning`** — Activity duration planning: define subtasks with effort estimates, assign collaborators from a pool, auto-calculate calendar durations. Navigation via `openPlanningView()` / `backFromPlanning()`

### Keyboard shortcuts

- **Ctrl+Z / Cmd+Z**: Undo
- **Ctrl+Y / Cmd+Y / Ctrl+Shift+Z**: Redo
- **Shift+Drag** (on activity bar): Create End→Start dependency between two activities
- **Escape**: Close modal, settings panel, versions panel, or deps panel; cancel drag
- Shortcuts are suppressed when focus is on input/textarea/select elements

### Data model

Projects contain: `phases[]` (each with `activities[]`), `steeringMilestones[]`, `snapshots[]` (for versioning/baseline), `client` (optional string), and `collaborators[]` (for planning view). Files use `_type: "gantt_project"` and `_version: 1` markers. `_lastSaved` (ISO timestamp) is set on every save and used for dashboard sorting.

#### Collaborators and planning

```javascript
project.collaborators = [
    { id: 'collab_...', name: 'Alice', daysPerWeek: 5 }
]

activity.planning = {
    subtasks: [{ id: 'sub_...', name: 'Task A', effortDays: 10 }],
    assignments: [{ collaboratorId: 'collab_...', daysPerWeek: 3 }]
}
```

Duration calculation (`App.Utils.calculatePlannedDuration`): `calendarDays = ceil(totalEffort / weeklyCapacity * 7)`. Collaborator and subtask IDs are remapped during `duplicateProject()`.

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

`computeLayout(project)` returns the central layout object used by both rendering and drag: `{ months, range, timelineX, timelineWidth, monthWidth, svgWidth, steeringY, phaseLayouts[], totalHeight, timelineUnit }`. Phase rows are equalized to the tallest phase height.

#### Timeline zoom

Three zoom levels controlled by `App.state.timelineUnit` (persisted per-project as `gantt_timelineUnit_<id>`):

- **`week`** — ISO week numbers (W1, W2, W3...)
- **`month`** — Italian month abbreviations (GEN, FEB, MAR...) — default
- **`quarter`** — Quarters (Q1, Q2, Q3, Q4)

Zoom controls are in the tools panel (Sett / Mese / Trim buttons). `App.Utils.getTimePeriods(unit, start, end)` generates the unified period list. When SVG width exceeds viewport, the container gets `.zoomed` class for horizontal scroll.

Per-project layout overrides (monthWidth, leftPanelWidth, svgHeight) are stored in `App.state` and persisted to localStorage with keys `gantt_monthWidth_<projectId>`, `gantt_leftPanelWidth_<projectId>`, `gantt_svgHeight_<projectId>`.

`App.Gantt.render(project, container)` returns the SVG element. It is used both for live rendering (into `#gantt-svg-container`) and for offscreen export (`App.Exporter` passes a detached div).

### Drag system (drag.js)

`App.Drag` handles interactive drag on the SVG via mousedown/mousemove/mouseup. Supported drag types:

- **Activity bars**: move, resize-left, resize-right — identified by `data-drag` + `data-activity-id` attributes
- **Segments**: same as activity bars, distinguished by `data-segment-idx` attribute; updates `act.segments[idx]` dates
- **Steering milestones**: `data-drag="move-milestone"` + `data-ms-id` — moves the milestone date horizontally; visual feedback via `translate` on the `<g>` group
- **Create dependency (Shift+drag)**: hold Shift and drag from any activity bar to another to create an End→Start dependency. Uses `type: 'create-dependency'` state with a temporary dashed SVG line (`#dep-arrowhead-drag` marker). Target detection via `document.elementFromPoint()` (checks `data-activity-id` and `data-bar-act` attributes). Target bar highlighted with `.dep-drop-target` class. On release: validates duplicates and circular dependencies (`hasCircularDependency()`), computes offset via `computeOffset()`, then calls `applyOwnDependencies()` + `cascadeDependents()` + `saveAndRender()`. Shift+drag on segments uses the parent activity ID. Cursor: `crosshair` via `body.dragging-dep` class.
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

### Dependencies and critical path (dependencies.js)

Activities support a `dependencies[]` array with predecessor relationships. Each dependency specifies `predecessorId`, `fromPoint` (start/end), `toPoint` (start/end), and `offsetDays`. Rendered as SVG arrows in the Gantt chart. Managed via a dedicated side panel (`#deps-panel`). Arrow visibility controlled by `App.state.showDependencyArrows`.

When an activity is dragged, `cascadeDependents()` BFS-propagates the date shift to all downstream dependents, preserving offsets. `recalcOwnOffsets()` recalculates offsets when an activity's own dates change (e.g., resize). `hasCircularDependency()` prevents cycles before adding new dependencies.

#### Critical path

`App.Dependencies.computeCriticalPath(project)` implements the Critical Path Method: topological sort (Kahn's algorithm), forward pass (ES/EF), backward pass (LS/LF), then identifies zero-slack activities. Returns `{criticalActivityIds: Set, criticalArrows: Set}`. Toggled via checkbox in the deps panel. State in `App.state.showCriticalPath` (persisted as `gantt_showCriticalPath`). Critical activities are rendered with highlighted styling. Only active when dependency arrows are visible.

### Undo/redo (history.js)

`App.History` manages a stack-based undo/redo system (max 30 states). Each state is a snapshot of `{phases, steeringMilestones, title, client}`. `pushState()` is called automatically after every modification via `App.Actions.saveAndRender()`. A pause mechanism prevents recursive pushes during restore. Toolbar buttons (`#btn-undo`, `#btn-redo`) are auto-enabled/disabled. History is cleared on `backToDashboard()`.

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

### Tools panel

The Gantt view has a collapsible tools panel (toggle via `toggleToolsPanel()`, state persisted as `gantt_toolsPanelCollapsed`). Contains: version controls, today/dependency toggles, zoom level selector (Sett/Mese/Trim), and a button to open the planning view.

### localStorage keys

Global: `gantt_projects` (fallback storage), `gantt_customToday`, `gantt_theme`, `gantt_showDependencyArrows`, `gantt_showCriticalPath`, `gantt_dashboardViewMode`, `gantt_toolsPanelCollapsed`. Per-project: `gantt_monthWidth_<id>`, `gantt_leftPanelWidth_<id>`, `gantt_svgHeight_<id>`, `gantt_timelineUnit_<id>`.
