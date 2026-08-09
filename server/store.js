const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const AUDIO_DIR = path.join(DATA_DIR, "audio");
const DB_FILE = path.join(DATA_DIR, "submissions.json");

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]", "utf8");
}

function readAll() {
  ensureDirs();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(raw || "[]");
  } catch (e) {
    console.error("Errore lettura DB, riparto da array vuoto:", e.message);
    return [];
  }
}

function writeAll(list) {
  ensureDirs();
  fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2), "utf8");
}

function insert(submission) {
  const list = readAll();
  list.push(submission);
  writeAll(list);
  return submission;
}

function getById(id) {
  return readAll().find((s) => s.id === id);
}

function update(id, patch) {
  const list = readAll();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch };
  writeAll(list);
  return list[idx];
}

module.exports = { readAll, writeAll, insert, getById, update, DATA_DIR, AUDIO_DIR };
