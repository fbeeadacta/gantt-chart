// planning.js - Vista pianificazione durata attività
App.Planning = {

    _debouncedSave: null,

    _getDebouncedSave() {
        if (!this._debouncedSave) {
            this._debouncedSave = App.Utils.debounce(() => {
                const project = App.getCurrentProject();
                if (project) App.Storage.save(project);
            }, 400);
        }
        return this._debouncedSave;
    },

    render(project, container) {
        if (!project.collaborators) project.collaborators = [];

        container.innerHTML = '';

        // Pool collaboratori
        const pool = document.getElementById('planning-pool');
        pool.innerHTML = this._renderCollabPool(project);

        // Area attività
        const acts = document.getElementById('planning-activities');
        let html = '';
        for (const phase of project.phases) {
            html += `<div class="planning-phase-group">`;
            html += `<div class="planning-phase-title">${App.UI.escapeHtml(phase.name)}</div>`;
            for (const act of phase.activities) {
                html += this._renderActivityCard(project, phase, act);
            }
            if (phase.activities.length === 0) {
                html += `<div class="planning-empty">Nessuna attività in questa fase</div>`;
            }
            html += `</div>`;
        }
        if (project.phases.length === 0) {
            html += `<div class="planning-empty">Nessuna fase nel progetto. Aggiungi fasi e attività dal Gantt.</div>`;
        }
        acts.innerHTML = html;

        this._initDragDrop(project, container);
        this._initInteractions(project, container);
    },

    _renderCollabPool(project) {
        let html = `<div class="pool-title">Collaboratori</div>`;
        for (const c of project.collaborators) {
            html += `
            <div class="pool-card" draggable="true" data-collab-id="${App.UI.escapeAttr(c.id)}">
                <div class="pool-card-grip">
                    <svg width="10" height="16" viewBox="0 0 10 16" fill="var(--gray-400)"><circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/></svg>
                </div>
                <div class="pool-card-info">
                    <span class="pool-card-name">${App.UI.escapeHtml(c.name)}</span>
                    <span class="pool-card-days">
                        <input type="number" class="pool-days-input" data-collab-days="${App.UI.escapeAttr(c.id)}" value="${c.daysPerWeek}" min="0.5" max="7" step="0.5" />
                        <span>gg/s</span>
                    </span>
                </div>
                <button class="pool-card-remove" data-remove-collab="${App.UI.escapeAttr(c.id)}" title="Rimuovi">&times;</button>
            </div>`;
        }
        html += `
        <div class="pool-add-form">
            <input type="text" class="form-input pool-add-name" placeholder="Nome collaboratore" />
            <div class="pool-add-row">
                <input type="number" class="form-input pool-add-days" placeholder="gg/s" min="0.5" max="7" step="0.5" value="5" />
                <button class="btn btn-primary pool-add-btn">+</button>
            </div>
        </div>`;
        return html;
    },

    _renderCalcHtml(calc, act, phase) {
        if (!calc) {
            return `<div class="planning-calc-empty">Aggiungi sotto-attività e collaboratori per calcolare la durata</div>`;
        }
        let html = `<div class="planning-kpis">`;
        html += `
            <div class="planning-kpi">
                <span class="planning-kpi-value">${calc.totalEffort}</span>
                <span class="planning-kpi-label">gg/persona</span>
            </div>
            <div class="planning-kpi planning-kpi-accent">
                <span class="planning-kpi-value">${calc.calendarDays}</span>
                <span class="planning-kpi-label">gg durata</span>
            </div>`;
        if (calc.suggestedEndDate) {
            html += `
            <div class="planning-kpi planning-kpi-accent">
                <span class="planning-kpi-value">${App.Utils.formatDate(calc.suggestedEndDate)}</span>
                <span class="planning-kpi-label">fine stimata</span>
            </div>`;
        }
        html += `</div>`;
        if (calc.suggestedEndDate) {
            html += `<button class="planning-apply-btn" data-apply-duration="${App.UI.escapeAttr(act.id)}" data-apply-date="${calc.suggestedEndDate}" data-apply-phase="${App.UI.escapeAttr(phase.id)}">Applica durata</button>`;
        }
        return html;
    },

    _renderActivityCard(project, phase, act) {
        if (!act.planning) act.planning = { subtasks: [], assignments: [] };
        const p = act.planning;
        const calc = App.Utils.calculatePlannedDuration(p, act.startDate);

        let html = `<details class="planning-act-card" data-act-id="${App.UI.escapeAttr(act.id)}" data-phase-id="${App.UI.escapeAttr(phase.id)}">`;
        html += `<summary class="planning-act-summary">`;
        html += `<span class="planning-act-name">${App.UI.escapeHtml(act.name)}</span>`;
        if (calc) {
            html += `<span class="planning-act-badge">${calc.totalEffort} gg/p &rarr; ${calc.calendarDays} gg cal</span>`;
        } else {
            html += `<span class="planning-act-badge planning-act-badge-empty">&mdash; gg</span>`;
        }
        html += `</summary>`;

        html += `<div class="planning-act-body">`;

        // Two-column layout: subtasks | collaborators
        html += `<div class="planning-columns">`;

        // Left column: sotto-attività
        html += `<div class="planning-col">`;
        html += `<div class="planning-section-label">Sotto-attività</div>`;
        html += `<div class="planning-subtasks">`;
        for (let i = 0; i < p.subtasks.length; i++) {
            const s = p.subtasks[i];
            html += `
            <div class="subtask-row" data-subtask-idx="${i}">
                <input type="text" class="form-input subtask-name" value="${App.UI.escapeAttr(s.name)}" placeholder="Nome sotto-attività" />
                <input type="number" class="form-input subtask-effort" value="${s.effortDays || ''}" placeholder="gg" min="0.5" step="0.5" />
                <span class="subtask-unit">gg</span>
                <button class="planning-remove-btn" data-remove-subtask="${i}" title="Rimuovi">&times;</button>
            </div>`;
        }
        html += `</div>`;
        html += `<button class="btn planning-add-subtask" data-add-subtask>+ Aggiungi sotto-attività</button>`;
        html += `</div>`;

        // Right column: collaboratori
        html += `<div class="planning-col">`;
        html += `<div class="planning-section-label">Collaboratori</div>`;
        html += `<div class="planning-assignments">`;
        if (p.assignments.length === 0) {
            html += `<div class="planning-drop-hint">Trascina qui un collaboratore dal pool</div>`;
        }
        for (let i = 0; i < p.assignments.length; i++) {
            const a = p.assignments[i];
            const collab = (project.collaborators || []).find(c => c.id === a.collaboratorId);
            if (!collab) continue;
            const max = collab.daysPerWeek;
            const val = a.daysPerWeek;
            html += `
            <div class="assignment-row" data-assignment-idx="${i}">
                <span class="assignment-name">${App.UI.escapeHtml(collab.name)}</span>
                <input type="range" class="assignment-slider" min="0" max="${max}" step="0.5" value="${val}" data-assignment-collab="${App.UI.escapeAttr(a.collaboratorId)}" />
                <span class="assignment-value">${val}</span>
                <span class="assignment-unit">gg/s</span>
                <button class="planning-remove-btn" data-remove-assignment="${i}" title="Rimuovi">&times;</button>
            </div>`;
        }
        html += `</div>`;
        html += `</div>`;

        html += `</div>`; // end .planning-columns

        // KPI summary
        html += `<div class="planning-calc">${this._renderCalcHtml(calc, act, phase)}</div>`;

        html += `</div></details>`;
        return html;
    },

    _initDragDrop(project, container) {
        const pool = document.getElementById('planning-pool');
        const acts = document.getElementById('planning-activities');

        // Track drag-enter depth per card to handle child element events
        const enterCount = new WeakMap();

        const clearAllDragOver = () => {
            acts.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        };

        // Dragstart on pool cards
        pool.addEventListener('dragstart', (e) => {
            const card = e.target.closest('.pool-card');
            if (!card) return;
            e.dataTransfer.setData('text/plain', card.dataset.collabId);
            e.dataTransfer.effectAllowed = 'copy';
            card.classList.add('dragging');
        });

        pool.addEventListener('dragend', (e) => {
            const card = e.target.closest('.pool-card');
            if (card) card.classList.remove('dragging');
            // Clean up any stuck highlights
            clearAllDragOver();
        });

        // Prevent drag when interacting with pool inputs
        pool.addEventListener('mousedown', (e) => {
            if (e.target.closest('.pool-days-input')) {
                const card = e.target.closest('.pool-card');
                if (card) card.draggable = false;
            }
        });
        pool.addEventListener('mouseup', (e) => {
            const card = e.target.closest('.pool-card');
            if (card) card.draggable = true;
        });

        // Dragenter/dragleave with counter to avoid child-element flickering
        acts.addEventListener('dragenter', (e) => {
            const card = e.target.closest('.planning-act-card');
            if (!card) return;
            e.preventDefault();
            const count = (enterCount.get(card) || 0) + 1;
            enterCount.set(card, count);
            card.classList.add('drag-over');
        });

        acts.addEventListener('dragleave', (e) => {
            const card = e.target.closest('.planning-act-card');
            if (!card) return;
            const count = (enterCount.get(card) || 0) - 1;
            enterCount.set(card, count);
            if (count <= 0) {
                enterCount.set(card, 0);
                card.classList.remove('drag-over');
            }
        });

        acts.addEventListener('dragover', (e) => {
            const card = e.target.closest('.planning-act-card');
            if (!card) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        acts.addEventListener('drop', (e) => {
            e.preventDefault();
            const card = e.target.closest('.planning-act-card');
            if (!card) return;
            enterCount.set(card, 0);
            card.classList.remove('drag-over');

            const collabId = e.dataTransfer.getData('text/plain');
            if (!collabId) return;

            const actId = card.dataset.actId;
            const phaseId = card.dataset.phaseId;
            const phase = project.phases.find(p => p.id === phaseId);
            const act = phase ? phase.activities.find(a => a.id === actId) : null;
            if (!act) return;

            if (!act.planning) act.planning = { subtasks: [], assignments: [] };

            // Prevent duplicate assignment
            if (act.planning.assignments.some(a => a.collaboratorId === collabId)) {
                App.UI.toast('Collaboratore già assegnato', 'error');
                return;
            }

            const collab = project.collaborators.find(c => c.id === collabId);
            if (!collab) return;

            act.planning.assignments.push({
                collaboratorId: collabId,
                daysPerWeek: collab.daysPerWeek
            });

            this._getDebouncedSave()();
            const newCard = this._rerenderCard(card, project, phase, act);
            newCard.open = true;
        });
    },

    _initInteractions(project, container) {
        const pool = document.getElementById('planning-pool');
        const acts = document.getElementById('planning-activities');

        // Pool: add collaborator
        pool.addEventListener('click', (e) => {
            if (e.target.closest('.pool-add-btn')) {
                const nameInput = pool.querySelector('.pool-add-name');
                const daysInput = pool.querySelector('.pool-add-days');
                const name = (nameInput.value || '').trim();
                const days = parseFloat(daysInput.value) || 5;
                if (!name) { nameInput.focus(); return; }

                project.collaborators.push({
                    id: App.Utils.generateId('collab'),
                    name: name,
                    daysPerWeek: Math.max(0.5, Math.min(7, days))
                });
                nameInput.value = '';
                daysInput.value = '5';
                this._getDebouncedSave()();
                pool.innerHTML = this._renderCollabPool(project);
            }

            // Remove collaborator
            const removeBtn = e.target.closest('[data-remove-collab]');
            if (removeBtn) {
                const id = removeBtn.dataset.removeCollab;
                project.collaborators = project.collaborators.filter(c => c.id !== id);
                // Remove from all assignments
                for (const phase of project.phases) {
                    for (const act of phase.activities) {
                        if (act.planning && act.planning.assignments) {
                            act.planning.assignments = act.planning.assignments.filter(a => a.collaboratorId !== id);
                        }
                    }
                }
                this._getDebouncedSave()();
                pool.innerHTML = this._renderCollabPool(project);
                // Re-render all activity cards
                this.render(project, container);
            }
        });

        // Pool: edit days/week
        pool.addEventListener('input', (e) => {
            const input = e.target.closest('.pool-days-input');
            if (!input) return;
            const id = input.dataset.collabDays;
            const collab = project.collaborators.find(c => c.id === id);
            if (!collab) return;
            const val = parseFloat(input.value);
            if (!val || val < 0.5 || val > 7) return;
            collab.daysPerWeek = val;
            // Update max on sliders already assigned to this collaborator
            acts.querySelectorAll(`.assignment-slider[data-assignment-collab="${id}"]`).forEach(slider => {
                slider.max = val;
                if (parseFloat(slider.value) > val) {
                    slider.value = val;
                    slider.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            this._getDebouncedSave()();
        });

        // Pool: allow Enter key to add
        pool.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.closest('.pool-add-name')) {
                pool.querySelector('.pool-add-btn').click();
            }
        });

        // Activities: event delegation
        acts.addEventListener('click', (e) => {
            const card = e.target.closest('.planning-act-card');
            if (!card) return;
            const { act, phase } = this._getActFromCard(card, project);
            if (!act) return;

            // Add subtask
            if (e.target.closest('[data-add-subtask]')) {
                if (!act.planning) act.planning = { subtasks: [], assignments: [] };
                act.planning.subtasks.push({
                    id: App.Utils.generateId('sub'),
                    name: '',
                    effortDays: 0
                });
                this._getDebouncedSave()();
                const newCard = this._rerenderCard(card, project, phase, act);
                // Focus new input
                setTimeout(() => {
                    const rows = newCard.querySelectorAll('.subtask-name');
                    if (rows.length) rows[rows.length - 1].focus();
                }, 50);
                return;
            }

            // Remove subtask
            const removeSubBtn = e.target.closest('[data-remove-subtask]');
            if (removeSubBtn) {
                const idx = parseInt(removeSubBtn.dataset.removeSubtask);
                act.planning.subtasks.splice(idx, 1);
                this._getDebouncedSave()();
                this._rerenderCard(card, project, phase, act);
                return;
            }

            // Remove assignment
            const removeAssBtn = e.target.closest('[data-remove-assignment]');
            if (removeAssBtn) {
                const idx = parseInt(removeAssBtn.dataset.removeAssignment);
                act.planning.assignments.splice(idx, 1);
                this._getDebouncedSave()();
                this._rerenderCard(card, project, phase, act);
                return;
            }

            // Apply duration
            const applyBtn = e.target.closest('[data-apply-duration]');
            if (applyBtn) {
                const newEnd = applyBtn.dataset.applyDate;
                if (newEnd) {
                    act.endDate = newEnd;
                    App.Actions.saveAndRender();
                    App.UI.toast('Durata applicata: fine ' + App.Utils.formatDate(newEnd));
                }
                return;
            }
        });

        // Subtask input changes
        acts.addEventListener('input', (e) => {
            const card = e.target.closest('.planning-act-card');
            if (!card) return;
            const { act, phase } = this._getActFromCard(card, project);
            if (!act || !act.planning) return;

            // Subtask name
            if (e.target.classList.contains('subtask-name')) {
                const row = e.target.closest('.subtask-row');
                const idx = parseInt(row.dataset.subtaskIdx);
                act.planning.subtasks[idx].name = e.target.value;
                this._getDebouncedSave()();
                return;
            }

            // Subtask effort
            if (e.target.classList.contains('subtask-effort')) {
                const row = e.target.closest('.subtask-row');
                const idx = parseInt(row.dataset.subtaskIdx);
                act.planning.subtasks[idx].effortDays = parseFloat(e.target.value) || 0;
                this._getDebouncedSave()();
                this._recalcCard(card, project, phase, act);
                return;
            }

            // Assignment slider
            if (e.target.classList.contains('assignment-slider')) {
                const row = e.target.closest('.assignment-row');
                const idx = parseInt(row.dataset.assignmentIdx);
                const val = parseFloat(e.target.value);
                act.planning.assignments[idx].daysPerWeek = val;
                row.querySelector('.assignment-value').textContent = val;
                this._getDebouncedSave()();
                this._recalcCard(card, project, phase, act);
                return;
            }
        });
    },

    _getActFromCard(card, project) {
        const actId = card.dataset.actId;
        const phaseId = card.dataset.phaseId;
        const phase = project.phases.find(p => p.id === phaseId);
        const act = phase ? phase.activities.find(a => a.id === actId) : null;
        return { act, phase };
    },

    _rerenderCard(card, project, phase, act) {
        const wasOpen = card.open;
        const temp = document.createElement('div');
        temp.innerHTML = this._renderActivityCard(project, phase, act);
        const newCard = temp.firstElementChild;
        card.replaceWith(newCard);
        newCard.open = wasOpen;
        return newCard;
    },

    _recalcCard(card, project, phase, act) {
        const calc = App.Utils.calculatePlannedDuration(act.planning, act.startDate);

        // Update badge in summary
        const badge = card.querySelector('.planning-act-badge');
        if (badge) {
            if (calc) {
                badge.textContent = `${calc.totalEffort} gg/p → ${calc.calendarDays} gg cal`;
                badge.classList.remove('planning-act-badge-empty');
            } else {
                badge.innerHTML = '&mdash; gg';
                badge.classList.add('planning-act-badge-empty');
            }
        }

        // Update calc section
        const calcSection = card.querySelector('.planning-calc');
        if (calcSection) {
            calcSection.innerHTML = this._renderCalcHtml(calc, act, phase);
        }
    }
};
