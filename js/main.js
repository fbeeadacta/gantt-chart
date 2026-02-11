// main.js - Init + funzioni window-scope (onclick handlers)

// === INIT ===
document.addEventListener('DOMContentLoaded', async () => {
    App.Actions.init();

    // Ripristina customToday da localStorage
    try {
        const saved = localStorage.getItem('gantt_customToday');
        if (saved) App.state.customToday = saved;
    } catch(e) {}

    // Tenta riconnessione alla cartella
    if (App.state.fsAccessSupported) {
        await App.Workspace.reconnect();
    }

    // Carica progetti
    App.state.projects = await App.Storage.loadAll();

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

function createNewProject(title) {
    App.Actions.createProject(title);
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

// Modal
function closeModal() {
    App.UI.closeModal();
}

// Gantt editing
function showNewPhaseModal() {
    App.UI.showNewPhaseModal();
}

function addPhase(name, label) {
    App.Actions.addPhase(name, label);
}

function showNewActivityModal() {
    App.UI.showNewActivityModal();
}

function addActivity(phaseId, name, startDate, endDate, progress, hasMilestone) {
    App.Actions.addActivity(phaseId, name, startDate, endDate, progress, hasMilestone);
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

function showTodaySettingModal() {
    App.UI.showTodaySettingModal();
}

// Export
function exportSVG() {
    App.Exporter.exportSVG();
}

function exportPNG() {
    App.Exporter.exportPNG();
}

// Versioning
function showNewSnapshotModal() {
    App.UI.showNewSnapshotModal();
}

function createSnapshot(name) {
    App.Actions.createSnapshot(name);
}

function toggleVersionsPanel() {
    App.UI.toggleVersionsPanel();
}

function setBaseline(snapId) {
    App.Actions.setBaseline(snapId);
}

function deleteSnapshot(snapId) {
    if (confirm('Eliminare questo snapshot?')) {
        App.Actions.deleteSnapshot(snapId);
    }
}

function toggleBaseline() {
    App.Actions.toggleBaseline();
}

// Keyboard shortcut: Escape chiude modale
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        if (App.state.versionsPanelOpen) {
            App.UI.toggleVersionsPanel();
        }
    }
});
