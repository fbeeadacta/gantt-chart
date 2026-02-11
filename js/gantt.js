// gantt.js - Rendering SVG del diagramma di Gantt
App.Gantt = {
    ns: 'http://www.w3.org/2000/svg',

    render(project, container) {
        if (!project) return;
        const G = App.GANTT;
        const C = App.COLORS;

        // Theme
        this._theme = App.UI._getTheme();
        const T = this._theme;

        // Calcolo layout
        const layout = this.computeLayout(project);
        const defaultHeight = Math.max(G.height, layout.totalHeight + G.padding.bottom);
        const totalHeight = App.state.svgHeight != null
            ? Math.max(layout.totalHeight + 10, App.state.svgHeight)
            : defaultHeight;
        const svgWidth = layout.svgWidth;

        // Crea SVG
        const svg = document.createElementNS(this.ns, 'svg');
        svg.setAttribute('viewBox', `0 0 ${svgWidth} ${totalHeight}`);
        svg.setAttribute('width', svgWidth);
        svg.setAttribute('height', totalHeight);
        svg.setAttribute('xmlns', this.ns);
        svg.style.fontFamily = T.fontFamily;
        svg.style.backgroundColor = C.white;

        // Defs: filtro ombra per hover
        const defs = document.createElementNS(this.ns, 'defs');
        const filter = document.createElementNS(this.ns, 'filter');
        filter.setAttribute('id', 'shadow-lift');
        filter.setAttribute('x', '-20%');
        filter.setAttribute('y', '-20%');
        filter.setAttribute('width', '140%');
        filter.setAttribute('height', '160%');
        const shadow = document.createElementNS(this.ns, 'feDropShadow');
        shadow.setAttribute('dx', '0');
        shadow.setAttribute('dy', '2');
        shadow.setAttribute('stdDeviation', '3');
        shadow.setAttribute('flood-color', '#000');
        shadow.setAttribute('flood-opacity', '0.35');
        filter.appendChild(shadow);
        defs.appendChild(filter);

        // Marker freccia per dipendenze
        const marker = document.createElementNS(this.ns, 'marker');
        marker.setAttribute('id', 'dep-arrowhead');
        marker.setAttribute('markerWidth', '5');
        marker.setAttribute('markerHeight', '4');
        marker.setAttribute('refX', '5');
        marker.setAttribute('refY', '2');
        marker.setAttribute('orient', 'auto');
        const arrowPoly = document.createElementNS(this.ns, 'polygon');
        arrowPoly.setAttribute('points', '0 0, 5 2, 0 4');
        arrowPoly.setAttribute('fill', '#666');
        marker.appendChild(arrowPoly);
        defs.appendChild(marker);

        svg.appendChild(defs);

        // Style: hover effects
        const style = document.createElementNS(this.ns, 'style');
        style.textContent = `
            .act-bar { transition: filter 0.15s ease, transform 0.15s ease; }
            .act-bar:hover { filter: url(#shadow-lift); transform: translateY(-2px); }
        `;
        svg.appendChild(style);

        // Sfondo bianco
        this.rect(svg, 0, 0, svgWidth, totalHeight, C.white);

        // Render sezioni
        this.renderHeader(svg, layout);
        this.renderLeftPanel(svg, project, layout);
        this.renderGrid(svg, layout);
        this.renderPanelGrip(svg, layout);
        this.renderMonthGrips(svg, layout);
        this.renderSteeringRow(svg, project, layout);
        if (App.state.showDependencyArrows) {
            this.renderDependencyArrows(svg, project, layout);
        }
        this.renderPhases(svg, project, layout);
        this.renderTodayLine(svg, layout);
        this.renderBottomGrip(svg, layout, totalHeight, svgWidth);

        // Baseline se attiva
        if (App.state.baselineActive) {
            this.renderBaseline(svg, project, layout);
        }

        container.innerHTML = '';
        // Gestione classe zoomed per scroll orizzontale
        if (svgWidth > G.width) {
            container.classList.add('zoomed');
        } else {
            container.classList.remove('zoomed');
        }
        container.appendChild(svg);
        return svg;
    },

    computeLayout(project) {
        const G = App.GANTT;
        const range = App.Utils.getMonthRange(project);
        const months = App.Utils.getMonthsList(range.start, range.end);

        const timelineX = App.state.leftPanelWidth || G.leftPanelWidth;
        const monthCount = months.length;

        let monthWidth, timelineWidth, svgWidth;
        if (App.state.monthWidth != null && App.state.monthWidth > 0) {
            monthWidth = App.state.monthWidth;
            timelineWidth = monthCount * monthWidth;
            svgWidth = timelineX + timelineWidth + G.padding.right;
        } else {
            timelineWidth = G.width - timelineX - G.padding.right;
            monthWidth = monthCount > 0 ? timelineWidth / monthCount : timelineWidth;
            svgWidth = G.width;
        }

        // Calcola posizioni Y per ogni riga
        let currentY = G.padding.top + G.headerHeight;

        // Riga steering
        const steeringY = currentY;
        currentY += G.steeringRowHeight + G.rowGap;

        // Fasi e attività
        const phaseLayouts = [];
        for (const phase of project.phases) {
            const phaseStartY = currentY;
            // Riga sommario fase
            const summaryY = currentY;
            currentY += G.phaseRowHeight + G.rowGap;

            // Righe attività
            const activityLayouts = [];
            for (const act of phase.activities) {
                activityLayouts.push({ y: currentY, activity: act });
                currentY += G.activityRowHeight + G.rowGap;
            }

            phaseLayouts.push({
                phase,
                startY: phaseStartY,
                summaryY,
                activities: activityLayouts,
                endY: currentY
            });

            currentY += G.phaseSeparator;
        }

        // Equalizza altezza fasi: tutte uguali alla più alta
        if (phaseLayouts.length > 0) {
            let maxPhaseH = 0;
            for (const pl of phaseLayouts) {
                const h = pl.endY - pl.startY;
                if (h > maxPhaseH) maxPhaseH = h;
            }

            // Ricalcola posizioni Y con altezza uniforme
            let newY = phaseLayouts[0].startY;
            for (const pl of phaseLayouts) {
                const oldH = pl.endY - pl.startY;
                const delta = newY - pl.startY;

                pl.startY = newY;
                pl.summaryY += delta;
                for (const al of pl.activities) {
                    al.y += delta;
                }
                pl.endY = pl.startY + maxPhaseH;

                newY = pl.endY + G.phaseSeparator;
            }
            currentY = newY;
        }

        return {
            months,
            range,
            timelineX,
            timelineWidth,
            monthWidth,
            svgWidth,
            steeringY,
            phaseLayouts,
            totalHeight: currentY,
            headerY: G.padding.top
        };
    },

    dateToX(date, layout) {
        const { months, timelineX, monthWidth } = layout;
        if (months.length === 0) return timelineX;

        // Trova l'indice del mese in cui cade la data
        const y = date.getFullYear();
        const m = date.getMonth();
        let idx = -1;
        for (let i = 0; i < months.length; i++) {
            if (months[i].year === y && months[i].month === m) { idx = i; break; }
        }

        if (idx === -1) {
            // Data prima del primo mese
            const first = months[0].date;
            if (date < first) {
                const daysInFirst = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
                const dayOff = App.Utils.daysBetween(first, date); // negativo
                return timelineX + (dayOff / daysInFirst) * monthWidth;
            }
            // Data dopo l'ultimo mese
            const last = months[months.length - 1];
            const daysInLast = new Date(last.year, last.month + 1, 0).getDate();
            const startOfLast = new Date(last.year, last.month, 1);
            const dayOff = App.Utils.daysBetween(startOfLast, date);
            return timelineX + (months.length - 1) * monthWidth + (dayOff / daysInLast) * monthWidth;
        }

        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const dayOfMonth = date.getDate() - 1; // 0-based
        return timelineX + idx * monthWidth + (dayOfMonth / daysInMonth) * monthWidth;
    },

    xToDate(x, layout) {
        const { months, timelineX, monthWidth } = layout;
        if (months.length === 0 || monthWidth <= 0) return new Date(layout.range.start);

        const relX = x - timelineX;
        const monthIdx = Math.floor(relX / monthWidth);
        const frac = (relX / monthWidth) - monthIdx;

        // Clamp all'intervallo dei mesi
        const clampedIdx = Math.max(0, Math.min(months.length - 1, monthIdx));
        const mEntry = months[clampedIdx];
        const daysInMonth = new Date(mEntry.year, mEntry.month + 1, 0).getDate();

        let dayOfMonth;
        if (monthIdx < 0) {
            dayOfMonth = Math.round((monthIdx + frac) * daysInMonth);
        } else if (monthIdx >= months.length) {
            dayOfMonth = Math.round(frac * daysInMonth) + (monthIdx - months.length + 1) * daysInMonth;
        } else {
            dayOfMonth = Math.round(frac * daysInMonth);
        }

        const result = new Date(mEntry.year, mEntry.month, 1 + dayOfMonth);
        return result;
    },

    monthToX(monthDate, layout) {
        return this.dateToX(monthDate, layout);
    },

    // === HEADER ===
    renderHeader(svg, layout) {
        const G = App.GANTT;
        const C = App.COLORS;
        const T = this._theme;
        const headerY = layout.headerY;

        // Sfondo header anno (riga superiore)
        const yearRowH = G.headerHeight / 2;
        const monthRowH = G.headerHeight / 2;
        this.rect(svg, layout.timelineX, headerY, layout.timelineWidth, yearRowH, T.headerBg);
        // Sfondo header mesi (riga inferiore)
        this.rect(svg, layout.timelineX, headerY + yearRowH, layout.timelineWidth, monthRowH, C.headerMonthBg);

        // Anno e mesi
        let prevYear = null;

        for (let i = 0; i < layout.months.length; i++) {
            const m = layout.months[i];
            const x = this.monthToX(m.date, layout);
            const nextDate = i < layout.months.length - 1
                ? layout.months[i + 1].date
                : new Date(m.date.getFullYear(), m.date.getMonth() + 1, 1);
            const nextX = this.dateToX(nextDate, layout);
            const colW = nextX - x;

            // Mese
            this.text(svg, x + colW / 2, headerY + yearRowH + monthRowH / 2 + 4,
                m.label, 10, '#000000', 'middle', 'normal');

            // Separatore verticale bianco semi-trasparente tra colonne mese (solo riga mesi)
            if (i > 0) {
                const sep = this.line(svg, x, headerY + yearRowH, x, headerY + G.headerHeight, '#FFFFFF', 0.7);
                sep.setAttribute('opacity', '0.3');
            }

            // Anno (solo al cambio anno o primo mese)
            if (m.year !== prevYear) {
                // Calcola larghezza gruppo anno
                let yearEndX = nextX;
                for (let j = i + 1; j < layout.months.length; j++) {
                    if (layout.months[j].year !== m.year) break;
                    const nd = j < layout.months.length - 1
                        ? layout.months[j + 1].date
                        : new Date(layout.months[j].date.getFullYear(), layout.months[j].date.getMonth() + 1, 1);
                    yearEndX = this.dateToX(nd, layout);
                }
                const yearW = yearEndX - x;
                this.text(svg, x + yearW / 2, headerY + yearRowH / 2 + 5,
                    String(m.year), 11, C.white, 'middle', 'bold');
                prevYear = m.year;
            }
        }

        // Bordo inferiore header
        this.line(svg, layout.timelineX, headerY + G.headerHeight,
            layout.timelineX + layout.timelineWidth, headerY + G.headerHeight, C.gridLine, 1);
    },

    // === LEFT PANEL ===
    renderLeftPanel(svg, project, layout) {
        const G = App.GANTT;
        const C = App.COLORS;
        const T = this._theme;
        const panelW = layout.timelineX;

        // Sfondo pannello sinistro header — bianco (l'header blu è solo sulla timeline)
        this.rect(svg, 0, layout.headerY, panelW, G.headerHeight, C.white);

        // Bordo destro pannello sinistro (si ferma all'ultima fase)
        const lastPl = layout.phaseLayouts[layout.phaseLayouts.length - 1];
        const panelBottomY = lastPl ? lastPl.endY : layout.totalHeight;
        this.line(svg, panelW, layout.headerY, panelW, panelBottomY, C.gridLine, 1);

        // Titolo progetto (verticale) - colonna sinistra
        const titleX = G.padding.left + G.titleColWidth / 2;
        const contentStartY = layout.headerY + G.headerHeight;
        const contentHeight = layout.totalHeight - contentStartY;

        // Sfondo azzurro colonna titolo progetto (allineato esattamente alle fasi)
        if (layout.phaseLayouts.length > 0) {
            const firstPhase = layout.phaseLayouts[0];
            const lastPhase = layout.phaseLayouts[layout.phaseLayouts.length - 1];
            const titleStartY = firstPhase.startY;
            const titleEndY = lastPhase.endY;
            const titleH = titleEndY - titleStartY;

            this.rect(svg, G.padding.left, titleStartY, G.titleColWidth, titleH, T.titleBg);
            this.verticalText(svg, titleX, titleStartY + titleH / 2,
                project.title.toUpperCase(), 10, C.white, 'bold');
        }

        // Per ogni fase (gap orizzontale tra titolo e fasi)
        const phaseColX = G.padding.left + G.titleColWidth + G.phaseSeparator;
        const phaseLabelX = phaseColX + G.phaseLabelWidth / 2;
        const actNameX = phaseColX + G.phaseLabelWidth + 8;
        const maxTextW = panelW - actNameX - 4; // larghezza disponibile per testi

        for (const pl of layout.phaseLayouts) {
            const phaseH = pl.endY - pl.startY;

            // Sfondo azzurro chiaro etichetta fase
            this.rect(svg, phaseColX, pl.startY, G.phaseLabelWidth, phaseH, T.phaseLabelBg);

            // Etichetta fase (verticale)
            this.verticalText(svg, phaseLabelX, pl.startY + phaseH / 2,
                pl.phase.label.toUpperCase(), 9, C.white, 'bold');

            // Nome fase (nella riga sommario) - clickabile
            const phaseNameEl = this.wrapText(svg, actNameX, pl.summaryY + G.phaseRowHeight / 2 + 4,
                pl.phase.name, maxTextW, 10, C.primary, 'start', 'bold');
            phaseNameEl.setAttribute('text-decoration', 'underline');
            phaseNameEl.setAttribute('data-id', pl.phase.id);
            phaseNameEl.style.cursor = 'pointer';

            // Nomi attività - clickabili
            for (const al of pl.activities) {
                const actNameEl = this.wrapText(svg, actNameX, al.y + G.activityRowHeight / 2 + 4,
                    al.activity.name, maxTextW, 9.5, '#404040', 'start', 'normal', true);
                actNameEl.setAttribute('data-activity-id', al.activity.id);
                actNameEl.setAttribute('data-phase-id', pl.phase.id);
                actNameEl.style.cursor = 'pointer';
            }
        }

        // Riga steering nel pannello sinistro
        const steeringLabelX = phaseColX + G.phaseLabelWidth + 8;
        this.wrapText(svg, steeringLabelX, layout.steeringY + G.steeringRowHeight / 2 + 4,
            'Kick-off / steering committee', maxTextW, 9, C.primary, 'start', 'normal');
    },

    // === GRID ===
    renderGrid(svg, layout) {
        const G = App.GANTT;
        const C = App.COLORS;
        const topY = layout.headerY + G.headerHeight;

        // Bordo inferiore griglia (ultima fase, linea continua)
        const lastPhase = layout.phaseLayouts[layout.phaseLayouts.length - 1];
        const gridBottomY = lastPhase ? lastPhase.endY : layout.totalHeight;

        // Linee verticali per ogni mese (si fermano al bordo inferiore)
        let prevYear = null;
        for (const m of layout.months) {
            const x = this.monthToX(m.date, layout);
            const isYearBound = m.year !== prevYear && prevYear !== null;
            this.line(svg, x, topY, x, gridBottomY,
                isYearBound ? C.yearLine : C.gridLine,
                isYearBound ? 1.5 : 0.5);
            prevYear = m.year;
        }

        // Linea verticale di chiusura dopo l'ultimo mese
        const rightEdgeX = layout.timelineX + layout.timelineWidth;
        this.line(svg, rightEdgeX, topY, rightEdgeX, gridBottomY, C.gridLine, 0.5);

        // Linea orizzontale tratteggiata sotto steering
        const steeringEndY = layout.steeringY + G.steeringRowHeight;
        const rightEnd = layout.svgWidth - G.padding.right;
        this.dashedLine(svg, layout.timelineX, steeringEndY,
            rightEnd, steeringEndY, C.gridLine, 1);

        // Linee orizzontali tra fasi
        for (let i = 0; i < layout.phaseLayouts.length; i++) {
            const pl = layout.phaseLayouts[i];
            if (i < layout.phaseLayouts.length - 1) {
                // Tra fasi: tratteggiata
                this.dashedLine(svg, layout.timelineX, pl.endY,
                    rightEnd, pl.endY, C.gridLine, 1);
            } else {
                // Ultima fase: linea continua
                this.line(svg, layout.timelineX, pl.endY,
                    rightEnd, pl.endY, C.gridLine, 1);
            }
        }
    },

    // === PANEL RESIZE GRIP ===
    renderPanelGrip(svg, layout) {
        const G = App.GANTT;
        const topY = layout.headerY;
        const lastPhase = layout.phaseLayouts[layout.phaseLayouts.length - 1];
        const bottomY = lastPhase ? lastPhase.endY : layout.totalHeight;
        const gripW = 8;
        const grip = this.rect(svg, layout.timelineX - gripW / 2, topY, gripW, bottomY - topY, 'transparent');
        grip.setAttribute('data-drag', 'panel-resize');
        grip.style.cursor = 'col-resize';
    },

    // === BOTTOM RESIZE GRIP ===
    renderBottomGrip(svg, layout, totalHeight, svgWidth) {
        const gripH = 8;
        const grip = this.rect(svg, 0, totalHeight - gripH / 2, svgWidth, gripH, 'transparent');
        grip.setAttribute('data-drag', 'bottom-resize');
        grip.style.cursor = 'ns-resize';
    },

    // === MONTH RESIZE GRIPS ===
    renderMonthGrips(svg, layout) {
        const G = App.GANTT;
        const headerY = layout.headerY;
        const gripW = 10;

        for (let i = 0; i < layout.months.length; i++) {
            // Grip sul bordo destro di ogni colonna mese
            const rightX = layout.timelineX + (i + 1) * layout.monthWidth;
            const grip = this.rect(svg, rightX - gripW / 2, headerY, gripW, G.headerHeight, 'transparent');
            grip.setAttribute('data-drag', 'month-resize');
            grip.style.cursor = 'col-resize';
        }
    },

    // === STEERING MILESTONES ===
    renderSteeringRow(svg, project, layout) {
        const G = App.GANTT;
        for (const ms of project.steeringMilestones) {
            const date = App.Utils.parseDate(ms.date);
            if (!date) continue;
            const x = this.dateToX(date, layout);
            const y = layout.steeringY + G.steeringRowHeight / 2;

            const color = ms.color === 'gold' ? App.COLORS.gold
                : ms.color === 'gray' ? App.COLORS.gray
                : App.COLORS.primary;

            // Gruppo per milestone (label + forma + drag handle)
            const g = document.createElementNS(this.ns, 'g');
            g.setAttribute('data-ms-group', ms.id);
            svg.appendChild(g);

            if (ms.type === 'triangle') {
                this.triangle(g, x, y, G.milestoneSize, color, ms.id);
            } else {
                this.diamond(g, x, y, G.milestoneSize, color, ms.id);
            }

            // Etichetta sopra
            if (ms.label) {
                const lbl = this.text(g, x, y - G.milestoneSize - 2, ms.label, 7, color, 'middle', 'normal');
                lbl.setAttribute('data-ms-label', ms.id);
            }

            // Area drag invisibile sopra la milestone
            const hitSize = Math.max(G.milestoneSize * 2, 16);
            const dragRect = this.rect(g, x - hitSize / 2, y - hitSize / 2, hitSize, hitSize, 'transparent', null, 0);
            dragRect.setAttribute('data-drag', 'move-milestone');
            dragRect.setAttribute('data-ms-id', ms.id);
            dragRect.style.cursor = 'grab';
        }
    },

    // === PHASES & ACTIVITIES ===
    renderPhases(svg, project, layout) {
        const G = App.GANTT;
        const C = App.COLORS;
        const T = this._theme;

        for (const pl of layout.phaseLayouts) {
            const phase = pl.phase;
            const phaseRange = App.Utils.getPhaseRange(phase);

            // Barra sommario fase
            if (phaseRange.start && phaseRange.end) {
                const x1 = this.dateToX(phaseRange.start, layout);
                const x2 = this.dateToX(phaseRange.end, layout);
                const barY = pl.summaryY + (G.phaseRowHeight - G.summaryBarHeight) / 2;
                const barW = Math.max(x2 - x1, 4);

                // Barra scura
                this.rect(svg, x1, barY, barW, G.summaryBarHeight, T.phaseFill, phase.id);

                // Triangolini alle estremità
                this.summaryTriangle(svg, x1, barY + G.summaryBarHeight, 'left', T.phaseFill);
                this.summaryTriangle(svg, x1 + barW, barY + G.summaryBarHeight, 'right', T.phaseFill);
            }

            // Barre attività
            for (const al of pl.activities) {
                const act = al.activity;
                const startDate = App.Utils.parseDate(act.startDate);
                const endDate = App.Utils.parseDate(act.endDate);
                if (!startDate || !endDate) continue;

                const x1 = this.dateToX(startDate, layout);
                const x2 = this.dateToX(endDate, layout);
                const barY = al.y + (G.activityRowHeight - G.barHeight) / 2;
                const barW = Math.max(x2 - x1, 4);

                // Gruppo attività per hover effect
                const g = document.createElementNS(this.ns, 'g');
                g.setAttribute('class', 'act-bar');
                svg.appendChild(g);

                // Sfondo azzurro chiaro (durata totale)
                const bgRect = this.rect(g, x1, barY, barW, G.barHeight, T.activityBg, null, 3);
                bgRect.setAttribute('data-bar-role', 'background');
                bgRect.setAttribute('data-bar-act', act.id);

                // Riempimento blu scuro (avanzamento)
                const progress = (act.progress || 0) / 100;
                if (progress > 0) {
                    const progressW = barW * progress;
                    const progRect = this.rect(g, x1, barY, progressW, G.barHeight, T.activityFill, null, 3);
                    progRect.setAttribute('data-bar-role', 'progress');
                    progRect.setAttribute('data-bar-act', act.id);
                }

                // Percentuale avanzamento
                if (act.progress > 0) {
                    const pctText = this.text(g, x1 + barW + 5, al.y + G.activityRowHeight / 2 + 3.5,
                        act.progress + '%', 8, T.activityFill, 'start', '600');
                    pctText.setAttribute('data-bar-role', 'pct');
                    pctText.setAttribute('data-bar-act', act.id);
                }

                // Area di move (centro barra) — invisibile
                const moveRect = this.rect(g, x1 + 8, barY, Math.max(barW - 16, 0), G.barHeight, 'transparent', null, 0);
                moveRect.setAttribute('data-drag', 'move');
                moveRect.setAttribute('data-activity-id', act.id);
                moveRect.setAttribute('data-phase-id', phase.id);
                moveRect.style.cursor = 'grab';

                // Handle resize sinistro (8px)
                const handleL = this.rect(g, x1, barY, 8, G.barHeight, 'transparent', null, 0);
                handleL.setAttribute('data-drag', 'resize-left');
                handleL.setAttribute('data-activity-id', act.id);
                handleL.setAttribute('data-phase-id', phase.id);
                handleL.style.cursor = 'ew-resize';

                // Handle resize destro (8px)
                const handleR = this.rect(g, x1 + barW - 8, barY, 8, G.barHeight, 'transparent', null, 0);
                handleR.setAttribute('data-drag', 'resize-right');
                handleR.setAttribute('data-activity-id', act.id);
                handleR.setAttribute('data-phase-id', phase.id);
                handleR.style.cursor = 'ew-resize';

                // Milestone diamante alla fine
                if (act.hasMilestone) {
                    this.diamond(g, x2, al.y + G.activityRowHeight / 2,
                        G.milestoneSize - 2, T.milestone);
                }

                // Segmenti aggiuntivi
                if (act.segments && act.segments.length > 0) {
                    for (let segIdx = 0; segIdx < act.segments.length; segIdx++) {
                        const seg = act.segments[segIdx];
                        const segStart = App.Utils.parseDate(seg.startDate);
                        const segEnd = App.Utils.parseDate(seg.endDate);
                        if (!segStart || !segEnd) continue;

                        const sx1 = this.dateToX(segStart, layout);
                        const sx2 = this.dateToX(segEnd, layout);
                        const segW = Math.max(sx2 - sx1, 4);

                        const sg = document.createElementNS(this.ns, 'g');
                        sg.setAttribute('class', 'act-bar');
                        svg.appendChild(sg);

                        // Sfondo
                        const segBg = this.rect(sg, sx1, barY, segW, G.barHeight, T.activityBg, null, 3);
                        segBg.setAttribute('data-bar-role', 'background');
                        segBg.setAttribute('data-bar-act', act.id);
                        segBg.setAttribute('data-bar-seg', String(segIdx));

                        // Avanzamento
                        const segProgress = (seg.progress || 0) / 100;
                        if (segProgress > 0) {
                            const segProgW = segW * segProgress;
                            const segProgRect = this.rect(sg, sx1, barY, segProgW, G.barHeight, T.activityFill, null, 3);
                            segProgRect.setAttribute('data-bar-role', 'progress');
                            segProgRect.setAttribute('data-bar-act', act.id);
                            segProgRect.setAttribute('data-bar-seg', String(segIdx));
                        }

                        // Percentuale
                        if (seg.progress > 0) {
                            const segPctText = this.text(sg, sx1 + segW + 5, al.y + G.activityRowHeight / 2 + 3.5,
                                seg.progress + '%', 8, T.activityFill, 'start', '600');
                            segPctText.setAttribute('data-bar-role', 'pct');
                            segPctText.setAttribute('data-bar-act', act.id);
                            segPctText.setAttribute('data-bar-seg', String(segIdx));
                        }

                        // Move handle
                        const segMove = this.rect(sg, sx1 + 8, barY, Math.max(segW - 16, 0), G.barHeight, 'transparent', null, 0);
                        segMove.setAttribute('data-drag', 'move');
                        segMove.setAttribute('data-activity-id', act.id);
                        segMove.setAttribute('data-phase-id', phase.id);
                        segMove.setAttribute('data-segment-idx', String(segIdx));
                        segMove.style.cursor = 'grab';

                        // Handle resize sinistro
                        const segHL = this.rect(sg, sx1, barY, 8, G.barHeight, 'transparent', null, 0);
                        segHL.setAttribute('data-drag', 'resize-left');
                        segHL.setAttribute('data-activity-id', act.id);
                        segHL.setAttribute('data-phase-id', phase.id);
                        segHL.setAttribute('data-segment-idx', String(segIdx));
                        segHL.style.cursor = 'ew-resize';

                        // Handle resize destro
                        const segHR = this.rect(sg, sx1 + segW - 8, barY, 8, G.barHeight, 'transparent', null, 0);
                        segHR.setAttribute('data-drag', 'resize-right');
                        segHR.setAttribute('data-activity-id', act.id);
                        segHR.setAttribute('data-phase-id', phase.id);
                        segHR.setAttribute('data-segment-idx', String(segIdx));
                        segHR.style.cursor = 'ew-resize';

                        // Milestone diamante alla fine del segmento
                        if (seg.hasMilestone) {
                            this.diamond(sg, sx2, al.y + G.activityRowHeight / 2,
                                G.milestoneSize - 2, T.milestone);
                        }
                    }
                }
            }
        }
    },

    // === TODAY LINE ===
    renderTodayLine(svg, layout) {
        const G = App.GANTT;
        const T = this._theme;
        const today = App.Utils.getToday();

        if (today >= layout.range.start && today <= layout.range.end) {
            const x = this.dateToX(today, layout);
            const topY = layout.headerY + G.headerHeight;
            this.line(svg, x, topY, x, layout.totalHeight, T.todayLine, 2);

            // Etichetta "Oggi" sotto la tabella
            this.text(svg, x, layout.totalHeight + 12, 'Oggi', 8, T.todayLine, 'middle', 'bold');
        }
    },

    // === BASELINE ===
    renderBaseline(svg, project, layout) {
        const G = App.GANTT;
        const baseline = project.snapshots?.find(s => s.isBaseline);
        if (!baseline || !baseline.data) return;

        const baselineData = baseline.data;

        for (const pl of layout.phaseLayouts) {
            const basePhase = baselineData.phases?.find(p => p.id === pl.phase.id);
            if (!basePhase) continue;

            for (const al of pl.activities) {
                const baseAct = basePhase.activities?.find(a => a.id === al.activity.id);
                if (!baseAct) continue;

                const startDate = App.Utils.parseDate(baseAct.startDate);
                const endDate = App.Utils.parseDate(baseAct.endDate);
                if (!startDate || !endDate) continue;

                const x1 = this.dateToX(startDate, layout);
                const x2 = this.dateToX(endDate, layout);
                const barY = al.y + (G.activityRowHeight - G.barHeight) / 2;
                const barW = Math.max(x2 - x1, 4);

                // Barra fantasma tratteggiata
                const rect = document.createElementNS(this.ns, 'rect');
                rect.setAttribute('x', x1);
                rect.setAttribute('y', barY);
                rect.setAttribute('width', barW);
                rect.setAttribute('height', G.barHeight);
                rect.setAttribute('fill', 'none');
                rect.setAttribute('stroke', '#999');
                rect.setAttribute('stroke-width', '1.5');
                rect.setAttribute('stroke-dasharray', '4,3');
                rect.setAttribute('opacity', '0.6');
                rect.setAttribute('rx', '2');
                svg.appendChild(rect);

                // Segmenti baseline
                if (baseAct.segments && baseAct.segments.length > 0) {
                    for (const seg of baseAct.segments) {
                        const segStart = App.Utils.parseDate(seg.startDate);
                        const segEnd = App.Utils.parseDate(seg.endDate);
                        if (!segStart || !segEnd) continue;

                        const sx1 = this.dateToX(segStart, layout);
                        const sx2 = this.dateToX(segEnd, layout);
                        const segW = Math.max(sx2 - sx1, 4);

                        const segRect = document.createElementNS(this.ns, 'rect');
                        segRect.setAttribute('x', sx1);
                        segRect.setAttribute('y', barY);
                        segRect.setAttribute('width', segW);
                        segRect.setAttribute('height', G.barHeight);
                        segRect.setAttribute('fill', 'none');
                        segRect.setAttribute('stroke', '#999');
                        segRect.setAttribute('stroke-width', '1.5');
                        segRect.setAttribute('stroke-dasharray', '4,3');
                        segRect.setAttribute('opacity', '0.6');
                        segRect.setAttribute('rx', '2');
                        svg.appendChild(segRect);
                    }
                }
            }
        }
    },

    // === SVG PRIMITIVES ===
    rect(svg, x, y, w, h, fill, id, rx) {
        const r = document.createElementNS(this.ns, 'rect');
        r.setAttribute('x', x);
        r.setAttribute('y', y);
        r.setAttribute('width', w);
        r.setAttribute('height', h);
        r.setAttribute('fill', fill);
        if (id) r.setAttribute('data-id', id);
        if (rx) r.setAttribute('rx', rx);
        svg.appendChild(r);
        return r;
    },

    line(svg, x1, y1, x2, y2, stroke, width) {
        const l = document.createElementNS(this.ns, 'line');
        l.setAttribute('x1', x1);
        l.setAttribute('y1', y1);
        l.setAttribute('x2', x2);
        l.setAttribute('y2', y2);
        l.setAttribute('stroke', stroke);
        l.setAttribute('stroke-width', width || 1);
        svg.appendChild(l);
        return l;
    },

    dashedLine(svg, x1, y1, x2, y2, stroke, width) {
        const l = this.line(svg, x1, y1, x2, y2, stroke, width);
        l.setAttribute('stroke-dasharray', '4,3');
        return l;
    },

    wrapText(svg, x, baselineY, content, maxWidth, size, fill, anchor, weight, italic) {
        const charW = size * (weight === 'bold' ? 0.62 : 0.55);
        const estWidth = content.length * charW;

        // No wrapping needed
        if (maxWidth <= 0 || estWidth <= maxWidth) {
            return this.text(svg, x, baselineY, content, size, fill, anchor, weight, italic);
        }

        const maxChars = Math.max(1, Math.floor(maxWidth / charW));
        const words = content.split(/\s+/).filter(w => w.length > 0);
        const lines = [];
        let current = '';

        for (const word of words) {
            const test = current ? current + ' ' + word : word;
            if (test.length > maxChars && current) {
                lines.push(current);
                current = word;
            } else {
                current = test;
            }
        }
        if (current) lines.push(current);

        // Max 2 lines, ellipsis if truncated
        if (lines.length > 2) {
            lines[1] = lines[1] + '\u2026';
            lines.length = 2;
        }
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].length > maxChars) {
                lines[i] = lines[i].substring(0, maxChars - 1) + '\u2026';
            }
        }

        const t = document.createElementNS(this.ns, 'text');
        t.setAttribute('font-size', size);
        t.setAttribute('fill', fill);
        t.setAttribute('text-anchor', anchor || 'start');
        t.setAttribute('font-weight', weight || 'normal');
        t.setAttribute('font-family', this._theme ? this._theme.fontFamily : 'Arial, sans-serif');
        if (italic) t.setAttribute('font-style', 'italic');

        const lineH = Math.round(size * 1.3);
        const startY = lines.length === 1 ? baselineY : baselineY - lineH / 2;

        for (let i = 0; i < lines.length; i++) {
            const tspan = document.createElementNS(this.ns, 'tspan');
            tspan.setAttribute('x', x);
            tspan.setAttribute('y', startY + i * lineH);
            tspan.textContent = lines[i];
            t.appendChild(tspan);
        }

        svg.appendChild(t);
        return t;
    },

    text(svg, x, y, content, size, fill, anchor, weight, italic) {
        const t = document.createElementNS(this.ns, 'text');
        t.setAttribute('x', x);
        t.setAttribute('y', y);
        t.setAttribute('font-size', size);
        t.setAttribute('fill', fill);
        t.setAttribute('text-anchor', anchor || 'start');
        t.setAttribute('font-weight', weight || 'normal');
        t.setAttribute('font-family', this._theme ? this._theme.fontFamily : 'Arial, sans-serif');
        if (italic) t.setAttribute('font-style', 'italic');
        t.textContent = content;
        svg.appendChild(t);
        return t;
    },

    verticalText(svg, x, y, content, size, fill, weight) {
        const t = this.text(svg, 0, 0, content, size, fill, 'middle', weight);
        t.setAttribute('transform', `translate(${x}, ${y}) rotate(-90)`);
        return t;
    },

    diamond(svg, cx, cy, size, fill, id) {
        const half = size / 2;
        const points = `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`;
        const p = document.createElementNS(this.ns, 'polygon');
        p.setAttribute('points', points);
        p.setAttribute('fill', fill);
        if (id) p.setAttribute('data-id', id);
        p.style.cursor = 'pointer';
        svg.appendChild(p);
        return p;
    },

    triangle(svg, cx, cy, size, fill, id) {
        const half = size / 2;
        // Punta in basso
        const points = `${cx - half},${cy - half / 2} ${cx + half},${cy - half / 2} ${cx},${cy + half / 2}`;
        const p = document.createElementNS(this.ns, 'polygon');
        p.setAttribute('points', points);
        p.setAttribute('fill', fill);
        if (id) p.setAttribute('data-id', id);
        p.style.cursor = 'pointer';
        svg.appendChild(p);
        return p;
    },

    summaryTriangle(svg, x, y, side, fill) {
        const s = 5;
        let points;
        if (side === 'left') {
            points = `${x},${y} ${x + s},${y} ${x},${y + s}`;
        } else {
            points = `${x},${y} ${x - s},${y} ${x},${y + s}`;
        }
        const p = document.createElementNS(this.ns, 'polygon');
        p.setAttribute('points', points);
        p.setAttribute('fill', fill);
        svg.appendChild(p);
        return p;
    },

    dashedRect(svg, x, y, w, h, stroke) {
        const r = document.createElementNS(this.ns, 'rect');
        r.setAttribute('x', x);
        r.setAttribute('y', y);
        r.setAttribute('width', w);
        r.setAttribute('height', h);
        r.setAttribute('fill', 'none');
        r.setAttribute('stroke', stroke);
        r.setAttribute('stroke-width', '0.7');
        r.setAttribute('stroke-dasharray', '3,2');
        svg.appendChild(r);
        return r;
    },

    // === DEPENDENCY ARROWS ===
    renderDependencyArrows(svg, project, layout) {
        const arrows = App.Dependencies.getDependencyArrows(project, layout);
        for (const a of arrows) {
            const d = this._depArrowPath(a.fromX, a.fromY, a.toX, a.toY, a.aboveToY, a.dropX);
            const path = document.createElementNS(this.ns, 'path');
            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', '#666');
            path.setAttribute('stroke-width', '1.5');
            path.setAttribute('marker-end', 'url(#dep-arrowhead)');
            path.setAttribute('class', 'dep-arrow');
            svg.appendChild(path);
        }
    },

    _depArrowPath(fromX, fromY, toX, toY, aboveToY, dropX) {
        const gap = 12; // spazio per uscire dalla barra
        if (fromX + gap < toX - gap) {
            // Caso standard: H → V sopra barra → scende a sinistra → H entra al centro
            const midX = dropX != null ? dropX : (fromX + toX) / 2;
            return `M ${fromX} ${fromY} H ${midX} V ${aboveToY} H ${toX - gap} V ${toY} H ${toX}`;
        } else {
            // Caso inverso: route sopra la barra dep, poi scende → H entra al centro
            return `M ${fromX} ${fromY} H ${fromX + gap} V ${aboveToY} H ${toX - gap} V ${toY} H ${toX}`;
        }
    }
};
