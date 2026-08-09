const path = require("path");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");

const { content } = require("./server/content");
const { autoGrade, maxAutoScore, maxManualScore } = require("./server/grading");
const store = require("./server/store");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "italica2026";

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- Contenuto pubblico (senza risposte corrette) ----------
function publicContent() {
  const clone = JSON.parse(JSON.stringify(content));
  for (const part of clone.parts) {
    if (part.items) {
      for (const item of part.items) {
        delete item.correct;
        delete item.accepted;
      }
    }
    if (part.vf) {
      for (const v of part.vf) delete v.correct;
    }
    if (part.open) {
      for (const o of part.open) delete o.sample;
    }
  }
  return clone;
}

app.get("/api/content", (req, res) => {
  res.json(publicContent());
});

// ---------- Invio risposte (testo) ----------
app.post("/api/submit", (req, res) => {
  const { studentName, answers, startedAt } = req.body || {};
  if (!studentName || !String(studentName).trim()) {
    return res.status(400).json({ error: "Nome mancante" });
  }
  const { autoScore, details } = autoGrade(answers || {});
  const id = crypto.randomUUID();
  const submission = {
    id,
    studentName: String(studentName).trim(),
    startedAt: startedAt || null,
    submittedAt: new Date().toISOString(),
    answers: answers || {},
    autoScore,
    autoDetails: details,
    manualScores: {}, // { partId: { criterionKeyOrItemId: points } }
    manualTotal: 0,
    status: "in_attesa", // in_attesa | valutato
    audioPath: null,
  };
  store.insert(submission);
  res.json({ id });
});

// ---------- Upload audio (parte orale) ----------
const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, store.AUDIO_DIR),
    filename: (req, file, cb) => {
      const id = req.body.submissionId || "unknown";
      const ext = (file.mimetype && file.mimetype.split("/")[1]) || "webm";
      cb(null, `${id}.${ext.split(";")[0]}`);
    },
  }),
});

app.post("/api/submit-audio", upload.single("audio"), (req, res) => {
  const { submissionId } = req.body;
  const sub = store.getById(submissionId);
  if (!sub) return res.status(404).json({ error: "Submission non trovata" });
  if (!req.file) return res.status(400).json({ error: "File audio mancante" });
  store.update(submissionId, { audioPath: req.file.filename });
  res.json({ ok: true });
});

// ---------- Admin: middleware password ----------
function requireAdmin(req, res, next) {
  const pw = req.header("x-admin-password") || req.query.pw;
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: "Password errata" });
  next();
}

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ ok: false });
});

app.get("/api/admin/submissions", requireAdmin, (req, res) => {
  const list = store.readAll().map((s) => ({
    id: s.id,
    studentName: s.studentName,
    submittedAt: s.submittedAt,
    autoScore: s.autoScore,
    manualTotal: s.manualTotal,
    grandTotal: s.autoScore + (s.manualTotal || 0),
    status: s.status,
    hasAudio: !!s.audioPath,
  }));
  list.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  res.json({ list, maxAuto: maxAutoScore(), maxManual: maxManualScore(), maxTotal: content.totalPoints });
});

app.get("/api/admin/submissions/:id", requireAdmin, (req, res) => {
  const sub = store.getById(req.params.id);
  if (!sub) return res.status(404).json({ error: "Non trovata" });
  res.json({ submission: sub, content });
});

app.post("/api/admin/submissions/:id/grade", requireAdmin, (req, res) => {
  const { manualScores } = req.body || {};
  const sub = store.getById(req.params.id);
  if (!sub) return res.status(404).json({ error: "Non trovata" });
  let manualTotal = 0;
  for (const partId of Object.keys(manualScores || {})) {
    for (const key of Object.keys(manualScores[partId] || {})) {
      const v = Number(manualScores[partId][key]) || 0;
      manualTotal += v;
    }
  }
  const updated = store.update(sub.id, { manualScores, manualTotal, status: "valutato" });
  res.json({ submission: updated });
});

app.get("/api/admin/audio/:id", (req, res) => {
  const pw = req.query.pw;
  if (pw !== ADMIN_PASSWORD) return res.status(401).send("Non autorizzato");
  const sub = store.getById(req.params.id);
  if (!sub || !sub.audioPath) return res.status(404).send("Audio non trovato");
  res.sendFile(path.join(store.AUDIO_DIR, sub.audioPath));
});

// ---------- Pagine ----------
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`ITALICA A2 test in ascolto su http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin (password: ${ADMIN_PASSWORD})`);
});
