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

1. `app.js` — Global `App` namespace, state, constants (colors, layout dimensions, Italian month names)
2. `utils.js` — Pure helpers: date math, ID generation (`generateId`), `deepClone`, `debounce`
3. `workspace.js` — File System Access API wrapper + IndexedDB for persisting DirectoryHandle
4. `storage.js` — Persistence abstraction over FS Access API and localStorage fallback
5. `gantt.js` — SVG rendering engine (1920×1080 canvas, month-based timeline, bars, milestones, baseline ghost bars)
6. `drag.js` — Interactive drag system for activity bars, segments, milestones, and layout resize handles
7. `ui.js` — Dashboard rendering, modal system, versions panel, toast notifications
8. `exporter.js` — SVG and PNG (3840×2160) export via Canvas API
9. `actions.js` — Business logic coordinator: CRUD for projects/phases/activities/milestones/snapshots
10. `main.js` — DOMContentLoaded init, 20+ window-scope functions bound to `onclick` handlers

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

Projects contain: `phases[]` (each with `activities[]`), `steeringMilestones[]`, and `snapshots[]` (for versioning/baseline). Files use `_type: "gantt_project"` and `_version: 1` markers.

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

### Drag system (drag.js)

`App.Drag` handles interactive drag on the SVG via mousedown/mousemove/mouseup. Supported drag types:

- **Activity bars**: move, resize-left, resize-right — identified by `data-drag` + `data-activity-id` attributes
- **Segments**: same as activity bars, distinguished by `data-segment-idx` attribute; updates `act.segments[idx]` dates
- **Steering milestones**: `data-drag="move-milestone"` + `data-ms-id` — moves the milestone date horizontally; visual feedback via `translate` on the `<g>` group
- **Panel/month/bottom resize**: structural layout adjustments

All drags snap to day boundaries via `xToDate()`→`dateToX()` round-trip. Escape cancels. A 300ms `_justDragged` flag prevents dblclick from firing after drag end.

### Key conventions

- IDs generated via `App.Utils.generateId(prefix)` with prefixes: `proj_`, `phase_`, `act_`, `ms_`, `snap_`
- All UI event handlers are window-scope functions defined in `main.js`
- Modals use a generic `App.UI.showModal()` / `App.UI.closeModal()` pattern; `_initSegmentButtons()` wires segment add/remove via event delegation after modal render
- HTML escaping via `App.UI.escapeHtml()` and `App.UI.escapeAttr()` for XSS prevention
- CSS uses custom properties for theming (colors, shadows, radii) defined in `:root`
