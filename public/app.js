(function () {
  const app = document.getElementById("app");
  const topbar = document.getElementById("topbar");
  const timerEl = document.getElementById("timer");
  const STORAGE_KEY = "italica_b1_state_v1";

  let content = null;
  let state = {
    phase: "intro", // intro | quiz | final | done
    studentName: "",
    startedAt: null,
    currentPart: 0,
    answers: {},
    submissionId: null,
    autoScore: null,
    maxAuto: null,
    finalWriting: {},
    audioDone: {},
  };

  let timerInterval = null;
  const rec = {}; // stato delle registrazioni per slot: { blobUrl, uploading, error }
  let activeRecorder = null;

  // ---------- Utils ----------
  function saveLocal() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function loadLocal() {
    try { const raw = sessionStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function clearLocal() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }
  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function blanks(text) {
    return esc(text).replace(/_{3,}/g, '<span class="blank">______</span>');
  }
  function wordCount(text) {
    return (text || "").trim().split(/\s+/).filter(Boolean).length;
  }
  function ansFor(partId) {
    if (!state.answers[partId]) state.answers[partId] = {};
    return state.answers[partId];
  }
  function timedParts() {
    return content.parts.filter((p) => p.type !== "final");
  }
  function finalPart() {
    return content.parts.find((p) => p.type === "final");
  }
  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  // ---------- Timer ----------
  function startTimer() {
    stopTimer();
    tick();
    timerInterval = setInterval(tick, 1000);
  }
  function tick() {
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    const remaining = content.totalMinutes * 60 - elapsed;
    if (remaining <= 0) {
      timerEl.textContent = "00:00";
      stopTimer();
      timeUp();
      return;
    }
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    timerEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    timerEl.classList.toggle("low", remaining <= 300);
  }
  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }
  function timeUp() {
    if (state.phase !== "quiz") return;
    alert("Il tempo per le Parti 1–7 è terminato. Le tue risposte vengono inviate ora e passi alla Parte finale (senza limite di tempo).");
    submitWritten(true);
  }

  // ---------- Intro ----------
  function renderIntro() {
    topbar.style.display = "none";
    const i = content.intro;
    app.innerHTML = `
      <div class="center" style="margin-bottom:20px;">
        <img src="/logo.png" alt="italica" style="height:56px;width:auto;margin:0 auto;display:block;" />
      </div>
      <h1>${esc(content.title)}</h1>
      <p class="muted"><strong>Parti 1–7: ${content.totalMinutes} minuti · Parte finale: senza limite di tempo</strong></p>
      <p>Ciao ciao!</p>
      <p>${esc(i.firstParagraphUk)}</p>
      ${i.bodyIt.map((p) => `<p>${esc(p)}</p>`).join("")}
      <h2 style="font-size:18px;">${esc(i.howItWorksTitle)}</h2>
      ${i.howItWorks.map((p) => `<p><em>${esc(p)}</em></p>`).join("")}
      <h2 style="font-size:18px;">${esc(i.beforeStartTitle)}</h2>
      <div class="notice"><ul class="plain">${i.beforeStart.map((li) => `<li>${esc(li)}</li>`).join("")}</ul></div>
      <p>${esc(i.closing)}</p>
      <p><em>${esc(i.signOff)}</em></p>
      <div class="field">
        <label for="studentName">Nome e cognome</label>
        <input type="text" id="studentName" placeholder="Es. Maria Rossi" value="${esc(state.studentName)}" />
      </div>
      <button class="btn" id="startBtn" disabled>Inizia il test</button>
    `;
    const input = document.getElementById("studentName");
    const btn = document.getElementById("startBtn");
    const refresh = () => { btn.disabled = !input.value.trim(); };
    input.addEventListener("input", refresh);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !btn.disabled) btn.click(); });
    refresh();
    btn.addEventListener("click", () => {
      state.studentName = input.value.trim();
      state.startedAt = Date.now();
      state.phase = "quiz";
      state.currentPart = 0;
      saveLocal();
      topbar.style.display = "flex";
      startTimer();
      renderPart();
    });
  }

  // ---------- Shell parti 1–7 ----------
  function partShell(part, innerHtml) {
    const total = timedParts().length;
    const isLast = part.number === total;
    return `
      <div class="step-label">Parte ${part.number} di ${total} &middot; ${part.points} punti</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${(part.number / (total + 1)) * 100}%"></div></div>
      <h2>${esc(part.title)}</h2>
      ${part.hint ? `<p class="hint">${esc(part.hint)}</p>` : ""}
      <p class="muted">${esc(part.instructions)}</p>
      ${innerHtml}
      <div class="nav-row">
        <button class="btn secondary" id="backBtn" ${part.number === 1 ? "disabled" : ""}>Indietro</button>
        <button class="btn" id="nextBtn">${isLast ? "Vai alla Parte finale" : "Avanti"}</button>
      </div>
    `;
  }

  function wireNav(part) {
    document.getElementById("backBtn").addEventListener("click", () => {
      if (part.number > 1) {
        state.currentPart -= 1;
        saveLocal();
        renderPart();
        scrollTop();
      }
    });
    document.getElementById("nextBtn").addEventListener("click", () => {
      saveLocal();
      if (part.number === timedParts().length) {
        const empty = countEmpty();
        const msg = (empty > 0 ? `Hai ancora ${empty} risposte vuote nelle Parti 1–7.\n\n` : "") +
          "Dopo questo passaggio non potrai più tornare alle Parti 1–7. Vuoi continuare con la Parte finale?";
        if (!confirm(msg)) return;
        submitWritten(false);
      } else {
        state.currentPart += 1;
        saveLocal();
        renderPart();
        scrollTop();
      }
    });
  }

  function countEmpty() {
    let n = 0;
    for (const part of timedParts()) {
      const a = state.answers[part.id] || {};
      if (part.type === "vf-only") {
        for (const v of part.vf) if (a.vf?.[v.id] === undefined) n++;
      } else if (part.type === "fillin" || part.type === "cloze") {
        for (const it of part.items) if (!(a[it.id] || []).some((x) => String(x || "").trim())) n++;
      } else if (part.type === "reorder") {
        for (const it of part.items) if (!(a[it.id] || []).length) n++;
      } else if (part.type === "open") {
        for (const it of part.items) if (!String(a[it.id] || "").trim()) n++;
      } else {
        for (const it of part.items) if (a[it.id] === undefined) n++;
      }
    }
    return n;
  }

  // ---------- Scelta multipla ----------
  function renderMcq(part) {
    const a = ansFor(part.id);
    const html = part.items.map((item, n) => {
      const opts = item.options.map((opt, i) => `
        <div class="option ${a[item.id] === i ? "selected" : ""}" data-item="${item.id}" data-idx="${i}">
          <div class="dot"></div><div>${String.fromCharCode(97 + i)}) ${esc(opt)}</div>
        </div>`).join("");
      return `<div class="question"><div class="question-text"><span class="qnum">${n + 1}.</span> ${blanks(item.text)}</div>${opts}</div>`;
    }).join("");
    app.innerHTML = partShell(part, html);
    app.querySelectorAll(".option").forEach((el) => {
      el.addEventListener("click", () => {
        a[el.dataset.item] = Number(el.dataset.idx);
        saveLocal();
        app.querySelectorAll(`.option[data-item="${el.dataset.item}"]`).forEach((o) => o.classList.toggle("selected", o === el));
      });
    });
    wireNav(part);
  }

  // ---------- Vero / Falso ----------
  function renderVf(part) {
    const a = ansFor(part.id);
    if (!a.vf) a.vf = {};
    const html = part.vf.map((item, n) => {
      const chosen = a.vf[item.id];
      return `
        <div class="vf-row">
          <div class="vf-text"><span class="qnum">${n + 1}.</span> ${esc(item.text)}</div>
          <div class="vf-buttons">
            <button class="vf-btn vero ${chosen === true ? "selected" : ""}" data-item="${item.id}" data-val="true">Vero</button>
            <button class="vf-btn falso ${chosen === false ? "selected" : ""}" data-item="${item.id}" data-val="false">Falso</button>
          </div>
        </div>`;
    }).join("");
    app.innerHTML = partShell(part, html);
    app.querySelectorAll(".vf-btn").forEach((el) => {
      el.addEventListener("click", () => {
        a.vf[el.dataset.item] = el.dataset.val === "true";
        saveLocal();
        app.querySelectorAll(`.vf-btn[data-item="${el.dataset.item}"]`).forEach((b) => b.classList.toggle("selected", b === el));
      });
    });
    wireNav(part);
  }

  // ---------- Abbinamento ----------
  function renderMatching(part) {
    const a = ansFor(part.id);
    const letter = (i) => String.fromCharCode(97 + i);
    const used = new Set(Object.values(a));
    const reactions = `
      <div class="reactions">
        <div class="reactions-title">Reazioni</div>
        ${part.reactions.map((r, i) => `<div class="reaction ${used.has(i) ? "used" : ""}"><span class="letter">${letter(i)}</span> ${esc(r)}</div>`).join("")}
      </div>`;
    const rows = part.items.map((item, n) => {
      const chosen = a[item.id];
      const chips = part.reactions.map((_, i) => `
        <button class="chip ${chosen === i ? "selected" : ""} ${chosen !== i && used.has(i) ? "taken" : ""}" data-item="${item.id}" data-idx="${i}">${letter(i)}</button>`).join("");
      return `
        <div class="question match-row">
          <div class="question-text"><span class="qnum">${n + 1}.</span> ${esc(item.text)}</div>
          <div class="chips">${chips}</div>
          <div class="match-preview">${chosen !== undefined ? `→ ${esc(part.reactions[chosen])}` : ""}</div>
        </div>`;
    }).join("");
    app.innerHTML = partShell(part, reactions + rows);
    app.querySelectorAll(".chip").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = Number(el.dataset.idx);
        if (a[el.dataset.item] === idx) delete a[el.dataset.item];
        else a[el.dataset.item] = idx;
        saveLocal();
        const y = window.scrollY;
        renderMatching(part);
        window.scrollTo(0, y);
      });
    });
    wireNav(part);
  }

  // ---------- Riordina ----------
  function renderReorder(part) {
    const a = ansFor(part.id);
    const html = part.items.map((item, n) => {
      const chosen = a[item.id] || [];
      const placed = chosen.map((wi, pos) => `<button class="word placed" data-item="${item.id}" data-pos="${pos}">${esc(item.words[wi])}</button>`).join("");
      const bank = item.words.map((w, wi) => chosen.includes(wi) ? "" : `<button class="word" data-item="${item.id}" data-wi="${wi}">${esc(w)}</button>`).join("");
      return `
        <div class="question reorder">
          <div class="question-text"><span class="qnum">${n + 1}.</span> <span class="muted">${item.words.map(esc).join(" / ")}</span></div>
          <div class="sentence-box ${chosen.length ? "" : "empty"}">${placed || '<span class="placeholder">Tocca le parole qui sotto…</span>'}</div>
          <div class="word-bank">${bank}</div>
          ${chosen.length ? `<button class="link-btn" data-reset="${item.id}">↺ Ricomincia</button>` : ""}
        </div>`;
    }).join("");
    app.innerHTML = partShell(part, html);
    const rerender = () => { saveLocal(); const y = window.scrollY; renderReorder(part); window.scrollTo(0, y); };
    app.querySelectorAll(".word[data-wi]").forEach((el) => {
      el.addEventListener("click", () => {
        const list = a[el.dataset.item] || (a[el.dataset.item] = []);
        list.push(Number(el.dataset.wi));
        rerender();
      });
    });
    app.querySelectorAll(".word.placed").forEach((el) => {
      el.addEventListener("click", () => {
        a[el.dataset.item].splice(Number(el.dataset.pos), 1);
        rerender();
      });
    });
    app.querySelectorAll("[data-reset]").forEach((el) => {
      el.addEventListener("click", () => { a[el.dataset.reset] = []; rerender(); });
    });
    wireNav(part);
  }

  // ---------- Completa le frasi ----------
  function inputHtml(itemId, idx, value, extraClass) {
    return `<input type="text" class="gap ${extraClass || ""}" data-item="${itemId}" data-idx="${idx}" value="${esc(value || "")}" autocomplete="off" autocapitalize="off" spellcheck="false" />`;
  }

  function wireGaps(a) {
    app.querySelectorAll("input.gap").forEach((el) => {
      el.addEventListener("input", () => {
        const list = a[el.dataset.item] || (a[el.dataset.item] = []);
        list[Number(el.dataset.idx)] = el.value;
        saveLocal();
      });
    });
  }

  function renderFillin(part) {
    const a = ansFor(part.id);
    let num = 0;
    const html = part.items.map((item) => {
      num++;
      const pieces = item.text.split(/_{3,}/);
      const vals = a[item.id] || [];
      let sentence = "";
      pieces.forEach((p, i) => {
        sentence += esc(p);
        if (i < pieces.length - 1) sentence += inputHtml(item.id, i, vals[i]);
      });
      const header = item.section ? `<h3 class="section-title">${esc(item.section)}</h3>` : "";
      return `${header}<div class="fillin-item"><div class="sentence"><span class="qnum">${num}.</span> ${sentence}</div></div>`;
    }).join("");
    app.innerHTML = partShell(part, html);
    wireGaps(a);
    wireNav(part);
  }

  // ---------- Completa il testo ----------
  function renderCloze(part) {
    const a = ansFor(part.id);
    const body = esc(part.text).replace(/\{(\d+)(?:\|([^}]+))?\}/g, (_, id, mid) => {
      const vals = a[id] || [];
      if (mid) return `${inputHtml(id, 0, vals[0], "inline")} ${esc(mid)} ${inputHtml(id, 1, vals[1], "inline")}`;
      return inputHtml(id, 0, vals[0], "inline");
    });
    const html = `
      <div class="reading-text cloze">
        <p>${esc(part.greeting)}</p>
        <p>${body}</p>
        <p>${esc(part.signature)}</p>
      </div>`;
    app.innerHTML = partShell(part, html);
    wireGaps(a);
    wireNav(part);
  }

  // ---------- Continua la frase ----------
  function renderOpen(part) {
    const a = ansFor(part.id);
    const html = part.items.map((item, n) => `
      <div class="field">
        <label><span class="qnum">${n + 1}.</span> ${esc(item.text)} <span class="muted">(${item.points} punti)</span></label>
        <textarea data-open="${item.id}" style="min-height:80px;" placeholder="Scrivi qui...">${esc(a[item.id] || "")}</textarea>
      </div>`).join("");
    app.innerHTML = partShell(part, html);
    app.querySelectorAll("textarea[data-open]").forEach((el) => {
      el.addEventListener("input", () => { a[el.dataset.open] = el.value; saveLocal(); });
    });
    wireNav(part);
  }

  function renderPart() {
    const part = timedParts()[state.currentPart];
    if (!part) return;
    if (part.type === "mcq") return renderMcq(part);
    if (part.type === "vf-only") return renderVf(part);
    if (part.type === "matching") return renderMatching(part);
    if (part.type === "reorder") return renderReorder(part);
    if (part.type === "fillin") return renderFillin(part);
    if (part.type === "cloze") return renderCloze(part);
    if (part.type === "open") return renderOpen(part);
  }

  // ---------- Invio parti 1–7 ----------
  let submittingWritten = false;
  async function submitWritten(timedOut) {
    if (submittingWritten) return;
    submittingWritten = true;
    stopTimer();
    app.innerHTML = `<div class="center"><div class="big-emoji">⏳</div><p>Invio delle Parti 1–7 in corso, non chiudere questa pagina...</p></div>`;
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName: state.studentName, startedAt: state.startedAt, answers: state.answers, timedOut: !!timedOut }),
      });
      if (!res.ok) throw new Error("submit failed");
      const data = await res.json();
      state.submissionId = data.id;
      state.autoScore = data.autoScore;
      state.maxAuto = data.maxAuto;
      state.phase = "final";
      saveLocal();
      submittingWritten = false;
      renderFinal();
      scrollTop();
    } catch (e) {
      submittingWritten = false;
      app.innerHTML = `<div class="center"><div class="big-emoji">⚠️</div><p>Si è verificato un errore durante l'invio. Controlla la connessione e riprova. Le tue risposte sono salvate.</p><button class="btn" id="retryBtn">Riprova</button></div>`;
      document.getElementById("retryBtn").addEventListener("click", () => submitWritten(timedOut));
    }
  }

  // ---------- Parte finale ----------
  function showFinalTopbar() {
    topbar.style.display = "flex";
    timerEl.textContent = "Parte finale";
    timerEl.classList.remove("low");
  }

  function renderFinal() {
    showFinalTopbar();
    const part = finalPart();
    const total = timedParts().length;
    const writingHtml = part.writing.map((w, n) => `
      <div class="final-task">
        <div class="question-text"><span class="qnum">${n + 1}.</span> ${esc(w.text)} <span class="muted">(${esc(w.words)})</span></div>
        <div class="field" style="margin-top:8px;">
          <textarea data-writing="${w.id}" placeholder="Scrivi qui...">${esc(state.finalWriting[w.id] || "")}</textarea>
          <div class="wordcount" id="wc_${w.id}">${wordCount(state.finalWriting[w.id])} parole</div>
        </div>
      </div>`).join("");
    const oralHtml = part.oral.map((o, n) => `
      <div class="final-task">
        <div class="question-text"><span class="qnum">${n + 1}.</span> ${esc(o.text)} <span class="muted">(${esc(o.time)})</span></div>
        <div class="record-box" id="box_${o.id}"></div>
      </div>`).join("");

    app.innerHTML = `
      <div class="step-label">Parte finale &middot; senza limite di tempo</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${(total / (total + 1)) * 100}%"></div></div>
      <div class="notice">✅ Le Parti 1–7 sono state inviate. Ora puoi lavorare con calma: qui il timer non c'è.</div>
      <h2>${esc(part.title)}</h2>
      <p class="muted">${esc(part.instructions)}</p>
      <h3 class="section-title">Produzione scritta</h3>
      ${writingHtml}
      <h3 class="section-title">Produzione orale</h3>
      <p class="muted">Registra una risposta vocale per ogni domanda. Ogni registrazione viene inviata subito all'insegnante; se non ti piace, puoi registrarla di nuovo.</p>
      ${oralHtml}
      <div class="nav-row" style="justify-content:flex-end;">
        <button class="btn" id="finishBtn">Invia il test</button>
      </div>
    `;
    app.querySelectorAll("textarea[data-writing]").forEach((el) => {
      el.addEventListener("input", () => {
        state.finalWriting[el.dataset.writing] = el.value;
        document.getElementById(`wc_${el.dataset.writing}`).textContent = `${wordCount(el.value)} parole`;
        saveLocal();
      });
    });
    part.oral.forEach((o) => renderRecordBox(o.id));
    document.getElementById("finishBtn").addEventListener("click", finishTest);
  }

  // ---------- Registrazione ----------
  function pickMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    for (const c of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  }

  function renderRecordBox(slot) {
    const box = document.getElementById(`box_${slot}`);
    if (!box) return;
    const r = rec[slot] || {};
    const done = state.audioDone[slot];
    if (r.recording) {
      box.innerHTML = `
        <div class="record-status">Registrazione in corso... <span class="record-time" id="time_${slot}">00:00</span></div>
        <button class="btn danger" data-stop="${slot}">⏹️ Ferma</button>`;
    } else if (r.uploading) {
      box.innerHTML = `<div class="record-status">Invio della registrazione...</div>`;
    } else if (done || r.url) {
      box.innerHTML = `
        <div class="record-status ok">${r.error ? "⚠️ " + esc(r.error) : "✓ Registrazione inviata"}</div>
        ${r.url ? `<audio controls src="${r.url}"></audio>` : ""}
        <div style="margin-top:10px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          ${r.error ? `<button class="btn" data-retry="${slot}">Riprova l'invio</button>` : ""}
          <button class="btn secondary" data-rec="${slot}">🔄 Registra di nuovo</button>
        </div>`;
    } else {
      box.innerHTML = `
        <div class="record-status">Premi il pulsante per registrare la tua risposta.</div>
        <button class="btn" data-rec="${slot}">🎙️ Registra</button>`;
    }
    box.querySelectorAll("[data-rec]").forEach((b) => b.addEventListener("click", () => startRecording(slot)));
    box.querySelectorAll("[data-stop]").forEach((b) => b.addEventListener("click", () => stopRecording(slot)));
    box.querySelectorAll("[data-retry]").forEach((b) => b.addEventListener("click", () => uploadAudio(slot)));
  }

  async function startRecording(slot) {
    if (activeRecorder) { alert("Ferma prima la registrazione in corso."); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      alert("Il tuo browser non supporta la registrazione audio. Prova con Chrome, Safari o Firefox aggiornati.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      alert("Non è stato possibile accedere al microfono. Controlla i permessi del browser.");
      return;
    }
    const mimeType = pickMimeType();
    const chunks = [];
    const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const r = (rec[slot] = { recording: true, seconds: 0 });
    activeRecorder = { slot, mr, stream };
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mr.onstop = () => {
      clearInterval(r.interval);
      stream.getTracks().forEach((t) => t.stop());
      activeRecorder = null;
      r.recording = false;
      r.blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      r.url = URL.createObjectURL(r.blob);
      uploadAudio(slot);
    };
    mr.start(1000);
    renderRecordBox(slot);
    r.interval = setInterval(() => {
      r.seconds += 1;
      const t = document.getElementById(`time_${slot}`);
      if (t) t.textContent = `${String(Math.floor(r.seconds / 60)).padStart(2, "0")}:${String(r.seconds % 60).padStart(2, "0")}`;
    }, 1000);
  }

  function stopRecording(slot) {
    if (activeRecorder && activeRecorder.slot === slot) activeRecorder.mr.stop();
  }

  async function uploadAudio(slot) {
    const r = rec[slot];
    if (!r || !r.blob) return;
    r.uploading = true;
    r.error = null;
    renderRecordBox(slot);
    try {
      const fd = new FormData();
      const ext = (r.blob.type.split("/")[1] || "webm").split(";")[0];
      fd.append("submissionId", state.submissionId);
      fd.append("slot", slot);
      fd.append("audio", r.blob, `${slot}.${ext}`);
      const res = await fetch("/api/submit-audio", { method: "POST", body: fd });
      if (!res.ok) throw new Error("upload failed");
      state.audioDone[slot] = true;
      saveLocal();
    } catch (e) {
      r.error = "Invio non riuscito. Controlla la connessione.";
    }
    r.uploading = false;
    renderRecordBox(slot);
  }

  async function finishTest() {
    const part = finalPart();
    if (activeRecorder) { alert("Ferma prima la registrazione in corso."); return; }
    if (part.oral.some((o) => rec[o.id] && rec[o.id].uploading)) { alert("Aspetta che le registrazioni vengano inviate."); return; }
    const missingW = part.writing.filter((w) => wordCount(state.finalWriting[w.id]) < 20).length;
    const missingA = part.oral.filter((o) => !state.audioDone[o.id]).length;
    if (missingW || missingA) {
      const bits = [];
      if (missingW) bits.push(`${missingW} test${missingW === 1 ? "o scritto" : "i scritti"} vuot${missingW === 1 ? "o" : "i"} o molto brev${missingW === 1 ? "e" : "i"}`);
      if (missingA) bits.push(`${missingA} registrazion${missingA === 1 ? "e" : "i"} mancant${missingA === 1 ? "e" : "i"}`);
      if (!confirm(`Attenzione: ${bits.join(" e ")}. La Parte finale è obbligatoria per il certificato.\n\nVuoi inviare comunque?`)) return;
    } else if (!confirm("Vuoi inviare il test? Dopo l'invio non potrai più modificarlo.")) {
      return;
    }
    app.innerHTML = `<div class="center"><div class="big-emoji">⏳</div><p>Invio in corso, non chiudere questa pagina...</p></div>`;
    try {
      const res = await fetch("/api/submit-final", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: state.submissionId, writing: state.finalWriting }),
      });
      if (!res.ok) throw new Error("final failed");
      state.phase = "done";
      const name = state.studentName, score = state.autoScore, max = state.maxAuto;
      clearLocal();
      renderDone(name, score, max);
      scrollTop();
    } catch (e) {
      app.innerHTML = `<div class="center"><div class="big-emoji">⚠️</div><p>Si è verificato un errore durante l'invio. Controlla la connessione e riprova.</p><button class="btn" id="retryBtn">Riprova</button></div>`;
      document.getElementById("retryBtn").addEventListener("click", () => { renderFinal(); });
    }
  }

  function renderDone(name, score, max) {
    topbar.style.display = "none";
    const scoreHtml = score !== null && score !== undefined ? `
      <div class="notice" style="text-align:left;">
        <div class="score-row">
          <span>Punteggio automatico:</span>
          <span class="score-pill">${score}/${max}</span>
        </div>
        <p style="margin:0;">Questo è il punteggio delle Parti 1–6, corrette automaticamente. <strong>La Parte 7 (Continua la frase) e la Parte finale saranno corrette dalla tua insegnante</strong>: il punteggio finale su 100 arriverà dopo la sua valutazione. Per il certificato B1 servono almeno ${content.passPoints} punti su 100 e la Parte finale valutata come sufficiente.</p>
      </div>` : "";
    app.innerHTML = `
      <div class="center">
        <div class="big-emoji">✅</div>
        <h1>Grazie, ${esc(name)}!</h1>
        <p>Il tuo test è stato inviato correttamente alla tua insegnante.</p>
      </div>
      ${scoreHtml}
      <div class="center">
        <p class="muted">Riceverai i risultati completi e un feedback personalizzato a breve.</p>
        <p><em>Complimenti per il percorso fatto finora! 🇮🇹</em></p>
      </div>
    `;
  }

  // ---------- Avvio ----------
  async function boot() {
    try {
      const res = await fetch("/api/content");
      content = await res.json();
    } catch (e) {
      app.innerHTML = `<div class="center"><div class="big-emoji">⚠️</div><p>Impossibile caricare il test. Ricarica la pagina tra qualche secondo.</p></div>`;
      return;
    }
    document.title = `Test di fine corso ${content.level} — italica`;

    const saved = loadLocal();
    if (saved && saved.studentName) {
      Object.assign(state, saved);
      state.answers = state.answers || {};
      state.finalWriting = state.finalWriting || {};
      state.audioDone = state.audioDone || {};
      if (state.phase === "final" && state.submissionId) {
        renderFinal();
        return;
      }
      if (state.phase === "quiz" && state.startedAt) {
        const elapsed = (Date.now() - state.startedAt) / 1000;
        topbar.style.display = "flex";
        if (elapsed < content.totalMinutes * 60) {
          startTimer();
          renderPart();
        } else {
          submitWritten(true);
        }
        return;
      }
    }
    renderIntro();
  }

  boot();
})();
