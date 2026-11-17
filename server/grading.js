const { content } = require("./content");

// Normalizza una risposta: minuscole, apostrofi uniformi, niente punteggiatura,
// spazi singoli, accenti tolti (gli studenti spesso non hanno la tastiera italiana).
function normalize(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[.,!?;:«»"“”]/g, "")
    .replace(/\s*'\s*/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Le caselle multiple (es. "___ già ___") vengono unite con uno spazio.
function joinAnswer(given) {
  if (Array.isArray(given)) return given.map((g) => String(g || "").trim()).filter(Boolean).join(" ");
  return String(given || "");
}

function matches(accepted, given) {
  const g = normalize(given);
  if (!g) return false;
  return (accepted || []).some((acc) => normalize(acc) === g);
}

function reorderSentence(item, given) {
  if (!Array.isArray(given)) return "";
  return given.map((i) => item.words[i]).filter((w) => w !== undefined).join(" ");
}

// Punteggio automatico per tutte le parti a correzione oggettiva.
// "open" e "final" restano all'insegnante.
function autoGrade(answers) {
  let autoScore = 0;
  const details = {};

  for (const part of content.parts) {
    const a = (answers && answers[part.id]) || {};

    if (part.type === "mcq" || part.type === "matching") {
      let partScore = 0;
      const items = {};
      for (const item of part.items) {
        const given = a[item.id];
        const isCorrect = given === item.correct;
        if (isCorrect) partScore += 1;
        items[item.id] = { given: given === undefined ? null : given, correct: item.correct, isCorrect, points: isCorrect ? 1 : 0, max: 1 };
      }
      autoScore += partScore;
      details[part.id] = { autoScore: partScore, maxAuto: part.items.length, items };
    }

    if (part.type === "vf-only") {
      let partScore = 0;
      const vf = {};
      const given0 = a.vf || {};
      for (const item of part.vf) {
        const given = given0[item.id];
        const isCorrect = given === item.correct;
        if (isCorrect) partScore += 1;
        vf[item.id] = { given: given === undefined ? null : given, correct: item.correct, isCorrect };
      }
      autoScore += partScore;
      details[part.id] = { autoScore: partScore, maxAuto: part.vf.length, vf };
    }

    if (part.type === "reorder") {
      const ppi = part.pointsPerItem || 1;
      let partScore = 0;
      const items = {};
      for (const item of part.items) {
        const sentence = reorderSentence(item, a[item.id]);
        const isCorrect = matches(item.accepted, sentence);
        const pts = isCorrect ? ppi : 0;
        partScore += pts;
        items[item.id] = { given: sentence, accepted: item.accepted, isCorrect, points: pts, max: ppi };
      }
      autoScore += partScore;
      details[part.id] = { autoScore: partScore, maxAuto: part.items.length * ppi, items };
    }

    if (part.type === "fillin" || part.type === "cloze") {
      let partScore = 0;
      const items = {};
      for (const item of part.items) {
        const given = joinAnswer(a[item.id]);
        const isCorrect = matches(item.accepted, given);
        if (isCorrect) partScore += 1;
        items[item.id] = { given, accepted: item.accepted, isCorrect, points: isCorrect ? 1 : 0, max: 1 };
      }
      autoScore += partScore;
      details[part.id] = { autoScore: partScore, maxAuto: part.items.length, items };
    }
  }

  return { autoScore, details };
}

function maxAutoScore() {
  let max = 0;
  for (const part of content.parts) {
    if (part.type === "mcq" || part.type === "matching" || part.type === "fillin" || part.type === "cloze") max += part.items.length;
    if (part.type === "vf-only") max += part.vf.length;
    if (part.type === "reorder") max += part.items.length * (part.pointsPerItem || 1);
  }
  return max;
}

function maxManualScore() {
  let max = 0;
  for (const part of content.parts) {
    if (part.type === "open") for (const o of part.items) max += o.points;
  }
  return max;
}

module.exports = { autoGrade, maxAutoScore, maxManualScore, normalize };
