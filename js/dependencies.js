// dependencies.js - Gestione dipendenze tra attività
App.Dependencies = {

    findActivityById(project, actId) {
        for (const phase of project.phases) {
            const act = phase.activities.find(a => a.id === actId);
            if (act) return act;
        }
        return null;
    },

    getAnchorDate(activity, point) {
        return point === 'start' ? activity.startDate : activity.endDate;
    },

    computeOffset(predecessor, dependent, fromPoint, toPoint) {
        const fromDate = App.Utils.parseDate(this.getAnchorDate(predecessor, fromPoint));
        const toDate = App.Utils.parseDate(this.getAnchorDate(dependent, toPoint));
        if (!fromDate || !toDate) return 0;
        return App.Utils.daysBetween(fromDate, toDate);
    },

    hasCircularDependency(project, actId, newPredecessorId) {
        // BFS forward da newPredecessorId attraverso i predecessori: se raggiunge actId, c'è un ciclo
        // Ovvero: se actId è un predecessore (diretto o indiretto) di newPredecessorId, aggiungere
        // newPredecessorId come predecessore di actId creerebbe un ciclo
        const visited = new Set();
        const queue = [actId];

        while (queue.length > 0) {
            const currentId = queue.shift();
            if (currentId === newPredecessorId) return true;
            if (visited.has(currentId)) continue;
            visited.add(currentId);

            // Trova tutti i dipendenti di currentId (attività che hanno currentId come predecessore)
            for (const phase of project.phases) {
                for (const act of phase.activities) {
                    if (!act.dependencies) continue;
                    for (const dep of act.dependencies) {
                        if (dep.predecessorId === currentId && !visited.has(act.id)) {
                            queue.push(act.id);
                        }
                    }
                }
            }
        }
        return false;
    },

    cascadeDependents(project, movedActId) {
        // Costruisce mappa predecessorId → [{activity, dep}]
        const depMap = new Map();
        for (const phase of project.phases) {
            for (const act of phase.activities) {
                if (!act.dependencies) continue;
                for (const dep of act.dependencies) {
                    if (!depMap.has(dep.predecessorId)) {
                        depMap.set(dep.predecessorId, []);
                    }
                    depMap.get(dep.predecessorId).push({ activity: act, dep });
                }
            }
        }

        // BFS da movedActId
        const processed = new Set();
        const queue = [movedActId];

        while (queue.length > 0) {
            const predId = queue.shift();
            if (processed.has(predId)) continue;
            processed.add(predId);

            const dependents = depMap.get(predId);
            if (!dependents) continue;

            const predecessor = this.findActivityById(project, predId);
            if (!predecessor) continue;

            for (const { activity: depAct, dep } of dependents) {
                const fromDate = App.Utils.parseDate(this.getAnchorDate(predecessor, dep.fromPoint));
                if (!fromDate) continue;

                // Calcola data target per il punto di ancoraggio del dipendente
                const targetDate = new Date(fromDate);
                targetDate.setDate(targetDate.getDate() + dep.offsetDays);

                // Data corrente del punto di ancoraggio del dipendente
                const currentAnchor = App.Utils.parseDate(this.getAnchorDate(depAct, dep.toPoint));
                if (!currentAnchor) continue;

                const delta = App.Utils.daysBetween(currentAnchor, targetDate);
                if (delta === 0) continue;

                // Shifta startDate/endDate preservando durata
                const start = App.Utils.parseDate(depAct.startDate);
                const end = App.Utils.parseDate(depAct.endDate);
                if (!start || !end) continue;

                start.setDate(start.getDate() + delta);
                end.setDate(end.getDate() + delta);
                depAct.startDate = App.Utils.toISODate(start);
                depAct.endDate = App.Utils.toISODate(end);

                // Shifta anche i segmenti
                if (depAct.segments) {
                    for (const seg of depAct.segments) {
                        const ss = App.Utils.parseDate(seg.startDate);
                        const se = App.Utils.parseDate(seg.endDate);
                        if (ss && se) {
                            ss.setDate(ss.getDate() + delta);
                            se.setDate(se.getDate() + delta);
                            seg.startDate = App.Utils.toISODate(ss);
                            seg.endDate = App.Utils.toISODate(se);
                        }
                    }
                }

                // Accoda per processare cascata
                queue.push(depAct.id);
            }
        }
    },

    getDependencyArrows(project, layout) {
        const arrows = [];
        const G = App.GANTT;

        // Mappa activityId → {y, activity} dai phaseLayouts
        const actLayoutMap = new Map();
        for (const pl of layout.phaseLayouts) {
            for (const al of pl.activities) {
                actLayoutMap.set(al.activity.id, al);
            }
        }

        for (const phase of project.phases) {
            for (const act of phase.activities) {
                if (!act.dependencies) continue;
                for (const dep of act.dependencies) {
                    const predLayout = actLayoutMap.get(dep.predecessorId);
                    const depLayout = actLayoutMap.get(act.id);
                    if (!predLayout || !depLayout) continue;

                    const pred = predLayout.activity;
                    const fromDate = App.Utils.parseDate(this.getAnchorDate(pred, dep.fromPoint));
                    const toDate = App.Utils.parseDate(this.getAnchorDate(act, dep.toPoint));
                    if (!fromDate || !toDate) continue;

                    const fromX = App.Gantt.dateToX(fromDate, layout);
                    const toX = App.Gantt.dateToX(toDate, layout);
                    const barTopOffset = (G.activityRowHeight - G.barHeight) / 2;
                    const fromY = predLayout.y + G.activityRowHeight / 2;
                    const aboveToY = depLayout.y + barTopOffset - 4;
                    const toY = depLayout.y + G.activityRowHeight / 2;

                    arrows.push({ fromX, fromY, toX, toY, aboveToY, predecessorId: dep.predecessorId });
                }
            }
        }

        // Allinea tratti verticali per frecce dallo stesso predecessore (solo caso standard)
        const gap = 12;
        const groups = new Map();
        for (const a of arrows) {
            if (!groups.has(a.predecessorId)) groups.set(a.predecessorId, []);
            groups.get(a.predecessorId).push(a);
        }
        for (const group of groups.values()) {
            if (group.length <= 1) continue;
            const fromX = group[0].fromX;
            const standardArrows = group.filter(a => fromX + gap < a.toX - gap);
            if (standardArrows.length <= 1) continue;
            const minToX = Math.min(...standardArrows.map(a => a.toX));
            const sharedDropX = (fromX + minToX) / 2;
            for (const a of standardArrows) {
                a.dropX = sharedDropX;
            }
        }

        return arrows;
    },

    applyOwnDependencies(project, actId) {
        const act = this.findActivityById(project, actId);
        if (!act || !act.dependencies) return;
        for (const dep of act.dependencies) {
            const pred = this.findActivityById(project, dep.predecessorId);
            if (!pred) continue;
            const fromDate = App.Utils.parseDate(this.getAnchorDate(pred, dep.fromPoint));
            if (!fromDate) continue;
            const targetDate = new Date(fromDate);
            targetDate.setDate(targetDate.getDate() + dep.offsetDays);
            const currentAnchor = App.Utils.parseDate(this.getAnchorDate(act, dep.toPoint));
            if (!currentAnchor) continue;
            const delta = App.Utils.daysBetween(currentAnchor, targetDate);
            if (delta === 0) continue;
            const start = App.Utils.parseDate(act.startDate);
            const end = App.Utils.parseDate(act.endDate);
            if (!start || !end) continue;
            start.setDate(start.getDate() + delta);
            end.setDate(end.getDate() + delta);
            act.startDate = App.Utils.toISODate(start);
            act.endDate = App.Utils.toISODate(end);
            if (act.segments) {
                for (const seg of act.segments) {
                    const ss = App.Utils.parseDate(seg.startDate);
                    const se = App.Utils.parseDate(seg.endDate);
                    if (ss && se) {
                        ss.setDate(ss.getDate() + delta);
                        se.setDate(se.getDate() + delta);
                        seg.startDate = App.Utils.toISODate(ss);
                        seg.endDate = App.Utils.toISODate(se);
                    }
                }
            }
        }
    },

    recalcOwnOffsets(project, actId) {
        const act = this.findActivityById(project, actId);
        if (!act || !act.dependencies) return;
        for (const dep of act.dependencies) {
            const pred = this.findActivityById(project, dep.predecessorId);
            if (!pred) continue;
            dep.offsetDays = this.computeOffset(pred, act, dep.fromPoint, dep.toPoint);
        }
    },

    cleanupDependencies(project, deletedActId) {
        for (const phase of project.phases) {
            for (const act of phase.activities) {
                if (!act.dependencies) continue;
                act.dependencies = act.dependencies.filter(d => d.predecessorId !== deletedActId);
                if (act.dependencies.length === 0) {
                    delete act.dependencies;
                }
            }
        }
    }
};
