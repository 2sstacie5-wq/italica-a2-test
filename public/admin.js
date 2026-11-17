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

  function letter(i) {
    return i === null || i === undefined ? "—" : String.fromCharCode(97 + i);
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

    const rows = listData.list.map((s) => {
      const cert = s.certificate === null ? "—" : s.certificate ? "✅ Sì" : "❌ No";
      return `
      <tr class="row" data-id="${s.id}">
        <td><strong>${esc(s.studentName)}</strong></td>
        <td>${fmtDate(s.submittedAt)}</td>
        <td>${s.autoScore}/${listData.maxAuto}</td>
        <td>${s.status === "valutato" ? `${s.grandTotal}/${listData.maxTotal}` : "—"}</td>
        <td>${s.finalDone ? "📝" : "—"} ${s.audioCount ? `🎙️×${s.audioCount}` : ""}</td>
        <td>${cert}</td>
        <td><span class="badge ${s.status === "valutato" ? "done" : "pending"}">${s.status === "valutato" ? "Valutato" : "Da valutare"}</span></td>
      </tr>`;
    }).join("");

    app.innerHTML = `
      <h1>Prove consegnate</h1>
      <p class="muted">${listData.list.length} student${listData.list.length === 1 ? "e" : "i"} · automatico max ${listData.maxAuto} · Parte 7 max ${listData.maxManual} · totale ${listData.maxTotal} · certificato da ${listData.passPoints} punti + Parte finale sufficiente</p>
      <div style="overflow-x:auto;">
      <table>
        <thead><tr><th>Nome</th><th>Data</th><th>Auto</th><th>Totale</th><th>Parte finale</th><th>Certificato</th><th>Stato</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
    `;
    app.querySelectorAll("tr.row").forEach((tr) => {
      tr.addEventListener("click", () => renderDetail(tr.dataset.id));
    });
  }

  function overrideBox(sub, partId, itemId, pts) {
    const prev = sub.overrides?.[partId]?.[itemId];
    return `<label class="override"><input type="checkbox" data-ovr-part="${partId}" data-ovr-key="${itemId}" data-ovr-pts="${pts}" ${prev ? "checked" : ""} /> Accetta comunque (+${pts})</label>`;
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
    const det = sub.autoDetails || {};

    let html = `<div class="backlink" id="backLink">&larr; Torna all'elenco</div>`;
    html += `<h1>${esc(sub.studentName)}</h1>`;
    html += `<p class="muted">Parti 1–7 consegnate il ${fmtDate(sub.submittedAt)}${sub.timedOut ? " (tempo scaduto)" : ""} · Parte finale: ${sub.finalSubmittedAt ? fmtDate(sub.finalSubmittedAt) : "non ancora inviata"}</p>`;
    html += `<div class="summary-box" id="summaryBox"></div>`;

    for (const part of content.parts) {
      const d = det[part.id];
      html += `<div class="detail-section"><h3>Parte ${part.type === "final" ? "finale" : part.number} — ${esc(part.title)}</h3>`;

      if (part.type === "mcq") {
        html += `<p class="muted">Punteggio automatico: <strong>${d.autoScore}/${d.maxAuto}</strong></p>`;
        part.items.forEach((item, n) => {
          const r = d.items[item.id];
          html += `<div class="qa-row ${r.isCorrect ? "correct" : "incorrect"}">
            <div class="q">${n + 1}. ${esc(item.text)}</div>
            <div class="a">Risposta: <strong>${letter(r.given)}${r.given !== null && r.given !== undefined ? ") " + esc(item.options[r.given]) : ""}</strong>
            ${r.isCorrect ? "" : ` · corretta: <strong>${letter(r.correct)}) ${esc(item.options[r.correct])}</strong>`}</div>
          </div>`;
        });
      }

      if (part.type === "vf-only") {
        html += `<p class="muted">Punteggio automatico: <strong>${d.autoScore}/${d.maxAuto}</strong></p>`;
        part.vf.forEach((v, n) => {
          const r = d.vf[v.id];
          const g = r.given === true ? "Vero" : r.given === false ? "Falso" : "—";
          html += `<div class="qa-row ${r.isCorrect ? "correct" : "incorrect"}">
            <div class="q">${n + 1}. ${esc(v.text)}</div>
            <div class="a">Risposta: <strong>${g}</strong>${r.isCorrect ? "" : ` · corretta: <strong>${r.correct ? "Vero" : "Falso"}</strong>`}</div>
          </div>`;
        });
      }

      if (part.type === "matching") {
        html += `<p class="muted">Punteggio automatico: <strong>${d.autoScore}/${d.maxAuto}</strong></p>`;
        part.items.forEach((item, n) => {
          const r = d.items[item.id];
          const g = r.given !== null && r.given !== undefined ? `${letter(r.given)}) ${esc(part.reactions[r.given])}` : "—";
          html += `<div class="qa-row ${r.isCorrect ? "correct" : "incorrect"}">
            <div class="q">${n + 1}. ${esc(item.text)}</div>
            <div class="a">Risposta: <strong>${g}</strong>${r.isCorrect ? "" : ` · corretta: <strong>${letter(r.correct)}) ${esc(part.reactions[r.correct])}</strong>`}</div>
          </div>`;
        });
      }

      if (part.type === "reorder" || part.type === "fillin" || part.type === "cloze") {
        html += `<p class="muted">Punteggio automatico: <strong>${d.autoScore}/${d.maxAuto}</strong>. Se una risposta sbagliata secondo il sistema è in realtà accettabile, spunta «Accetta comunque».</p>`;
        part.items.forEach((item, n) => {
          const r = d.items[item.id];
          const q = part.type === "reorder" ? item.words.join(" / ") : part.type === "fillin" ? item.text : `(${item.id})`;
          if (item.section) html += `<h4>${esc(item.section)}</h4>`;
          html += `<div class="qa-row ${r.isCorrect ? "correct" : "incorrect"}">
            <div class="q">${n + 1}. ${esc(q)}</div>
            <div class="a">Risposta: <strong>${esc(r.given || "—")}</strong>${r.isCorrect ? "" : ` · accettate: ${r.accepted.map(esc).join(" / ")}`}</div>
            ${r.isCorrect ? "" : overrideBox(sub, part.id, item.id, r.max)}
          </div>`;
        });
      }

      if (part.type === "open") {
        html += `<p class="muted">Da valutare: 2 = struttura corretta e frase coerente · 1 = comprensibile con un errore nella struttura richiesta · 0 = struttura assente o frase incomprensibile.</p>`;
        part.items.forEach((item, n) => {
          const given = sub.answers?.[part.id]?.[item.id];
          const prev = sub.manualScores?.[part.id]?.[item.id];
          html += `<div class="qa-row">
            <div class="q">${n + 1}. ${esc(item.text)} <span class="muted">(${esc(item.focus)})</span></div>
            <div class="a" style="white-space:pre-wrap;">${esc(given || "(nessuna risposta)")}</div>
            <div class="rubric-row" style="justify-content:flex-start;margin-top:8px;">
              <span>Punti:</span>
              ${[0, 1, 2].map((p) => `<label class="pt"><input type="radio" name="o_${item.id}" data-part="${part.id}" data-key="${item.id}" value="${p}" ${Number(prev || 0) === p ? "checked" : ""}/> ${p}</label>`).join("")}
            </div>
          </div>`;
        });
      }

      if (part.type === "final") {
        html += `<h4>Produzione scritta</h4>`;
        part.writing.forEach((w, n) => {
          const t = sub.finalWriting?.[w.id] || "";
          const wc = t.trim().split(/\s+/).filter(Boolean).length;
          html += `<div class="qa-row"><div class="q">${n + 1}. ${esc(w.text)} <span class="muted">(${wc} parole · richieste ${esc(w.words)})</span></div>
            <div class="a" style="white-space:pre-wrap;">${esc(t || "(nessun testo)")}</div></div>`;
        });
        html += `<h4>Produzione orale</h4>`;
        part.oral.forEach((o, n) => {
          const has = sub.audio && sub.audio[o.id];
          html += `<div class="qa-row"><div class="q">${n + 1}. ${esc(o.text)}</div>
            ${has ? `<audio controls preload="none" src="/api/admin/audio/${sub.id}/${o.id}?pw=${encodeURIComponent(pw)}"></audio>` : `<div class="a muted">Nessuna registrazione.</div>`}</div>`;
        });
        html += `<h4>Criteri</h4><ul class="plain muted">${(part.criteria || []).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
          <div class="rubric-row" style="justify-content:flex-start;gap:18px;">
            <strong>Giudizio:</strong>
            <label class="pt"><input type="radio" name="verdict" value="sufficiente" ${sub.finalVerdict === "sufficiente" ? "checked" : ""}/> Sufficiente</label>
            <label class="pt"><input type="radio" name="verdict" value="insufficiente" ${sub.finalVerdict === "insufficiente" ? "checked" : ""}/> Insufficiente</label>
          </div>
          <div class="field"><label>Nota per te (facoltativa)</label><textarea id="teacherNote" style="min-height:70px;">${esc(sub.teacherNote || "")}</textarea></div>`;
      }

      html += `</div>`;
    }

    html += `
      <div class="detail-section">
        <button class="btn" id="saveGradeBtn">Salva valutazione</button>
        <span id="saveStatus" class="muted" style="margin-left:12px;"></span>
      </div>
    `;

    app.innerHTML = html;

    function collect() {
      const manualScores = {};
      app.querySelectorAll("input[type=radio][data-part]:checked").forEach((el) => {
        (manualScores[el.dataset.part] = manualScores[el.dataset.part] || {})[el.dataset.key] = Number(el.value) || 0;
      });
      const overrides = {};
      app.querySelectorAll("input[data-ovr-part]:checked").forEach((el) => {
        (overrides[el.dataset.ovrPart] = overrides[el.dataset.ovrPart] || {})[el.dataset.ovrKey] = Number(el.dataset.ovrPts) || 0;
      });
      const v = app.querySelector("input[name=verdict]:checked");
      const note = document.getElementById("teacherNote");
      return { manualScores, overrides, finalVerdict: v ? v.value : null, teacherNote: note ? note.value : "" };
    }

    function sum(o) { let t = 0; for (const p in o) for (const k in o[p]) t += o[p][k]; return t; }

    function updateSummary() {
      const c = collect();
      const extra = sum(c.overrides);
      const manual = sum(c.manualScores);
      const total = sub.autoScore + extra + manual;
      const pass = content.passPoints;
      const cert = total >= pass && c.finalVerdict === "sufficiente";
      document.getElementById("summaryBox").innerHTML = `
        <div class="score-row">
          <span>Automatico <strong>${sub.autoScore}</strong></span>
          ${extra ? `<span>+ accettate a mano <strong>${extra}</strong></span>` : ""}
          <span>+ Parte 7 <strong>${manual}</strong></span>
          <span>=</span>
          <span class="score-pill">${total}/${content.totalPoints}</span>
          <span class="badge ${total >= pass ? "done" : "pending"}">${total >= pass ? `≥ ${pass}: superato` : `sotto ${pass}`}</span>
        </div>
        <div class="muted">Parte finale: <strong>${c.finalVerdict || "non valutata"}</strong> · Certificato B1: <strong>${c.finalVerdict ? (cert ? "✅ sì" : "❌ no") : "in attesa del giudizio sulla Parte finale"}</strong></div>`;
    }

    app.addEventListener("change", updateSummary);
    updateSummary();
    document.getElementById("backLink").addEventListener("click", renderList);
    document.getElementById("saveGradeBtn").addEventListener("click", async () => {
      const statusEl = document.getElementById("saveStatus");
      statusEl.textContent = "Salvataggio...";
      try {
        const res = await api(`/api/admin/submissions/${sub.id}/grade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(collect()),
        });
        const out = await res.json();
        statusEl.textContent = `Salvato! Totale: ${out.total}/${content.totalPoints}`;
      } catch (e) {
        statusEl.textContent = "Errore nel salvataggio.";
      }
    });
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
