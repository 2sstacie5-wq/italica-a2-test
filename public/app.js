(function () {
  const app = document.getElementById("app");
  const topbar = document.getElementById("topbar");
  const timerEl = document.getElementById("timer");
  const STORAGE_KEY = "italica_a2_state_v1";

  let content = null;
  let state = {
    screen: "intro", // intro | quiz | done
    studentName: "",
    startedAt: null,
    currentPart: 0,
    answers: {},
    submissionId: null,
  };

  let timerInterval = null;
  let mediaRecorder = null;
  let mediaChunks = [];
  let audioBlob = null;
  let audioUrl = null;
  let recordSeconds = 0;
  let recordInterval = null;
  let micStream = null;

  function saveLocal() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        studentName: state.studentName,
        startedAt: state.startedAt,
        currentPart: state.currentPart,
        answers: state.answers,
      }));
    } catch (e) { /* ignore */ }
  }

  function loadLocal() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function clearLocal() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function esc(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function wordCount(text) {
    return (text || "").trim().split(/\s+/).filter(Boolean).length;
  }

  // ---------- Timer ----------
  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
      const total = content.totalMinutes * 60;
      const remaining = total - elapsed;
      if (remaining <= 0) {
        timerEl.textContent = "00:00";
        stopTimer();
        autoSubmit();
        return;
      }
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      timerEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      timerEl.classList.toggle("low", remaining <= 300);
    }, 1000);
  }
  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  // ---------- Intro ----------
  function renderIntro() {
    topbar.style.display = "none";
    app.innerHTML = `
      <h1>${content.title}</h1>
      <p class="muted"><strong>Durata totale: ${content.totalMinutes} minuti</strong></p>
      <p>Ciao ciao!</p>
      <p>${esc(content.intro.firstParagraphUk)}</p>
      ${content.intro.bodyIt.map((p) => `<p>${esc(p)}</p>`).join("")}
      <h2 style="font-size:18px;">${esc(content.intro.howItWorksTitle)}</h2>
      ${content.intro.howItWorks.map((p) => `<p><em>${esc(p)}</em></p>`).join("")}
      <h2 style="font-size:18px;">${esc(content.intro.beforeStartTitle)}</h2>
      <div class="notice">
        <ul class="plain">
          ${content.intro.beforeStart.map((li) => `<li>${esc(li)}</li>`).join("")}
        </ul>
      </div>
      <p>${esc(content.intro.closing)}</p>
      <p><em>${esc(content.intro.signOff)}</em></p>
      <div class="field">
        <label for="studentName">Nome e cognome</label>
        <input type="text" id="studentName" placeholder="Es. Maria Rossi" value="${esc(state.studentName)}" />
      </div>
      <button class="btn" id="startBtn" disabled>Inizia il test</button>
    `;
    const input = document.getElementById("studentName");
    const btn = document.getElementById("startBtn");
    function refresh() { btn.disabled = !input.value.trim(); }
    input.addEventListener("input", refresh);
    refresh();
    btn.addEventListener("click", () => {
      state.studentName = input.value.trim();
      state.startedAt = Date.now();
      state.screen = "quiz";
      state.currentPart = 0;
      saveLocal();
      topbar.style.display = "flex";
      startTimer();
      renderPart();
    });
  }

  // ---------- Navigation shell ----------
  function partShell(part, innerHtml) {
    const total = content.parts.length;
    const isLast = part.number === total;
    return `
      <div class="step-label">Parte ${part.number} di ${total} (${part.kind}) &middot; ${part.points} punti</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${(part.number / total) * 100}%"></div></div>
      <h2>${esc(part.title)}</h2>
      <p class="muted">${esc(part.instructions)}</p>
      ${innerHtml}
      <div class="nav-row">
        <button class="btn secondary" id="backBtn" ${part.number === 1 ? "disabled" : ""}>Indietro</button>
        <button class="btn" id="nextBtn">${isLast ? "Invia il test" : "Avanti"}</button>
      </div>
    `;
  }

  function wireNav(part, onNext) {
    document.getElementById("backBtn").addEventListener("click", () => {
      if (part.number > 1) {
        state.currentPart -= 1;
        saveLocal();
        renderPart();
      }
    });
    document.getElementById("nextBtn").addEventListener("click", () => {
      const ok = onNext ? onNext() : true;
      if (ok === false) return;
      saveLocal();
      if (part.number === content.parts.length) {
        submitTest();
      } else {
        state.currentPart += 1;
        saveLocal();
        renderPart();
      }
    });
  }

  function ansFor(partId) {
    if (!state.answers[partId]) state.answers[partId] = {};
    return state.answers[partId];
  }

  // ---------- MCQ ----------
  function renderMcq(part) {
    const a = ansFor(part.id);
    const html = part.items.map((item) => {
      const chosen = a[item.id];
      const opts = item.options.map((opt, i) => `
        <div class="option ${chosen === i ? "selected" : ""}" data-item="${item.id}" data-idx="${i}">
          <div class="dot"></div><div>${String.fromCharCode(97 + i)}) ${esc(opt)}</div>
        </div>`).join("");
      return `<div class="question"><div class="question-text">${item.text.replace(/^(\d+)\.\s*/, "").replace(/__________/g, "____")}</div>${opts}</div>`;
    }).join("");
    app.innerHTML = partShell(part, html);
    app.querySelectorAll(".option").forEach((el) => {
      el.addEventListener("click", () => {
        a[el.dataset.item] = Number(el.dataset.idx);
        saveLocal();
        renderMcq(part);
      });
    });
    wireNav(part);
  }

  // ---------- Reading (vf + optional open) ----------
  function renderReading(part) {
    const a = ansFor(part.id);
    if (!a.vf) a.vf = {};
    if (!a.open) a.open = {};
    const vfHtml = (part.vf || []).map((item) => {
      const chosen = a.vf[item.id];
      return `
        <div class="vf-row">
          <div class="vf-text">${esc(item.text)}</div>
          <div class="vf-buttons">
            <button class="vf-btn vero ${chosen === true ? "selected" : ""}" data-item="${item.id}" data-val="true">Vero</button>
            <button class="vf-btn falso ${chosen === false ? "selected" : ""}" data-item="${item.id}" data-val="false">Falso</button>
          </div>
        </div>`;
    }).join("");
    const openHtml = (part.open || []).length ? `
      <h2 style="font-size:17px;margin-top:24px;">Domande aperte</h2>
      ${part.open.map((o) => `
        <div class="field">
          <label>${esc(o.text)} <span class="muted">(${o.points} punti)</span></label>
          <textarea data-open="${o.id}" style="min-height:70px;">${esc(a.open[o.id] || "")}</textarea>
        </div>`).join("")}
    ` : "";
    const body = `
      <div class="reading-text">“${esc(part.readingTitle)}”<br><br>${esc(part.text)}</div>
      ${vfHtml}
      ${openHtml}
    `;
    app.innerHTML = partShell(part, body);
    app.querySelectorAll(".vf-btn").forEach((el) => {
      el.addEventListener("click", () => {
        a.vf[el.dataset.item] = el.dataset.val === "true";
        saveLocal();
        renderReading(part);
      });
    });
    app.querySelectorAll("textarea[data-open]").forEach((el) => {
      el.addEventListener("input", () => { a.open[el.dataset.open] = el.value; saveLocal(); });
    });
    wireNav(part);
  }

  // ---------- Lessico (vf only) ----------
  function renderVfOnly(part) {
    const a = ansFor(part.id);
    if (!a.vf) a.vf = {};
    const vfHtml = part.vf.map((item) => {
      const chosen = a.vf[item.id];
      return `
        <div class="vf-row">
          <div class="vf-text">${esc(item.text)}</div>
          <div class="vf-buttons">
            <button class="vf-btn vero ${chosen === true ? "selected" : ""}" data-item="${item.id}" data-val="true">Vero</button>
            <button class="vf-btn falso ${chosen === false ? "selected" : ""}" data-item="${item.id}" data-val="false">Falso</button>
          </div>
        </div>`;
    }).join("");
    app.innerHTML = partShell(part, vfHtml);
    app.querySelectorAll(".vf-btn").forEach((el) => {
      el.addEventListener("click", () => {
        a.vf[el.dataset.item] = el.dataset.val === "true";
        saveLocal();
        renderVfOnly(part);
      });
    });
    wireNav(part);
  }

  // ---------- Fill-in ----------
  function renderFillin(part) {
    const a = ansFor(part.id);
    const html = part.items.map((item) => {
      const parts2 = item.text.split("__________");
      return `
        <div class="fillin-item">
          <div class="sentence">${esc(parts2[0])}<input type="text" data-item="${item.id}" value="${esc(a[item.id] || "")}" />${esc(parts2[1] || "")}</div>
        </div>`;
    }).join("");
    app.innerHTML = partShell(part, html);
    app.querySelectorAll("input[data-item]").forEach((el) => {
      el.addEventListener("input", () => { a[el.dataset.item] = el.value; saveLocal(); });
    });
    wireNav(part);
  }

  // ---------- Writing ----------
  function renderWriting(part) {
    const a = ansFor(part.id);
    if (a.topic === undefined) a.topic = null;
    if (a.text === undefined) a.text = "";
    const topicsHtml = part.topics.map((t, i) => `
      <div class="option topic-option ${a.topic === i ? "selected" : ""}" data-idx="${i}">
        <div class="dot"></div><div>${esc(t)}</div>
      </div>`).join("");
    const html = `
      ${topicsHtml}
      <div class="field">
        <label>Il tuo testo (80–100 parole)</label>
        <textarea id="writingText" placeholder="Scrivi qui...">${esc(a.text)}</textarea>
        <div class="wordcount" id="wc">${wordCount(a.text)} parole</div>
      </div>
    `;
    app.innerHTML = partShell(part, html);
    app.querySelectorAll(".topic-option").forEach((el) => {
      el.addEventListener("click", () => { a.topic = Number(el.dataset.idx); saveLocal(); renderWriting(part); });
    });
    const ta = document.getElementById("writingText");
    ta.addEventListener("input", () => {
      a.text = ta.value;
      document.getElementById("wc").textContent = `${wordCount(a.text)} parole`;
      saveLocal();
    });
    wireNav(part, () => {
      if (a.topic === null) { alert("Scegli un argomento prima di continuare."); return false; }
      if (wordCount(a.text) < 40) { if (!confirm("Il testo sembra molto breve. Vuoi continuare comunque?")) return false; }
      return true;
    });
  }

  // ---------- Oral (recording) ----------
  function pickMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    for (const c of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  }

  function renderOral(part) {
    const html = `
      <ul class="plain">${part.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>
      <div class="record-box" id="recordBox">
        <div class="record-status" id="recStatus">Premi il pulsante per registrare la tua risposta.</div>
        <button class="btn" id="recBtn">🎙️ Registra</button>
        <div id="recPreview"></div>
      </div>
    `;
    app.innerHTML = partShell(part, html);

    const recBtn = document.getElementById("recBtn");
    const recStatus = document.getElementById("recStatus");
    const recPreview = document.getElementById("recPreview");

    function renderPreview() {
      if (!audioUrl) { recPreview.innerHTML = ""; return; }
      recPreview.innerHTML = `<audio controls src="${audioUrl}"></audio><br><button class="btn secondary" id="rerecordBtn" style="margin-top:10px;">🔄 Registra di nuovo</button>`;
      document.getElementById("rerecordBtn").addEventListener("click", () => {
        audioBlob = null; audioUrl = null;
        recStatus.textContent = "Premi il pulsante per registrare la tua risposta.";
        recBtn.style.display = "inline-block";
        renderPreview();
      });
    }
    renderPreview();
    if (audioBlob) recBtn.style.display = "none";

    recBtn.addEventListener("click", async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Il tuo browser non supporta la registrazione audio. Prova con Chrome, Safari o Firefox aggiornati.");
        return;
      }
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        alert("Non è stato possibile accedere al microfono. Controlla i permessi del browser.");
        return;
      }
      const mimeType = pickMimeType();
      mediaChunks = [];
      mediaRecorder = mimeType ? new MediaRecorder(micStream, { mimeType }) : new MediaRecorder(micStream);
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) mediaChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        audioBlob = new Blob(mediaChunks, { type: mediaRecorder.mimeType || "audio/webm" });
        audioUrl = URL.createObjectURL(audioBlob);
        micStream.getTracks().forEach((t) => t.stop());
        recStatus.textContent = "Registrazione completata. Ascoltala qui sotto.";
        recBtn.textContent = "🎙️ Registra";
        recBtn.style.display = "none";
        renderPreview();
      };
      mediaRecorder.start();
      recordSeconds = 0;
      recStatus.innerHTML = `Registrazione in corso... <span class="record-time" id="recTime">00:00</span>`;
      recBtn.textContent = "⏹️ Ferma";
      recBtn.onclick = () => { mediaRecorder.stop(); clearInterval(recordInterval); };
      recordInterval = setInterval(() => {
        recordSeconds += 1;
        const m = Math.floor(recordSeconds / 60), s = recordSeconds % 60;
        const t = document.getElementById("recTime");
        if (t) t.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      }, 1000);
    });

    wireNav(part, () => {
      if (!audioBlob) {
        return confirm("Non hai ancora registrato una risposta vocale. Vuoi inviare comunque il test senza audio?");
      }
      return true;
    });
  }

  // ---------- Dispatch ----------
  function renderPart() {
    const part = content.parts[state.currentPart];
    if (!part) return;
    if (part.type === "mcq") return renderMcq(part);
    if (part.type === "reading") return renderReading(part);
    if (part.type === "vf-only") return renderVfOnly(part);
    if (part.type === "fillin") return renderFillin(part);
    if (part.type === "writing") return renderWriting(part);
    if (part.type === "oral") return renderOral(part);
  }

  // ---------- Submit ----------
  async function submitTest() {
    app.innerHTML = `<div class="center"><div class="big-emoji">⏳</div><p>Invio in corso, non chiudere questa pagina...</p></div>`;
    stopTimer();
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName: state.studentName, startedAt: state.startedAt, answers: state.answers }),
      });
      const data = await res.json();
      state.submissionId = data.id;
      state.autoScore = data.autoScore;
      state.maxAuto = data.maxAuto;
      if (audioBlob && data.id) {
        const fd = new FormData();
        const ext = (audioBlob.type.split("/")[1] || "webm").split(";")[0];
        fd.append("audio", audioBlob, `orale.${ext}`);
        fd.append("submissionId", data.id);
        await fetch("/api/submit-audio", { method: "POST", body: fd });
      }
      clearLocal();
      renderDone();
    } catch (e) {
      app.innerHTML = `<div class="center"><div class="big-emoji">⚠️</div><p>Si è verificato un errore durante l'invio. Controlla la connessione e riprova.</p><button class="btn" id="retryBtn">Riprova</button></div>`;
      document.getElementById("retryBtn").addEventListener("click", submitTest);
    }
  }

  function autoSubmit() {
    if (state.screen !== "quiz") return;
    alert("Il tempo a disposizione è terminato. Il test verrà inviato ora con le risposte date finora.");
    submitTest();
  }

  function renderDone() {
    topbar.style.display = "none";
    const hasScore = state.autoScore !== undefined && state.maxAuto !== undefined;
    const scoreHtml = hasScore ? `
      <div class="notice" style="text-align:left;">
        <div class="score-row">
          <span>Punteggio automatico:</span>
          <span class="score-pill">${state.autoScore}/${state.maxAuto}</span>
        </div>
        <p style="margin:0;">Questo è il punteggio delle parti a correzione automatica (grammatica, lettura Vero/Falso, lessico, uso della lingua). <strong>Le domande aperte, il testo scritto e la parte orale saranno corrette dalla tua insegnante</strong>: il punteggio finale su 100 arriverà dopo la sua valutazione.</p>
      </div>
    ` : "";
    app.innerHTML = `
      <div class="center">
        <div class="big-emoji">✅</div>
        <h1>Grazie, ${esc(state.studentName)}!</h1>
        <p>Il tuo test è stato inviato correttamente alla tua insegnante.</p>
      </div>
      ${scoreHtml}
      <div class="center">
        <p class="muted">Riceverai i risultati completi e un feedback personalizzato a breve.</p>
        <p><em>In bocca al lupo per il livello B1! 🇮🇹</em></p>
      </div>
    `;
  }

  // ---------- Boot ----------
  async function boot() {
    const res = await fetch("/api/content");
    content = await res.json();

    const saved = loadLocal();
    if (saved && saved.studentName && saved.startedAt) {
      const elapsed = (Date.now() - saved.startedAt) / 1000;
      if (elapsed < content.totalMinutes * 60) {
        state.studentName = saved.studentName;
        state.startedAt = saved.startedAt;
        state.currentPart = saved.currentPart || 0;
        state.answers = saved.answers || {};
        state.screen = "quiz";
        topbar.style.display = "flex";
        startTimer();
        renderPart();
        return;
      } else {
        clearLocal();
      }
    }
    renderIntro();
  }

  boot();
})();
