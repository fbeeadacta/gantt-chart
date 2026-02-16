// exporter.js - Export SVG e PNG
App.Exporter = {
    exportSVG() {
        const project = App.getCurrentProject();
        if (!project) return;

        const container = document.createElement('div');
        const svg = App.Gantt.render(project, container);
        if (!svg) return;

        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(svg);

        // Aggiungi dichiarazione XML
        svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString;

        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = App.Workspace.sanitizeFileName(project.title) + '.svg';
        a.click();
        URL.revokeObjectURL(url);

        App.UI.toast('SVG esportato');
    },

    async exportPNG() {
        const project = App.getCurrentProject();
        if (!project) return;

        const container = document.createElement('div');
        const svg = App.Gantt.render(project, container);
        if (!svg) return;

        // Dimensioni 4K per alta risoluzione
        const scale = 2;
        const vb = svg.getAttribute('viewBox').split(' ');
        const width = parseFloat(vb[2]) * scale;
        const height = parseFloat(vb[3]) * scale;

        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(svg);

        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            // Sfondo bianco
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);

            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(url);

            canvas.toBlob((pngBlob) => {
                const pngUrl = URL.createObjectURL(pngBlob);
                const a = document.createElement('a');
                a.href = pngUrl;
                a.download = App.Workspace.sanitizeFileName(project.title) + '.png';
                a.click();
                URL.revokeObjectURL(pngUrl);
                App.UI.toast('PNG esportato (alta risoluzione)');
            }, 'image/png');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            App.UI.toast('Errore nell\'esportazione PNG', 'error');
        };
        img.src = url;
    },

    exportCSV() {
        const project = App.getCurrentProject();
        if (!project) return;

        const escapeCSV = (val) => {
            const s = String(val ?? '');
            if (s.includes(';') || s.includes('"') || s.includes('\n')) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        };

        const header = ['Fase', 'Etichetta', 'Attività', 'Inizio', 'Fine', 'Durata (gg)', 'Avanzamento (%)', 'Milestone'];
        const rows = [header.join(';')];

        for (const phase of (project.phases || [])) {
            for (const act of (phase.activities || [])) {
                const s = App.Utils.parseDate(act.startDate);
                const e = App.Utils.parseDate(act.endDate);
                const duration = (s && e) ? App.Utils.daysBetween(s, e) : '';
                rows.push([
                    escapeCSV(phase.name),
                    escapeCSV(phase.label),
                    escapeCSV(act.name),
                    act.startDate || '',
                    act.endDate || '',
                    duration,
                    act.progress || 0,
                    act.hasMilestone ? 'Sì' : 'No'
                ].join(';'));

                // Include segments as additional rows
                for (const seg of (act.segments || [])) {
                    const ss = App.Utils.parseDate(seg.startDate);
                    const se = App.Utils.parseDate(seg.endDate);
                    const segDur = (ss && se) ? App.Utils.daysBetween(ss, se) : '';
                    rows.push([
                        escapeCSV(phase.name),
                        escapeCSV(phase.label),
                        escapeCSV(act.name + ' (segmento)'),
                        seg.startDate || '',
                        seg.endDate || '',
                        segDur,
                        seg.progress || 0,
                        seg.hasMilestone ? 'Sì' : 'No'
                    ].join(';'));
                }
            }
        }

        const csvContent = '\uFEFF' + rows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = App.Workspace.sanitizeFileName(project.title) + '_attività.csv';
        a.click();
        URL.revokeObjectURL(url);

        App.UI.toast('CSV esportato');
    }
};
