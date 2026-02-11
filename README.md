# Gantt Project Manager

Web app per creare diagrammi di Gantt di progetto, ottimizzati per l'export come immagini da incollare in slide PowerPoint.

![HTML5](https://img.shields.io/badge/HTML5-vanilla-orange) ![JavaScript](https://img.shields.io/badge/JS-ES2020+-yellow) ![Zero Build](https://img.shields.io/badge/build-zero-green)

## Demo

**https://fbeeadacta.github.io/gantt-chart/**

## Quick Start

Aprire `index.html` in **Chrome** o **Edge**. Nessun server, nessuna installazione, funziona anche da `file://`.

## Funzionalit&agrave;

- **Dashboard multi-progetto** con schede riassuntive
- **Editor Gantt interattivo**: drag & drop per spostare e ridimensionare barre attivit&agrave;, segmenti e milestone
- **Fasi e attivit&agrave;** con avanzamento percentuale e milestone di fine
- **Milestone Steering** (kick-off, comitati guida) sulla riga dedicata
- **Segmenti**: periodi di lavoro multipli sulla stessa attivit&agrave;
- **Dipendenze**: collegamenti tra attivit&agrave; (Fine→Inizio, Inizio→Inizio, ecc.) con offset in giorni, frecce SVG sul Gantt, propagazione a cascata e pannello laterale dedicato per gestione rapida
- **Versioning**: snapshot e confronto baseline con barre fantasma
- **Export** SVG vettoriale e PNG ad alta risoluzione (3840&times;2160)
- **Salvataggio automatico** su cartella locale via File System Access API
- **Layout regolabile**: pannello sinistro, larghezza mesi e altezza SVG ridimensionabili via drag

## Architettura

Zero-build, vanilla JavaScript. Nessun npm, bundler o framework.

Tutto il codice vive sotto un unico oggetto globale `App`, con moduli caricati in sequenza da `index.html`:

```
app.js → utils.js → dependencies.js → workspace.js → storage.js → gantt.js → drag.js → ui.js → exporter.js → actions.js → main.js
```

### Persistenza

| Metodo | Dettaglio |
|--------|-----------|
| **File System Access API** | Salva file `.gantt.json` in una cartella locale (Chrome/Edge) |
| **IndexedDB** | Persiste il DirectoryHandle tra sessioni |
| **localStorage** | Fallback per browser senza FS Access API |

## Browser supportati

| Browser | Supporto |
|---------|----------|
| Chrome / Edge | Pieno (incluso salvataggio automatico su cartella) |
| Altri | Funzionalit&agrave; completa tranne salvataggio automatico (usare import/export JSON) |

## Licenza

Uso interno.
