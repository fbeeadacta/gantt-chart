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
    }
};
