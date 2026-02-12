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

                    arrows.push({ fromX, fromY, toX, toY, aboveToY, predecessorId: dep.predecessorId, dependentId: act.id });
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
    },

    computeCriticalPath(project) {
        const result = { criticalActivityIds: new Set(), criticalArrows: new Set() };

        // Raccogli tutte le attività con dipendenze (connesse al grafo)
        const allActs = new Map(); // id -> activity
        const depMap = new Map();  // predecessorId -> [{depAct, dep}]
        const predMap = new Map(); // actId -> [{predAct, dep}]
        const connectedIds = new Set();

        for (const phase of project.phases) {
            for (const act of phase.activities) {
                allActs.set(act.id, act);
            }
        }

        for (const phase of project.phases) {
            for (const act of phase.activities) {
                if (!act.dependencies) continue;
                for (const dep of act.dependencies) {
                    if (!allActs.has(dep.predecessorId)) continue;
                    connectedIds.add(act.id);
                    connectedIds.add(dep.predecessorId);

                    if (!depMap.has(dep.predecessorId)) depMap.set(dep.predecessorId, []);
                    depMap.get(dep.predecessorId).push({ depAct: act, dep });

                    if (!predMap.has(act.id)) predMap.set(act.id, []);
                    predMap.get(act.id).push({ predAct: allActs.get(dep.predecessorId), dep });
                }
            }
        }

        if (connectedIds.size === 0) return result;

        // Forward pass: calcola Early Start (ES) / Early Finish (EF)
        const ES = new Map();
        const EF = new Map();

        // Topological sort via Kahn's algorithm
        const inDegree = new Map();
        for (const id of connectedIds) {
            inDegree.set(id, 0);
        }
        for (const [predId, deps] of depMap) {
            for (const { depAct } of deps) {
                inDegree.set(depAct.id, (inDegree.get(depAct.id) || 0) + 1);
            }
        }
        // Reset: only count dependencies within connected set
        for (const id of connectedIds) {
            inDegree.set(id, 0);
        }
        for (const [predId, deps] of depMap) {
            for (const { depAct } of deps) {
                if (connectedIds.has(predId) && connectedIds.has(depAct.id)) {
                    inDegree.set(depAct.id, (inDegree.get(depAct.id) || 0) + 1);
                }
            }
        }

        const queue = [];
        for (const [id, deg] of inDegree) {
            if (deg === 0) queue.push(id);
        }

        const topoOrder = [];
        while (queue.length > 0) {
            const id = queue.shift();
            topoOrder.push(id);
            const deps = depMap.get(id) || [];
            for (const { depAct } of deps) {
                if (!connectedIds.has(depAct.id)) continue;
                const newDeg = (inDegree.get(depAct.id) || 1) - 1;
                inDegree.set(depAct.id, newDeg);
                if (newDeg === 0) queue.push(depAct.id);
            }
        }

        // Inizializza ES con la data di inizio effettiva di ogni attività
        for (const id of connectedIds) {
            const act = allActs.get(id);
            const start = App.Utils.parseDate(act.startDate);
            const end = App.Utils.parseDate(act.endDate);
            if (!start || !end) continue;
            ES.set(id, start.getTime());
            EF.set(id, end.getTime());
        }

        // Forward pass
        for (const id of topoOrder) {
            const act = allActs.get(id);
            if (!act) continue;
            const preds = predMap.get(id) || [];
            let maxEarlyStart = ES.get(id) || 0;

            for (const { predAct, dep } of preds) {
                const predEF = EF.get(predAct.id);
                if (predEF == null) continue;
                const anchorDate = dep.fromPoint === 'start' ? ES.get(predAct.id) : predEF;
                if (anchorDate == null) continue;
                const target = anchorDate + dep.offsetDays * 86400000;
                if (dep.toPoint === 'start') {
                    if (target > maxEarlyStart) maxEarlyStart = target;
                }
            }

            const actStart = App.Utils.parseDate(act.startDate);
            const actEnd = App.Utils.parseDate(act.endDate);
            if (!actStart || !actEnd) continue;
            const duration = actEnd.getTime() - actStart.getTime();
            ES.set(id, maxEarlyStart);
            EF.set(id, maxEarlyStart + duration);
        }

        // Backward pass: calcola Late Start (LS) / Late Finish (LF)
        const LS = new Map();
        const LF = new Map();

        // Trova il max EF (fine del progetto)
        let maxEF = 0;
        for (const ef of EF.values()) {
            if (ef > maxEF) maxEF = ef;
        }

        // Inizializza LF = maxEF per tutti
        for (const id of connectedIds) {
            LF.set(id, maxEF);
            const act = allActs.get(id);
            const actStart = App.Utils.parseDate(act.startDate);
            const actEnd = App.Utils.parseDate(act.endDate);
            if (actStart && actEnd) {
                const duration = actEnd.getTime() - actStart.getTime();
                LS.set(id, maxEF - duration);
            }
        }

        // Backward pass (reverse topological order)
        for (let i = topoOrder.length - 1; i >= 0; i--) {
            const id = topoOrder[i];
            const act = allActs.get(id);
            if (!act) continue;
            const actStart = App.Utils.parseDate(act.startDate);
            const actEnd = App.Utils.parseDate(act.endDate);
            if (!actStart || !actEnd) continue;
            const duration = actEnd.getTime() - actStart.getTime();

            const successors = depMap.get(id) || [];
            let minLate = LF.get(id) || maxEF;

            for (const { depAct, dep } of successors) {
                if (!connectedIds.has(depAct.id)) continue;
                const depLS = LS.get(depAct.id);
                const depLF = LF.get(depAct.id);
                if (depLS == null || depLF == null) continue;

                const anchorDate = dep.toPoint === 'start' ? depLS : depLF;
                const target = anchorDate - dep.offsetDays * 86400000;

                if (dep.fromPoint === 'end') {
                    if (target < minLate) minLate = target;
                } else {
                    const shifted = target + duration;
                    if (shifted < minLate) minLate = shifted;
                }
            }

            LF.set(id, minLate);
            LS.set(id, minLate - duration);
        }

        // Float = LS - ES; critico se float ~ 0
        const THRESHOLD = 86400000; // 1 giorno di tolleranza
        for (const id of connectedIds) {
            const es = ES.get(id);
            const ls = LS.get(id);
            if (es == null || ls == null) continue;
            const float = ls - es;
            if (Math.abs(float) <= THRESHOLD) {
                result.criticalActivityIds.add(id);
            }
        }

        // Frecce critiche: tra due attività critiche
        for (const phase of project.phases) {
            for (const act of phase.activities) {
                if (!act.dependencies) continue;
                if (!result.criticalActivityIds.has(act.id)) continue;
                for (const dep of act.dependencies) {
                    if (result.criticalActivityIds.has(dep.predecessorId)) {
                        result.criticalArrows.add(dep.predecessorId + '->' + act.id);
                    }
                }
            }
        }

        return result;
    }
};
