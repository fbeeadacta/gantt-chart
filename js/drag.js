// drag.js - Drag-to-resize/move delle barre attività nel Gantt SVG
App.Drag = {
    _svg: null,
    _layout: null,
    _dragging: false,
    _justDragged: false,
    _state: null, // stato drag corrente

    init(svg, layout) {
        this._svg = svg;
        this._layout = layout;

        // Rimuovi listener precedente se esiste (per evitare duplicati)
        if (this._onMouseDown) {
            svg.removeEventListener('mousedown', this._onMouseDown);
        }

        this._onMouseDown = (e) => this.handleMouseDown(e);
        svg.addEventListener('mousedown', this._onMouseDown);
    },

    screenToSVG(screenX, screenY) {
        const svg = this._svg;
        const pt = svg.createSVGPoint();
        pt.x = screenX;
        pt.y = screenY;
        const ctm = svg.getScreenCTM();
        if (!ctm) return { x: 0, y: 0 };
        const svgPt = pt.matrixTransform(ctm.inverse());
        return { x: svgPt.x, y: svgPt.y };
    },

    findActivity(actId) {
        const project = App.getCurrentProject();
        if (!project) return null;
        for (const phase of project.phases) {
            const act = phase.activities.find(a => a.id === actId);
            if (act) return act;
        }
        return null;
    },

    handleMouseDown(e) {
        if (e.button !== 0) return; // solo click sinistro
        const target = e.target;
        const dragType = target.getAttribute('data-drag');
        if (!dragType) return;

        // Intercetta month-resize e panel-resize prima dei controlli attività
        if (dragType === 'month-resize') {
            this.startMonthResize(e);
            return;
        }
        if (dragType === 'panel-resize') {
            this.startPanelResize(e);
            return;
        }
        if (dragType === 'bottom-resize') {
            this.startBottomResize(e);
            return;
        }
        if (dragType === 'move-milestone') {
            this.startMilestoneDrag(e, target);
            return;
        }

        const actId = target.getAttribute('data-activity-id');
        if (!actId) return;

        const act = this.findActivity(actId);
        if (!act) return;

        // Controlla se è un segmento
        const segIdxAttr = target.getAttribute('data-segment-idx');
        const segIdx = segIdxAttr != null ? parseInt(segIdxAttr) : null;

        let startDate, endDate;
        if (segIdx != null && act.segments && act.segments[segIdx]) {
            startDate = App.Utils.parseDate(act.segments[segIdx].startDate);
            endDate = App.Utils.parseDate(act.segments[segIdx].endDate);
        } else {
            startDate = App.Utils.parseDate(act.startDate);
            endDate = App.Utils.parseDate(act.endDate);
        }
        if (!startDate || !endDate) return;

        const svgPt = this.screenToSVG(e.clientX, e.clientY);
        const duration = App.Utils.daysBetween(startDate, endDate);

        // Trova i rect della barra da muovere visivamente
        let bgRect, progRect, pctText, moveHandle, handleL, handleR;
        if (segIdx != null) {
            const segSel = `[data-bar-seg="${segIdx}"]`;
            bgRect = this._svg.querySelector(`rect[data-bar-role="background"][data-bar-act="${actId}"]${segSel}`);
            progRect = this._svg.querySelector(`rect[data-bar-role="progress"][data-bar-act="${actId}"]${segSel}`);
            pctText = this._svg.querySelector(`text[data-bar-role="pct"][data-bar-act="${actId}"]${segSel}`);
            moveHandle = this._svg.querySelector(`rect[data-drag="move"][data-activity-id="${actId}"][data-segment-idx="${segIdx}"]`);
            handleL = this._svg.querySelector(`rect[data-drag="resize-left"][data-activity-id="${actId}"][data-segment-idx="${segIdx}"]`);
            handleR = this._svg.querySelector(`rect[data-drag="resize-right"][data-activity-id="${actId}"][data-segment-idx="${segIdx}"]`);
        } else {
            bgRect = this._svg.querySelector(`rect[data-bar-role="background"][data-bar-act="${actId}"]:not([data-bar-seg])`);
            progRect = this._svg.querySelector(`rect[data-bar-role="progress"][data-bar-act="${actId}"]:not([data-bar-seg])`);
            pctText = this._svg.querySelector(`text[data-bar-role="pct"][data-bar-act="${actId}"]:not([data-bar-seg])`);
            moveHandle = this._svg.querySelector(`rect[data-drag="move"][data-activity-id="${actId}"]:not([data-segment-idx])`);
            handleL = this._svg.querySelector(`rect[data-drag="resize-left"][data-activity-id="${actId}"]:not([data-segment-idx])`);
            handleR = this._svg.querySelector(`rect[data-drag="resize-right"][data-activity-id="${actId}"]:not([data-segment-idx])`);
        }

        if (!bgRect) return;

        const origX = parseFloat(bgRect.getAttribute('x'));
        const origW = parseFloat(bgRect.getAttribute('width'));

        const origStartDate = segIdx != null ? act.segments[segIdx].startDate : act.startDate;
        const origEndDate = segIdx != null ? act.segments[segIdx].endDate : act.endDate;
        const progress = segIdx != null ? (act.segments[segIdx].progress || 0) / 100 : (act.progress || 0) / 100;

        this._state = {
            type: dragType,
            actId,
            segIdx,
            startSvgX: svgPt.x,
            origStartDate,
            origEndDate,
            origX,
            origW,
            duration,
            progress,
            bgRect,
            progRect,
            pctText,
            moveHandle,
            handleL,
            handleR,
            moved: false
        };

        this._dragging = true;
        this._justDragged = false;

        // Cursor su body
        const cursorClass = dragType === 'move' ? 'dragging-grab' : 'dragging-ew';
        document.body.classList.add(cursorClass);
        this._cursorClass = cursorClass;

        // Listener globali
        this._onMouseMove = (ev) => this.handleMouseMove(ev);
        this._onMouseUp = (ev) => this.handleMouseUp(ev);
        this._onKeyDown = (ev) => { if (ev.key === 'Escape') this.cancelDrag(); };

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
        document.addEventListener('keydown', this._onKeyDown);

        e.preventDefault();
    },

    startMonthResize(e) {
        const svg = this._svg;
        const layout = this._layout;
        const monthCount = layout.months.length;
        if (monthCount === 0) return;

        // Scala iniziale: rapporto viewBox width / screen width dell'SVG
        const svgRect = svg.getBoundingClientRect();
        const vbWidth = parseFloat(svg.getAttribute('viewBox').split(' ')[2]);
        const initialScale = vbWidth / svgRect.width;

        this._state = {
            type: 'month-resize',
            startClientX: e.clientX,
            origMonthWidth: layout.monthWidth,
            origStateMonthWidth: App.state.monthWidth, // può essere null
            initialScale,
            monthCount,
            moved: false,
            _rafId: null
        };

        this._dragging = true;
        this._justDragged = false;

        document.body.classList.add('dragging-col-resize');
        this._cursorClass = 'dragging-col-resize';

        this._onMouseMove = (ev) => this.handleMouseMove(ev);
        this._onMouseUp = (ev) => this.handleMouseUp(ev);
        this._onKeyDown = (ev) => { if (ev.key === 'Escape') this.cancelDrag(); };

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
        document.addEventListener('keydown', this._onKeyDown);

        e.preventDefault();
    },

    startPanelResize(e) {
        const svg = this._svg;
        const layout = this._layout;

        const svgRect = svg.getBoundingClientRect();
        const vbWidth = parseFloat(svg.getAttribute('viewBox').split(' ')[2]);
        const initialScale = vbWidth / svgRect.width;

        const G = App.GANTT;
        const origPanelWidth = App.state.leftPanelWidth || G.leftPanelWidth;

        this._state = {
            type: 'panel-resize',
            startClientX: e.clientX,
            origPanelWidth,
            origStatePanelWidth: App.state.leftPanelWidth, // può essere null
            initialScale,
            svgWidth: layout.svgWidth,
            moved: false,
            _rafId: null
        };

        this._dragging = true;
        this._justDragged = false;

        document.body.classList.add('dragging-col-resize');
        this._cursorClass = 'dragging-col-resize';

        this._onMouseMove = (ev) => this.handleMouseMove(ev);
        this._onMouseUp = (ev) => this.handleMouseUp(ev);
        this._onKeyDown = (ev) => { if (ev.key === 'Escape') this.cancelDrag(); };

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
        document.addEventListener('keydown', this._onKeyDown);

        e.preventDefault();
    },

    startBottomResize(e) {
        const svg = this._svg;
        const layout = this._layout;

        const svgRect = svg.getBoundingClientRect();
        const vbHeight = parseFloat(svg.getAttribute('viewBox').split(' ')[3]);
        const initialScale = vbHeight / svgRect.height;

        const G = App.GANTT;
        const defaultHeight = Math.max(G.height, layout.totalHeight + G.padding.bottom);
        const origHeight = App.state.svgHeight != null ? App.state.svgHeight : defaultHeight;

        this._state = {
            type: 'bottom-resize',
            startClientY: e.clientY,
            origHeight,
            origStateHeight: App.state.svgHeight,
            initialScale,
            minHeight: layout.totalHeight + 10,
            moved: false,
            _rafId: null
        };

        this._dragging = true;
        this._justDragged = false;

        document.body.classList.add('dragging-row-resize');
        this._cursorClass = 'dragging-row-resize';

        this._onMouseMove = (ev) => this.handleMouseMove(ev);
        this._onMouseUp = (ev) => this.handleMouseUp(ev);
        this._onKeyDown = (ev) => { if (ev.key === 'Escape') this.cancelDrag(); };

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
        document.addEventListener('keydown', this._onKeyDown);

        e.preventDefault();
    },

    startMilestoneDrag(e, target) {
        const msId = target.getAttribute('data-ms-id');
        if (!msId) return;

        const project = App.getCurrentProject();
        if (!project) return;
        const ms = project.steeringMilestones.find(m => m.id === msId);
        if (!ms) return;

        const date = App.Utils.parseDate(ms.date);
        if (!date) return;

        const svgPt = this.screenToSVG(e.clientX, e.clientY);
        const layout = this._layout;
        const origX = App.Gantt.dateToX(date, layout);

        // Trova gli elementi visivi della milestone
        const msGroup = this._svg.querySelector(`g[data-ms-group="${msId}"]`);

        this._state = {
            type: 'move-milestone',
            msId,
            origDate: ms.date,
            startSvgX: svgPt.x,
            origX,
            msGroup,
            moved: false
        };

        this._dragging = true;
        this._justDragged = false;

        document.body.classList.add('dragging-grab');
        this._cursorClass = 'dragging-grab';

        this._onMouseMove = (ev) => this.handleMouseMove(ev);
        this._onMouseUp = (ev) => this.handleMouseUp(ev);
        this._onKeyDown = (ev) => { if (ev.key === 'Escape') this.cancelDrag(); };

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
        document.addEventListener('keydown', this._onKeyDown);

        e.preventDefault();
    },

    handleMouseMove(e) {
        if (!this._dragging || !this._state) return;
        const s = this._state;

        // Month-resize: calcola in coordinate screen → SVG
        if (s.type === 'month-resize') {
            const dxScreen = e.clientX - s.startClientX;
            const dxSvg = dxScreen * s.initialScale;
            const newMW = Math.max(30, s.origMonthWidth + dxSvg / s.monthCount);

            if (!s.moved && Math.abs(dxScreen) < 3) return;
            s.moved = true;

            // Throttle via rAF
            if (s._rafId) cancelAnimationFrame(s._rafId);
            s._rafId = requestAnimationFrame(() => {
                App.state.monthWidth = newMW;
                const project = App.getCurrentProject();
                if (!project) return;
                const container = document.getElementById('gantt-svg-container');
                if (!container) return;
                const svg = App.Gantt.render(project, container);
                if (svg) {
                    this._svg = svg;
                    this._layout = App.Gantt.computeLayout(project);
                }
            });
            return;
        }

        // Panel-resize: ridimensiona pannello sinistro
        if (s.type === 'panel-resize') {
            const dxScreen = e.clientX - s.startClientX;
            const dxSvg = dxScreen * s.initialScale;
            const newPW = Math.max(150, Math.min(s.origPanelWidth + dxSvg, s.svgWidth - 200));

            if (!s.moved && Math.abs(dxScreen) < 3) return;
            s.moved = true;

            if (s._rafId) cancelAnimationFrame(s._rafId);
            s._rafId = requestAnimationFrame(() => {
                App.state.leftPanelWidth = newPW;
                const project = App.getCurrentProject();
                if (!project) return;
                const container = document.getElementById('gantt-svg-container');
                if (!container) return;
                const svg = App.Gantt.render(project, container);
                if (svg) {
                    this._svg = svg;
                    this._layout = App.Gantt.computeLayout(project);
                }
            });
            return;
        }

        // Bottom-resize: ridimensiona altezza SVG
        if (s.type === 'bottom-resize') {
            const dyScreen = e.clientY - s.startClientY;
            const dySvg = dyScreen * s.initialScale;
            const newH = Math.max(s.minHeight, s.origHeight + dySvg);

            if (!s.moved && Math.abs(dyScreen) < 3) return;
            s.moved = true;

            if (s._rafId) cancelAnimationFrame(s._rafId);
            s._rafId = requestAnimationFrame(() => {
                App.state.svgHeight = newH;
                const project = App.getCurrentProject();
                if (!project) return;
                const container = document.getElementById('gantt-svg-container');
                if (!container) return;
                const svg = App.Gantt.render(project, container);
                if (svg) {
                    this._svg = svg;
                    this._layout = App.Gantt.computeLayout(project);
                }
            });
            return;
        }

        // Move-milestone: sposta il gruppo milestone via translate
        if (s.type === 'move-milestone') {
            const svgPt = this.screenToSVG(e.clientX, e.clientY);
            const dx = svgPt.x - s.startSvgX;

            if (!s.moved && Math.abs(dx) < 3) return;
            s.moved = true;

            // Snap al giorno
            const newX = s.origX + dx;
            const snappedDate = App.Gantt.xToDate(newX, this._layout);
            const snappedX = App.Gantt.dateToX(snappedDate, this._layout);
            const translateX = snappedX - s.origX;

            if (s.msGroup) {
                s.msGroup.setAttribute('transform', `translate(${translateX}, 0)`);
            }
            return;
        }

        const svgPt = this.screenToSVG(e.clientX, e.clientY);
        const dx = svgPt.x - s.startSvgX;

        // Soglia minima per considerare un drag
        if (!s.moved && Math.abs(dx) < 3) return;
        s.moved = true;

        const layout = this._layout;
        const G = App.GANTT;
        const minW = 4; // larghezza minima barra (circa 1 giorno)

        let newX, newW;

        if (s.type === 'resize-left') {
            newX = Math.max(layout.timelineX, Math.min(s.origX + dx, s.origX + s.origW - minW));
            newW = s.origW - (newX - s.origX);
        } else if (s.type === 'resize-right') {
            newW = Math.max(minW, s.origW + dx);
            // Clamp bordo destro alla fine timeline
            const maxRight = layout.timelineX + layout.timelineWidth;
            if (s.origX + newW > maxRight) newW = maxRight - s.origX;
            newX = s.origX;
        } else { // move
            newX = s.origX + dx;
            newW = s.origW;
            // Clamp ai bordi
            if (newX < layout.timelineX) newX = layout.timelineX;
            const maxRight = layout.timelineX + layout.timelineWidth;
            if (newX + newW > maxRight) newX = maxRight - newW;
        }

        // Snap al giorno: converte x → data → x per snappare
        const snappedStart = App.Gantt.xToDate(newX, layout);
        const snappedX = App.Gantt.dateToX(snappedStart, layout);
        let snappedEnd, snappedW;

        if (s.type === 'move') {
            // Preserva durata
            const endD = new Date(snappedStart);
            endD.setDate(endD.getDate() + s.duration);
            snappedW = App.Gantt.dateToX(endD, layout) - snappedX;
        } else if (s.type === 'resize-left') {
            const endD = App.Gantt.xToDate(s.origX + s.origW, layout);
            snappedW = App.Gantt.dateToX(endD, layout) - snappedX;
        } else {
            snappedEnd = App.Gantt.xToDate(newX + newW, layout);
            snappedW = App.Gantt.dateToX(snappedEnd, layout) - snappedX;
        }

        if (snappedW < minW) snappedW = minW;

        // Aggiorna visivamente i rect
        s.bgRect.setAttribute('x', snappedX);
        s.bgRect.setAttribute('width', snappedW);

        if (s.progRect) {
            s.progRect.setAttribute('x', snappedX);
            s.progRect.setAttribute('width', snappedW * s.progress);
        }

        if (s.pctText) {
            s.pctText.setAttribute('x', snappedX + snappedW + 5);
        }

        // Aggiorna handle
        if (s.moveHandle) {
            s.moveHandle.setAttribute('x', snappedX + 8);
            s.moveHandle.setAttribute('width', Math.max(snappedW - 16, 0));
        }
        if (s.handleL) {
            s.handleL.setAttribute('x', snappedX);
        }
        if (s.handleR) {
            s.handleR.setAttribute('x', snappedX + snappedW - 8);
        }
    },

    handleMouseUp(e) {
        if (!this._dragging || !this._state) {
            this.cleanup();
            return;
        }

        const s = this._state;

        if (!s.moved) {
            this.cleanup();
            return;
        }

        // Month-resize: persisti e re-render completo
        if (s.type === 'month-resize') {
            if (s._rafId) cancelAnimationFrame(s._rafId);
            const project = App.getCurrentProject();
            if (project) {
                try { localStorage.setItem('gantt_monthWidth_' + project.id, String(App.state.monthWidth)); } catch(e) {}
            }
            this._justDragged = true;
            setTimeout(() => { this._justDragged = false; }, 300);
            this.cleanup();
            // Re-render completo con listeners
            App.UI.renderGanttView();
            return;
        }

        // Panel-resize: persisti e re-render completo
        if (s.type === 'panel-resize') {
            if (s._rafId) cancelAnimationFrame(s._rafId);
            const project = App.getCurrentProject();
            if (project) {
                try { localStorage.setItem('gantt_leftPanelWidth_' + project.id, String(App.state.leftPanelWidth)); } catch(e) {}
            }
            this._justDragged = true;
            setTimeout(() => { this._justDragged = false; }, 300);
            this.cleanup();
            App.UI.renderGanttView();
            return;
        }

        // Bottom-resize: persisti e re-render completo
        if (s.type === 'bottom-resize') {
            if (s._rafId) cancelAnimationFrame(s._rafId);
            const project = App.getCurrentProject();
            if (project) {
                try { localStorage.setItem('gantt_svgHeight_' + project.id, String(App.state.svgHeight)); } catch(e) {}
            }
            this._justDragged = true;
            setTimeout(() => { this._justDragged = false; }, 300);
            this.cleanup();
            App.UI.renderGanttView();
            return;
        }

        // Move-milestone: aggiorna data milestone
        if (s.type === 'move-milestone') {
            const svgPt = this.screenToSVG(e.clientX, e.clientY);
            const dx = svgPt.x - s.startSvgX;
            const newX = s.origX + dx;
            const newDate = App.Gantt.xToDate(newX, this._layout);

            const project = App.getCurrentProject();
            if (project) {
                const ms = project.steeringMilestones.find(m => m.id === s.msId);
                if (ms) {
                    ms.date = App.Utils.toISODate(newDate);
                    App.Actions.saveAndRender();
                }
            }

            this._justDragged = true;
            setTimeout(() => { this._justDragged = false; }, 300);
            this.cleanup();
            return;
        }

        // Calcola date finali
        const layout = this._layout;
        const svgPt = this.screenToSVG(e.clientX, e.clientY);
        const dx = svgPt.x - s.startSvgX;
        const minW = 4;

        let newX, newW;

        if (s.type === 'resize-left') {
            newX = Math.max(layout.timelineX, Math.min(s.origX + dx, s.origX + s.origW - minW));
            newW = s.origW - (newX - s.origX);
        } else if (s.type === 'resize-right') {
            newW = Math.max(minW, s.origW + dx);
            const maxRight = layout.timelineX + layout.timelineWidth;
            if (s.origX + newW > maxRight) newW = maxRight - s.origX;
            newX = s.origX;
        } else {
            newX = s.origX + dx;
            newW = s.origW;
            if (newX < layout.timelineX) newX = layout.timelineX;
            const maxRight = layout.timelineX + layout.timelineWidth;
            if (newX + newW > maxRight) newX = maxRight - newW;
        }

        // Snap al giorno
        const newStart = App.Gantt.xToDate(newX, layout);
        let newEnd;

        if (s.type === 'move') {
            newEnd = new Date(newStart);
            newEnd.setDate(newEnd.getDate() + s.duration);
        } else if (s.type === 'resize-left') {
            newEnd = App.Utils.parseDate(s.origEndDate);
            // Se start >= end, imposta start = end - 1 giorno
            if (newStart >= newEnd) {
                newStart.setTime(newEnd.getTime() - 86400000);
            }
        } else {
            newEnd = App.Gantt.xToDate(newX + newW, layout);
            const origStart = App.Utils.parseDate(s.origStartDate);
            // Se end <= start, imposta end = start + 1 giorno
            if (newEnd <= origStart) {
                newEnd = new Date(origStart);
                newEnd.setDate(newEnd.getDate() + 1);
            }
        }

        // Aggiorna l'attività o il segmento
        const act = this.findActivity(s.actId);
        if (act) {
            if (s.segIdx != null && act.segments && act.segments[s.segIdx]) {
                act.segments[s.segIdx].startDate = App.Utils.toISODate(newStart);
                act.segments[s.segIdx].endDate = App.Utils.toISODate(newEnd);
            } else {
                act.startDate = App.Utils.toISODate(newStart);
                act.endDate = App.Utils.toISODate(newEnd);
                // Ricalcola offset delle proprie dipendenze + cascata dipendenti
                App.Dependencies.recalcOwnOffsets(App.getCurrentProject(), s.actId);
                App.Dependencies.cascadeDependents(App.getCurrentProject(), s.actId);
            }
            App.Actions.saveAndRender();
        }

        this._justDragged = true;
        // Reset flag dopo un breve delay (per bloccare il dblclick)
        setTimeout(() => { this._justDragged = false; }, 300);

        this.cleanup();
    },

    cancelDrag() {
        if (!this._dragging || !this._state) return;
        const s = this._state;

        // Month-resize: ripristina larghezza originale
        if (s.type === 'month-resize') {
            if (s._rafId) cancelAnimationFrame(s._rafId);
            App.state.monthWidth = s.origStateMonthWidth;
            this.cleanup();
            App.UI.renderGanttView();
            return;
        }

        // Panel-resize: ripristina larghezza originale
        if (s.type === 'panel-resize') {
            if (s._rafId) cancelAnimationFrame(s._rafId);
            App.state.leftPanelWidth = s.origStatePanelWidth;
            this.cleanup();
            App.UI.renderGanttView();
            return;
        }

        // Bottom-resize: ripristina altezza originale
        if (s.type === 'bottom-resize') {
            if (s._rafId) cancelAnimationFrame(s._rafId);
            App.state.svgHeight = s.origStateHeight;
            this.cleanup();
            App.UI.renderGanttView();
            return;
        }

        // Move-milestone: ripristina posizione originale
        if (s.type === 'move-milestone') {
            if (s.msGroup) {
                s.msGroup.removeAttribute('transform');
            }
            this.cleanup();
            return;
        }

        // Ripristina posizioni originali
        s.bgRect.setAttribute('x', s.origX);
        s.bgRect.setAttribute('width', s.origW);

        if (s.progRect) {
            s.progRect.setAttribute('x', s.origX);
            s.progRect.setAttribute('width', s.origW * s.progress);
        }
        if (s.pctText) {
            s.pctText.setAttribute('x', s.origX + s.origW + 5);
        }
        if (s.moveHandle) {
            s.moveHandle.setAttribute('x', s.origX + 8);
            s.moveHandle.setAttribute('width', Math.max(s.origW - 16, 0));
        }
        if (s.handleL) {
            s.handleL.setAttribute('x', s.origX);
        }
        if (s.handleR) {
            s.handleR.setAttribute('x', s.origX + s.origW - 8);
        }

        this.cleanup();
    },

    cleanup() {
        this._dragging = false;
        this._state = null;

        if (this._cursorClass) {
            document.body.classList.remove(this._cursorClass);
            this._cursorClass = null;
        }

        if (this._onMouseMove) {
            document.removeEventListener('mousemove', this._onMouseMove);
            this._onMouseMove = null;
        }
        if (this._onMouseUp) {
            document.removeEventListener('mouseup', this._onMouseUp);
            this._onMouseUp = null;
        }
        if (this._onKeyDown) {
            document.removeEventListener('keydown', this._onKeyDown);
            this._onKeyDown = null;
        }
    }
};
