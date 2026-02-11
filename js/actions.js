// actions.js - Coordinamento azioni
App.Actions = {
    _saveDebounced: null,

    init() {
        this._saveDebounced = App.Utils.debounce(async () => {
            const project = App.getCurrentProject();
            if (project) {
                await App.Storage.save(project);
            }
        }, 300);
    },

    async saveAndRender() {
        const project = App.getCurrentProject();
        if (!project) return;

        // Salvataggio immediato
        await App.Storage.save(project);

        // Re-render vista corrente
        if (App.state.currentView === 'gantt') {
            App.UI.renderGanttView();
        } else {
            App.UI.renderDashboard();
        }
    },

    async createProject(title, client) {
        const project = App.Utils.createEmptyProject(title);
        if (client) project.client = client;
        App.state.projects.push(project);
        await App.Storage.save(project);
        App.UI.toast('Progetto creato');
        App.UI.renderDashboard();
        return project;
    },

    async deleteProject(projectId) {
        await App.Storage.deleteProject(projectId);
        if (App.state.currentProjectId === projectId) {
            App.state.currentProjectId = null;
        }
        App.UI.toast('Progetto eliminato');
        App.UI.renderDashboard();
    },

    openProject(projectId) {
        App.state.currentProjectId = projectId;
        App.state.baselineActive = false;
        App.state.versionsPanelOpen = false;

        // Ripristina monthWidth da localStorage
        try {
            const saved = localStorage.getItem('gantt_monthWidth_' + projectId);
            App.state.monthWidth = saved ? parseFloat(saved) : null;
        } catch(e) {
            App.state.monthWidth = null;
        }

        // Ripristina leftPanelWidth da localStorage
        try {
            const savedPW = localStorage.getItem('gantt_leftPanelWidth_' + projectId);
            App.state.leftPanelWidth = savedPW ? parseFloat(savedPW) : null;
        } catch(e) {
            App.state.leftPanelWidth = null;
        }

        // Ripristina svgHeight da localStorage
        try {
            const savedH = localStorage.getItem('gantt_svgHeight_' + projectId);
            App.state.svgHeight = savedH ? parseFloat(savedH) : null;
        } catch(e) {
            App.state.svgHeight = null;
        }

        App.UI.showView('gantt');
    },

    backToDashboard() {
        App.state.currentProjectId = null;
        App.state.versionsPanelOpen = false;
        App.state.monthWidth = null;
        App.state.leftPanelWidth = null;
        App.state.svgHeight = null;
        App.UI.showView('dashboard');
    },

    addPhase(name, label) {
        const project = App.getCurrentProject();
        if (!project) return;
        project.phases.push({
            id: App.Utils.generateId('phase'),
            name,
            label,
            activities: []
        });
        this.saveAndRender();
        App.UI.toast('Fase aggiunta');
    },

    addActivity(phaseId, name, startDate, endDate, progress, hasMilestone) {
        const project = App.getCurrentProject();
        if (!project) return;
        const phase = project.phases.find(p => p.id === phaseId);
        if (!phase) return;

        phase.activities.push({
            id: App.Utils.generateId('act'),
            name,
            startDate,
            endDate,
            progress: progress || 0,
            hasMilestone: hasMilestone || false
        });
        this.saveAndRender();
        App.UI.toast('Attività aggiunta');
    },

    addMilestone(date, label, type, color) {
        const project = App.getCurrentProject();
        if (!project) return;
        project.steeringMilestones.push({
            id: App.Utils.generateId('ms'),
            date,
            label,
            type,
            color
        });
        this.saveAndRender();
        App.UI.toast('Milestone aggiunta');
    },

    createSnapshot(name) {
        const project = App.getCurrentProject();
        if (!project) return;

        // Deep clone dei dati correnti (senza snapshots per evitare ricorsione)
        const data = App.Utils.deepClone({
            phases: project.phases,
            steeringMilestones: project.steeringMilestones
        });

        project.snapshots = project.snapshots || [];
        project.snapshots.push({
            id: App.Utils.generateId('snap'),
            name,
            date: new Date().toISOString(),
            data,
            isBaseline: false
        });

        this.saveAndRender();
        App.UI.toast('Snapshot creato');
        if (App.state.versionsPanelOpen) {
            App.UI.renderVersionsPanel();
        }
    },

    setBaseline(snapId) {
        const project = App.getCurrentProject();
        if (!project) return;

        for (const snap of project.snapshots) {
            if (snap.id === snapId) {
                snap.isBaseline = !snap.isBaseline;
            } else {
                snap.isBaseline = false;
            }
        }

        // Attiva/disattiva baseline
        App.state.baselineActive = project.snapshots.some(s => s.isBaseline);

        this.saveAndRender();
        App.UI.renderVersionsPanel();
        App.UI.toast(App.state.baselineActive ? 'Baseline attivata' : 'Baseline rimossa');
    },

    async duplicateProject(projectId) {
        const original = App.state.projects.find(p => p.id === projectId);
        if (!original) return;

        const clone = App.Utils.deepClone(original);

        // New project ID
        const newProjectId = App.Utils.generateId('proj');
        clone.id = newProjectId;
        clone.title = original.title + ' (copia)';
        clone._lastSaved = new Date().toISOString();

        // Build idMap: old ID -> new ID
        const idMap = {};
        for (const phase of clone.phases) {
            const newPhaseId = App.Utils.generateId('phase');
            idMap[phase.id] = newPhaseId;
            phase.id = newPhaseId;

            for (const act of phase.activities) {
                const newActId = App.Utils.generateId('act');
                idMap[act.id] = newActId;
                act.id = newActId;
            }
        }
        for (const ms of clone.steeringMilestones) {
            const newMsId = App.Utils.generateId('ms');
            idMap[ms.id] = newMsId;
            ms.id = newMsId;
        }

        // Update dependency predecessorId references
        for (const phase of clone.phases) {
            for (const act of phase.activities) {
                if (act.dependencies) {
                    for (const dep of act.dependencies) {
                        if (idMap[dep.predecessorId]) {
                            dep.predecessorId = idMap[dep.predecessorId];
                        }
                    }
                }
            }
        }

        // Reset baseline on snapshots
        for (const snap of (clone.snapshots || [])) {
            const newSnapId = App.Utils.generateId('snap');
            idMap[snap.id] = newSnapId;
            snap.id = newSnapId;
            snap.isBaseline = false;
        }

        App.state.projects.push(clone);
        await App.Storage.save(clone);
        App.UI.toast('Progetto duplicato');
        App.UI.renderDashboard();
    },

    deleteSnapshot(snapId) {
        const project = App.getCurrentProject();
        if (!project) return;

        const snap = project.snapshots.find(s => s.id === snapId);
        if (snap?.isBaseline) {
            App.state.baselineActive = false;
        }

        project.snapshots = project.snapshots.filter(s => s.id !== snapId);
        this.saveAndRender();
        App.UI.renderVersionsPanel();
        App.UI.toast('Snapshot eliminato');
    }
};
