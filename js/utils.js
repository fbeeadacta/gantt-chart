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
                date: new Date(current),
                daysInPeriod: new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
            });
            current.setMonth(current.getMonth() + 1);
        }
        return months;
    },

    getISOWeek(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    },

    getWeeksList(start, end) {
        const weeks = [];
        // Snap al lunedì precedente (o uguale) a start
        const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const dow = current.getDay();
        const diff = dow === 0 ? -6 : 1 - dow; // lunedì = 1
        current.setDate(current.getDate() + diff);

        while (current <= end) {
            const wn = this.getISOWeek(current);
            weeks.push({
                year: current.getFullYear(),
                month: current.getMonth(),
                label: 'W' + wn,
                date: new Date(current),
                daysInPeriod: 7
            });
            current.setDate(current.getDate() + 7);
        }
        return weeks;
    },

    getQuartersList(start, end) {
        const quarters = [];
        // Snap all'inizio del trimestre di start (mese 0, 3, 6, 9)
        const qMonth = Math.floor(start.getMonth() / 3) * 3;
        const current = new Date(start.getFullYear(), qMonth, 1);

        while (current <= end) {
            const qNum = Math.floor(current.getMonth() / 3) + 1;
            const nextQ = new Date(current.getFullYear(), current.getMonth() + 3, 1);
            const daysInQ = Math.round((nextQ - current) / 86400000);
            quarters.push({
                year: current.getFullYear(),
                month: current.getMonth(),
                label: 'Q' + qNum,
                date: new Date(current),
                daysInPeriod: daysInQ
            });
            current.setMonth(current.getMonth() + 3);
        }
        return quarters;
    },

    getTimePeriods(unit, start, end) {
        switch (unit) {
            case 'week': return this.getWeeksList(start, end);
            case 'quarter': return this.getQuartersList(start, end);
            default: return this.getMonthsList(start, end);
        }
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

    lightenColor(hex, amount) {
        hex = hex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const nr = Math.round(r + (255 - r) * amount);
        const ng = Math.round(g + (255 - g) * amount);
        const nb = Math.round(b + (255 - b) * amount);
        return '#' + [nr, ng, nb].map(c => c.toString(16).padStart(2, '0')).join('');
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
