// utils.js - Funzioni di utilità
App.Utils = {
    generateId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    },

    parseDate(dateStr) {
        if (!dateStr) return null;
        return new Date(dateStr + 'T00:00:00');
    },

    toISODate(date) {
        if (!date) return '';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    getToday() {
        if (App.state.customToday) {
            const d = this.parseDate(App.state.customToday);
            if (d) return d;
        }
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    },

    daysBetween(d1, d2) {
        const ms = d2.getTime() - d1.getTime();
        return Math.round(ms / (1000 * 60 * 60 * 24));
    },

    getMonthRange(project) {
        let minDate = null;
        let maxDate = null;

        for (const phase of project.phases) {
            for (const act of phase.activities) {
                const s = this.parseDate(act.startDate);
                const e = this.parseDate(act.endDate);
                if (s && (!minDate || s < minDate)) minDate = s;
                if (e && (!maxDate || e > maxDate)) maxDate = e;
                // Segmenti aggiuntivi
                if (act.segments) {
                    for (const seg of act.segments) {
                        const ss = this.parseDate(seg.startDate);
                        const se = this.parseDate(seg.endDate);
                        if (ss && (!minDate || ss < minDate)) minDate = ss;
                        if (se && (!maxDate || se > maxDate)) maxDate = se;
                    }
                }
            }
        }
        for (const ms of project.steeringMilestones) {
            const d = this.parseDate(ms.date);
            if (d && (!minDate || d < minDate)) minDate = d;
            if (d && (!maxDate || d > maxDate)) maxDate = d;
        }

        if (!minDate || !maxDate) {
            minDate = new Date();
            maxDate = new Date();
            maxDate.setMonth(maxDate.getMonth() + 6);
        }

        // Margine di un mese prima solo se ci sono elementi nei primi 15 giorni
        const startOffset = minDate.getDate() <= 15 ? 1 : 0;
        const start = new Date(minDate.getFullYear(), minDate.getMonth() - startOffset, 1);
        // Margine di un mese dopo solo se ci sono elementi negli ultimi 15 giorni
        const daysInMaxMonth = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0).getDate();
        const endOffset = maxDate.getDate() > daysInMaxMonth - 15 ? 2 : 1;
        const end = new Date(maxDate.getFullYear(), maxDate.getMonth() + endOffset, 0);

        return { start, end };
    },

    getMonthsList(start, end) {
        const months = [];
        const current = new Date(start.getFullYear(), start.getMonth(), 1);
        while (current <= end) {
            months.push({
                year: current.getFullYear(),
                month: current.getMonth(),
                label: App.MONTHS_IT[current.getMonth()],
                date: new Date(current)
            });
            current.setMonth(current.getMonth() + 1);
        }
        return months;
    },

    getPhaseRange(phase) {
        let minDate = null;
        let maxDate = null;
        for (const act of phase.activities) {
            const s = this.parseDate(act.startDate);
            const e = this.parseDate(act.endDate);
            if (s && (!minDate || s < minDate)) minDate = s;
            if (e && (!maxDate || e > maxDate)) maxDate = e;
            if (act.segments) {
                for (const seg of act.segments) {
                    if (seg.includeInPhase === false) continue;
                    const ss = this.parseDate(seg.startDate);
                    const se = this.parseDate(seg.endDate);
                    if (ss && (!minDate || ss < minDate)) minDate = ss;
                    if (se && (!maxDate || se > maxDate)) maxDate = se;
                }
            }
        }
        return { start: minDate, end: maxDate };
    },

    createEmptyProject(title = 'Nuovo Progetto') {
        return {
            _type: 'gantt_project',
            _version: 1,
            _lastSaved: new Date().toISOString(),
            id: this.generateId('proj'),
            title: title,
            client: '',
            phases: [],
            steeringMilestones: [],
            snapshots: []
        };
    },

    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    debounce(fn, delay = 500) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }
};
