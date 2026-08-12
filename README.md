# ⚽ Asta Fantacalcio — busta chiusa, a chiamata, in tempo reale

Web app completa per gestire un'asta di Fantacalcio a busta chiusa con
chiamata a turno, pensata per 8 partecipanti connessi contemporaneamente da
PC, tablet o smartphone. Stack: **Next.js (App Router, TypeScript) +
Tailwind CSS + Supabase (Postgres + Realtime) + Vercel**.

## Indice

1. [Architettura in breve](#architettura-in-breve)
2. [Setup Supabase](#1-setup-supabase)
3. [Variabili d'ambiente](#2-variabili-dambiente)
4. [Sviluppo locale](#3-sviluppo-locale)
5. [Deploy su GitHub + Vercel](#4-deploy-su-github--vercel)
6. [Uso dell'app la sera dell'asta](#5-uso-dellapp-la-sera-dellasta)
7. [Decisioni di design e limiti noti](#6-decisioni-di-design-e-limiti-noti)

---

## Architettura in breve

- **Database**: Postgres su Supabase. Schema in `supabase/migrations/0001_init.sql`
  (tabelle + RLS + realtime) e `0002_functions.sql` (l'intera logica
  dell'asta come funzioni Postgres/RPC — chiamata, offerta, risoluzione,
  pareggi, azioni admin).
- **Backend**: le API route di Next.js (`src/app/api/**`) sono l'unico
  punto che parla con la `service_role` key di Supabase. Autenticano il
  partecipante/admin tramite un token di sessione, poi invocano le
  funzioni RPC lato database.
- **Sicurezza delle offerte**: la tabella `bids` non ha **nessuna** policy
  RLS → con RLS abilitata questo significa accesso negato per chiunque
  usi la chiave `anon` (il browser), anche via Realtime. Solo la
  `service_role` (usata esclusivamente dalle API route server-side) può
  leggerla o scriverla. Le offerte diventano pubbliche solo dopo la
  chiusura del round, quando il server copia il "reveal" nella tabella
  pubblica `bid_rounds`.
- **Timer sincronizzato**: il server è l'unica fonte di verità (colonna
  `phase_end_at`). Non esistendo un processo persistente in
  un'infrastruttura serverless come Vercel, la chiusura effettiva del
  round è affidata a un "tick": ogni client connesso invia una richiesta
  leggera (`POST /api/leagues/[code]/tick`) circa una volta al secondo
  mentre il timer è attivo. Chi arriva dopo la scadenza fa scattare la
  risoluzione, che è protetta da un lock di riga Postgres
  (`select ... for update`): è sicura anche se più client la chiamano
  nello stesso istante.
- **Realtime**: Supabase Realtime (Postgres Changes) su `auction_state`,
  `participants`, `players`, `bid_rounds`, `rosters`, `history`. Tutti i
  client vedono chiamate, timer, esiti e cambi turno senza ricaricare la
  pagina.

## 1. Setup Supabase

1. Crea un progetto su [supabase.com](https://supabase.com) (piano free
   sufficiente per 8 partecipanti).
2. Apri **SQL Editor** e incolla ed esegui, **in ordine**:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_functions.sql`
   (In alternativa, se usi la Supabase CLI: `supabase link` seguito da
   `supabase db push`.)
3. Verifica in **Database → Replication** che le tabelle
   `auction_state`, `participants`, `players`, `bid_rounds`, `rosters`,
   `history` risultino aggiunte alla pubblicazione `supabase_realtime`
   (lo script lo fa già automaticamente; questo passaggio è solo di
   controllo).
4. In **Project Settings → API** copia: `Project URL`, chiave `anon
   public` e chiave `service_role` (quest'ultima è segreta: non
   condividerla né metterla a `NEXT_PUBLIC_*`).

## 2. Variabili d'ambiente

Copia `.env.example` in `.env.local` per lo sviluppo locale:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Le stesse quattro variabili vanno impostate in **Vercel → Project
Settings → Environment Variables** prima del deploy.

## 3. Sviluppo locale

```bash
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000). Da lì puoi creare una
nuova lega (`/crea`) oppure entrare con un codice lega esistente.

## 4. Deploy su GitHub + Vercel

```bash
git init   # se non è già una repo
git add .
git commit -m "Asta Fantacalcio"
git branch -M main
git remote add origin https://github.com/<tuo-utente>/<tuo-repo>.git
git push -u origin main
```

Poi su [vercel.com](https://vercel.com):

1. **Add New → Project**, importa il repository GitHub appena creato.
2. Framework preset: Next.js (rilevato automaticamente).
3. In **Environment Variables** inserisci le 4 variabili del punto 2.
4. Deploy. Ogni push su `main` ridistribuisce automaticamente.

Non è richiesta nessuna configurazione server aggiuntiva: le API route
girano come funzioni serverless di Vercel.

## 5. Uso dell'app la sera dell'asta

1. L'admin crea la lega da `/crea` (nome, crediti, composizione rosa,
   timer, regola di spareggio...) e ottiene il **codice lega**
   (es. `FANTA2026`).
2. L'admin importa i giocatori da Excel dal pannello `/league/<CODICE>/admin`
   ("Importa giocatori da Excel"): carica il file, verifica/aggiusta
   l'associazione delle colonne, controlla l'anteprima, importa.
3. Gli altri partecipanti apronoo l'app (sullo stesso link, da telefono o
   PC), inseriscono **codice lega + il proprio nome** e restano sulla
   dashboard.
4. Quando tutti sono pronti, l'admin preme **Avvia asta**.
5. Si procede a turno: chi è di turno vede "È IL TUO TURNO" e può
   chiamare un giocatore o passare; alla chiamata parte il timer per
   tutti, ognuno decide in privato PARTECIPO/NON PARTECIPO e l'eventuale
   importo; alla scadenza il risultato viene rivelato a tutti
   contemporaneamente.
6. A fine asta (tutte le rose complete) è disponibile l'esportazione in
   Excel (rose, crediti, storico) da `/league/<CODICE>/classifica`.

Se il browser di qualcuno si chiude o perde la connessione, riaprendo lo
stesso link il progresso non si perde: la sessione del partecipante è
salvata nel dispositivo e lo stato dell'asta vive sul server.

## 6. Decisioni di design e limiti noti

- **Ruolo "admin che non gioca"**: in fase di creazione lega si può
  scegliere se l'amministratore partecipa anch'esso all'asta con una
  propria rosa oppure gestisce solo l'evento (`is_player = false`, non
  entra nella rotazione dei turni né nel conteggio "rosa completa").
- **Autenticazione semplice, non Supabase Auth**: ogni partecipante
  riceve un token di sessione casuale al momento dell'ingresso; solo il
  suo hash SHA-256 è salvato in database. L'admin ha invece una password
  (bcrypt) impostata alla creazione della lega, usata per il login da
  altri dispositivi (`/league/<CODICE>/admin`).
- **Tick lato client come "orologio" del server**: è il compromesso
  corretto per un'infrastruttura serverless senza processi persistenti.
  Finché almeno un partecipante ha la pagina aperta durante il countdown
  (praticamente sempre, essendo un evento live con 8 persone connesse), la
  risoluzione avviene entro ~1 secondo dalla scadenza. Se per assurdo
  **tutti** chiudessero il browser esattamente nell'istante di scadenza,
  il round resterebbe "congelato" fino al prossimo tick di un client che
  si riconnette: nella pratica di un'asta live questo non accade.
- **Offerta massima consentita**: crediti attuali meno una riserva di 1
  credito (configurabile) per ogni slot di rosa ancora da riempire dopo
  l'acquisto corrente — impedisce di spendere più di quanto permetta di
  completare la rosa minima.
- **Import Excel**: il parsing avviene lato browser (SheetJS) così puoi
  vedere l'anteprima e correggere la mappatura delle colonne prima di
  scrivere nulla nel database. Riconosce di default il formato "Lega
  Fantacalcio" (colonne `R`, `Nome`, `Squadra`, `Qt.A`) ma la mappatura è
  manuale e quindi adattabile ad altri formati.
