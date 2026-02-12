// history.js - Undo/Redo per il progetto corrente
App.History = {
    _stack: [],
    _index: -1,
    _maxSize: 30,
    _paused: false,
    _projectId: null,

    init(projectId) {
        this._stack = [];
        this._index = -1;
        this._projectId = projectId;
        this._pushCurrentState();
        this._updateButtons();
    },

    clear() {
        this._stack = [];
        this._index = -1;
        this._projectId = null;
        this._updateButtons();
    },

    pushState() {
        if (this._paused) return;
        this._pushCurrentState();
        this._updateButtons();
    },

    _pushCurrentState() {
        const project = App.getCurrentProject();
        if (!project) return;

        // Tronca history futura
        this._stack = this._stack.slice(0, this._index + 1);

        const snapshot = App.Utils.deepClone({
            phases: project.phases,
            steeringMilestones: project.steeringMilestones,
            title: project.title,
            client: project.client
        });

        this._stack.push(snapshot);

        // Limita dimensione stack
        if (this._stack.length > this._maxSize) {
            this._stack.shift();
        }

        this._index = this._stack.length - 1;
    },

    canUndo() {
        return this._index > 0;
    },

    canRedo() {
        return this._index < this._stack.length - 1;
    },

    async undo() {
        if (!this.canUndo()) return;
        this._index--;
        await this._restore();
        this._updateButtons();
        App.UI.toast('Annullato');
    },

    async redo() {
        if (!this.canRedo()) return;
        this._index++;
        await this._restore();
        this._updateButtons();
        App.UI.toast('Ripristinato');
    },

    async _restore() {
        const project = App.getCurrentProject();
        if (!project) return;

        const snapshot = this._stack[this._index];
        if (!snapshot) return;

        this._paused = true;

        project.phases = App.Utils.deepClone(snapshot.phases);
        project.steeringMilestones = App.Utils.deepClone(snapshot.steeringMilestones);
        project.title = snapshot.title;
        project.client = snapshot.client;

        await App.Storage.save(project);

        if (App.state.currentView === 'gantt') {
            document.getElementById('gantt-project-title').textContent = project.title;
            App.UI.renderGanttView();
        }

        this._paused = false;
    },

    _updateButtons() {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');
        if (undoBtn) {
            undoBtn.disabled = !this.canUndo();
            undoBtn.classList.toggle('btn-disabled', !this.canUndo());
        }
        if (redoBtn) {
            redoBtn.disabled = !this.canRedo();
            redoBtn.classList.toggle('btn-disabled', !this.canRedo());
        }
    }
};
