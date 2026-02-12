// main.js - Init + funzioni window-scope (onclick handlers)

// === INIT ===
document.addEventListener('DOMContentLoaded', async () => {
    App.Actions.init();

    // Ripristina customToday da localStorage
    try {
        const saved = localStorage.getItem('gantt_customToday');
        if (saved) App.state.customToday = saved;
    } catch(e) {}

    // Ripristina tema da localStorage
    try {
        const savedTheme = localStorage.getItem('gantt_theme');
        if (savedTheme) App.state.theme = JSON.parse(savedTheme);
    } catch(e) {}

    // Ripristina showDependencyArrows da localStorage
    try {
        const savedDeps = localStorage.getItem('gantt_showDependencyArrows');
        if (savedDeps !== null) {
            App.state.showDependencyArrows = savedDeps !== '0';
        }
    } catch(e) {}

    // Ripristina showCriticalPath da localStorage
    try {
        const savedCP = localStorage.getItem('gantt_showCriticalPath');
        if (savedCP !== null) {
            App.state.showCriticalPath = savedCP === '1';
        }
    } catch(e) {}

    // Ripristina dashboardViewMode da localStorage
    try {
        const savedViewMode = localStorage.getItem('gantt_dashboardViewMode');
        if (savedViewMode === 'grid' || savedViewMode === 'list') {
            App.state.dashboardViewMode = savedViewMode;
        }
    } catch(e) {}

    // Tenta riconnessione alla cartella
    if (App.state.fsAccessSupported) {
        await App.Workspace.reconnect();
    }

    // Carica progetti
    App.state.projects = await App.Storage.loadAll();

    // Ripristina stato tools panel
    try {
        if (localStorage.getItem('gantt_toolsPanelCollapsed') === '1') {
            const tp = document.getElementById('tools-panel');
            if (tp) {
                tp.classList.add('collapsed');
                const btn = document.getElementById('tools-panel-toggle');
                if (btn) {
                    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
                    btn.title = 'Espandi pannello';
                }
            }
        }
    } catch(e) {}

    // Mostra dashboard
    App.UI.showView('dashboard');
});

// === WINDOW-SCOPE FUNCTIONS (chiamate da onclick nell'HTML) ===

// Dashboard
function openProject(id) {
    App.Actions.openProject(id);
}

function backToDashboard() {
    App.Actions.backToDashboard();
}

function showNewProjectModal() {
    App.UI.showNewProjectModal();
}

function createNewProject(title, client) {
    App.Actions.createProject(title, client);
}

function deleteProject(id) {
    if (confirm('Eliminare questo progetto?')) {
        App.Actions.deleteProject(id);
    }
}

function exportProject(id) {
    const project = App.state.projects.find(p => p.id === id);
    if (project) {
        App.Storage.exportProjectJSON(project);
        App.UI.toast('Progetto esportato');
    }
}

function duplicateProject(id) {
    App.Actions.duplicateProject(id);
}

function dashboardSearch(query) {
    App.state.dashboardSearch = query;
    App.UI.renderDashboard();
}

function dashboardSort(sortBy) {
    App.state.dashboardSort = sortBy;
    App.UI.renderDashboard();
}

function setDashboardView(mode) {
    App.state.dashboardViewMode = mode;
    try { localStorage.setItem('gantt_dashboardViewMode', mode); } catch(e) {}
    App.UI.renderDashboard();
}

function importProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.gantt.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const project = await App.Storage.importProjectJSON(file);
            App.state.projects.push(project);
            await App.Storage.save(project);
            App.UI.renderDashboard();
            App.UI.toast('Progetto importato');
        } catch (err) {
            App.UI.toast('Errore importazione: ' + err.message, 'error');
        }
    };
    input.click();
}

async function selectWorkspace() {
    const handle = await App.Workspace.selectDirectory();
    if (handle) {
        // Ricarica progetti dalla nuova cartella
        App.state.projects = await App.Storage.loadAll();
        App.UI.renderDashboard();
        App.UI.toast('Cartella di lavoro selezionata');
    }
}

// Undo/Redo
function undoAction() {
    App.History.undo();
}

function redoAction() {
    App.History.redo();
}

// Modal
function closeModal() {
    App.UI.closeModal();
}

// Gantt editing
function showNewPhaseModal() {
    App.UI.showNewPhaseModal();
}

function addPhase(name, label, color) {
    App.Actions.addPhase(name, label, color);
}

function showNewActivityModal() {
    App.UI.showNewActivityModal();
}

function addActivity(phaseId, name, startDate, endDate, progress, hasMilestone, color) {
    App.Actions.addActivity(phaseId, name, startDate, endDate, progress, hasMilestone, color);
}

function showNewMilestoneModal() {
    App.UI.showNewMilestoneModal();
}

function addMilestone(date, label, type, color) {
    App.Actions.addMilestone(date, label, type, color);
}

function showEditActivityModal(phaseId, actId) {
    App.UI.showEditActivityModal(phaseId, actId);
}

function showEditPhaseModal(phaseId) {
    App.UI.showEditPhaseModal(phaseId);
}

function showEditMilestoneModal(msId) {
    App.UI.showEditMilestoneModal(msId);
}

function showEditProjectModal() {
    App.UI.showEditProjectModal();
}

function showProjectOptions(projectId) {
    App.UI.showProjectOptionsPanel(projectId);
}

function dashboardClientFilterChange(client) {
    App.state.dashboardClientFilter = client;
    App.UI.renderDashboard();
}

function showGlobalSettings() {
    App.UI.showGlobalSettingsPanel();
}

function showTodaySettingModal() {
    App.UI.showTodaySettingModal();
}

function showThemeSettingsModal() {
    App.UI.showThemeSettingsModal();
}

function closeSettingsPanel() {
    App.UI.closeSettingsPanel();
}

function toggleToolsPanel() {
    const panel = document.getElementById('tools-panel');
    const btn = document.getElementById('tools-panel-toggle');
    if (!panel) return;
    const collapsed = panel.classList.toggle('collapsed');
    if (btn) {
        if (collapsed) {
            btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
            btn.title = 'Espandi pannello';
        } else {
            btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>';
            btn.title = 'Comprimi pannello';
        }
    }
    try { localStorage.setItem('gantt_toolsPanelCollapsed', collapsed ? '1' : '0'); } catch(e) {}
}

// Dependencies panel
function toggleDepsPanel() {
    App.UI.toggleDepsPanel();
}

// Critical path toggle
function toggleCriticalPath() {
    const checkbox = document.getElementById('deps-critical-toggle');
    if (checkbox) {
        App.state.showCriticalPath = checkbox.checked;
    } else {
        App.state.showCriticalPath = !App.state.showCriticalPath;
    }
    // Attiva automaticamente le frecce se si attiva il percorso critico
    if (App.state.showCriticalPath && !App.state.showDependencyArrows) {
        App.state.showDependencyArrows = true;
        try { localStorage.setItem('gantt_showDependencyArrows', '1'); } catch(e) {}
    }
    try { localStorage.setItem('gantt_showCriticalPath', App.state.showCriticalPath ? '1' : '0'); } catch(e) {}
    _updateCriticalPathButton();
    if (App.state.currentView === 'gantt') {
        App.UI.renderGanttView();
    }
}

function _updateCriticalPathButton() {
    const btn = document.getElementById('btn-toggle-critical');
    if (btn) {
        btn.classList.toggle('tools-btn-active', App.state.showCriticalPath);
    }
}

// Dependency arrows toggle (state only, called from panel checkbox)
function toggleDependencyArrows() {
    const checkbox = document.getElementById('deps-global-toggle');
    if (checkbox) {
        App.state.showDependencyArrows = checkbox.checked;
    } else {
        App.state.showDependencyArrows = !App.state.showDependencyArrows;
    }
    try { localStorage.setItem('gantt_showDependencyArrows', App.state.showDependencyArrows ? '1' : '0'); } catch(e) {}
    if (App.state.currentView === 'gantt') {
        App.UI.renderGanttView();
    }
}

// Export
function exportSVG() {
    App.Exporter.exportSVG();
}

function exportPNG() {
    App.Exporter.exportPNG();
}

// Versioning
function createSnapshot(name) {
    App.Actions.createSnapshot(name);
}

function toggleVersionsPanel() {
    App.UI.toggleVersionsPanel();
}

function setBaseline(snapId) {
    App.Actions.setBaseline(snapId);
}

function restoreSnapshot(snapId) {
    if (confirm('Ripristinare questo snapshot? Verrà creato un backup automatico dello stato corrente.')) {
        App.Actions.restoreSnapshot(snapId);
    }
}

function deleteSnapshot(snapId) {
    if (confirm('Eliminare questo snapshot?')) {
        App.Actions.deleteSnapshot(snapId);
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Undo/Redo (skip se focus su input/textarea)
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            App.History.undo();
            return;
        }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z' && e.shiftKey)) {
            e.preventDefault();
            App.History.redo();
            return;
        }
    }

    if (e.key === 'Escape') {
        closeModal();
        if (App.state.versionsPanelOpen) {
            App.UI.toggleVersionsPanel();
        }
        if (document.getElementById('settings-panel').classList.contains('open')) {
            App.UI.closeSettingsPanel();
        }
        if (document.getElementById('deps-panel').classList.contains('open')) {
            App.UI.toggleDepsPanel();
        }
    }
});
