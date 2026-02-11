// ui.js - Rendering UI: dashboard, toolbar, modali, toast
App.UI = {
    // === DASHBOARD ===
    renderDashboard() {
        const container = document.getElementById('dashboard-view');
        const grid = document.getElementById('project-grid');
        grid.innerHTML = '';

        // Stato connessione workspace
        this.updateWorkspaceStatus();

        if (App.state.projects.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <h3>Nessun progetto</h3>
                    <p>Crea un nuovo progetto o importa un file .gantt.json</p>
                </div>`;
            return;
        }

        for (const p of App.state.projects) {
            const card = document.createElement('div');
            card.className = 'project-card';
            card.onclick = () => openProject(p.id);

            const phaseCount = p.phases?.length || 0;
            let actCount = 0;
            let minDate = null, maxDate = null;
            for (const ph of (p.phases || [])) {
                actCount += ph.activities?.length || 0;
                for (const a of (ph.activities || [])) {
                    const s = App.Utils.parseDate(a.startDate);
                    const e = App.Utils.parseDate(a.endDate);
                    if (s && (!minDate || s < minDate)) minDate = s;
                    if (e && (!maxDate || e > maxDate)) maxDate = e;
                }
            }

            const periodo = minDate && maxDate
                ? `${App.Utils.formatDate(App.Utils.toISODate(minDate))} - ${App.Utils.formatDate(App.Utils.toISODate(maxDate))}`
                : 'Nessuna attività';

            const lastSaved = p._lastSaved
                ? new Date(p._lastSaved).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '-';

            card.innerHTML = `
                <div class="card-header">
                    <h3 class="card-title">${this.escapeHtml(p.title)}</h3>
                    <div class="card-actions" onclick="event.stopPropagation()">
                        <button class="btn-icon" onclick="exportProject('${p.id}')" title="Esporta JSON">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        </button>
                        <button class="btn-icon btn-danger" onclick="deleteProject('${p.id}')" title="Elimina">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="card-stat"><span class="stat-label">Periodo</span><span class="stat-value">${periodo}</span></div>
                    <div class="card-stat"><span class="stat-label">Fasi</span><span class="stat-value">${phaseCount}</span></div>
                    <div class="card-stat"><span class="stat-label">Attività</span><span class="stat-value">${actCount}</span></div>
                    <div class="card-stat"><span class="stat-label">Aggiornato</span><span class="stat-value">${lastSaved}</span></div>
                </div>`;

            grid.appendChild(card);
        }
    },

    updateWorkspaceStatus() {
        const el = document.getElementById('workspace-status');
        if (!el) return;

        if (!App.state.fsAccessSupported) {
            el.innerHTML = `<span class="status-warning">Salvataggio automatico non disponibile. Usa Import/Export manuale.</span>`;
        } else if (App.state.dirHandle) {
            el.innerHTML = `<span class="status-ok">Cartella di lavoro connessa</span>`;
        } else {
            el.innerHTML = `<span class="status-info">Seleziona una cartella per il salvataggio automatico</span>`;
        }
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

        // Aggiorna stato baseline
        this.updateBaselineButton();
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

    updateBaselineButton() {
        const btn = document.getElementById('btn-toggle-baseline');
        if (!btn) return;
        const project = App.getCurrentProject();
        const hasBaseline = project?.snapshots?.some(s => s.isBaseline);
        btn.classList.toggle('active', App.state.baselineActive && hasBaseline);
        btn.disabled = !hasBaseline;
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
        `, () => {
            const title = document.getElementById('input-project-title').value.trim();
            if (!title) return;
            createNewProject(title);
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

    // === Modal: Nuova Fase ===
    showNewPhaseModal() {
        const project = App.getCurrentProject();
        if (!project) return;
        const nextNum = project.phases.length + 1;

        this.showModal('Nuova Fase', `
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

    // === Modal: Modifica Fase ===
    showEditPhaseModal(phaseId) {
        const project = App.getCurrentProject();
        if (!project) return;
        const phase = project.phases.find(p => p.id === phaseId);
        if (!phase) return;

        this.showModal('Modifica Fase', `
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

    // === Modal: Nuova Attività ===
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

        this.showModal('Nuova Attività', `
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
        `, () => {
            const phaseId = document.getElementById('input-act-phase').value;
            const name = document.getElementById('input-act-name').value.trim();
            const startDate = document.getElementById('input-act-start').value;
            const endDate = document.getElementById('input-act-end').value;
            const progress = parseInt(document.getElementById('input-act-progress').value);
            const hasMilestone = document.getElementById('input-act-milestone').checked;
            if (!name) return;
            addActivity(phaseId, name, startDate, endDate, progress, hasMilestone);
        });
    },

    // === Modal: Modifica Attività ===
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

        this.showModal('Modifica Attività', `
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
            <div class="form-group" style="border-top:1px solid var(--gray-200); padding-top:12px; margin-top:8px;">
                <label style="font-weight:600;">Segmenti aggiuntivi</label>
                <div id="segments-container">
                    ${(act.segments || []).map((seg, i) => `
                    <div class="segment-row" style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">
                        <input type="date" class="form-input seg-start" value="${seg.startDate}" style="flex:1;min-width:120px;" />
                        <input type="date" class="form-input seg-end" value="${seg.endDate}" style="flex:1;min-width:120px;" />
                        <span style="font-size:11px;white-space:nowrap;" class="seg-pct-label">${seg.progress || 0}%</span>
                        <input type="range" class="form-range seg-progress" min="0" max="100" value="${seg.progress || 0}" style="flex:0.7;"
                            oninput="this.previousElementSibling.textContent=this.value+'%'" />
                        <button type="button" class="btn btn-danger btn-small seg-remove" style="padding:4px 8px;" title="Rimuovi">&times;</button>
                        <label class="form-checkbox" style="width:100%;margin-top:2px;font-size:11px;">
                            <input type="checkbox" class="seg-include-phase" ${seg.includeInPhase !== false ? 'checked' : ''} />
                            <span>Includi nella durata fase</span>
                        </label>
                        <label class="form-checkbox" style="width:100%;margin-top:2px;font-size:11px;">
                            <input type="checkbox" class="seg-milestone" ${seg.hasMilestone ? 'checked' : ''} />
                            <span>Milestone di fine (diamante)</span>
                        </label>
                    </div>`).join('')}
                </div>
                <button type="button" id="btn-add-segment" class="btn btn-secondary" style="margin-top:8px;font-size:12px;">+ Aggiungi segmento</button>
            </div>
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

            // Spostamento tra fasi
            if (newPhaseId !== currentPhaseId) {
                const srcPhase = project.phases.find(p => p.id === currentPhaseId);
                const dstPhase = project.phases.find(p => p.id === newPhaseId);
                if (srcPhase && dstPhase) {
                    srcPhase.activities = srcPhase.activities.filter(a => a.id !== actId);
                    dstPhase.activities.push(act);
                }
            }
            App.Actions.saveAndRender();
        }, () => {
            const phase = project.phases.find(p => p.id === currentPhaseId);
            if (phase) {
                phase.activities = phase.activities.filter(a => a.id !== actId);
            }
            App.Actions.saveAndRender();
        });

        // Wire up segment add/remove buttons
        this._initSegmentButtons();
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
            row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;';
            row.innerHTML = `
                <input type="date" class="form-input seg-start" value="${defaults.start}" style="flex:1;min-width:120px;" />
                <input type="date" class="form-input seg-end" value="${defaults.end}" style="flex:1;min-width:120px;" />
                <span style="font-size:11px;white-space:nowrap;" class="seg-pct-label">0%</span>
                <input type="range" class="form-range seg-progress" min="0" max="100" value="0" style="flex:0.7;"
                    oninput="this.previousElementSibling.textContent=this.value+'%'" />
                <button type="button" class="btn btn-danger btn-small seg-remove" style="padding:4px 8px;" title="Rimuovi">&times;</button>
                <label class="form-checkbox" style="width:100%;margin-top:2px;font-size:11px;">
                    <input type="checkbox" class="seg-include-phase" checked />
                    <span>Includi nella durata fase</span>
                </label>
                <label class="form-checkbox" style="width:100%;margin-top:2px;font-size:11px;">
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
    },

    // === Modal: Nuova Milestone Steering ===
    showNewMilestoneModal() {
        const today = App.Utils.toISODate(App.Utils.getToday());

        this.showModal('Nuova Milestone Steering', `
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

    // === Modal: Modifica Milestone Steering ===
    showEditMilestoneModal(msId) {
        const project = App.getCurrentProject();
        if (!project) return;
        const ms = project.steeringMilestones.find(m => m.id === msId);
        if (!ms) return;

        this.showModal('Modifica Milestone', `
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

    // === Modal: Snapshot ===
    showNewSnapshotModal() {
        const today = new Date().toLocaleDateString('it-IT');
        this.showModal('Crea Snapshot', `
            <div class="form-group">
                <label>Nome snapshot</label>
                <input type="text" id="input-snap-name" value="Snapshot ${today}" class="form-input" />
            </div>
        `, () => {
            const name = document.getElementById('input-snap-name').value.trim();
            if (!name) return;
            createSnapshot(name);
        });
    },

    // === Modal: Impostazione data "Oggi" ===
    showTodaySettingModal() {
        const current = App.state.customToday || '';
        const realToday = App.Utils.toISODate(new Date());

        this.showModal('Imposta data "Oggi"', `
            <div class="form-group">
                <label>Data di riferimento per la linea "Oggi"</label>
                <input type="date" id="input-custom-today" value="${current}" class="form-input" />
            </div>
            <div class="form-group" style="font-size:12px; color:var(--gray-500);">
                Data reale: ${App.Utils.formatDate(realToday)}. Lascia vuoto per usare la data reale.
            </div>
        `, () => {
            const val = document.getElementById('input-custom-today').value;
            App.state.customToday = val || null;
            try { localStorage.setItem('gantt_customToday', val || ''); } catch(e) {}
            if (App.state.currentView === 'gantt') {
                App.UI.renderGanttView();
            }
        });
    },

    // === VERSIONS PANEL ===
    renderVersionsPanel() {
        const panel = document.getElementById('versions-panel');
        const project = App.getCurrentProject();
        if (!project) return;

        const list = document.getElementById('versions-list');
        list.innerHTML = '';

        const snapshots = (project.snapshots || []).slice().reverse();

        if (snapshots.length === 0) {
            list.innerHTML = '<div class="empty-versions">Nessuno snapshot creato</div>';
            return;
        }

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
                    ${snap.isBaseline ? '<div class="version-badge">BASELINE</div>' : ''}
                </div>
                <div class="version-actions">
                    <button class="btn-small ${snap.isBaseline ? 'btn-active' : ''}"
                        onclick="setBaseline('${snap.id}')" title="Imposta come baseline">
                        ${snap.isBaseline ? 'Rimuovi baseline' : 'Imposta baseline'}
                    </button>
                    <button class="btn-small btn-danger" onclick="deleteSnapshot('${snap.id}')" title="Elimina">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>`;
            list.appendChild(item);
        }
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
