const { content } = require("./content");

function normalize(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ");
}

// Calcola il punteggio automatico per le parti a correzione oggettiva
// (mcq, vero/falso, completamento). Le parti "writing" e "oral", e le
// domande aperte di lettura, restano a punteggio 0 finché l'insegnante
// non le corregge dall'admin.
function autoGrade(answers) {
  let autoScore = 0;
  const details = {};

  for (const part of content.parts) {
    if (part.type === "mcq") {
      let partScore = 0;
      const itemResults = {};
      for (const item of part.items) {
        const given = answers?.[part.id]?.[item.id];
        const correct = given === item.correct;
        if (correct) partScore += 1;
        itemResults[item.id] = { given, correct: item.correct, isCorrect: correct };
      }
      autoScore += partScore;
      details[part.id] = { autoScore: partScore, maxAuto: part.items.length, items: itemResults };
    }

    if (part.type === "reading" || part.type === "vf-only") {
      let partScore = 0;
      const vfResults = {};
      for (const item of part.vf || []) {
        const given = answers?.[part.id]?.vf?.[item.id];
        const correct = given === item.correct;
        if (correct) partScore += 1;
        vfResults[item.id] = { given, correct: item.correct, isCorrect: correct };
      }
      autoScore += partScore;
      const maxAuto = (part.vf || []).length;
      details[part.id] = { autoScore: partScore, maxAuto, vf: vfResults };
    }

    if (part.type === "fillin") {
      let partScore = 0;
      const itemResults = {};
      for (const item of part.items) {
        const given = answers?.[part.id]?.[item.id];
        const isCorrect = (item.accepted || []).some((acc) => normalize(acc) === normalize(given));
        if (isCorrect) partScore += 1;
        itemResults[item.id] = { given, accepted: item.accepted, isCorrect };
      }
      autoScore += partScore;
      details[part.id] = { autoScore: partScore, maxAuto: part.items.length, items: itemResults };
    }
  }

  return { autoScore, details };
}

// Punteggio massimo ottenibile automaticamente (usato per mostrare "X/Y" in admin)
function maxAutoScore() {
  let max = 0;
  for (const part of content.parts) {
    if (part.type === "mcq") max += part.items.length;
    if (part.type === "reading" || part.type === "vf-only") max += (part.vf || []).length;
    if (part.type === "fillin") max += part.items.length;
  }
  return max;
}

// Punteggio massimo che richiede correzione manuale (lettura aperta + scritta + orale)
function maxManualScore() {
  let max = 0;
  for (const part of content.parts) {
    if (part.type === "reading") {
      for (const o of part.open || []) max += o.points;
    }
    if (part.type === "writing" || part.type === "oral") {
      for (const r of part.rubric || []) max += r.max;
    }
  }
  return max;
}

module.exports = { autoGrade, maxAutoScore, maxManualScore, normalize };
