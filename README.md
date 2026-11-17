# ITALICA — Test di fine corso B1 (app interattiva)

Stessa app del test A2, con il contenuto del "Test di fine corso B1" e nuovi tipi di esercizio.

## Struttura del test

| Parte | Tipo | Punti | Correzione |
| --- | --- | --- | --- |
| 1 — Scegli la risposta corretta | 34 domande a/b/c | 34 | automatica |
| 2 — Vero o Falso | 8 | 8 | automatica |
| 3 — Abbinamento | 8 situazioni → reazioni a–h | 8 | automatica |
| 4 — Riordina le parole | 5 frasi da comporre con le tessere | 10 | automatica (+ "accetta comunque") |
| 5 — Completa le frasi | 16 caselle (5A–5D) | 16 | automatica (+ "accetta comunque") |
| 6 — Completa il testo | lettera con 14 verbi | 14 | automatica (+ "accetta comunque") |
| 7 — Continua la frase | 5 risposte libere | 10 | insegnante (0–2 ciascuna) |
| Parte finale | 3 testi scritti + 3 registrazioni audio | — | insegnante: sufficiente / insufficiente |

- Timer di **70 minuti** per le Parti 1–7. Allo scadere le risposte vengono inviate e lo studente passa
  alla Parte finale, che non ha limite di tempo. Dalla Parte finale non si torna indietro.
- Le Parti 1–7 vengono salvate sul server già al passaggio alla Parte finale; ogni registrazione
  audio viene caricata subito dopo averla fermata. Se lo studente chiude la pagina, non perde nulla.
- Correzione automatica tollerante: maiuscole, punteggiatura, apostrofi e **accenti mancanti** non
  contano (es. "e successa" = "è successa"). Le varianti accettate sono in `server/content.js`.
- Certificato B1: almeno **60/100** e Parte finale **sufficiente**. Il pannello admin lo calcola.

## File

```
server/content.js   -> tutto il contenuto: domande, testi, risposte accettate
server/grading.js   -> correzione automatica
server.js           -> API + pagine
public/app.js       -> app studente
public/admin.js     -> pannello insegnante (/admin)
```

## In locale

```
npm install
npm start
```

Studente: `http://localhost:3000` · Insegnante: `http://localhost:3000/admin`
(password = variabile d'ambiente `ADMIN_PASSWORD`, default `italica2026`).

## Deploy su Render

New + → Web Service → questo repository, branch del test B1 → Build `npm install`, Start
`npm start` → in Environment imposta `ADMIN_PASSWORD`. Valgono le stesse note sul disco
persistente del test A2: sul piano Free i dati si azzerano ai riavvii, quindi scarica/correggi
le prove subito oppure usa un piano con disco (render.yaml lo monta su `/data`).
