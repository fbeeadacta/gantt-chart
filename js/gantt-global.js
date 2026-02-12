// gantt-global.js - Rendering SVG portfolio (tutti i progetti in un unico Gantt, solo lettura)
App.GanttGlobal = {
    ns: 'http://www.w3.org/2000/svg',

    // Range date globale iterando tutti i progetti
    getGlobalMonthRange(projects) {
        let minDate = null;
        let maxDate = null;

        for (const project of projects) {
            for (const phase of project.phases) {
                for (const act of phase.activities) {
                    const s = App.Utils.parseDate(act.startDate);
                    const e = App.Utils.parseDate(act.endDate);
                    if (s && (!minDate || s < minDate)) minDate = s;
                    if (e && (!maxDate || e > maxDate)) maxDate = e;
                    if (act.segments) {
                        for (const seg of act.segments) {
                            const ss = App.Utils.parseDate(seg.startDate);
                            const se = App.Utils.parseDate(seg.endDate);
                            if (ss && (!minDate || ss < minDate)) minDate = ss;
                            if (se && (!maxDate || se > maxDate)) maxDate = se;
                        }
                    }
                }
            }
            for (const ms of (project.steeringMilestones || [])) {
                const d = App.Utils.parseDate(ms.date);
                if (d && (!minDate || d < minDate)) minDate = d;
                if (d && (!maxDate || d > maxDate)) maxDate = d;
            }
        }

        if (!minDate || !maxDate) {
            minDate = new Date();
            maxDate = new Date();
            maxDate.setMonth(maxDate.getMonth() + 6);
        }

        // Stessi margini di App.Utils.getMonthRange
        const startOffset = minDate.getDate() <= 15 ? 1 : 0;
        const start = new Date(minDate.getFullYear(), minDate.getMonth() - startOffset, 1);
        const daysInMaxMonth = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0).getDate();
        const endOffset = maxDate.getDate() > daysInMaxMonth - 15 ? 2 : 1;
        const end = new Date(maxDate.getFullYear(), maxDate.getMonth() + endOffset, 0);

        return { start, end };
    },

    computeGlobalLayout(projects) {
        const G = App.GANTT;
        const expanded = App.state.globalGanttExpanded;
        const unit = App.state.globalGanttTimelineUnit || 'month';

        const range = this.getGlobalMonthRange(projects);
        const months = App.Utils.getTimePeriods(unit, range.start, range.end);

        const timelineX = G.leftPanelWidth;
        const monthCount = months.length;

        let monthWidth, timelineWidth, svgWidth;
        if (App.state.globalGanttMonthWidth != null && App.state.globalGanttMonthWidth > 0) {
            monthWidth = App.state.globalGanttMonthWidth;
            timelineWidth = monthCount * monthWidth;
            svgWidth = timelineX + timelineWidth + G.padding.right;
        } else {
            timelineWidth = G.width - timelineX - G.padding.right;
            monthWidth = monthCount > 0 ? timelineWidth / monthCount : timelineWidth;
            svgWidth = G.width;
        }

        // Calcola posizioni Y
        let currentY = G.padding.top + G.headerHeight;

        const projectLayouts = [];
        for (let pi = 0; pi < projects.length; pi++) {
            const project = projects[pi];
            const projectStartY = currentY;

            // Riga sommario progetto
            const summaryY = currentY;
            currentY += 28 + G.rowGap;

            const phaseLayouts = [];
            for (const phase of project.phases) {
                const phaseStartY = currentY;
                const phaseSummaryY = currentY;
                currentY += G.phaseRowHeight + G.rowGap;

                const activityLayouts = [];
                if (expanded) {
                    for (const act of phase.activities) {
                        activityLayouts.push({ y: currentY, activity: act });
                        currentY += G.activityRowHeight + G.rowGap;
                    }
                }

                phaseLayouts.push({
                    phase,
                    summaryY: phaseSummaryY,
                    startY: phaseStartY,
                    endY: currentY,
                    activities: activityLayouts
                });

                currentY += 4; // gap inter-fase
            }

            const projectEndY = currentY;
            projectLayouts.push({
                project,
                startY: projectStartY,
                endY: projectEndY,
                summaryY,
                phaseLayouts
            });

            currentY += 12; // separatore inter-progetto
        }

        return {
            months,
            range,
            timelineX,
            timelineWidth,
            monthWidth,
            svgWidth,
            headerY: G.padding.top,
            timelineUnit: unit,
            expanded,
            projectLayouts,
            totalHeight: currentY
        };
    },

    render(projects, container) {
        if (!projects || projects.length === 0) return null;
        const G = App.GANTT;
        const C = App.COLORS;

        // Theme (imposta anche su App.Gantt per renderHeader/renderTodayLine)
        this._theme = App.UI._getTheme();
        App.Gantt._theme = this._theme;
        const T = this._theme;

        const layout = this.computeGlobalLayout(projects);
        const totalHeight = Math.max(G.height, layout.totalHeight + G.padding.bottom);
        const svgWidth = layout.svgWidth;

        // Crea SVG
        const svg = document.createElementNS(this.ns, 'svg');
        svg.setAttribute('viewBox', `0 0 ${svgWidth} ${totalHeight}`);
        svg.setAttribute('width', svgWidth);
        svg.setAttribute('height', totalHeight);
        svg.setAttribute('xmlns', this.ns);
        svg.style.fontFamily = T.fontFamily;
        svg.style.backgroundColor = C.white;

        // Sfondo bianco
        App.Gantt.rect(svg, 0, 0, svgWidth, totalHeight, C.white);

        // Render sezioni
        App.Gantt.renderHeader(svg, layout);
        this.renderGridGlobal(svg, layout);
        this.renderProjectSeparators(svg, layout);
        this.renderLeftPanel(svg, layout);

        for (const pl of layout.projectLayouts) {
            this.renderProjectSummaryBar(svg, pl, layout);
            this.renderProjectBars(svg, pl, layout);
        }

        App.Gantt.renderTodayLine(svg, layout);

        container.innerHTML = '';
        if (svgWidth > G.width) {
            container.classList.add('zoomed');
        } else {
            container.classList.remove('zoomed');
        }
        container.appendChild(svg);
        return svg;
    },

    renderLeftPanel(svg, layout) {
        const G = App.GANTT;
        const C = App.COLORS;
        const T = this._theme;
        const panelW = layout.timelineX;

        // Sfondo header pannello sinistro
        App.Gantt.rect(svg, 0, layout.headerY, panelW, G.headerHeight, C.white);

        // Label "PORTFOLIO" nell'header
        App.Gantt.text(svg, G.padding.left + 8, layout.headerY + G.headerHeight / 2 + 5,
            'PORTFOLIO', 11, C.primary, 'start', 'bold');

        // Bordo destro pannello sinistro
        const lastPl = layout.projectLayouts[layout.projectLayouts.length - 1];
        const panelBottomY = lastPl ? lastPl.endY : layout.totalHeight;
        App.Gantt.line(svg, panelW, layout.headerY, panelW, panelBottomY, C.gridLine, 1);

        const phaseColX = G.padding.left + G.titleColWidth + G.phaseSeparator;
        const actNameX = phaseColX + G.phaseLabelWidth + 8;
        const maxTextW = panelW - actNameX - 4;

        for (const pl of layout.projectLayouts) {
            const project = pl.project;

            // Colonna titolo progetto (verticale, sfondo colorato)
            const projectH = pl.endY - pl.startY;
            const titleColStartY = pl.startY;

            // Sfondo colonna titolo progetto
            const projColor = (project.phases[0] && project.phases[0].color) || T.titleBg;
            App.Gantt.rect(svg, G.padding.left, titleColStartY, G.titleColWidth, projectH, projColor);

            // Testo verticale progetto
            const titleX = G.padding.left + G.titleColWidth / 2;
            App.Gantt.verticalText(svg, titleX, titleColStartY + projectH / 2,
                project.title.toUpperCase(), 9, C.white, 'bold');

            // Per ogni fase
            for (const fpl of pl.phaseLayouts) {
                const phaseH = fpl.endY - fpl.startY;

                // Sfondo etichetta fase
                const phaseLabelColor = fpl.phase.color ? App.Utils.lightenColor(fpl.phase.color, 0.4) : T.phaseLabelBg;
                App.Gantt.rect(svg, phaseColX, fpl.startY, G.phaseLabelWidth, phaseH, phaseLabelColor);

                // Etichetta fase (verticale)
                const phaseLabelX = phaseColX + G.phaseLabelWidth / 2;
                App.Gantt.verticalText(svg, phaseLabelX, fpl.startY + phaseH / 2,
                    fpl.phase.label.toUpperCase(), 8, C.white, 'bold');

                // Nome fase
                App.Gantt.wrapText(svg, actNameX, fpl.summaryY + G.phaseRowHeight / 2 + 4,
                    fpl.phase.name, maxTextW, 9, C.primary, 'start', 'bold');

                // Nomi attività (solo se espanso)
                if (layout.expanded) {
                    for (const al of fpl.activities) {
                        App.Gantt.wrapText(svg, actNameX, al.y + G.activityRowHeight / 2 + 4,
                            al.activity.name, maxTextW, 8.5, '#404040', 'start', 'normal');
                    }
                }
            }
        }
    },

    renderGridGlobal(svg, layout) {
        const G = App.GANTT;
        const C = App.COLORS;
        const topY = layout.headerY + G.headerHeight;
        const unit = layout.timelineUnit || 'month';
        const periods = layout.months;

        // Ultimo progetto per gridBottomY
        const lastPl = layout.projectLayouts[layout.projectLayouts.length - 1];
        const gridBottomY = lastPl ? lastPl.endY : layout.totalHeight;

        // Linee verticali per ogni periodo
        for (let i = 0; i < periods.length; i++) {
            const x = layout.timelineX + i * layout.monthWidth;
            const isUpperBound = (i > 0) && (
                unit === 'week'
                    ? periods[i].month !== periods[i - 1].month
                    : periods[i].year !== periods[i - 1].year
            );
            App.Gantt.line(svg, x, topY, x, gridBottomY,
                isUpperBound ? C.yearLine : C.gridLine,
                isUpperBound ? 1.5 : 0.5);
        }

        // Linea verticale di chiusura
        const rightEdgeX = layout.timelineX + layout.timelineWidth;
        App.Gantt.line(svg, rightEdgeX, topY, rightEdgeX, gridBottomY, C.gridLine, 0.5);
    },

    renderProjectSeparators(svg, layout) {
        const G = App.GANTT;
        const C = App.COLORS;
        const rightEnd = layout.svgWidth - G.padding.right;

        for (let i = 0; i < layout.projectLayouts.length; i++) {
            const pl = layout.projectLayouts[i];

            // Sfondo alternato per progetti pari
            if (i % 2 === 1) {
                const h = pl.endY - pl.startY;
                App.Gantt.rect(svg, layout.timelineX, pl.startY, layout.timelineWidth, h, '#f8f9fa');
            }

            // Linea divisoria tra progetti (tratteggiata, tranne l'ultima = continua)
            if (i < layout.projectLayouts.length - 1) {
                const sepY = pl.endY + 6; // metà del gap 12px
                App.Gantt.dashedLine(svg, layout.timelineX, sepY, rightEnd, sepY, C.gridLine, 1);
            } else {
                App.Gantt.line(svg, layout.timelineX, pl.endY, rightEnd, pl.endY, C.gridLine, 1);
            }
        }
    },

    renderProjectSummaryBar(svg, pl, layout) {
        const G = App.GANTT;
        const T = this._theme;
        const project = pl.project;

        // Calcola range date globale del progetto
        let minDate = null, maxDate = null;
        for (const phase of project.phases) {
            const r = App.Utils.getPhaseRange(phase);
            if (r.start && (!minDate || r.start < minDate)) minDate = r.start;
            if (r.end && (!maxDate || r.end > maxDate)) maxDate = r.end;
        }
        if (!minDate || !maxDate) return;

        const x1 = App.Gantt.dateToX(minDate, layout);
        const x2 = App.Gantt.dateToX(maxDate, layout);
        const barH = 14;
        const barY = pl.summaryY + (28 - barH) / 2;
        const barW = Math.max(x2 - x1, 4);

        const projColor = (project.phases[0] && project.phases[0].color) || T.phaseFill;

        // Barra sommario progetto
        App.Gantt.rect(svg, x1, barY, barW, barH, projColor, null, 2);

        // Triangolini
        App.Gantt.summaryTriangle(svg, x1, barY + barH, 'left', projColor);
        App.Gantt.summaryTriangle(svg, x1 + barW, barY + barH, 'right', projColor);

        // Percentuale progresso
        const progress = this._computeProjectProgress(project);
        if (progress > 0) {
            // Barra progresso (sfondo chiaro + fill)
            const progressW = barW * (progress / 100);
            const progressColor = App.Utils.lightenColor(projColor, 0.3);
            App.Gantt.rect(svg, x1, barY, progressW, barH, progressColor, null, 2);
        }

        // Label progresso a destra
        App.Gantt.text(svg, x2 + 8, pl.summaryY + 28 / 2 + 4,
            progress + '%', 9, projColor, 'start', 'bold');
    },

    renderProjectBars(svg, pl, layout) {
        const G = App.GANTT;
        const T = this._theme;

        for (const fpl of pl.phaseLayouts) {
            const phase = fpl.phase;
            const phaseRange = App.Utils.getPhaseRange(phase);

            // Barra sommario fase
            if (phaseRange.start && phaseRange.end) {
                const x1 = App.Gantt.dateToX(phaseRange.start, layout);
                const x2 = App.Gantt.dateToX(phaseRange.end, layout);
                const barY = fpl.summaryY + (G.phaseRowHeight - G.summaryBarHeight) / 2;
                const barW = Math.max(x2 - x1, 4);
                const phaseColor = phase.color || T.phaseFill;

                App.Gantt.rect(svg, x1, barY, barW, G.summaryBarHeight, phaseColor);
                App.Gantt.summaryTriangle(svg, x1, barY + G.summaryBarHeight, 'left', phaseColor);
                App.Gantt.summaryTriangle(svg, x1 + barW, barY + G.summaryBarHeight, 'right', phaseColor);
            }

            // Barre attività (solo se espanso)
            if (!layout.expanded) continue;

            for (const al of fpl.activities) {
                const act = al.activity;
                const startDate = App.Utils.parseDate(act.startDate);
                const endDate = App.Utils.parseDate(act.endDate);
                if (!startDate || !endDate) continue;

                const x1 = App.Gantt.dateToX(startDate, layout);
                const x2 = App.Gantt.dateToX(endDate, layout);
                const barY = al.y + (G.activityRowHeight - G.barHeight) / 2;
                const barW = Math.max(x2 - x1, 4);

                const actColor = act.color || T.activityFill;
                const actBgColor = act.color ? App.Utils.lightenColor(act.color, 0.6) : T.activityBg;

                // Sfondo chiaro
                App.Gantt.rect(svg, x1, barY, barW, G.barHeight, actBgColor, null, 3);

                // Avanzamento
                const progress = (act.progress || 0) / 100;
                if (progress > 0) {
                    App.Gantt.rect(svg, x1, barY, barW * progress, G.barHeight, actColor, null, 3);
                }

                // Percentuale
                if (act.progress > 0) {
                    App.Gantt.text(svg, x1 + barW + 5, al.y + G.activityRowHeight / 2 + 3.5,
                        act.progress + '%', 8, actColor, 'start', '600');
                }

                // Milestone diamante
                if (act.hasMilestone) {
                    const d = App.Gantt.diamond(svg, x2, al.y + G.activityRowHeight / 2,
                        G.milestoneSize - 2, act.color || T.milestone);
                    d.style.cursor = 'default';
                }

                // Segmenti
                if (act.segments && act.segments.length > 0) {
                    for (const seg of act.segments) {
                        const segStart = App.Utils.parseDate(seg.startDate);
                        const segEnd = App.Utils.parseDate(seg.endDate);
                        if (!segStart || !segEnd) continue;

                        const sx1 = App.Gantt.dateToX(segStart, layout);
                        const sx2 = App.Gantt.dateToX(segEnd, layout);
                        const segW = Math.max(sx2 - sx1, 4);

                        App.Gantt.rect(svg, sx1, barY, segW, G.barHeight, actBgColor, null, 3);

                        const segProgress = (seg.progress || 0) / 100;
                        if (segProgress > 0) {
                            App.Gantt.rect(svg, sx1, barY, segW * segProgress, G.barHeight, actColor, null, 3);
                        }

                        if (seg.hasMilestone) {
                            const sd = App.Gantt.diamond(svg, sx2, al.y + G.activityRowHeight / 2,
                                G.milestoneSize - 2, act.color || T.milestone);
                            sd.style.cursor = 'default';
                        }
                    }
                }
            }
        }
    },

    _computeProjectProgress(project) {
        let totalDuration = 0, totalWeightedProgress = 0;
        for (const phase of project.phases) {
            for (const act of phase.activities) {
                const s = App.Utils.parseDate(act.startDate);
                const e = App.Utils.parseDate(act.endDate);
                const dur = (s && e) ? App.Utils.daysBetween(s, e) : 0;
                totalDuration += dur;
                totalWeightedProgress += (act.progress || 0) * dur;
            }
        }
        return totalDuration > 0 ? Math.round(totalWeightedProgress / totalDuration) : 0;
    }
};
