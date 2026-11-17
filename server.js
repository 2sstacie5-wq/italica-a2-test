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
    for (const item of part.items || []) {
      delete item.correct;
      delete item.accepted;
      delete item.focus;
    }
    for (const v of part.vf || []) delete v.correct;
    delete part.criteria;
  }
  return clone;
}

app.get("/api/content", (req, res) => {
  res.json(publicContent());
});

function sumScores(obj) {
  let total = 0;
  for (const partId of Object.keys(obj || {})) {
    for (const key of Object.keys(obj[partId] || {})) total += Number(obj[partId][key]) || 0;
  }
  return total;
}

// ---------- Invio parti 1–7 ----------
app.post("/api/submit", (req, res) => {
  const { studentName, answers, startedAt, timedOut } = req.body || {};
  if (!studentName || !String(studentName).trim()) {
    return res.status(400).json({ error: "Nome mancante" });
  }
  const { autoScore, details } = autoGrade(answers || {});
  const id = crypto.randomUUID();
  const submission = {
    id,
    level: content.level,
    studentName: String(studentName).trim(),
    startedAt: startedAt || null,
    submittedAt: new Date().toISOString(),
    timedOut: !!timedOut,
    answers: answers || {},
    autoScore,
    autoDetails: details,
    manualScores: {}, // parti aperte: { partId: { itemId: punti } }
    overrides: {}, // risposte automatiche accettate a mano: { partId: { itemId: punti } }
    manualTotal: 0,
    finalWriting: {},
    finalSubmittedAt: null,
    finalVerdict: null, // "sufficiente" | "insufficiente" | null
    teacherNote: "",
    status: "in_attesa", // in_attesa | valutato
    audio: {}, // { slotId: filename }
  };
  store.insert(submission);
  res.json({ id, autoScore, maxAuto: maxAutoScore() });
});

// ---------- Invio parte finale (testi scritti) ----------
app.post("/api/submit-final", (req, res) => {
  const { submissionId, writing } = req.body || {};
  const sub = store.getById(submissionId);
  if (!sub) return res.status(404).json({ error: "Submission non trovata" });
  store.update(submissionId, { finalWriting: writing || {}, finalSubmittedAt: new Date().toISOString() });
  res.json({ ok: true });
});

// ---------- Upload audio (una registrazione per domanda orale) ----------
const upload = multer({
  limits: { fileSize: 40 * 1024 * 1024 },
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, store.AUDIO_DIR),
    filename: (req, file, cb) => {
      const id = String(req.body.submissionId || "unknown").replace(/[^a-zA-Z0-9-]/g, "");
      const slot = String(req.body.slot || "orale").replace(/[^a-zA-Z0-9_-]/g, "");
      const ext = ((file.mimetype && file.mimetype.split("/")[1]) || "webm").split(";")[0];
      cb(null, `${id}_${slot}.${ext}`);
    },
  }),
});

app.post("/api/submit-audio", upload.single("audio"), (req, res) => {
  const { submissionId, slot } = req.body;
  const sub = store.getById(submissionId);
  if (!sub) return res.status(404).json({ error: "Submission non trovata" });
  if (!req.file) return res.status(400).json({ error: "File audio mancante" });
  const audio = { ...(sub.audio || {}), [slot || "orale"]: req.file.filename };
  store.update(submissionId, { audio });
  res.json({ ok: true });
});

// ---------- Admin ----------
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
  const list = store.readAll().map((s) => {
    const grandTotal = s.autoScore + (s.manualTotal || 0);
    return {
      id: s.id,
      studentName: s.studentName,
      submittedAt: s.submittedAt,
      autoScore: s.autoScore,
      manualTotal: s.manualTotal,
      grandTotal,
      status: s.status,
      finalDone: !!s.finalSubmittedAt,
      audioCount: Object.keys(s.audio || {}).length,
      finalVerdict: s.finalVerdict,
      certificate: s.status === "valutato" ? grandTotal >= content.passPoints && s.finalVerdict === "sufficiente" : null,
    };
  });
  list.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  res.json({ list, maxAuto: maxAutoScore(), maxManual: maxManualScore(), maxTotal: content.totalPoints, passPoints: content.passPoints });
});

app.get("/api/admin/submissions/:id", requireAdmin, (req, res) => {
  const sub = store.getById(req.params.id);
  if (!sub) return res.status(404).json({ error: "Non trovata" });
  res.json({ submission: sub, content, maxAuto: maxAutoScore() });
});

app.post("/api/admin/submissions/:id/grade", requireAdmin, (req, res) => {
  const { manualScores, overrides, finalVerdict, teacherNote } = req.body || {};
  const sub = store.getById(req.params.id);
  if (!sub) return res.status(404).json({ error: "Non trovata" });
  const manualTotal = sumScores(manualScores) + sumScores(overrides);
  const updated = store.update(sub.id, {
    manualScores: manualScores || {},
    overrides: overrides || {},
    manualTotal,
    finalVerdict: finalVerdict || null,
    teacherNote: teacherNote || "",
    status: "valutato",
  });
  res.json({ submission: updated, total: updated.autoScore + manualTotal });
});

app.get("/api/admin/audio/:id/:slot", (req, res) => {
  if (req.query.pw !== ADMIN_PASSWORD) return res.status(401).send("Non autorizzato");
  const sub = store.getById(req.params.id);
  const file = sub && sub.audio && sub.audio[req.params.slot];
  if (!file) return res.status(404).send("Audio non trovato");
  res.sendFile(path.join(store.AUDIO_DIR, file));
});

// ---------- Pagine ----------
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`ITALICA ${content.level} test in ascolto su http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
});
