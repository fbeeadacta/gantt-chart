// storage.js - Persistenza (File System + localStorage fallback)
App.Storage = {
    LS_KEY: 'gantt_projects',

    async loadAll() {
        // Prova File System Access API
        if (App.state.dirHandle) {
            return await this.loadFromFileSystem();
        }
        // Fallback localStorage
        return this.loadFromLocalStorage();
    },

    async loadFromFileSystem() {
        const files = await App.Workspace.listProjectFiles();
        const projects = [];
        for (const fh of files) {
            const data = await App.Workspace.readProject(fh);
            if (data && data._type === 'gantt_project') {
                projects.push(data);
            }
        }
        return projects;
    },

    loadFromLocalStorage() {
        try {
            const raw = localStorage.getItem(this.LS_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('Errore lettura localStorage:', e);
            return [];
        }
    },

    async save(project) {
        project._lastSaved = new Date().toISOString();

        // Aggiorna nell'array in memoria
        const idx = App.state.projects.findIndex(p => p.id === project.id);
        if (idx >= 0) {
            App.state.projects[idx] = project;
        } else {
            App.state.projects.push(project);
        }

        // Salva su File System se disponibile
        if (App.state.dirHandle) {
            const ok = await App.Workspace.writeProject(project);
            if (ok) return true;
        }

        // Fallback localStorage
        this.saveToLocalStorage();
        return true;
    },

    saveToLocalStorage() {
        try {
            localStorage.setItem(this.LS_KEY, JSON.stringify(App.state.projects));
        } catch (e) {
            console.error('Errore salvataggio localStorage:', e);
        }
    },

    async deleteProject(projectId) {
        const project = App.state.projects.find(p => p.id === projectId);
        if (!project) return;

        // Rimuovi dal filesystem
        if (App.state.dirHandle) {
            await App.Workspace.deleteProjectFile(project);
        }

        // Rimuovi dall'array
        App.state.projects = App.state.projects.filter(p => p.id !== projectId);

        // Aggiorna localStorage
        this.saveToLocalStorage();
    },

    exportProjectJSON(project) {
        const json = JSON.stringify(project, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = App.Workspace.sanitizeFileName(project.title) + '.gantt.json';
        a.click();
        URL.revokeObjectURL(url);
    },

    importProjectJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    if (data._type !== 'gantt_project') {
                        reject(new Error('File non valido: non è un progetto Gantt'));
                        return;
                    }
                    // Genera nuovo ID per evitare conflitti
                    data.id = App.Utils.generateId('proj');
                    resolve(data);
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }
};
