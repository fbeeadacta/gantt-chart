// ui.js - Rendering UI: dashboard, toolbar, modali, toast
App.UI = {
    // === DASHBOARD ===

    _getProjectStatus(project) {
        const phases = project.phases || [];
        let totalActs = 0;
        let completedActs = 0;
        let hasLateAct = false;
        const today = App.Utils.getToday();

        for (const ph of phases) {
            for (const act of (ph.activities || [])) {
                totalActs++;
                if (act.progress >= 100) {
                    completedActs++;
                } else {
                    const end = App.Utils.parseDate(act.endDate);
                    if (end && end < today) hasLateAct = true;
                }
            }
        }

        if (totalActs === 0) return { label: 'Non avviato', color: 'gray' };
        if (completedActs === totalActs) return { label: 'Completato', color: 'green' };
        if (hasLateAct) return { label: 'In ritardo', color: 'red' };

        // Check if project is in progress (today within project range)
        let minDate = null, maxDate = null;
        for (const ph of phases) {
            for (const act of (ph.activities || [])) {
                const s = App.Utils.parseDate(act.startDate);
                const e = App.Utils.parseDate(act.endDate);
                if (s && (!minDate || s < minDate)) minDate = s;
                if (e && (!maxDate || e > maxDate)) maxDate = e;
            }
        }
        if (minDate && maxDate && today >= minDate && today <= maxDate) {
            return { label: 'In corso', color: 'blue' };
        }

        return { label: 'Non avviato', color: 'gray' };
    },

    _computeCardData(project) {
        const phases = project.phases || [];
        const phaseCount = phases.length;
        let actCount = 0;
        let minDate = null, maxDate = null;
        let totalDuration = 0, totalWeightedProgress = 0;

        for (const ph of phases) {
            const acts = ph.activities || [];
            actCount += acts.length;
            for (const a of acts) {
                const s = App.Utils.parseDate(a.startDate);
                const e = App.Utils.parseDate(a.endDate);
                if (s && (!minDate || s < minDate)) minDate = s;
                if (e && (!maxDate || e > maxDate)) maxDate = e;
                const dur = (s && e) ? App.Utils.daysBetween(s, e) : 0;
                totalDuration += dur;
                totalWeightedProgress += (a.progress || 0) * dur;
            }
        }

        const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
        const periodo = minDate && maxDate
            ? `${MESI_BREVI[minDate.getMonth()]} ${String(minDate.getFullYear()).slice(2)} - ${MESI_BREVI[maxDate.getMonth()]} ${String(maxDate.getFullYear()).slice(2)}`
            : 'Nessuna attività';

        const phasesProgress = phases.map(ph => {
            const acts = ph.activities || [];
            if (acts.length === 0) return { name: ph.label || ph.name, progress: 0 };
            let phDur = 0, phWeighted = 0;
            for (const a of acts) {
                const s = App.Utils.parseDate(a.startDate);
                const e = App.Utils.parseDate(a.endDate);
                const dur = (s && e) ? App.Utils.daysBetween(s, e) : 0;
                phDur += dur;
                phWeighted += (a.progress || 0) * dur;
            }
            return { name: ph.label || ph.name, progress: phDur > 0 ? Math.round(phWeighted / phDur) : 0 };
        });

        const lastSaved = project._lastSaved
            ? new Date(project._lastSaved).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '-';

        const avgProgress = totalDuration > 0 ? Math.round(totalWeightedProgress / totalDuration) : 0;
        const status = this._getProjectStatus(project);

        return { phaseCount, actCount, periodo, lastSaved, avgProgress, status, client: project.client || '', phasesProgress };
    },

    _getProjectMinDate(project) {
        let minDate = null;
        for (const ph of (project.phases || [])) {
            for (const a of (ph.activities || [])) {
                const s = App.Utils.parseDate(a.startDate);
                if (s && (!minDate || s < minDate)) minDate = s;
            }
        }
        return minDate ? App.Utils.toISODate(minDate) : '9999-12-31';
    },

    _getUniqueClients() {
        const clients = new Set();
        for (const p of App.state.projects) {
            if (p.client) clients.add(p.client);
        }
        return [...clients].sort((a, b) => a.localeCompare(b));
    },

    renderDashboard() {
        const grid = document.getElementById('project-grid');
        grid.innerHTML = '';

        // Stato connessione workspace
        this.updateWorkspaceStatus();

        // Sync state from DOM controls (in case renderDashboard is called externally)
        const searchInput = document.getElementById('dashboard-search-input');
        if (searchInput) App.state.dashboardSearch = searchInput.value;

        const sortSelect = document.getElementById('dashboard-sort-select');
        if (sortSelect) App.state.dashboardSort = sortSelect.value;

        // Update view toggle active state
        this._updateViewToggle();

        if (App.state.projects.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <h3>Nessun progetto</h3>
                    <p>Crea un nuovo progetto o importa un file .gantt.json</p>
                </div>`;
            return;
        }

        // Filter by search
        const query = (App.state.dashboardSearch || '').toLowerCase().trim();
        let filtered = App.state.projects;
        if (query) {
            filtered = filtered.filter(p =>
                (p.title || '').toLowerCase().includes(query) ||
                (p.client || '').toLowerCase().includes(query)
            );
        }

        // Filter by client
        const clientFilter = App.state.dashboardClientFilter;
        if (clientFilter) {
            filtered = filtered.filter(p => (p.client || '') === clientFilter);
        }

        // Update client filter dropdown options
        this._updateClientFilterDropdown();

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <h3>Nessun risultato</h3>
                    <p>Nessun progetto corrisponde alla ricerca</p>
                </div>`;
            return;
        }

        // Sort
        filtered = [...filtered];
        const sortBy = App.state.dashboardSort;
        if (sortBy === 'nameAsc') {
            filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        } else if (sortBy === 'nameDesc') {
            filtered.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
        } else if (sortBy === 'startDate') {
            filtered.sort((a, b) => this._getProjectMinDate(a).localeCompare(this._getProjectMinDate(b)));
        } else {
            // lastSaved (default, most recent first)
            filtered.sort((a, b) => (b._lastSaved || '').localeCompare(a._lastSaved || ''));
        }

        // Render based on view mode
        if (App.state.dashboardViewMode === 'list') {
            this._renderDashboardList(filtered, grid);
        } else {
            this._renderDashboardGrid(filtered, grid);
        }
    },

    _renderDashboardGrid(projects, grid) {
        grid.className = 'project-grid-view';

        for (const p of projects) {
            const data = this._computeCardData(p);
            const card = document.createElement('div');
            card.className = 'project-card';
            card.onclick = () => openProject(p.id);

            card.innerHTML = `
                <div class="card-header">
                    <div class="card-title-group">
                        <h3 class="card-title">${this.escapeHtml(p.title)}</h3>
                        ${data.client ? `<span class="card-client">${this.escapeHtml(data.client)}</span>` : ''}
                        <span class="status-badge status-badge-${data.status.color}">${data.status.label}</span>
                    </div>
                    <div class="card-actions" onclick="event.stopPropagation()">
                        <button class="btn-icon" onclick="showProjectOptions('${p.id}')" title="Opzioni">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="card-stat"><span class="stat-label">Periodo</span><span class="stat-value">${data.periodo}</span></div>
                    <div class="card-stat"><span class="stat-label">Aggiornato</span><span class="stat-value">${data.lastSaved}</span></div>
                    ${data.phasesProgress.length > 0 ? `
                    <div class="card-phases-row">
                        ${data.phasesProgress.map(ph => this._renderPhaseCircle(ph)).join('')}
                    </div>` : ''}
                </div>
                <div class="card-progress">
                    <div class="card-progress-bar">
                        <div class="card-progress-fill" style="width:${data.avgProgress}%"></div>
                    </div>
                    <span class="card-progress-label">${data.avgProgress}%</span>
                </div>`;

            grid.appendChild(card);
        }
    },

    _renderPhaseCircle(phase) {
        const size = 28;
        const r = 10;
        const circ = 2 * Math.PI * r;
        const pct = phase.progress;
        const title = this.escapeAttr(phase.name + ' \u2014 ' + pct + '%');

        if (pct >= 100) {
            return `<div class="phase-circle" title="${title}">
                <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                    <circle cx="14" cy="14" r="${r}" fill="var(--success)" />
                    <polyline points="9,14 12.5,17.5 19,11" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>`;
        }

        const offset = circ - (circ * pct / 100);
        return `<div class="phase-circle" title="${title}">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                <circle cx="14" cy="14" r="${r}" fill="none" stroke="var(--gray-200)" stroke-width="3"/>
                <circle cx="14" cy="14" r="${r}" fill="none" stroke="var(--primary)" stroke-width="3"
                    stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
                    transform="rotate(-90 14 14)" stroke-linecap="round"/>
                <text x="14" y="14" text-anchor="middle" dominant-baseline="central"
                    font-size="8" font-weight="600" fill="var(--gray-600)">${pct}</text>
            </svg>
        </div>`;
    },

    _renderDashboardList(projects, grid) {
        grid.className = 'project-list-view';

        // Header
        const header = document.createElement('div');
        header.className = 'project-list-header';
        header.innerHTML = `
            <span class="list-col-name">Progetto</span>
            <span class="list-col-client">Cliente</span>
            <span class="list-col-status">Stato</span>
            <span class="list-col-progress">Avanzamento</span>
            <span class="list-col-period">Periodo</span>
            <span class="list-col-phases">Fasi</span>
            <span class="list-col-acts">Attività</span>
            <span class="list-col-updated">Aggiornato</span>
            <span class="list-col-actions">Azioni</span>`;
        grid.appendChild(header);

        for (const p of projects) {
            const data = this._computeCardData(p);
            const row = document.createElement('div');
            row.className = 'project-list-row';
            row.onclick = () => openProject(p.id);

            row.innerHTML = `
                <span class="list-col-name">${this.escapeHtml(p.title)}</span>
                <span class="list-col-client">${this.escapeHtml(data.client)}</span>
                <span class="list-col-status"><span class="status-badge status-badge-${data.status.color}">${data.status.label}</span></span>
                <span class="list-col-progress">
                    <span class="list-progress-bar"><span class="card-progress-fill" style="width:${data.avgProgress}%"></span></span>
                    <span class="list-progress-label">${data.avgProgress}%</span>
                </span>
                <span class="list-col-period">${data.periodo}</span>
                <span class="list-col-phases">${data.phaseCount}</span>
                <span class="list-col-acts">${data.actCount}</span>
                <span class="list-col-updated">${data.lastSaved}</span>
                <span class="list-col-actions" onclick="event.stopPropagation()">
                    <button class="btn-icon" onclick="showProjectOptions('${p.id}')" title="Opzioni">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                    </button>
                </span>`;
            grid.appendChild(row);
        }
    },

    _updateViewToggle() {
        const gridBtn = document.getElementById('view-toggle-grid');
        const listBtn = document.getElementById('view-toggle-list');
        if (gridBtn) gridBtn.classList.toggle('active', App.state.dashboardViewMode === 'grid');
        if (listBtn) listBtn.classList.toggle('active', App.state.dashboardViewMode === 'list');
    },

    _updateClientFilterDropdown() {
        const select = document.getElementById('dashboard-client-filter');
        if (!select) return;
        const clients = this._getUniqueClients();
        const current = App.state.dashboardClientFilter;
        let html = '<option value="">Tutti i clienti</option>';
        for (const c of clients) {
            html += `<option value="${this.escapeAttr(c)}" ${c === current ? 'selected' : ''}>${this.escapeHtml(c)}</option>`;
        }
        select.innerHTML = html;
    },

    updateWorkspaceStatus() {
        const el = document.getElementById('workspace-status');
        if (!el) return;

        let icon, color, title;
        if (!App.state.fsAccessSupported) {
            icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
            color = 'var(--warning)';
            title = 'Salvataggio automatico non disponibile';
        } else if (App.state.dirHandle) {
            icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
            color = 'var(--success)';
            title = 'Cartella di lavoro connessa';
        } else {
            icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
            color = 'var(--gray-400)';
            title = 'Nessuna cartella di lavoro selezionata';
        }

        el.innerHTML = `<button class="workspace-status-btn" onclick="showGlobalSettings()" title="${title}" style="color:${color}">${icon}<span class="workspace-status-dot" style="background:${color}"></span></button>`;
    },

    // === GANTT VIEW ===
    renderGanttView() {
        const project = App.getCurrentProject();
        if (!project) return;

        document.getElementById('gantt-project-title').textContent = project.title;

        // Render SVG Gantt
        const container = document.getElementById('gantt-svg-container');
        App.Gantt.render(project, container);

        // Aggiungi event listeners per double-click editing
        this.attachGanttListeners(container);

    },

    attachGanttListeners(container) {
        const svg = container.querySelector('svg');
        if (!svg) return;

        // Inizializza drag sulle barre attività
        const project = App.getCurrentProject();
        if (project) {
            const layout = App.Gantt.computeLayout(project);
            App.Drag.init(svg, layout);
        }

        svg.addEventListener('dblclick', (e) => {
            // Blocca dblclick se appena finito un drag
            if (App.Drag._justDragged) return;

            const target = e.target;
            // Supporto click su tspan dentro text (per testi multiriga)
            const parent = target.parentElement;

            // Click su barra attività
            const actId = target.getAttribute('data-activity-id') || parent?.getAttribute('data-activity-id');
            const phaseId = target.getAttribute('data-phase-id') || parent?.getAttribute('data-phase-id');
            if (actId && phaseId) {
                showEditActivityModal(phaseId, actId);
                return;
            }

            // Click su milestone steering o barra fase
            const msId = target.getAttribute('data-id') || parent?.getAttribute('data-id')
                || target.getAttribute('data-ms-id') || parent?.getAttribute('data-ms-id');
            if (msId && msId.startsWith('ms_')) {
                showEditMilestoneModal(msId);
                return;
            }

            // Click su barra sommario fase
            if (msId && msId.startsWith('phase_')) {
                showEditPhaseModal(msId);
                return;
            }
        });
    },

    // === MODALS ===
    showModal(title, content, onSave, onDelete) {
        const overlay = document.getElementById('modal-overlay');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        const modalFooter = document.getElementById('modal-footer');

        modalTitle.textContent = title;
        modalBody.innerHTML = content;

        let footer = '';
        if (onDelete) {
            footer += `<button class="btn btn-danger" id="modal-delete-btn">Elimina</button>`;
        }
        footer += `<div class="modal-footer-right">`;
        footer += `<button class="btn btn-secondary" onclick="closeModal()">Annulla</button>`;
        if (onSave) {
            footer += `<button class="btn btn-primary" id="modal-save-btn">Salva</button>`;
        }
        footer += `</div>`;
        modalFooter.innerHTML = footer;

        if (onSave) {
            document.getElementById('modal-save-btn').onclick = () => {
                onSave();
                this.closeModal();
            };
        }
        if (onDelete) {
            document.getElementById('modal-delete-btn').onclick = () => {
                if (confirm('Sei sicuro di voler eliminare questo elemento?')) {
                    onDelete();
                    this.closeModal();
                }
            };
        }

        overlay.classList.add('visible');
    },

    closeModal() {
        document.getElementById('modal-overlay').classList.remove('visible');
    },

    // === Modal: Nuovo Progetto ===
    showNewProjectModal() {
        this.showModal('Nuovo Progetto', `
            <div class="form-group">
                <label>Titolo del progetto</label>
                <input type="text" id="input-project-title" value="Nuovo Progetto" class="form-input" />
            </div>
            <div class="form-group">
                <label>Cliente (opzionale)</label>
                <input type="text" id="input-project-client" class="form-input" placeholder="Es. Acme S.p.A." />
            </div>
        `, () => {
            const title = document.getElementById('input-project-title').value.trim();
            const client = document.getElementById('input-project-client').value.trim();
            if (!title) return;
            createNewProject(title, client);
        });
        setTimeout(() => {
            const inp = document.getElementById('input-project-title');
            if (inp) { inp.focus(); inp.select(); }
        }, 100);
    },

    // === Modal: Modifica Progetto (titolo) ===
    showEditProjectModal() {
        const project = App.getCurrentProject();
        if (!project) return;
        this.showModal('Modifica Progetto', `
            <div class="form-group">
                <label>Titolo</label>
                <input type="text" id="input-project-title" value="${this.escapeAttr(project.title)}" class="form-input" />
            </div>
        `, () => {
            const title = document.getElementById('input-project-title').value.trim();
            if (title) {
                project.title = title;
                App.Actions.saveAndRender();
            }
        });
    },

    // === Panel: Opzioni Progetto ===
    showProjectOptionsPanel(projectId) {
        const project = projectId
            ? App.state.projects.find(p => p.id === projectId)
            : App.getCurrentProject();
        if (!project) return;
        const fromDashboard = App.state.currentView === 'dashboard';

        const body = document.getElementById('settings-panel-body');
        body.innerHTML = `
            <div class="form-group">
                <label>Titolo progetto</label>
                <input type="text" id="input-opt-title" value="${this.escapeAttr(project.title)}" class="form-input" />
            </div>
            <div class="form-group">
                <label>Cliente</label>
                <input type="text" id="input-opt-client" value="${this.escapeAttr(project.client || '')}" class="form-input" placeholder="Es. Acme S.p.A." />
            </div>
            <div class="settings-actions">
                <button class="btn btn-primary" id="panel-opt-save-btn">Salva</button>
            </div>
            <div class="project-options-actions">
                <button class="btn" id="panel-opt-export">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Esporta JSON
                </button>
                <button class="btn" id="panel-opt-duplicate">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Duplica progetto
                </button>
                <button class="btn btn-danger" id="panel-opt-delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Elimina progetto
                </button>
            </div>
        `;

        this.openSettingsPanel('Opzioni Progetto');

        document.getElementById('panel-opt-save-btn').onclick = async () => {
            const title = document.getElementById('input-opt-title').value.trim();
            const client = document.getElementById('input-opt-client').value.trim();
            if (title) project.title = title;
            project.client = client;
            await App.Storage.save(project);
            this.closeSettingsPanel();
            if (fromDashboard) {
                this.renderDashboard();
            } else {
                this.renderGanttView();
            }
        };

        document.getElementById('panel-opt-export').onclick = () => {
            exportProject(project.id);
        };

        document.getElementById('panel-opt-duplicate').onclick = async () => {
            this.closeSettingsPanel();
            await App.Actions.duplicateProject(project.id);
            if (!fromDashboard) App.Actions.backToDashboard();
        };

        document.getElementById('panel-opt-delete').onclick = () => {
            if (confirm('Eliminare questo progetto?')) {
                this.closeSettingsPanel();
                App.Actions.deleteProject(project.id);
                if (!fromDashboard) App.Actions.backToDashboard();
            }
        };
    },

    // === Panel: Nuova Fase ===
    showNewPhaseModal() {
        const project = App.getCurrentProject();
        if (!project) return;
        const nextNum = project.phases.length + 1;

        this.showPanel('Nuova Fase', `
            <div class="form-group">
                <label>Nome fase</label>
                <input type="text" id="input-phase-name" placeholder="Es. Assessment e Disegno To-Be" class="form-input" />
            </div>
            <div class="form-group">
                <label>Etichetta breve (pannello sinistro)</label>
                <input type="text" id="input-phase-label" value="FASE ${nextNum}" class="form-input" />
            </div>
        `, () => {
            const name = document.getElementById('input-phase-name').value.trim();
            const label = document.getElementById('input-phase-label').value.trim();
            if (!name) return;
            addPhase(name, label || `FASE ${nextNum}`);
        });
    },

    // === Panel: Modifica Fase ===
    showEditPhaseModal(phaseId) {
        const project = App.getCurrentProject();
        if (!project) return;
        const phase = project.phases.find(p => p.id === phaseId);
        if (!phase) return;

        this.showPanel('Modifica Fase', `
            <div class="form-group">
                <label>Nome fase</label>
                <input type="text" id="input-phase-name" value="${this.escapeAttr(phase.name)}" class="form-input" />
            </div>
            <div class="form-group">
                <label>Etichetta breve</label>
                <input type="text" id="input-phase-label" value="${this.escapeAttr(phase.label)}" class="form-input" />
            </div>
        `, () => {
            phase.name = document.getElementById('input-phase-name').value.trim() || phase.name;
            phase.label = document.getElementById('input-phase-label').value.trim() || phase.label;
            App.Actions.saveAndRender();
        }, () => {
            project.phases = project.phases.filter(p => p.id !== phaseId);
            App.Actions.saveAndRender();
        });
    },

    // === Panel: Nuova Attività ===
    showNewActivityModal() {
        const project = App.getCurrentProject();
        if (!project) return;

        if (project.phases.length === 0) {
            this.toast('Crea prima una fase', 'warning');
            return;
        }

        const phaseOptions = project.phases.map(p =>
            `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`
        ).join('');

        const today = App.Utils.toISODate(App.Utils.getToday());
        const nextMonth = new Date(App.Utils.getToday());
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const nextMonthStr = App.Utils.toISODate(nextMonth);

        this.showPanel('Nuova Attività', `
            <div class="form-group">
                <label>Fase</label>
                <select id="input-act-phase" class="form-input">${phaseOptions}</select>
            </div>
            <div class="form-group">
                <label>Nome attività</label>
                <input type="text" id="input-act-name" placeholder="Es. Analisi As-Is" class="form-input" />
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Data inizio</label>
                    <input type="date" id="input-act-start" value="${today}" class="form-input" />
                </div>
                <div class="form-group">
                    <label>Data fine</label>
                    <input type="date" id="input-act-end" value="${nextMonthStr}" class="form-input" />
                </div>
                <div class="form-group">
                    <label>Durata (gg)</label>
                    <input type="number" id="input-act-duration" min="1" value="${App.Utils.daysBetween(App.Utils.parseDate(today), nextMonth)}" class="form-input" style="max-width:90px;" />
                </div>
            </div>
            <div class="form-group">
                <label>Avanzamento: <span id="progress-val">0</span>%</label>
                <input type="range" id="input-act-progress" min="0" max="100" value="0" class="form-range"
                    oninput="document.getElementById('progress-val').textContent=this.value" />
            </div>
            <div class="form-group">
                <label class="form-checkbox">
                    <input type="checkbox" id="input-act-milestone" />
                    <span>Milestone di fine (diamante)</span>
                </label>
            </div>
            <details class="segments-collapsible">
                <summary>Segmenti aggiuntivi</summary>
                <div class="segments-collapsible-body">
                    <div id="segments-container"></div>
                    <button type="button" id="btn-add-segment" class="btn btn-secondary" style="margin-top:8px;font-size:12px;">+ Aggiungi segmento</button>
                </div>
            </details>
            <details class="segments-collapsible">
                <summary>Dipendenze</summary>
                <div class="segments-collapsible-body">
                    <div id="deps-container"></div>
                    <button type="button" id="btn-add-dep" class="btn btn-secondary" style="margin-top:8px;font-size:12px;">+ Aggiungi dipendenza</button>
                </div>
            </details>
        `, () => {
            const phaseId = document.getElementById('input-act-phase').value;
            const name = document.getElementById('input-act-name').value.trim();
            const startDate = document.getElementById('input-act-start').value;
            const endDate = document.getElementById('input-act-end').value;
            const progress = parseInt(document.getElementById('input-act-progress').value);
            const hasMilestone = document.getElementById('input-act-milestone').checked;
            if (!name) return;

            // Raccolta segmenti
            const segRows = document.querySelectorAll('#segments-container .segment-row');
            const segments = [];
            segRows.forEach(row => {
                const sd = row.querySelector('.seg-start').value;
                const ed = row.querySelector('.seg-end').value;
                const pr = parseInt(row.querySelector('.seg-progress').value) || 0;
                const incPhase = row.querySelector('.seg-include-phase')?.checked !== false;
                const hasMil = row.querySelector('.seg-milestone')?.checked || false;
                if (sd && ed) {
                    segments.push({ startDate: sd, endDate: ed, progress: pr, includeInPhase: incPhase, hasMilestone: hasMil });
                }
            });

            // Raccolta dipendenze
            const depRows = document.querySelectorAll('#deps-container .dep-row');
            const deps = [];
            depRows.forEach(row => {
                const predId = row.querySelector('.dep-predecessor')?.value;
                const fromPoint = row.querySelector('.dep-from-point')?.value;
                const toPoint = row.querySelector('.dep-to-point')?.value;
                const offset = parseInt(row.querySelector('.dep-offset')?.value) || 0;
                if (predId) {
                    deps.push({ predecessorId: predId, fromPoint: fromPoint || 'end', toPoint: toPoint || 'start', offsetDays: offset });
                }
            });

            addActivity(phaseId, name, startDate, endDate, progress, hasMilestone);

            // Applica segmenti e dipendenze all'attività appena creata
            const project = App.getCurrentProject();
            const phase = project.phases.find(p => p.id === phaseId);
            if (phase) {
                const act = phase.activities[phase.activities.length - 1];
                if (act) {
                    if (segments.length > 0) act.segments = segments;
                    if (deps.length > 0) {
                        act.dependencies = deps;
                        App.Dependencies.applyOwnDependencies(project, act.id);
                        App.Dependencies.cascadeDependents(project, act.id);
                    }
                    App.Actions.saveAndRender();
                }
            }
        });

        this._initSegmentButtons();
        this._initDurationSync();
        this._initDependencyButtons(null);
    },

    // === Panel: Modifica Attività ===
    showEditActivityModal(phaseId, actId) {
        const project = App.getCurrentProject();
        if (!project) return;
        let act = null;
        let currentPhaseId = phaseId;
        for (const ph of project.phases) {
            const found = ph.activities.find(a => a.id === actId);
            if (found) { act = found; currentPhaseId = ph.id; break; }
        }
        if (!act) return;

        const phaseOptions = project.phases.map(p =>
            `<option value="${p.id}" ${p.id === currentPhaseId ? 'selected' : ''}>${this.escapeHtml(p.name)}</option>`
        ).join('');

        this.showPanel('Modifica Attività', `
            <div class="form-group">
                <label>Fase</label>
                <select id="input-act-phase" class="form-input">${phaseOptions}</select>
            </div>
            <div class="form-group">
                <label>Nome attività</label>
                <input type="text" id="input-act-name" value="${this.escapeAttr(act.name)}" class="form-input" />
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Data inizio</label>
                    <input type="date" id="input-act-start" value="${act.startDate}" class="form-input" />
                </div>
                <div class="form-group">
                    <label>Data fine</label>
                    <input type="date" id="input-act-end" value="${act.endDate}" class="form-input" />
                </div>
                <div class="form-group">
                    <label>Durata (gg)</label>
                    <input type="number" id="input-act-duration" min="1" value="${App.Utils.daysBetween(App.Utils.parseDate(act.startDate), App.Utils.parseDate(act.endDate))}" class="form-input" style="max-width:90px;" />
                </div>
            </div>
            <div class="form-group">
                <label>Avanzamento: <span id="progress-val">${act.progress || 0}</span>%</label>
                <input type="range" id="input-act-progress" min="0" max="100" value="${act.progress || 0}" class="form-range"
                    oninput="document.getElementById('progress-val').textContent=this.value" />
            </div>
            <div class="form-group">
                <label class="form-checkbox">
                    <input type="checkbox" id="input-act-milestone" ${act.hasMilestone ? 'checked' : ''} />
                    <span>Milestone di fine (diamante)</span>
                </label>
            </div>
            <details class="segments-collapsible">
                <summary>Segmenti aggiuntivi${(act.segments || []).length ? ` (${(act.segments || []).length})` : ''}</summary>
                <div class="segments-collapsible-body">
                    <div id="segments-container">
                        ${(act.segments || []).map((seg, i) => `
                        <div class="segment-row">
                            <input type="date" class="form-input seg-start" value="${seg.startDate}" />
                            <input type="date" class="form-input seg-end" value="${seg.endDate}" />
                            <input type="number" class="form-input seg-duration" min="1" value="${App.Utils.daysBetween(App.Utils.parseDate(seg.startDate), App.Utils.parseDate(seg.endDate))}" title="Durata (gg)" />
                            <span class="seg-pct-label">${seg.progress || 0}%</span>
                            <input type="range" class="form-range seg-progress" min="0" max="100" value="${seg.progress || 0}"
                                oninput="this.previousElementSibling.textContent=this.value+'%'" />
                            <button type="button" class="btn btn-danger btn-small seg-remove" title="Rimuovi">&times;</button>
                            <label class="form-checkbox seg-option">
                                <input type="checkbox" class="seg-include-phase" ${seg.includeInPhase !== false ? 'checked' : ''} />
                                <span>Includi nella durata fase</span>
                            </label>
                            <label class="form-checkbox seg-option">
                                <input type="checkbox" class="seg-milestone" ${seg.hasMilestone ? 'checked' : ''} />
                                <span>Milestone di fine (diamante)</span>
                            </label>
                        </div>`).join('')}
                    </div>
                    <button type="button" id="btn-add-segment" class="btn btn-secondary" style="margin-top:8px;font-size:12px;">+ Aggiungi segmento</button>
                </div>
            </details>
            <details class="segments-collapsible">
                <summary>Dipendenze${(act.dependencies || []).length ? ` (${(act.dependencies || []).length})` : ''}</summary>
                <div class="segments-collapsible-body">
                    <div id="deps-container">
                        ${this._renderDepRows(project, act)}
                    </div>
                    <button type="button" id="btn-add-dep" class="btn btn-secondary" style="margin-top:8px;font-size:12px;">+ Aggiungi dipendenza</button>
                </div>
            </details>
        `, () => {
            const newPhaseId = document.getElementById('input-act-phase').value;
            act.name = document.getElementById('input-act-name').value.trim() || act.name;
            act.startDate = document.getElementById('input-act-start').value;
            act.endDate = document.getElementById('input-act-end').value;
            act.progress = parseInt(document.getElementById('input-act-progress').value);
            act.hasMilestone = document.getElementById('input-act-milestone').checked;

            // Raccolta segmenti
            const segRows = document.querySelectorAll('#segments-container .segment-row');
            const segments = [];
            segRows.forEach(row => {
                const sd = row.querySelector('.seg-start').value;
                const ed = row.querySelector('.seg-end').value;
                const pr = parseInt(row.querySelector('.seg-progress').value) || 0;
                const incPhase = row.querySelector('.seg-include-phase')?.checked !== false;
                const hasMilestone = row.querySelector('.seg-milestone')?.checked || false;
                if (sd && ed) {
                    segments.push({ startDate: sd, endDate: ed, progress: pr, includeInPhase: incPhase, hasMilestone: hasMilestone });
                }
            });
            act.segments = segments.length > 0 ? segments : undefined;

            // Raccolta dipendenze
            const depRows = document.querySelectorAll('#deps-container .dep-row');
            const deps = [];
            depRows.forEach(row => {
                const predId = row.querySelector('.dep-predecessor')?.value;
                const fromPoint = row.querySelector('.dep-from-point')?.value;
                const toPoint = row.querySelector('.dep-to-point')?.value;
                const offset = parseInt(row.querySelector('.dep-offset')?.value) || 0;
                if (predId) {
                    deps.push({ predecessorId: predId, fromPoint: fromPoint || 'end', toPoint: toPoint || 'start', offsetDays: offset });
                }
            });
            act.dependencies = deps.length > 0 ? deps : undefined;

            // Spostamento tra fasi
            if (newPhaseId !== currentPhaseId) {
                const srcPhase = project.phases.find(p => p.id === currentPhaseId);
                const dstPhase = project.phases.find(p => p.id === newPhaseId);
                if (srcPhase && dstPhase) {
                    srcPhase.activities = srcPhase.activities.filter(a => a.id !== actId);
                    dstPhase.activities.push(act);
                }
            }

            // Applica dipendenze (sposta la barra per rispettare offset) + cascata dipendenti
            App.Dependencies.applyOwnDependencies(project, actId);
            App.Dependencies.cascadeDependents(project, actId);
            App.Actions.saveAndRender();
        }, () => {
            // Cleanup dipendenze orfane prima di eliminare
            App.Dependencies.cleanupDependencies(project, actId);
            const phase = project.phases.find(p => p.id === currentPhaseId);
            if (phase) {
                phase.activities = phase.activities.filter(a => a.id !== actId);
            }
            App.Actions.saveAndRender();
        });

        // Wire up segment add/remove buttons
        this._initSegmentButtons();
        this._initDurationSync();
        this._initDependencyButtons(actId);
    },

    _initDurationSync() {
        const startInput = document.getElementById('input-act-start');
        const endInput = document.getElementById('input-act-end');
        const durationInput = document.getElementById('input-act-duration');
        if (!startInput || !endInput || !durationInput) return;

        const syncDuration = () => {
            const start = App.Utils.parseDate(startInput.value);
            const end = App.Utils.parseDate(endInput.value);
            if (start && end) {
                durationInput.value = App.Utils.daysBetween(start, end);
            }
        };

        const syncEndDate = () => {
            const start = App.Utils.parseDate(startInput.value);
            const days = parseInt(durationInput.value);
            if (start && days > 0) {
                const end = new Date(start);
                end.setDate(end.getDate() + days);
                endInput.value = App.Utils.toISODate(end);
            }
        };

        startInput.addEventListener('change', syncEndDate);
        endInput.addEventListener('change', syncDuration);
        durationInput.addEventListener('change', syncEndDate);
    },

    _initSegmentButtons() {
        const addBtn = document.getElementById('btn-add-segment');
        const container = document.getElementById('segments-container');
        if (!addBtn || !container) return;

        // Calcola date default dal campo fine attività principale
        const getDefaultDates = () => {
            const actEnd = document.getElementById('input-act-end')?.value;
            if (actEnd) {
                const d = App.Utils.parseDate(actEnd);
                if (d) {
                    const start = new Date(d);
                    start.setDate(start.getDate() + 1);
                    const end = new Date(start);
                    end.setMonth(end.getMonth() + 1);
                    return { start: App.Utils.toISODate(start), end: App.Utils.toISODate(end) };
                }
            }
            const today = App.Utils.getToday();
            const nextMonth = new Date(today);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            return { start: App.Utils.toISODate(today), end: App.Utils.toISODate(nextMonth) };
        };

        addBtn.addEventListener('click', () => {
            const defaults = getDefaultDates();
            const row = document.createElement('div');
            row.className = 'segment-row';
            const segDuration = App.Utils.daysBetween(App.Utils.parseDate(defaults.start), App.Utils.parseDate(defaults.end));
            row.innerHTML = `
                <input type="date" class="form-input seg-start" value="${defaults.start}" />
                <input type="date" class="form-input seg-end" value="${defaults.end}" />
                <input type="number" class="form-input seg-duration" min="1" value="${segDuration}" title="Durata (gg)" />
                <span class="seg-pct-label">0%</span>
                <input type="range" class="form-range seg-progress" min="0" max="100" value="0"
                    oninput="this.previousElementSibling.textContent=this.value+'%'" />
                <button type="button" class="btn btn-danger btn-small seg-remove" title="Rimuovi">&times;</button>
                <label class="form-checkbox seg-option">
                    <input type="checkbox" class="seg-include-phase" checked />
                    <span>Includi nella durata fase</span>
                </label>
                <label class="form-checkbox seg-option">
                    <input type="checkbox" class="seg-milestone" />
                    <span>Milestone di fine (diamante)</span>
                </label>
            `;
            container.appendChild(row);
        });

        // Event delegation per rimuovere singoli segmenti
        container.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.seg-remove');
            if (removeBtn) {
                e.stopPropagation();
                const row = removeBtn.closest('.segment-row');
                if (row) row.remove();
            }
        });

        // Event delegation per sync durata segmenti
        container.addEventListener('change', (e) => {
            const row = e.target.closest('.segment-row');
            if (!row) return;
            const segStart = row.querySelector('.seg-start');
            const segEnd = row.querySelector('.seg-end');
            const segDur = row.querySelector('.seg-duration');
            if (!segStart || !segEnd || !segDur) return;

            if (e.target === segEnd) {
                const s = App.Utils.parseDate(segStart.value);
                const ed = App.Utils.parseDate(segEnd.value);
                if (s && ed) segDur.value = App.Utils.daysBetween(s, ed);
            } else if (e.target === segStart || e.target === segDur) {
                const s = App.Utils.parseDate(segStart.value);
                const days = parseInt(segDur.value);
                if (s && days > 0) {
                    const ed = new Date(s);
                    ed.setDate(ed.getDate() + days);
                    segEnd.value = App.Utils.toISODate(ed);
                }
            }
        });
    },

    _renderDepRows(project, act) {
        if (!act.dependencies || act.dependencies.length === 0) return '';
        return act.dependencies.map((dep, i) => {
            const predAct = App.Dependencies.findActivityById(project, dep.predecessorId);
            const predName = predAct ? predAct.name : '(eliminata)';
            const options = this._getDepPredecessorOptions(project, act.id, dep.predecessorId);
            return `<div class="dep-row">
                <select class="form-input dep-predecessor">${options}</select>
                <select class="form-input dep-from-point">
                    <option value="end" ${dep.fromPoint === 'end' ? 'selected' : ''}>Fine</option>
                    <option value="start" ${dep.fromPoint === 'start' ? 'selected' : ''}>Inizio</option>
                </select>
                <span class="dep-arrow-symbol">&rarr;</span>
                <select class="form-input dep-to-point">
                    <option value="start" ${dep.toPoint === 'start' ? 'selected' : ''}>Inizio</option>
                    <option value="end" ${dep.toPoint === 'end' ? 'selected' : ''}>Fine</option>
                </select>
                <input type="number" class="form-input dep-offset" value="${dep.offsetDays}" title="Offset in giorni" />
                <span class="dep-offset-label">gg</span>
                <button type="button" class="btn btn-danger btn-small dep-remove" title="Rimuovi">&times;</button>
            </div>`;
        }).join('');
    },

    _getDepPredecessorOptions(project, selfId, selectedId) {
        let html = '<option value="">-- Seleziona --</option>';
        for (const phase of project.phases) {
            for (const act of phase.activities) {
                if (act.id === selfId) continue;
                const label = this.escapeHtml(phase.name + ' / ' + act.name);
                html += `<option value="${act.id}" ${act.id === selectedId ? 'selected' : ''}>${label}</option>`;
            }
        }
        return html;
    },

    _initDependencyButtons(actId) {
        const addBtn = document.getElementById('btn-add-dep');
        const container = document.getElementById('deps-container');
        if (!addBtn || !container) return;

        const project = App.getCurrentProject();
        if (!project) return;

        addBtn.addEventListener('click', () => {
            const options = this._getDepPredecessorOptions(project, actId, null);
            const row = document.createElement('div');
            row.className = 'dep-row';
            row.innerHTML = `
                <select class="form-input dep-predecessor">${options}</select>
                <select class="form-input dep-from-point">
                    <option value="end">Fine</option>
                    <option value="start">Inizio</option>
                </select>
                <span class="dep-arrow-symbol">&rarr;</span>
                <select class="form-input dep-to-point">
                    <option value="start">Inizio</option>
                    <option value="end">Fine</option>
                </select>
                <input type="number" class="form-input dep-offset" value="0" title="Offset in giorni" />
                <span class="dep-offset-label">gg</span>
                <button type="button" class="btn btn-danger btn-small dep-remove" title="Rimuovi">&times;</button>
            `;
            container.appendChild(row);
        });

        // Event delegation: rimuovi riga + auto-calcolo offset + verifica circolarità
        container.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.dep-remove');
            if (removeBtn) {
                e.stopPropagation();
                const row = removeBtn.closest('.dep-row');
                if (row) row.remove();
            }
        });

        container.addEventListener('change', (e) => {
            const row = e.target.closest('.dep-row');
            if (!row) return;
            const predSelect = row.querySelector('.dep-predecessor');
            const fromSelect = row.querySelector('.dep-from-point');
            const toSelect = row.querySelector('.dep-to-point');
            const offsetInput = row.querySelector('.dep-offset');

            if (e.target === predSelect) {
                const predId = predSelect.value;
                if (!predId) return;

                // Verifica circolarità
                if (App.Dependencies.hasCircularDependency(project, actId, predId)) {
                    App.UI.toast('Dipendenza circolare rilevata!', 'error');
                    predSelect.value = '';
                    return;
                }

                // Auto-calcolo offset
                const pred = App.Dependencies.findActivityById(project, predId);
                const depAct = App.Dependencies.findActivityById(project, actId);
                if (pred && depAct) {
                    const offset = App.Dependencies.computeOffset(pred, depAct, fromSelect.value, toSelect.value);
                    offsetInput.value = offset;
                }
            }

            // Ricalcola offset se cambiano fromPoint o toPoint
            if (e.target === fromSelect || e.target === toSelect) {
                const predId = predSelect.value;
                if (!predId) return;
                const pred = App.Dependencies.findActivityById(project, predId);
                const depAct = App.Dependencies.findActivityById(project, actId);
                if (pred && depAct) {
                    const offset = App.Dependencies.computeOffset(pred, depAct, fromSelect.value, toSelect.value);
                    offsetInput.value = offset;
                }
            }
        });
    },

    // === Panel: Nuova Milestone Steering ===
    showNewMilestoneModal() {
        const today = App.Utils.toISODate(App.Utils.getToday());

        this.showPanel('Nuova Milestone Steering', `
            <div class="form-group">
                <label>Data</label>
                <input type="date" id="input-ms-date" value="${today}" class="form-input" />
            </div>
            <div class="form-group">
                <label>Etichetta (opzionale)</label>
                <input type="text" id="input-ms-label" placeholder="Es. Kick-off" class="form-input" />
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Tipo</label>
                    <select id="input-ms-type" class="form-input">
                        <option value="triangle">Triangolo</option>
                        <option value="diamond">Diamante</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Colore</label>
                    <select id="input-ms-color" class="form-input">
                        <option value="gold">Oro (kick-off)</option>
                        <option value="gray">Grigio (steering)</option>
                        <option value="blue">Blu scuro</option>
                    </select>
                </div>
            </div>
        `, () => {
            const date = document.getElementById('input-ms-date').value;
            const label = document.getElementById('input-ms-label').value.trim();
            const type = document.getElementById('input-ms-type').value;
            const color = document.getElementById('input-ms-color').value;
            if (!date) return;
            addMilestone(date, label, type, color);
        });
    },

    // === Panel: Modifica Milestone Steering ===
    showEditMilestoneModal(msId) {
        const project = App.getCurrentProject();
        if (!project) return;
        const ms = project.steeringMilestones.find(m => m.id === msId);
        if (!ms) return;

        this.showPanel('Modifica Milestone', `
            <div class="form-group">
                <label>Data</label>
                <input type="date" id="input-ms-date" value="${ms.date}" class="form-input" />
            </div>
            <div class="form-group">
                <label>Etichetta</label>
                <input type="text" id="input-ms-label" value="${this.escapeAttr(ms.label || '')}" class="form-input" />
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Tipo</label>
                    <select id="input-ms-type" class="form-input">
                        <option value="triangle" ${ms.type === 'triangle' ? 'selected' : ''}>Triangolo</option>
                        <option value="diamond" ${ms.type === 'diamond' ? 'selected' : ''}>Diamante</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Colore</label>
                    <select id="input-ms-color" class="form-input">
                        <option value="gold" ${ms.color === 'gold' ? 'selected' : ''}>Oro</option>
                        <option value="gray" ${ms.color === 'gray' ? 'selected' : ''}>Grigio</option>
                        <option value="blue" ${ms.color === 'blue' ? 'selected' : ''}>Blu scuro</option>
                    </select>
                </div>
            </div>
        `, () => {
            ms.date = document.getElementById('input-ms-date').value;
            ms.label = document.getElementById('input-ms-label').value.trim();
            ms.type = document.getElementById('input-ms-type').value;
            ms.color = document.getElementById('input-ms-color').value;
            App.Actions.saveAndRender();
        }, () => {
            project.steeringMilestones = project.steeringMilestones.filter(m => m.id !== msId);
            App.Actions.saveAndRender();
        });
    },

    // === Settings Panel: Impostazioni Globali ===
    showGlobalSettingsPanel() {
        const wsStatus = !App.state.fsAccessSupported
            ? 'Non disponibile'
            : App.state.dirHandle
                ? 'Connessa'
                : 'Non selezionata';
        const wsClass = !App.state.fsAccessSupported
            ? 'gray'
            : App.state.dirHandle ? 'green' : 'gray';

        const todayLabel = App.state.customToday
            ? App.Utils.formatDate(App.state.customToday)
            : 'Data reale';

        const body = document.getElementById('settings-panel-body');
        body.innerHTML = `
            <div class="settings-menu">
                ${App.state.fsAccessSupported ? `<button class="settings-menu-item" id="gs-workspace">
                    <div class="settings-menu-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <div class="settings-menu-text">
                        <span class="settings-menu-label">Cartella di lavoro</span>
                        <span class="settings-menu-desc"><span class="settings-dot settings-dot-${wsClass}"></span>${wsStatus}</span>
                    </div>
                    <svg class="settings-menu-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>` : ''}
                <button class="settings-menu-item" id="gs-theme">
                    <div class="settings-menu-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    </div>
                    <div class="settings-menu-text">
                        <span class="settings-menu-label">Tema</span>
                        <span class="settings-menu-desc">Colori e font del Gantt</span>
                    </div>
                    <svg class="settings-menu-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <button class="settings-menu-item" id="gs-today">
                    <div class="settings-menu-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </div>
                    <div class="settings-menu-text">
                        <span class="settings-menu-label">Data "Oggi"</span>
                        <span class="settings-menu-desc">${todayLabel}</span>
                    </div>
                    <svg class="settings-menu-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <button class="settings-menu-item" id="gs-import">
                    <div class="settings-menu-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    </div>
                    <div class="settings-menu-text">
                        <span class="settings-menu-label">Importa JSON</span>
                        <span class="settings-menu-desc">Importa un file .gantt.json</span>
                    </div>
                    <svg class="settings-menu-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
            </div>
        `;

        this.openSettingsPanel('Impostazioni');

        const wsBtn = document.getElementById('gs-workspace');
        if (wsBtn) {
            wsBtn.onclick = async () => {
                this.closeSettingsPanel();
                await selectWorkspace();
            };
        }
        document.getElementById('gs-theme').onclick = () => {
            this.showThemeSettingsModal();
        };
        document.getElementById('gs-today').onclick = () => {
            this.showTodaySettingModal();
        };
        document.getElementById('gs-import').onclick = () => {
            this.closeSettingsPanel();
            importProject();
        };
    },

    // === Settings Panel: Impostazione data "Oggi" ===
    showTodaySettingModal() {
        const current = App.state.customToday || '';
        const realToday = App.Utils.toISODate(new Date());

        const body = document.getElementById('settings-panel-body');
        body.innerHTML = `
            <div class="form-group">
                <label>Data di riferimento per la linea "Oggi"</label>
                <input type="date" id="input-custom-today" value="${current}" class="form-input" />
            </div>
            <div class="form-group" style="font-size:12px; color:var(--gray-500);">
                Data reale: ${App.Utils.formatDate(realToday)}. Lascia vuoto per usare la data reale.
            </div>
            <div class="settings-actions">
                <button class="btn btn-primary" id="settings-save-btn">Salva</button>
            </div>
        `;

        this.openSettingsPanel('Imposta data "Oggi"');

        document.getElementById('settings-save-btn').onclick = () => {
            const val = document.getElementById('input-custom-today').value;
            App.state.customToday = val || null;
            try { localStorage.setItem('gantt_customToday', val || ''); } catch(e) {}
            this.closeSettingsPanel();
            if (App.state.currentView === 'gantt') {
                App.UI.renderGanttView();
            }
        };
    },

    // === VERSIONS PANEL ===
    renderVersionsPanel() {
        const panel = document.getElementById('versions-panel');
        const project = App.getCurrentProject();
        if (!project) return;

        const list = document.getElementById('versions-list');

        // Form inline per creare snapshot
        const today = new Date().toLocaleDateString('it-IT');
        const defaultName = `Snapshot ${today}`;
        let html = `<div class="snapshot-create-form">
            <input type="text" id="input-snap-inline" value="${this.escapeAttr(defaultName)}" class="form-input" placeholder="Nome snapshot" />
            <button class="btn btn-primary" id="btn-snap-inline">Crea</button>
        </div>`;

        const snapshots = (project.snapshots || []).slice().reverse();

        if (snapshots.length === 0) {
            html += '<div class="empty-versions">Nessuno snapshot creato</div>';
            list.innerHTML = html;
            this._initSnapshotInlineForm();
            return;
        }

        list.innerHTML = html;

        for (const snap of snapshots) {
            const item = document.createElement('div');
            item.className = `version-item ${snap.isBaseline ? 'is-baseline' : ''}`;
            const snapDate = new Date(snap.date).toLocaleString('it-IT', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            item.innerHTML = `
                <div class="version-info">
                    <div class="version-name">${this.escapeHtml(snap.name)}</div>
                    <div class="version-date">${snapDate}</div>
                </div>
                <div class="version-actions">
                    <label class="toggle-switch" title="Baseline">
                        <input type="checkbox" ${snap.isBaseline ? 'checked' : ''} onchange="setBaseline('${snap.id}')" />
                        <span class="toggle-slider"></span>
                    </label>
                    <button class="btn-small btn-danger" onclick="deleteSnapshot('${snap.id}')" title="Elimina">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>`;
            list.appendChild(item);
        }

        this._initSnapshotInlineForm();
    },

    _initSnapshotInlineForm() {
        const btn = document.getElementById('btn-snap-inline');
        const input = document.getElementById('input-snap-inline');
        if (!btn || !input) return;

        const doCreate = () => {
            const name = input.value.trim();
            if (!name) return;
            createSnapshot(name);
            this.renderVersionsPanel();
        };

        btn.addEventListener('click', doCreate);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doCreate();
        });
    },

    toggleVersionsPanel() {
        const panel = document.getElementById('versions-panel');
        const backdrop = document.getElementById('versions-backdrop');
        App.state.versionsPanelOpen = !App.state.versionsPanelOpen;
        panel.classList.toggle('open', App.state.versionsPanelOpen);
        backdrop.classList.toggle('visible', App.state.versionsPanelOpen);
        if (App.state.versionsPanelOpen) {
            this.renderVersionsPanel();
        }
    },

    // === DEPENDENCIES PANEL ===
    renderDepsPanel() {
        const project = App.getCurrentProject();
        const body = document.getElementById('deps-panel-body');
        if (!project || !body) return;

        // Toggle globale
        let html = `<div class="deps-toggle-row">
            <span>Mostra frecce</span>
            <label class="toggle-switch">
                <input type="checkbox" id="deps-global-toggle"
                    ${App.state.showDependencyArrows ? 'checked' : ''}
                    onchange="toggleDependencyArrows()" />
                <span class="toggle-slider"></span>
            </label>
        </div>`;

        // Form nuova dipendenza
        const actOptions = this._getDepsPanelActivityOptions(project);
        html += `<div class="deps-add-form">
            <div class="deps-add-row">
                <label>Predecessore</label>
                <select class="form-input" id="deps-add-pred">${actOptions}</select>
            </div>
            <div class="deps-add-row">
                <label>Dipendente</label>
                <select class="form-input" id="deps-add-dep">${actOptions}</select>
            </div>
            <div class="deps-add-row deps-add-type-row">
                <select class="form-input" id="deps-add-from">
                    <option value="end">Fine</option>
                    <option value="start">Inizio</option>
                </select>
                <span class="dep-arrow-symbol">\u2192</span>
                <select class="form-input" id="deps-add-to">
                    <option value="start">Inizio</option>
                    <option value="end">Fine</option>
                </select>
                <input type="number" class="form-input" id="deps-add-offset" value="0" title="Offset giorni" style="width:50px;text-align:center;" />
                <span class="dep-offset-label">gg</span>
            </div>
            <button class="btn btn-primary" id="deps-add-btn" style="width:100%;font-size:12px;">+ Aggiungi dipendenza</button>
        </div>`;

        // Raccogli dipendenze raggruppate per predecessore
        const groups = new Map();
        for (const phase of project.phases) {
            for (const act of phase.activities) {
                if (!act.dependencies) continue;
                for (const dep of act.dependencies) {
                    if (!groups.has(dep.predecessorId)) groups.set(dep.predecessorId, []);
                    groups.get(dep.predecessorId).push({
                        dep, dependentId: act.id, dependentName: act.name, dependentPhaseName: phase.name
                    });
                }
            }
        }

        if (groups.size === 0) {
            html += '<div class="deps-empty">Nessuna dipendenza configurata</div>';
        } else {
            for (const [predId, items] of groups) {
                const predAct = App.Dependencies.findActivityById(project, predId);
                const predName = predAct ? predAct.name : '(eliminata)';
                let phaseName = '';
                for (const ph of project.phases) {
                    if (ph.activities.some(a => a.id === predId)) { phaseName = ph.name; break; }
                }

                html += `<details class="deps-group">
                    <summary class="deps-group-header">${this.escapeHtml(phaseName)} / ${this.escapeHtml(predName)} <span class="deps-group-count">(${items.length})</span></summary>`;

                for (const item of items) {
                    html += `<div class="deps-item" data-dependent-id="${item.dependentId}" data-predecessor-id="${predId}">
                        <div class="deps-item-name">\u2192 ${this.escapeHtml(item.dependentPhaseName)} / ${this.escapeHtml(item.dependentName)}</div>
                        <div class="deps-item-controls">
                            <select class="form-input dep-panel-from">
                                <option value="end" ${item.dep.fromPoint === 'end' ? 'selected' : ''}>Fine</option>
                                <option value="start" ${item.dep.fromPoint === 'start' ? 'selected' : ''}>Inizio</option>
                            </select>
                            <span class="dep-arrow-symbol">\u2192</span>
                            <select class="form-input dep-panel-to">
                                <option value="start" ${item.dep.toPoint === 'start' ? 'selected' : ''}>Inizio</option>
                                <option value="end" ${item.dep.toPoint === 'end' ? 'selected' : ''}>Fine</option>
                            </select>
                            <input type="number" class="form-input dep-panel-offset" value="${item.dep.offsetDays || 0}" title="Offset giorni" />
                            <span class="dep-offset-label">gg</span>
                            <button class="btn btn-danger btn-small dep-panel-remove" title="Rimuovi">\u00d7</button>
                        </div>
                    </div>`;
                }
                html += '</details>';
            }
        }

        body.innerHTML = html;
        this._initDepsPanelEvents();
    },

    _initDepsPanelEvents() {
        const body = document.getElementById('deps-panel-body');
        if (!body) return;

        body.addEventListener('change', (e) => {
            const item = e.target.closest('.deps-item');
            if (!item) return;

            const depTarget = e.target.closest('.dep-panel-from, .dep-panel-to, .dep-panel-offset');
            if (!depTarget) return;

            const dependentId = item.getAttribute('data-dependent-id');
            const predecessorId = item.getAttribute('data-predecessor-id');
            const project = App.getCurrentProject();
            if (!project) return;

            const act = App.Dependencies.findActivityById(project, dependentId);
            if (!act || !act.dependencies) return;

            const dep = act.dependencies.find(d => d.predecessorId === predecessorId);
            if (!dep) return;

            // Read current values from the controls
            const fromSel = item.querySelector('.dep-panel-from');
            const toSel = item.querySelector('.dep-panel-to');
            const offsetInput = item.querySelector('.dep-panel-offset');

            dep.fromPoint = fromSel.value;
            dep.toPoint = toSel.value;
            dep.offsetDays = parseInt(offsetInput.value) || 0;

            App.Dependencies.applyOwnDependencies(project, dependentId);
            App.Dependencies.cascadeDependents(project, dependentId);
            App.Actions.saveAndRender();
        });

        body.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.dep-panel-remove');
            if (!removeBtn) return;

            const item = removeBtn.closest('.deps-item');
            if (!item) return;

            const dependentId = item.getAttribute('data-dependent-id');
            const predecessorId = item.getAttribute('data-predecessor-id');
            const project = App.getCurrentProject();
            if (!project) return;

            const act = App.Dependencies.findActivityById(project, dependentId);
            if (!act || !act.dependencies) return;

            act.dependencies = act.dependencies.filter(d => d.predecessorId !== predecessorId);
            if (act.dependencies.length === 0) delete act.dependencies;

            App.Actions.saveAndRender();
            this.renderDepsPanel();
        });

        // Pulsante aggiungi dipendenza
        const addBtn = document.getElementById('deps-add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const predId = document.getElementById('deps-add-pred').value;
                const depId = document.getElementById('deps-add-dep').value;
                const fromPoint = document.getElementById('deps-add-from').value;
                const toPoint = document.getElementById('deps-add-to').value;
                const offset = parseInt(document.getElementById('deps-add-offset').value) || 0;

                if (!predId || !depId) {
                    App.UI.toast('Seleziona predecessore e dipendente', 'warning');
                    return;
                }
                if (predId === depId) {
                    App.UI.toast('Predecessore e dipendente devono essere diversi', 'warning');
                    return;
                }

                const project = App.getCurrentProject();
                if (!project) return;

                // Verifica circolarità
                if (App.Dependencies.hasCircularDependency(project, depId, predId)) {
                    App.UI.toast('Dipendenza circolare rilevata!', 'error');
                    return;
                }

                // Verifica duplicato
                const act = App.Dependencies.findActivityById(project, depId);
                if (!act) return;
                if (!act.dependencies) act.dependencies = [];
                if (act.dependencies.some(d => d.predecessorId === predId)) {
                    App.UI.toast('Dipendenza già esistente', 'warning');
                    return;
                }

                act.dependencies.push({ predecessorId: predId, fromPoint, toPoint, offsetDays: offset });
                App.Dependencies.applyOwnDependencies(project, depId);
                App.Dependencies.cascadeDependents(project, depId);
                App.Actions.saveAndRender();
                this.renderDepsPanel();
            });
        }
    },

    _getDepsPanelActivityOptions(project) {
        let html = '<option value="">-- Seleziona --</option>';
        for (const phase of project.phases) {
            for (const act of phase.activities) {
                const label = this.escapeHtml(phase.name + ' / ' + act.name);
                html += `<option value="${act.id}">${label}</option>`;
            }
        }
        return html;
    },

    toggleDepsPanel() {
        const panel = document.getElementById('deps-panel');
        const backdrop = document.getElementById('deps-panel-backdrop');
        const btn = document.getElementById('btn-toggle-deps');
        if (!panel) return;
        const isOpen = panel.classList.contains('open');
        if (isOpen) {
            panel.classList.remove('open');
            backdrop.classList.remove('visible');
            if (btn) btn.classList.remove('tools-btn-active');
        } else {
            this.renderDepsPanel();
            panel.classList.add('open');
            backdrop.classList.add('visible');
            if (btn) btn.classList.add('tools-btn-active');
        }
    },

    // === TOAST ===
    toast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => toast.classList.add('visible'), 10);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // === VIEW SWITCHING ===
    showView(view) {
        App.state.currentView = view;
        document.getElementById('dashboard-view').style.display = view === 'dashboard' ? '' : 'none';
        document.getElementById('gantt-view').style.display = view === 'gantt' ? 'flex' : 'none';

        if (view === 'dashboard') {
            this.renderDashboard();
        } else if (view === 'gantt') {
            this.renderGanttView();
        }
    },

    // === THEME ===
    _getTheme() {
        return { ...App.DEFAULTS_THEME, ...App.state.theme };
    },

    showThemeSettingsModal() {
        const T = this._getTheme();

        const fonts = [
            'Arial, sans-serif',
            "'Segoe UI', Arial, sans-serif",
            'Calibri, sans-serif',
            'Helvetica, sans-serif',
            'Verdana, sans-serif',
            'Tahoma, sans-serif',
            'Georgia, serif',
            "'Times New Roman', serif"
        ];
        const fontOptions = fonts.map(f => {
            const label = f.split(',')[0].replace(/'/g, '');
            return `<option value="${this.escapeAttr(f)}" ${T.fontFamily === f ? 'selected' : ''} style="font-family:${f}">${label}</option>`;
        }).join('');

        const colorFields = [
            { key: 'activityBg', label: 'Barra attività (sfondo)' },
            { key: 'activityFill', label: 'Barra attività (avanzamento)' },
            { key: 'phaseFill', label: 'Barra fase sommario' },
            { key: 'headerBg', label: 'Header anno (sfondo)' },
            { key: 'phaseLabelBg', label: 'Etichetta fase (sfondo)' },
            { key: 'titleBg', label: 'Colonna titolo (sfondo)' },
            { key: 'todayLine', label: 'Linea oggi' },
            { key: 'milestone', label: 'Milestone attività' }
        ];

        const colorInputs = colorFields.map(f => `
            <div class="theme-color-row">
                <input type="color" id="theme-${f.key}" value="${T[f.key]}" />
                <label for="theme-${f.key}">${f.label}</label>
            </div>
        `).join('');

        const body = document.getElementById('settings-panel-body');
        body.innerHTML = `
            <div class="form-group">
                <label>Font</label>
                <select id="theme-fontFamily" class="form-input" style="font-family:${T.fontFamily}"
                    onchange="this.style.fontFamily=this.value">${fontOptions}</select>
            </div>
            <div style="border-top:1px solid var(--gray-200);padding-top:12px;margin-top:8px;">
                <label style="font-weight:600;margin-bottom:10px;display:block;">Colori</label>
                ${colorInputs}
            </div>
            <div class="settings-actions">
                <button class="btn btn-primary" id="settings-save-btn">Salva</button>
                <button class="btn btn-secondary" id="settings-reset-btn">Ripristina default</button>
            </div>
        `;

        this.openSettingsPanel('Impostazioni Tema');

        document.getElementById('settings-save-btn').onclick = () => {
            const theme = {};
            const defaults = App.DEFAULTS_THEME;

            const font = document.getElementById('theme-fontFamily').value;
            if (font !== defaults.fontFamily) theme.fontFamily = font;

            for (const f of colorFields) {
                const val = document.getElementById('theme-' + f.key).value;
                if (val !== defaults[f.key]) theme[f.key] = val;
            }

            App.state.theme = theme;
            try { localStorage.setItem('gantt_theme', JSON.stringify(theme)); } catch(e) {}

            this.closeSettingsPanel();
            if (App.state.currentView === 'gantt') {
                App.UI.renderGanttView();
            }
        };

        document.getElementById('settings-reset-btn').onclick = () => {
            App.state.theme = {};
            try { localStorage.removeItem('gantt_theme'); } catch(e) {}
            this.closeSettingsPanel();
            if (App.state.currentView === 'gantt') {
                App.UI.renderGanttView();
            }
        };
    },

    // === SETTINGS PANEL (generico) ===
    showPanel(title, content, onSave, onDelete) {
        const body = document.getElementById('settings-panel-body');

        let footer = '<div class="settings-actions">';
        if (onSave) {
            footer += '<button class="btn btn-primary" id="panel-save-btn">Salva</button>';
        }
        if (onDelete) {
            footer += '<button class="btn btn-danger" id="panel-delete-btn">Elimina</button>';
        }
        footer += '</div>';

        body.innerHTML = content + footer;

        this.openSettingsPanel(title);

        if (onSave) {
            document.getElementById('panel-save-btn').onclick = () => {
                onSave();
                this.closeSettingsPanel();
            };
        }
        if (onDelete) {
            document.getElementById('panel-delete-btn').onclick = () => {
                if (confirm('Sei sicuro di voler eliminare questo elemento?')) {
                    onDelete();
                    this.closeSettingsPanel();
                }
            };
        }
    },

    openSettingsPanel(title) {
        document.getElementById('settings-panel-title').textContent = title;
        document.getElementById('settings-panel').classList.add('open');
        document.getElementById('settings-backdrop').classList.add('visible');
    },

    closeSettingsPanel() {
        document.getElementById('settings-panel').classList.remove('open');
        document.getElementById('settings-backdrop').classList.remove('visible');
    },

    // === HELPERS ===
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    },

    escapeAttr(str) {
        return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
};
