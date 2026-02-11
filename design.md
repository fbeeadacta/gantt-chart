# Gantt Project Manager - Requisiti di Design

## Obiettivo

Creare uno strumento per costruire diagrammi di Gantt di progetto, ottimizzati per essere esportati come immagini e incollati in slide PowerPoint. Lo strumento deve essere utilizzabile da un project manager senza competenze tecniche, direttamente dal browser, senza installazione.

---

## 1. Gestione Multi-Progetto

### Dashboard
- All'apertura l'utente vede una lista dei propri progetti sotto forma di schede (cards).
- Ogni scheda mostra: titolo del progetto, periodo (data inizio - data fine), numero di fasi e attivit, data ultimo aggiornamento.
- L'utente pu creare un nuovo progetto, importare un progetto da file JSON, eliminare un progetto esistente, esportare un progetto come file JSON.
- Cliccando su una scheda si entra nella vista Gantt del progetto.

### Persistenza
- I progetti vengono salvati automaticamente su una cartella locale scelta dall'utente (su browser compatibili: Chrome, Edge).
- Ogni progetto  un file `.gantt.json` separato nella cartella.
- Il salvataggio avviene automaticamente ad ogni modifica, senza che l'utente debba premere "Salva".
- Se il browser non supporta il salvataggio su cartella, l'utente pu comunque lavorare e usare import/export manuale.
- Alla riapertura dell'app, la cartella precedentemente selezionata viene riproposta automaticamente.

---

## 2. Struttura del Progetto

### Progetto
- Ha un **titolo** (es. "Costing e Valorizzazione Magazzini").
- Contiene una o pi **fasi**, ordinate dall'utente.
- Contiene una riga **Steering** con milestone indipendenti dalle fasi.

### Fase
- Ha un **nome** descrittivo (es. "Assessment e Disegno To-Be").
- Ha un'**etichetta breve** che appare verticalmente nel pannello sinistro (es. "FASE 1", "FASE 2").
- Contiene una o pi **attivit**, ordinate dall'utente.
- Le date di inizio e fine della fase sono calcolate automaticamente dalla prima e ultima attivit contenuta.
- La barra sommario della fase mostra visivamente l'estensione temporale complessiva.

### Attivit
- Ha un **nome** (es. "Sviluppo Datamart").
- Ha una **data inizio** e una **data fine**.
- Ha un **avanzamento** espresso in percentuale (0-100%), regolabile con uno slider.
- Pu avere una **milestone di fine** (simbolo diamante alla fine della barra).
- Pu essere spostata tra fasi diverse.

### Milestone Steering
- Sono milestone posizionate nella riga "KICK OFF / STEERING" in cima al Gantt.
- Hanno una **data**, un'**etichetta** opzionale, un **tipo** (triangolo o diamante) e un **colore** (oro per kick-off, grigio per steering periodici, blu scuro per altri).
- Servono a segnare eventi chiave del progetto indipendenti dalle singole attivit: kick-off, comitati guida, checkpoint.

---

## 3. Visualizzazione Gantt

### Layout Generale
- Il Gantt ha proporzioni **16:9** (formato slide), cos da poter essere inserito direttamente in una presentazione PowerPoint senza ritagli o distorsioni.
- A **sinistra** c' un pannello con le etichette: titolo del progetto (verticale), etichette delle fasi (verticali), nomi delle attivit.
- A **destra** c' l'area temporale con la griglia mensile e le barre.

### Header Temporale
- In alto, due righe: **anno** e **mese**.
- I mesi sono abbreviati in italiano (GEN, FEB, MAR, ...).
- Il range temporale si adatta automaticamente alle date del progetto, con un mese di margine prima e dopo.

### Barre
- **Barra sommario fase**: barra scura piena che copre l'intera estensione della fase, con piccoli triangoli alle estremit. Non  modificabile direttamente (calcolata dalle attivit).
- **Barra attivit**: composta da due strati sovrapposti:
  - Sfondo azzurro chiaro = durata totale dell'attivit.
  - Riempimento blu scuro da sinistra = porzione completata (proporzionale all'avanzamento %).
- **Milestone diamante**: rombo blu scuro posizionato alla fine della barra dell'attivit, se abilitato.

### Milestone Steering
- Triangoli (punta in basso) sulla riga steering.
- Il primo (kick-off) di colore oro, i successivi grigi.

### Linea "Oggi"
- Una linea verticale rossa che indica la data odierna.
- Visibile solo se la data odierna rientra nel range del Gantt.

### Griglia
- Linee verticali sottili per ogni mese.
- Linee pi marcate ai confini tra un anno e l'altro.
- Linee orizzontali tratteggiate per separare le fasi.

---

## 4. Editing

### Creazione
- Dalla toolbar si possono aggiungere: nuove fasi, nuove attivit (selezionando la fase di destinazione), nuove milestone steering.
- La creazione avviene tramite modali (finestre di dialogo) con campi compilabili.

### Modifica
- **Doppio click** su una barra o sul nome di un'attivit apre la modale di modifica.
- **Doppio click** sul nome di una fase apre la modale di modifica fase.
- **Doppio click** su una milestone steering apre la modale di modifica milestone.
- Nelle modali di modifica  sempre presente il pulsante "Elimina" per rimuovere l'elemento.

### Campi editabili
- **Progetto**: titolo.
- **Fase**: nome, etichetta verticale.
- **Attivit**: nome, data inizio, data fine, avanzamento (slider), milestone di fine (checkbox), fase di appartenenza (dropdown per spostare tra fasi).
- **Milestone steering**: data, etichetta, tipo (triangolo/diamante), colore (oro/grigio/blu).

### Feedback
- Notifiche temporanee (toast) in basso a destra confermano le azioni: "Fase aggiunta", "Salvato", "PNG esportato", ecc.
- Messaggi di avviso se si tenta un'azione non valida (es. "Crea prima una fase" se si prova ad aggiungere un'attivit senza fasi).

---

## 5. Export Immagine

### SVG
- Esporta il Gantt come file `.svg` vettoriale.
- Utile per modifica successiva o inclusione in documenti scalabili.

### PNG
- Esporta il Gantt come file `.png` ad alta risoluzione (doppia scala per qualit 4K: 3840x2160 pixel).
- Il PNG  pensato per essere incollato direttamente in una slide PowerPoint mantenendo nitidezza e leggibilit.
- Lo sfondo  bianco, i font sono quelli di sistema (Segoe UI, Arial) per garantire coerenza visiva.

---

## 6. Versioning e Baseline

### Snapshot
- L'utente pu creare uno **snapshot** (fotografia) dello stato attuale del progetto in qualsiasi momento.
- Ogni snapshot ha un nome (es. "Snapshot 10/02/2026") e la data di creazione.
- Gli snapshot sono elencati nel pannello laterale "Versioni".

### Baseline
- L'utente pu impostare uno snapshot come **baseline** (riferimento).
- Quando la baseline  attiva, il Gantt sovrappone alle barre attuali delle **barre fantasma tratteggiate** (grigie, semitrasparenti) che rappresentano le date della baseline.
- Questo permette di vedere immediatamente gli **slittamenti**: se un'attivit  stata posticipata rispetto alla baseline, la barra tratteggiata (pianificato) e la barra piena (attuale) saranno sfasate.
- La baseline si attiva/disattiva con un pulsante nella toolbar o dal pannello versioni.

### Pannello Versioni
- Pannello laterale apribile dalla toolbar.
- Mostra l'elenco degli snapshot dal pi recente al pi vecchio.
- Per ogni snapshot: nome, data, azioni (imposta come baseline, elimina).
- Lo snapshot attualmente impostato come baseline  evidenziato.

---

## 7. Compatibilit Browser

- L'app funziona aprendo un singolo file HTML nel browser, senza installazione n server.
- **Chrome/Edge**: piena funzionalit, incluso salvataggio automatico su cartella locale.
- **Altri browser**: funzionalit completa tranne il salvataggio automatico. L'utente pu usare import/export manuale di file JSON.
- Se il salvataggio automatico non  disponibile, viene mostrato un avviso chiaro con istruzioni.

---

## 8. Riferimento Visivo

Il Gantt deve riprodurre fedelmente lo stile del file `esempio.png` fornito come riferimento:

- Palette colori: blu scuro (#1a3a5c) per barre sommario, progress e header; azzurro chiaro (#a8c8e8) per barre attivit rimanenti; oro per milestone kick-off; grigio per milestone steering; rosso per linea oggi.
- Font: Segoe UI o Arial, leggibile anche in dimensione ridotta su slide.
- Pannello sinistro con bordi tratteggiati per delimitare titolo progetto e etichette fase.
- Nomi attivit in corsivo e colore pi chiaro rispetto ai nomi delle fasi (in grassetto).
- Proporzioni 16:9 complessive.
