// workspace.js - File System Access API
App.Workspace = {
    DB_NAME: 'GanttWorkspaceDB',
    DB_VERSION: 1,
    STORE_NAME: 'handles',

    async openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onupgradeneeded = () => {
                req.result.createObjectStore(this.STORE_NAME);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async saveHandle(handle) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).put(handle, 'workspace');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    async loadHandle() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const req = tx.objectStore(this.STORE_NAME).get('workspace');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    },

    async selectDirectory() {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await this.saveHandle(handle);
            App.state.dirHandle = handle;
            return handle;
        } catch (e) {
            if (e.name !== 'AbortError') console.error('Errore selezione cartella:', e);
            return null;
        }
    },

    async reconnect() {
        const handle = await this.loadHandle();
        if (!handle) return false;

        try {
            const perm = await handle.queryPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
                App.state.dirHandle = handle;
                return true;
            }
            const req = await handle.requestPermission({ mode: 'readwrite' });
            if (req === 'granted') {
                App.state.dirHandle = handle;
                return true;
            }
        } catch (e) {
            console.warn('Impossibile riconnettersi alla cartella:', e);
        }
        return false;
    },

    async listProjectFiles() {
        const handle = App.state.dirHandle;
        if (!handle) return [];

        const files = [];
        for await (const entry of handle.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('.gantt.json')) {
                files.push(entry);
            }
        }
        return files;
    },

    async readProject(fileHandle) {
        try {
            const file = await fileHandle.getFile();
            const text = await file.text();
            return JSON.parse(text);
        } catch (e) {
            console.error('Errore lettura progetto:', e);
            return null;
        }
    },

    async writeProject(project) {
        const handle = App.state.dirHandle;
        if (!handle) return false;

        try {
            const fileName = this.sanitizeFileName(project.title) + '.gantt.json';
            const fileHandle = await handle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            project._lastSaved = new Date().toISOString();
            await writable.write(JSON.stringify(project, null, 2));
            await writable.close();
            return true;
        } catch (e) {
            console.error('Errore scrittura progetto:', e);
            return false;
        }
    },

    async deleteProjectFile(project) {
        const handle = App.state.dirHandle;
        if (!handle) return false;

        try {
            const fileName = this.sanitizeFileName(project.title) + '.gantt.json';
            await handle.removeEntry(fileName);
            return true;
        } catch (e) {
            console.error('Errore eliminazione file:', e);
            return false;
        }
    },

    sanitizeFileName(name) {
        return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'progetto';
    }
};
