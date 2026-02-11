# Tech Stack - Timesheet Manager

Documento tecnico sullo stack tecnologico adottato per **Timesheet Manager**, una web app statica per l'elaborazione di timesheet aziendali. Serve da riferimento per future implementazioni con architettura simile.

---

## Panoramica Architetturale

L'applicazione segue un approccio **zero-build**: nessun bundler, transpiler o framework. Il frontend e puro HTML/CSS/JavaScript vanilla, caricato direttamente dal filesystem o da un server statico. Il backend e limitato a un server MCP (Model Context Protocol) opzionale in Node.js per l'integrazione con AI.

```
┌─────────────────────────────────────────────────────────┐
│                     BROWSER (Chrome/Edge)                │
│                                                         │
│  index.html ──► js/*.js (App namespace)                 │
│       │              │                                  │
│       │         App.Workspace ──► File System Access API│
│       │              │                  │               │
│       │         App.Storage   ──► IndexedDB (handles)   │
│       │              │              localStorage (fallback)
│       │              ▼                                  │
│  CDN libs     /workspace/                               │
│  (SheetJS,     ├── Progetto A/project.json              │
│   ExcelJS)     └── Progetto B/project.json              │
└──────────────────────┬──────────────────────────────────┘
                       │ condivisione file
┌──────────────────────▼──────────────────────────────────┐
│              MCP SERVER (Node.js, opzionale)             │
│                                                         │
│  stdio transport (Claude Code) + HTTP health :3847      │
│  @modelcontextprotocol/sdk                              │
│  TimesheetData class (legge/scrive stessi project.json) │
└─────────────────────────────────────────────────────────┘
```

---

## Frontend

### Linguaggi e Standard

| Tecnologia | Versione | Note |
|-----------|----------|------|
| **HTML5** | - | Singolo `index.html`, markup semantico |
| **CSS3** | - | Singolo `css/styles.css`, CSS custom properties, `color-mix()` |
| **JavaScript** | ES2020+ | Vanilla, nessun framework, `async/await`, optional chaining |

### Perche vanilla JS senza framework

- **Zero dipendenze di build**: nessun `node_modules`, webpack, vite o simili per il frontend
- **Avvio istantaneo**: apertura diretta di `index.html` via `file://` o HTTPS
- **Manutenzione minimale**: nessun aggiornamento framework, nessuna breaking change
- **Adatto a tool interni**: l'app e uno strumento aziendale con scope limitato, non un prodotto consumer

**Quando questa scelta e appropriata**: app interne con UI moderatamente complessa (< 15 viste), team piccolo, nessun requisito SEO/SSR, ciclo di vita lungo con manutenzione sporadica.

**Quando preferire un framework**: app con molte viste dinamiche, team multiplo, necessita di routing complesso, stato condiviso tra decine di componenti.

### Pattern: Global Namespace

Tutto il codice e organizzato sotto un unico oggetto `App`, con moduli aggiunti da file separati:

```javascript
// app.js - crea il namespace e lo stato
const App = { state: { ... } };

// utils.js - aggiunge modulo
App.Utils = { generateActivityHash() { ... } };

// ui.js, calculator.js, ecc. - stessa logica
App.UI = { ... };
App.Calculator = { ... };
```

**Ordine di caricamento** (in `index.html`):
1. `app.js` - Namespace + state
2. `utils.js` - Funzioni pure
3. `workspace.js` - File System Access API
4. `storage.js` - Persistenza
5. `calculator.js` - Logica business
6. `ui.js` - Rendering
7. `exporter.js` - Export
8. `actions.js` - Coordinamento
9. `main.js` - Init + funzioni window-scope (onclick handlers)
10. `logo.js` - Logo SVG

Le funzioni chiamate da `onclick` nell'HTML sono esposte a livello `window` in `main.js`:
```html
<button onclick="openProject('proj_123')">Apri</button>
```
```javascript
// main.js
function openProject(id) { /* ... */ }
// automaticamente window.openProject
```

### Librerie Esterne (CDN)

| Libreria | Versione | CDN | Scopo |
|----------|----------|-----|-------|
| **SheetJS (xlsx)** | 0.18.5 | cdnjs | Parsing file Excel in input |
| **xlsx-js-style** | 1.2.0 | jsDelivr | Export Excel con formattazione |
| **ExcelJS** | 4.4.0 | cdnjs | Generazione report Excel avanzati |

Le tre librerie Excel coesistono perche coprono casi d'uso diversi:
- **SheetJS**: lettura robusta di qualsiasi formato Excel
- **xlsx-js-style**: export rapido con stili basilari
- **ExcelJS**: report complessi con formattazione avanzata (colori, bordi, merge celle)

### Font

- **Inter** (Google Fonts, pesi 400/500/600/700) - Caricato via `@import` in CSS

---

## API del Browser

### File System Access API

API principale per la persistenza. Permette lettura/scrittura diretta su disco senza server.

```javascript
// Selezione workspace
const handle = await window.showDirectoryPicker();

// Lettura
const fileHandle = await dirHandle.getFileHandle('project.json');
const file = await fileHandle.getFile();
const text = await file.text();

// Scrittura
const writable = await fileHandle.createWritable();
await writable.write(JSON.stringify(data));
await writable.close();
```

**Compatibilita**: Solo Chrome e Edge (Chromium-based). Richiede contesto sicuro (HTTPS, localhost, o `file://`).

**Limitazione critica**: i permessi sono per sessione. Al ricaricamento della pagina, l'utente deve ri-autorizzare l'accesso. Per mitigare questo, l'handle viene persistito in IndexedDB.

### IndexedDB

Usato esclusivamente per persistere il `DirectoryHandle` del workspace tra sessioni:

```javascript
// Salvataggio handle
const db = await indexedDB.open('TimesheetWorkspaceDB', 1);
const tx = db.transaction('handles', 'readwrite');
tx.objectStore('handles').put(handle, 'workspace');

// Recupero + verifica permessi
const savedHandle = await store.get('workspace');
const permission = await savedHandle.queryPermission({ mode: 'readwrite' });
if (permission === 'granted') {
    // Riconnessione automatica
} else {
    // Mostra banner "Clicca per riconnettere"
    await savedHandle.requestPermission({ mode: 'readwrite' });
}
```

### localStorage

Fallback per quando File System Access API non e disponibile. Salva l'intero stato come JSON serializzato.

---

## CSS Architecture

### Design Tokens (Custom Properties)

```css
:root {
    --primary: #5c88da;
    --primary-hover: #4a73c4;
    --primary-light: #e0e9f7;
    --success: #10b981;
    --warning: #ffc000;
    --danger: #ef4444;
    --gray-50 ... --gray-900;    /* scala di grigi a 10 step */
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --shadow-sm / --shadow-md / --shadow-lg;
    --transition: all 0.2s ease;
}
```

### Derivazione Automatica dei Colori

I componenti derivano varianti dal colore primario con `color-mix()`:

```css
.stat-box {
    background: color-mix(in srgb, var(--primary) 8%, white);
    border-color: color-mix(in srgb, var(--primary) 20%, white);
}
```

Questo garantisce che cambiando `--primary` in `:root` si aggiornino automaticamente tutti i componenti.

---

## Persistenza Dati

### Formato v3 (Attuale)

Ogni progetto ha la propria cartella con un file `project.json`:

```
/workspace/
├── Cliente ABC/
│   └── project.json      ← formato v3
├── Cliente XYZ/
│   └── project.json
```

Struttura `project.json`:
```json
{
  "_type": "timesheet_project",
  "_version": 3,
  "_lastSaved": "2026-02-04T10:00:00Z",
  "id": "proj_1234567890",
  "name": "Cliente ABC",
  "tariffa": 600,
  "oreGiornata": 8,
  "calcMode": "tariffa",
  "collaboratorRates": { "Mario Rossi": 500 },
  "clusters": [{ "id": "cl_xxx", "name": "Sviluppo", "color": "#3498db" }],
  "monthlyReports": {
    "2026-01": {
      "status": "closed",
      "activities": { "<hash>": { "clusterId": "cl_xxx", "giornateModificate": 1.5, "originalData": {} } },
      "history": [{ "date": "...", "fileName": "...", "loaded": 10, "new": 5 }]
    }
  }
}
```

### Hash come Chiave Attivita

Ogni attivita e identificata da un hash deterministico:
```
Data|Collaboratore|Descrizione|ImportoOriginale
```
Questo permette di ri-importare lo stesso Excel senza duplicare dati e di preservare modifiche manuali (cluster, arrotondamenti).

### Formato v2 (Legacy, Supportato in Sola Lettura)

File singolo `timesheet_data.json` con tutti i progetti in un array. L'app e il server MCP migrano automaticamente al v3.

### Backup Automatici

Ogni scrittura su disco (lato MCP server) crea una copia `.bak` del file prima di sovrascriverlo.

---

## MCP Server (Backend)

### Cos'e MCP

**Model Context Protocol** e uno standard aperto per connettere AI (Claude, ecc.) a tool esterni. Il server espone "tool" che l'AI puo invocare per leggere e modificare dati.

### Stack

| Componente | Tecnologia |
|-----------|-----------|
| Runtime | **Node.js** >= 18 |
| Protocollo | **MCP** via `@modelcontextprotocol/sdk` ^1.0.0 |
| Moduli | **ES Modules** (`"type": "module"`) |
| Trasporto | **stdio** (comunicazione con Claude Code) |
| Health check | **http** nativo Node.js, porta 3847, CORS abilitato |

### Architettura Tool

Ogni tool e un modulo ES con due export:

```javascript
// tools/list-projects.js
export const definition = {
  name: 'list_projects',
  description: 'Elenca progetti con statistiche',
  inputSchema: {
    type: 'object',
    properties: { filePath: { type: 'string' } },
    required: ['filePath']
  }
};

export async function handler(args) {
  const ts = await loadTimesheet(args.filePath);
  // ... logica
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
```

Il server centrale (`index.js`) registra tutti i tool in una `Map` e li dispatcha.

### Classe TimesheetData

Astrazione centrale che incapsula la lettura/scrittura dei dati in tutti i formati supportati:

```javascript
// Caricamento adattivo
const ts = await TimesheetData.load('path/to/project.json');    // v2 o v3
const ts = await TimesheetData.loadWorkspace('path/to/workspace/'); // directory

// Operazioni
ts.getProjects();
ts.getProject(projectId);
ts.save(); // scrive su disco con backup .bak
```

Internamente normalizza tutto al formato v2 per uniformita, ma salva nel formato originale.

### Condivisione File

Server MCP e app web operano sugli **stessi file** su disco. Non c'e database: il filesystem e il database. Questo semplifica enormemente l'architettura ma richiede attenzione alla concorrenza (in pratica non e un problema perche l'uso e mono-utente).

---

## CI/CD

### GitHub Pages Deploy

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .                    # Deploya l'intera root
      - uses: actions/deploy-pages@v4
```

Nessun build step nel CI: i file vengono serviti cosi come sono. Questo e possibile perche non c'e transpilazione o bundling.

### Versioning

Semantic versioning con tag Git e GitHub Releases:
```bash
git tag v1.2.0
gh release create v1.2.0 --title "v1.2.0 - Titolo" --generate-notes
```

---

## Ambiente di Sviluppo

### Requisiti

| Requisito | Versione | Note |
|-----------|----------|------|
| Browser | Chrome o Edge | Richiesto per File System Access API |
| Node.js | >= 18 | Solo per server MCP |
| Git | qualsiasi | Versionamento |
| GitHub CLI (`gh`) | qualsiasi | Release e gestione repo |

### Quick Start (Windows)

```bash
# Opzione 1: launcher automatico
start-app.bat     # Avvia MCP server + apre browser

# Opzione 2: manuale
cd mcp-server && npm install    # Solo prima volta
node index.js                   # Avvia server MCP (opzionale)
# Poi aprire index.html in Chrome/Edge
```

### Nessun Linting o Test Automatici

Il progetto non ha test automatici, linting o formatting configurati. La validazione e manuale nel browser.

---

## Lezioni e Pattern Replicabili

### 1. Namespace Pattern per App Vanilla

Invece di inquinare il global scope o usare moduli ES (che richiederebbero un server per `file://`), il pattern `App.ModuleName` offre:
- Organizzazione chiara senza build tool
- Compatibilita con `file://` (importante per tool interni)
- Facile debugging (tutto ispezionabile da console: `App.state`, `App.Calculator`, ecc.)

### 2. File System Access API come "Database"

Per app mono-utente interne, il filesystem locale e un'alternativa valida a database o backend:
- Zero infrastruttura server
- Dati ispezionabili e editabili manualmente (JSON)
- Backup naturale (copia cartella)
- Condivisione via cartelle di rete o cloud sync (OneDrive, ecc.)

### 3. MCP come Layer di Integrazione AI

Il server MCP permette all'AI di operare sui dati senza reimplementare la logica dell'app:
- Tool atomici (assegna cluster, arrotonda, chiudi mese)
- Stessi file condivisi con l'app web
- Health check HTTP per feedback visivo nell'app

### 4. CDN per Dipendenze Stabili

Per librerie mature e stabili (SheetJS, ExcelJS), il caricamento via CDN elimina la necessita di `package.json` e `node_modules` nel frontend. Funziona bene quando:
- Le librerie sono poche (< 5)
- Le versioni sono pinnate (non `@latest`)
- Non serve tree-shaking

### 5. CSS Custom Properties + color-mix()

`color-mix()` permette di derivare varianti (lighter, hover) da un singolo colore primario, creando un design system coerente con una sola variabile da cambiare.

### 6. Deploy Senza Build

Se non c'e build step, il deploy diventa banale: copia dei file. GitHub Pages con `path: .` deploya l'intera root senza trasformazioni.

---

## Limiti Noti dello Stack

| Limite | Impatto | Mitigazione |
|--------|---------|-------------|
| No framework JS | Gestione stato manuale, rendering imperativo | Accettabile per scope attuale |
| File System Access API solo Chromium | Esclusi Firefox/Safari | Target interno, browser controllato |
| No test automatici | Regressioni possibili | Test manuale, scope limitato |
| No TypeScript | Nessun type checking | JSDoc per documentazione |
| CDN singolo punto di fallimento | Offline non funziona | App usata in rete aziendale |
| Concorrenza file non gestita | Possibile corruzione se due tab scrivono | Uso mono-utente nella pratica |
