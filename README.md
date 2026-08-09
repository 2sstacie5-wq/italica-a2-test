# ITALICA — Test di livello A2 (app interattiva)

App web che fa svolgere agli studenti il test finale A2 online: 7 parti (grammatica,
due testi di lettura, lessico, uso della lingua, produzione scritta, produzione orale
con registrazione audio dal microfono), timer di 90 minuti, e un pannello admin dove
tu correggi le parti aperte/scritte/orali e ascolti gli audio.

## Struttura del progetto

```
server.js              -> server Express (API + file statici)
server/content.js       -> TUTTO il contenuto del test (domande, testi, risposte corrette)
server/grading.js       -> correzione automatica (scelta multipla, vero/falso, completamento)
server/store.js         -> salvataggio delle consegne su file JSON (data/submissions.json)
public/index.html+app.js -> l'app che vede lo studente
public/admin.html+admin.js -> il pannello che vedi tu
data/                    -> creata automaticamente: risposte + audio degli studenti
```

Per modificare domande, testi o punteggi in futuro, basta editare `server/content.js`
(le risposte corrette non vengono mai inviate al browser dello studente).

## Come funziona il punteggio

- Punteggio automatico (55 punti): grammatica (20), vero/falso lettura (5+5), lessico (10),
  uso della lingua (15).
- Punteggio manuale, da assegnare tu nel pannello admin (45 punti): domande aperte di
  lettura (10), produzione scritta (20, griglia a 4 criteri), produzione orale (15,
  griglia a 3 criteri + audio).
- Totale: 100 punti.

## Provarla in locale

```
npm install
npm start
```

Poi apri `http://localhost:3000` (test studente) e `http://localhost:3000/admin`
(pannello insegnante — password di default `italica2026`, la cambi con la variabile
d'ambiente `ADMIN_PASSWORD`, vedi sotto).

## Deploy su Render

1. **Crea un repository GitHub** con tutto il contenuto di questa cartella (esclusi
   `node_modules` e `data`, già ignorati da `.gitignore`) e fai il push.
2. Su [render.com](https://render.com), **New + → Web Service**, collega il repository.
3. Render riconosce automaticamente `render.yaml` (Blueprint) con questi valori:
   - Build command: `npm install`
   - Start command: `npm start`
   - Un disco persistente da 1GB montato su `/data`
4. Nella sezione **Environment**, imposta `ADMIN_PASSWORD` con una password a tua
   scelta (obbligatorio: se non lo fai, resta quella di default `italica2026`, che è
   pubblica in questo README — cambiala prima di condividere il link con gli studenti).
5. Fai deploy. Render ti darà un URL tipo `https://italica-a2-test.onrender.com` — è
   quello da mandare agli studenti. Il pannello insegnante è allo stesso indirizzo con
   `/admin` in fondo.

### ⚠️ Nota importante sullo storage (dischi persistenti)

Il piano **Free** di Render NON supporta dischi persistenti: il filesystem viene
azzerato a ogni riavvio/deploy del servizio, quindi le consegne degli studenti
(risposte e audio) andrebbero perse quando il servizio si riavvia (anche solo per
inattività). Per la produzione ho preparato `render.yaml` con un disco da 1GB, ma
funziona solo su un piano **Starter o superiore** (a pagamento).

Due strade:
- **Test rapido / poche persone**: usa il piano Free, ma scarica/controlla i risultati
  dal pannello admin subito dopo che tutti hanno finito, prima che il servizio vada in
  sleep e si riavvii.
- **Uso continuativo con più classi**: passa a un piano con disco persistente (Starter),
  così `data/` sopravvive ai riavvii.

## Sicurezza del pannello admin

La protezione è volutamente semplice (una sola password condivisa, pensata per un uso
personale/di classe): non usarla per dati sensibili oltre alle risposte del test.
Tieni privato il link admin e cambia la password di default prima di andare online.

## Requisiti lato studente

- Browser aggiornato (Chrome, Safari, Firefox, Edge) su desktop o mobile.
- Connessione HTTPS (Render la fornisce automaticamente) — necessaria per l'accesso al
  microfono nella parte orale.
- Al momento della parte orale, il browser chiederà il permesso di usare il microfono:
  lo studente deve accettare per poter registrare.
