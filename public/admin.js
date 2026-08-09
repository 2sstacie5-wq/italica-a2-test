(function () {
  const app = document.getElementById("app");
  const logoutArea = document.getElementById("logoutArea");
  const PW_KEY = "italica_admin_pw";

  let pw = sessionStorage.getItem(PW_KEY) || "";
  let listData = null;

  function esc(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function fmtDate(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { ...(opts.headers || {}), "x-admin-password": pw },
    });
    if (res.status === 401) {
      sessionStorage.removeItem(PW_KEY);
      pw = "";
      renderLogin("Sessione scaduta o password errata. Accedi di nuovo.");
      throw new Error("unauthorized");
    }
    return res;
  }

  function renderLogoutBtn() {
    logoutArea.innerHTML = pw ? `<button class="btn secondary" id="logoutBtn">Esci</button>` : "";
    const btn = document.getElementById("logoutBtn");
    if (btn) btn.addEventListener("click", () => {
      sessionStorage.removeItem(PW_KEY);
      pw = "";
      renderLogoutBtn();
      renderLogin();
    });
  }

  function renderLogin(errorMsg) {
    renderLogoutBtn();
    app.innerHTML = `
      <h1>Accesso insegnante</h1>
      <p class="muted">Inserisci la password amministratore per vedere le prove consegnate.</p>
      ${errorMsg ? `<div class="notice">${esc(errorMsg)}</div>` : ""}
      <div class="field">
        <label for="pwInput">Password</label>
        <input type="text" id="pwInput" placeholder="Password" />
      </div>
      <button class="btn" id="loginBtn">Entra</button>
    `;
    document.getElementById("loginBtn").addEventListener("click", doLogin);
    document.getElementById("pwInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  }

  async function doLogin() {
    const val = document.getElementById("pwInput").value;
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: val }),
    });
    if (res.ok) {
      pw = val;
      sessionStorage.setItem(PW_KEY, pw);
      renderLogoutBtn();
      renderList();
    } else {
      renderLogin("Password errata. Riprova.");
    }
  }

  async function renderList() {
    renderLogoutBtn();
    app.innerHTML = `<h1>Prove consegnate</h1><p class="muted">Caricamento...</p>`;
    try {
      const res = await api("/api/admin/submissions");
      listData = await res.json();
    } catch (e) { return; }

    if (!listData.list.length) {
      app.innerHTML = `<h1>Prove consegnate</h1><p class="muted">Nessuna prova ancora inviata.</p>`;
      return;
    }

    const rows = listData.list.map((s) => `
      <tr class="row" data-id="${s.id}">
        <td>${esc(s.studentName)}</td>
        <td>${fmtDate(s.submittedAt)}</td>
        <td>${s.autoScore}/${listData.maxAuto}</td>
        <td>${s.status === "valutato" ? `${s.grandTotal}/${listData.maxTotal}` : "—"}</td>
        <td>${s.hasAudio ? "🎙️" : "—"}</td>
        <td><span class="badge ${s.status === "valutato" ? "done" : "pending"}">${s.status === "valutato" ? "Valutato" : "Da valutare"}</span></td>
      </tr>`).join("");

    app.innerHTML = `
      <h1>Prove consegnate</h1>
      <p class="muted">${listData.list.length} student${listData.list.length === 1 ? "e" : "i"} · punteggio automatico max ${listData.maxAuto}, manuale max ${listData.maxManual}, totale ${listData.maxTotal}</p>
      <table>
        <thead><tr><th>Nome</th><th>Data</th><th>Auto</th><th>Totale</th><th>Audio</th><th>Stato</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    app.querySelectorAll("tr.row").forEach((tr) => {
      tr.addEventListener("click", () => renderDetail(tr.dataset.id));
    });
  }

  async function renderDetail(id) {
    renderLogoutBtn();
    app.innerHTML = `<p class="muted">Caricamento...</p>`;
    let data;
    try {
      const res = await api(`/api/admin/submissions/${id}`);
      data = await res.json();
    } catch (e) { return; }
    const { submission: sub, content } = data;

    let html = `<div class="backlink" id="backLink">&larr; Torna all'elenco</div>`;
    html += `<h1>${esc(sub.studentName)}</h1>`;
    html += `<p class="muted">Consegnato il ${fmtDate(sub.submittedAt)}</p>`;

    for (const part of content.parts) {
      html += `<div class="detail-section" data-part="${part.id}"><h3>Parte ${part.number} — ${esc(part.title)}</h3>`;

      if (part.type === "mcq") {
        const det = sub.autoDetails[part.id];
        html += `<p class="muted">Punteggio automatico: <strong>${det.autoScore}/${det.maxAuto}</strong></p>`;
        for (const item of part.items) {
          const r = det.items[item.id];
          const givenLetter = r.given !== undefined && r.given !== null ? String.fromCharCode(97 + r.given) : "—";
          const correctLetter = String.fromCharCode(97 + r.correct);
          html += `<div class="qa-row ${r.isCorrect ? "correct" : "incorrect"}">
            <div class="q">${esc(item.text.replace(/__________/g, "____"))}</div>
            <div class="a">Risposta studente: <strong>${esc(givenLetter)}</strong> ${r.isCorrect ? "" : `(corretta: <strong>${esc(correctLetter)}</strong>)`}</div>
          </div>`;
        }
      }

      if (part.type === "reading" || part.type === "vf-only") {
        const det = sub.autoDetails[part.id];
        if (part.text) html += `<div class="reading-text">${esc(part.text)}</div>`;
        html += `<p class="muted">Vero/Falso — punteggio automatico: <strong>${det.autoScore}/${det.maxAuto}</strong></p>`;
        for (const v of part.vf || []) {
          const r = det.vf[v.id];
          const givenLabel = r.given === true ? "Vero" : r.given === false ? "Falso" : "—";
          const correctLabel = r.correct ? "Vero" : "Falso";
          html += `<div class="qa-row ${r.isCorrect ? "correct" : "incorrect"}">
            <div class="q">${esc(v.text)}</div>
            <div class="a">Risposta studente: <strong>${givenLabel}</strong> ${r.isCorrect ? "" : `(corretta: <strong>${correctLabel}</strong>)`}</div>
          </div>`;
        }
        if (part.open && part.open.length) {
          html += `<h4>Domande aperte (da valutare manualmente)</h4>`;
          for (const o of part.open) {
            const given = sub.answers?.[part.id]?.open?.[o.id] || "(nessuna risposta)";
            const prev = sub.manualScores?.[part.id]?.[o.id];
            html += `<div class="qa-row">
              <div class="q">${esc(o.text)} <span class="muted">(max ${o.points} punti · esempio: "${esc(o.sample)}")</span></div>
              <div class="a">${esc(given)}</div>
              <div class="rubric-row">
                <label for="score_${part.id}_${o.id}">Punti</label>
                <input type="number" min="0" max="${o.points}" step="0.5" id="score_${part.id}_${o.id}" data-part="${part.id}" data-key="${o.id}" value="${prev !== undefined ? prev : 0}" />
              </div>
            </div>`;
          }
        }
      }

      if (part.type === "fillin") {
        const det = sub.autoDetails[part.id];
        html += `<p class="muted">Punteggio automatico: <strong>${det.autoScore}/${det.maxAuto}</strong></p>`;
        for (const item of part.items) {
          const r = det.items[item.id];
          html += `<div class="qa-row ${r.isCorrect ? "correct" : "incorrect"}">
            <div class="q">${esc(item.text.replace(/__________/g, "____"))}</div>
            <div class="a">Risposta studente: <strong>${esc(r.given || "—")}</strong> ${r.isCorrect ? "" : `(accettate: ${r.accepted.map(esc).join(", ")})`}</div>
          </div>`;
        }
      }

      if (part.type === "writing") {
        const ans = sub.answers?.[part.id] || {};
        const topic = ans.topic !== null && ans.topic !== undefined ? part.topics[ans.topic] : "(nessun argomento scelto)";
        html += `<div class="qa-row"><div class="q">Argomento scelto</div><div class="a">${esc(topic)}</div></div>`;
        html += `<div class="qa-row"><div class="q">Testo (${(ans.text || "").trim().split(/\s+/).filter(Boolean).length} parole)</div><div class="a" style="white-space:pre-wrap;">${esc(ans.text || "(nessun testo)")}</div></div>`;
        html += `<h4>Griglia di valutazione</h4>`;
        for (const r of part.rubric) {
          const prev = sub.manualScores?.[part.id]?.[r.key];
          html += `<div class="rubric-row">
            <div>${esc(r.name)}</div>
            <input type="number" min="0" max="${r.max}" step="0.5" data-part="${part.id}" data-key="${r.key}" value="${prev !== undefined ? prev : 0}" /> / ${r.max}
          </div>`;
        }
      }

      if (part.type === "oral") {
        html += `<ul class="plain">${part.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>`;
        if (sub.audioPath) {
          html += `<audio controls src="/api/admin/audio/${sub.id}?pw=${encodeURIComponent(pw)}"></audio>`;
        } else {
          html += `<p class="muted">Nessuna registrazione audio ricevuta.</p>`;
        }
        html += `<h4>Griglia di valutazione</h4>`;
        for (const r of part.rubric) {
          const prev = sub.manualScores?.[part.id]?.[r.key];
          html += `<div class="rubric-row">
            <div>${esc(r.name)}</div>
            <input type="number" min="0" max="${r.max}" step="0.5" data-part="${part.id}" data-key="${r.key}" value="${prev !== undefined ? prev : 0}" /> / ${r.max}
          </div>`;
        }
      }

      html += `</div>`;
    }

    html += `
      <div class="detail-section">
        <p>Punteggio automatico: <span class="score-pill">${sub.autoScore}/${content.totalPoints}</span></p>
        <button class="btn" id="saveGradeBtn">Salva valutazione</button>
        <span id="saveStatus" class="muted" style="margin-left:12px;"></span>
      </div>
    `;

    app.innerHTML = html;
    document.getElementById("backLink").addEventListener("click", renderList);
    document.getElementById("saveGradeBtn").addEventListener("click", () => saveGrade(sub.id));
  }

  async function saveGrade(id) {
    const manualScores = {};
    document.querySelectorAll("input[data-part][data-key]").forEach((el) => {
      const partId = el.dataset.part;
      const key = el.dataset.key;
      if (!manualScores[partId]) manualScores[partId] = {};
      manualScores[partId][key] = Number(el.value) || 0;
    });
    const statusEl = document.getElementById("saveStatus");
    statusEl.textContent = "Salvataggio...";
    try {
      const res = await api(`/api/admin/submissions/${id}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualScores }),
      });
      const data = await res.json();
      statusEl.textContent = `Salvato! Totale: ${data.submission.autoScore + data.submission.manualTotal}/100`;
    } catch (e) {
      statusEl.textContent = "Errore nel salvataggio.";
    }
  }

  function boot() {
    if (pw) {
      renderList().catch(() => renderLogin());
    } else {
      renderLogin();
    }
  }

  boot();
})();
